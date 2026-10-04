import { useState, useEffect } from 'react';
import { Play, Plus, Check, Star, X, Users, Trophy, ChevronRight, ChevronDown, ChevronLeft, ListVideo, Eye } from 'lucide-react';
import { tmdb, FALLBACK_PROFILE, FALLBACK_POSTER } from '../services/tmdb';
import { getImdbRating, imdbIdOf } from '../services/ratings';
import { getAwardsByImdb } from '../services/wikidata';
import { storage, WATCHED_PCT } from '../services/storage';
import RowRail from './RowRail';

// RT lookups cache a day (edge caches hits a day too; misses an hour).
// Module scope: survives detail open/close.
const rtCache = new Map();
const RT_TTL = 24 * 60 * 60 * 1000;
// Misses (flaky backends, quota blips) re-try soon — a transient 404 must
// not hide the score for a day.
const RT_MISS_TTL = 10 * 60 * 1000;
const RT_CACHE_MAX = 120;
function rtCacheSet(key, value) {
  if (rtCache.has(key)) rtCache.delete(key);
  rtCache.set(key, value);
  while (rtCache.size > RT_CACHE_MAX) rtCache.delete(rtCache.keys().next().value);
}

function formatMoney(value) {
  if (!value) return null;
  return `$${(value / 1_000_000).toFixed(1)}M`;
}

function formatRuntime(mins) {
  if (!mins) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatEndsAt(mins) {
  if (!mins) return null;
  const end = new Date(Date.now() + mins * 60000);
  return `Ends ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Day-first everywhere ("19 May 2026", never 2026-05-19): episode air
// dates, guest sections, history rows. One helper, all screens.
function formatDay(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function certificationOf(details, mediaType) {
  try {
    if (mediaType === 'tv') {
      const us = (details?.content_ratings?.results || []).find((r) => r.iso_3166_1 === 'US');
      return us?.rating || null;
    }
    const us = (details?.release_dates?.results || []).find((r) => r.iso_3166_1 === 'US');
    const rated = (us?.release_dates || []).find((r) => r.certification);
    return rated?.certification || null;
  } catch {
    return null;
  }
}

// US certification → plain-English explainer for the hover tip.
const CERT_TIPS = {
  G: 'Rated G: all ages admitted',
  PG: 'Rated PG: parental guidance suggested',
  'PG-13': 'Rated PG-13: 13 and older recommended',
  R: 'Rated R: 17 and older without a parent or guardian',
  'NC-17': 'Rated NC-17: adults only',
  'TV-Y': 'TV-Y: all children',
  'TV-Y7': 'TV-Y7: 7 and older',
  'TV-G': 'TV-G: all audiences',
  'TV-PG': 'TV-PG: parental guidance suggested',
  'TV-14': 'TV-14: 14 and older',
  'TV-MA': 'TV-MA: mature audiences',
  NR: 'Not rated',
  UR: 'Unrated',
};

// Episodes (detail page, above cast): season pills + episode rail with
// stills and synopses. Card click plays that exact episode via
// switchEpisode, eye marks watched, chevron opens the episode sheet
// (Phase 2: full overview + guest stars + prev/next). Guest names ride
// the season payload, no extra calls. Same file by design (single
// consumer): EpisodeDrawer stays the player chrome.
function EpisodesSection({ mediaId, media, details, onPlay, onToast, onSelectPerson }) {
  const apiSeasons = Array.isArray(details?.seasons) ? details.seasons : [];
  const seasons = apiSeasons.length > 0
    ? apiSeasons
        .filter((s) => s && s.season_number != null && s.season_number >= 0)
        .sort((a, b) => a.season_number - b.season_number)
    : Array.from({ length: Math.max(1, details?.number_of_seasons || 1) }, (_, i) => ({ season_number: i + 1 }));
  const [activeSeason, setActiveSeason] = useState(1);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [seasonError, setSeasonError] = useState('');
  const [seasonRetry, setSeasonRetry] = useState(0);
  const [newestFirst, setNewestFirst] = useState(false);
  const [sheetEp, setSheetEp] = useState(null);
  const [watchedTick, setWatchedTick] = useState(0);

  useEffect(() => {
    if (!mediaId) return;
    let alive = true;
    setLoading(true);
    setSeasonError('');
    tmdb.getSeasonDetails(mediaId, activeSeason)
      .then((data) => {
        if (alive) {
          setEpisodes(data?.episodes || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setSeasonError('Could not load episodes. Check your connection.');
          setLoading(false);
        }
      });
    return () => { alive = false; };
  }, [mediaId, activeSeason, seasonRetry]);

  useEffect(() => {
    if (!sheetEp) return;
    const onKey = (e) => { if (e.key === 'Escape') setSheetEp(null); };
    document.addEventListener('keydown', onKey);
    // Lock the page behind the sheet. iOS Safari ignores body overflow,
    // so pin the body fixed at the current scroll offset instead.
    const y = window.scrollY || 0;
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${y}px`;
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      window.scrollTo(0, y);
    };
  }, [sheetEp]);

  // Watched truth reads the whole episode stamp, not one server slot:
  // episodes finished inside the player carry per-server clocks, and a
  // server-less read returned null for those (the toggle that never
  // flipped). Any clock past the watched percent counts.
  const isWatched = (epNum) => {
    try {
      const entry = storage.getProgress('tv', mediaId);
      const ep = entry?.episodes?.[`${activeSeason}x${epNum}`];
      if (!ep) return false;
      if ((ep.percent || 0) >= WATCHED_PCT) return true;
      return Object.values(ep.servers || {}).some((s) => {
        const pct = s && s.duration > 0 ? (s.currentTime / s.duration) * 100 : 0;
        return pct >= WATCHED_PCT;
      });
    } catch {
      return false;
    }
  };
  void watchedTick;

  const playEp = (epNum) => {
    try {
      storage.switchEpisode({
        mediaId,
        type: 'tv',
        season: activeSeason,
        episode: epNum,
        title: details?.name || details?.title || media?.name || media?.title || '',
        poster: details?.poster_path || media?.poster_path || '',
        genres: (details?.genres || []).map((g) => g.id),
      });
    } catch {
      // storage unavailable. Play still works, resume just will not stick.
    }
    onPlay?.(media, details);
  };

  const markEpWatched = (epNum, runtimeMin) => {
    try {
      const dur = Math.max(1, Math.round((runtimeMin || details?.episode_run_time?.[0] || 45) * 60));
      storage.saveProgress({
        mediaId,
        type: 'tv',
        season: activeSeason,
        episode: epNum,
        currentTime: dur,
        duration: dur,
        title: details?.name || details?.title || media?.name || media?.title || '',
        poster: details?.poster_path || media?.poster_path || '',
        genres: (details?.genres || []).map((g) => g.id),
      });
      setWatchedTick((t) => t + 1);
      onToast?.(`Marked S${activeSeason} E${epNum} watched`);
    } catch {
      onToast?.('Could not mark watched. Retry.');
    }
  };

  const toggleEpWatched = (epNum, runtimeMin) => {
    if (isWatched(epNum)) {
      try {
        storage.unmarkEpisode({ mediaId, type: 'tv', season: activeSeason, episode: epNum });
        setWatchedTick((t) => t + 1);
        onToast?.(`Removed S${activeSeason} E${epNum} from watched`);
      } catch {
        onToast?.('Could not update. Retry.');
      }
      return;
    }
    markEpWatched(epNum, runtimeMin);
  };

  const ordered = newestFirst ? [...episodes].reverse() : episodes;
  const seasonLabel = (n) => (n === 0 ? 'Specials' : `Season ${n}`);
  const sheetIdx = sheetEp ? ordered.findIndex((e) => e.episode_number === sheetEp.episode_number) : -1;

  return (
    <section className="space-y-4" aria-label="Episodes">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <h3 className="cine-section-title inline-flex items-center gap-2">
          <ListVideo className="w-4 h-4 text-white/60" />
          Episodes
          {!loading && episodes.length > 0 && (
            <span className="text-xs font-semibold text-white/50">
              {seasonLabel(activeSeason)} · {episodes.length} episode{episodes.length === 1 ? '' : 's'}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setNewestFirst((v) => !v)}
            className="cine-pill cine-pill--sm cine-has-tip"
            aria-pressed={newestFirst}
            aria-label={newestFirst ? 'Sort oldest first' : 'Sort newest first'}
          >
            {newestFirst ? 'Newest' : 'Oldest'}
            <span className="cine-tip" aria-hidden="true">
              {newestFirst ? 'Newest episodes first' : 'Oldest episodes first'}
            </span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="Seasons">
        {seasons.map((s) => {
          const n = s.season_number;
          const active = n === activeSeason;
          return (
            <button
              key={n}
              role="tab"
              aria-selected={active}
              onClick={() => { setActiveSeason(n); setSheetEp(null); }}
              className={`cine-pill cine-pill--sm${active ? ' cine-pill--active' : ''}`}
            >
              {seasonLabel(n)}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40" aria-label="Loading episodes">
          <div className="w-6 h-6 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : seasonError ? (
        <div className="flex flex-col items-center justify-center gap-3 h-32 text-xs text-white/60">
          <span>{seasonError}</span>
          <button onClick={() => setSeasonRetry((r) => r + 1)} className="cine-control-btn">
            Retry
          </button>
        </div>
      ) : ordered.length === 0 ? (
        <p className="text-xs text-white/60 py-6 text-center">No episodes indexed for this season yet.</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
          {ordered.map((ep) => {
            const watched = isWatched(ep.episode_number);
            const thumb = ep.still_path ? tmdb.getImageUrl(ep.still_path, 'w300') : FALLBACK_POSTER;
            return (
              <article key={ep.id || ep.episode_number} className="flex-shrink-0 w-64 md:w-72 space-y-2.5">
                <div
                  onClick={() => playEp(ep.episode_number)}
                  className="group relative aspect-video rounded-2xl overflow-hidden cursor-pointer border border-[var(--cine-glass-border)] hover:border-white/25 transition bg-black/50"
                  role="button"
                  tabIndex={0}
                  aria-label={`Play episode ${ep.episode_number}: ${ep.name || ''}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playEp(ep.episode_number); } }}
                >
                  <img
                    src={thumb}
                    alt={ep.name || `Episode ${ep.episode_number}`}
                    loading="lazy"
                    className="w-full h-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    onError={(e) => { e.target.src = FALLBACK_POSTER; }}
                  />
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/75 text-[10px] font-bold text-white">
                    E{ep.episode_number}
                  </span>
                  {ep.runtime ? (
                    <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/75 text-[10px] font-bold text-white">
                      {ep.runtime}m
                    </span>
                  ) : null}
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/30">
                    <span className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center">
                      <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                    </span>
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-start gap-2">
                    <h4 className={`flex-1 text-sm font-bold leading-snug ${watched ? 'text-white/50' : 'text-white'}`}>
                      {ep.episode_number}. {ep.name || `Episode ${ep.episode_number}`}
                    </h4>
                    <button
                      onClick={() => toggleEpWatched(ep.episode_number, ep.runtime)}
                      className={`cine-icon-btn cine-icon-btn--xs flex-shrink-0 cine-has-tip${watched ? ' text-[var(--cine-accent)]' : ''}`}
                      aria-label={watched ? `Remove episode ${ep.episode_number} from watched` : `Mark episode ${ep.episode_number} watched`}
                      aria-pressed={watched}
                    >
                      {watched ? <Check className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span className="cine-tip" aria-hidden="true">
                        {watched ? 'Remove from watched' : 'Mark watched'}
                      </span>
                    </button>
                    <button
                      onClick={() => setSheetEp(ep)}
                      className="cine-icon-btn cine-icon-btn--xs flex-shrink-0 cine-has-tip"
                      aria-label={`Episode ${ep.episode_number} details`}
                      aria-expanded={sheetEp?.episode_number === ep.episode_number}
                    >
                      <ChevronDown className="w-3 h-3" />
                      <span className="cine-tip" aria-hidden="true">Episode details</span>
                    </button>
                  </div>
                  <p className="text-xs leading-relaxed text-white/60 line-clamp-2">
                    {ep.overview || 'No synopsis available.'}
                  </p>
                  <p className="text-[11px] text-white/40">
                    {[
                      formatDay(ep.air_date),
                      ep.vote_average ? `★ ${Number(ep.vote_average).toFixed(1)}` : null,
                    ].filter(Boolean).join(' · ') || 'Details coming soon'}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {sheetEp && sheetIdx >= 0 && (
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4 pt-24 bg-black/70"
          onClick={() => setSheetEp(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Episode ${sheetEp.episode_number} details`}
        >
          <div
            className="w-full max-w-2xl max-h-[86vh] overflow-y-auto rounded-3xl bg-[#0e0e12] border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-video bg-black/60">
              <img
                src={sheetEp.still_path ? tmdb.getImageUrl(sheetEp.still_path, 'w780') : FALLBACK_POSTER}
                alt={sheetEp.name || `Episode ${sheetEp.episode_number}`}
                className="w-full h-full object-cover"
                onError={(e) => { e.target.src = FALLBACK_POSTER; }}
              />
              <button
                onClick={() => setSheetEp(null)}
                className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition"
                aria-label="Close episode details"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 md:p-6 space-y-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">
                  {seasonLabel(activeSeason)} · Episode {sheetEp.episode_number}
                </p>
                <h4 className="text-xl font-black text-white mt-1">{sheetEp.name || `Episode ${sheetEp.episode_number}`}</h4>
                <p className="text-xs text-white/50 mt-1">
                  {[
                    formatDay(sheetEp.air_date),
                    sheetEp.runtime ? `${sheetEp.runtime}m` : null,
                    sheetEp.vote_average ? `★ ${Number(sheetEp.vote_average).toFixed(1)}` : null,
                  ].filter(Boolean).join(' · ') || 'Details coming soon'}
                </p>
              </div>
              <p className="text-sm leading-relaxed text-white/75">{sheetEp.overview || 'No synopsis available.'}</p>
              {(sheetEp.guest_stars || []).length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Guest starring</p>
                  <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
                    {sheetEp.guest_stars.slice(0, 6).map((g) => (
                      <button
                        key={g.id || g.name}
                        onClick={() => { if (g.id) { setSheetEp(null); onSelectPerson?.(g.id); } }}
                        className="group flex-shrink-0 w-20 text-center space-y-1.5 cursor-pointer"
                        aria-label={g.id ? `Open ${g.name}'s profile` : g.name}
                      >
                        <span className="block w-[72px] h-[72px] mx-auto rounded-full overflow-hidden bg-white/5 border border-white/10 group-hover:border-white/30 transition">
                          <img
                            src={tmdb.getImageUrl(g.profile_path, 'w185', FALLBACK_PROFILE)}
                            alt={g.name}
                            loading="lazy"
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.src = FALLBACK_PROFILE; }}
                          />
                        </span>
                        <span className="block text-[11px] font-semibold text-white/85 leading-tight line-clamp-2 group-hover:text-white group-hover:underline">
                          {g.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={() => { setSheetEp(null); playEp(sheetEp.episode_number); }}
                  className="h-11 px-6 text-sm rounded-full bg-white text-black font-bold inline-flex items-center gap-2 hover:bg-[#f2f2f5] transition"
                >
                  <Play className="w-4 h-4" fill="currentColor" /> Play episode
                </button>
                {isWatched(sheetEp.episode_number) ? (
                  <button
                    onClick={() => toggleEpWatched(sheetEp.episode_number, sheetEp.runtime)}
                    className="cine-control-btn h-11 px-5 text-sm"
                  >
                    <Check className="w-3.5 h-3.5" /> Remove from watched
                  </button>
                ) : (
                  <button
                    onClick={() => toggleEpWatched(sheetEp.episode_number, sheetEp.runtime)}
                    className="cine-control-btn h-11 px-5 text-sm"
                  >
                    <Check className="w-3.5 h-3.5" /> Mark watched
                  </button>
                )}
                <span className="flex-1" />
                <button
                  onClick={() => { const p = ordered[sheetIdx - 1]; if (p) setSheetEp(p); }}
                  disabled={sheetIdx <= 0}
                  className="cine-icon-btn cine-has-tip disabled:opacity-30"
                  aria-label="Previous episode"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="cine-tip" aria-hidden="true">Previous episode</span>
                </button>
                <button
                  onClick={() => { const n = ordered[sheetIdx + 1]; if (n) setSheetEp(n); }}
                  disabled={sheetIdx >= ordered.length - 1}
                  className="cine-icon-btn cine-has-tip disabled:opacity-30"
                  aria-label="Next episode"
                >
                  <ChevronRight className="w-4 h-4" />
                  <span className="cine-tip" aria-hidden="true">Next episode</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function MediaDetailPage({ media, mediaType, onPlay, onSelectMedia, onToast, onWatchTogether, onSelectPerson, onSelectStudio }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailsError, setDetailsError] = useState('');
  const [detailsRetry, setDetailsRetry] = useState(0);
  // User-picked trailer key — hero is a still backdrop until the user
  // chooses to play (no autoplay embeds, no chrome, no mute dance).
  const [heroVideo, setHeroVideo] = useState(null);
  const [isWatchlist, setIsWatchlist] = useState(false);
  const [logo, setLogo] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [imdb, setImdb] = useState(null);
  const [rt, setRt] = useState(null);
  const [awards, setAwards] = useState([]);
  const [honoursExpanded, setHonoursExpanded] = useState(false);

  const mediaId = media?.id;

  useEffect(() => {
    let isMounted = true;
    async function fetchDetails() {
      setLoading(true);
      setDetailsError('');
      setHeroVideo(null);
      setLogo(null);
      setExpanded(false);
      setHonoursExpanded(false);
      try {
        const [data, titleLogo] = await Promise.all([
          tmdb.getMediaDetails(mediaType, mediaId),
          tmdb.getLogos(mediaType, mediaId),
        ]);
        if (isMounted) {
          setDetails(data);
          setIsWatchlist(storage.isInWatchlist(mediaId));
          if (titleLogo?.file_path) setLogo(titleLogo.file_path);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load media details:', err);
        if (isMounted) {
          setDetailsError("Couldn't load full details. Showing basic info.");
          setLoading(false);
        }
      }
    }
    fetchDetails();
    return () => { isMounted = false; };
  }, [mediaId, mediaType, detailsRetry]);

  // Stay in sync when the watchlist changes elsewhere (no reload needed).
  useEffect(() => {
    if (!mediaId) return;
    return storage.subscribeWatchlist(() => {
      setIsWatchlist(storage.isInWatchlist(mediaId));
    });
  }, [mediaId]);

  // IMDb rating via keyless Cinemeta lookup on the TMDB IMDb ID.
  useEffect(() => {
    let isMounted = true;
    setImdb(null);
    const imdbId = imdbIdOf(details, mediaType);
    if (!imdbId) return;
    getImdbRating(mediaType, imdbId).then((r) => {
      if (isMounted) setImdb(r);
    });
    return () => {
      isMounted = false;
    };
  }, [details, mediaType]);

  // Awards via Wikidata on the IMDb id (cached, silent on miss).
  useEffect(() => {
    let isMounted = true;
    setAwards([]);
    const imdbId = imdbIdOf(details, mediaType);
    if (!imdbId) return;
    getAwardsByImdb(imdbId).then((list) => {
      if (isMounted) setAwards(list);
    });
    return () => {
      isMounted = false;
    };
  }, [details, mediaType]);

  // Rotten Tomatoes via our /api/rt proxy (free keyless backend by
  // default; RapidAPI backend if RAPIDAPI_KEY is set server-side).
  // Module cache (hits AND misses): the effect keys on title/year strings,
  // but parent re-renders mint fresh details/media objects — without this
  // every chrome poke refired the flaky free backend (6x on one visit).
  useEffect(() => {
    let isMounted = true;
    const t = details?.title || details?.name || media?.title || media?.name;
    const y = (details?.release_date || details?.first_air_date || '').slice(0, 4);
    // Exact match when TMDB carried the IMDb ID (OMDb primary backend).
    const imdbId = imdbIdOf(details, mediaType);
    if (!t && !imdbId) return;
    const ck = `${t}|${y}|${imdbId || ''}`;
    const hit = rtCache.get(ck);
    if (hit && Date.now() - hit.at < (hit.ttl || RT_TTL)) {
      if (hit.data) setRt(hit.data);
      else setRt(null);
      return;
    }
    setRt(null);
    const qs = new URLSearchParams({ title: t || '', year: y || '' });
    if (imdbId) qs.set('imdb', imdbId);
    fetch(`/api/rt?${qs.toString()}`, {
      signal: AbortSignal.timeout(8000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const good = d && (d.critic != null || d.audience != null) ? d : null;
        rtCacheSet(ck, { at: Date.now(), data: good, ttl: good ? RT_TTL : RT_MISS_TTL });
        if (isMounted && good) setRt(good);
      })
      .catch(() => {
        rtCacheSet(ck, { at: Date.now(), data: null, ttl: RT_MISS_TTL });
      });
    return () => {
      isMounted = false;
    };
  }, [details?.title, details?.name, media?.title, media?.name, details?.release_date, details?.first_air_date]);

  const title = details?.title || details?.name || media?.title || media?.name;
  const backdrop = tmdb.getImageUrl(details?.backdrop_path || media?.backdrop_path, 'w1280');
  const rating = (details?.vote_average || media?.vote_average || 0).toFixed(1);
  const voteCount = details?.vote_count || media?.vote_count || null;
  const releaseYear = (details?.release_date || details?.first_air_date || media?.release_date || media?.first_air_date || '').split('-')[0];
  const runtimeMins = details?.runtime || (details?.episode_run_time && details.episode_run_time[0]) || null;
  const runtime = formatRuntime(runtimeMins);
  const cert = certificationOf(details, mediaType);
  const revenue = formatMoney(details?.revenue);
  const budget = formatMoney(details?.budget);
  // Profit verdict: real-data color, not decoration. Green = box office
  // covered the budget, red = it did not. Null when either is missing.
  const boxVerdict =
    details?.revenue > 0 && details?.budget > 0
      ? (details.revenue >= details.budget ? 'profit' : 'flop')
      : null;
  const genres = details?.genres || [];
  const cast = details?.credits?.cast?.slice(0, 12) || [];
  const directors = (details?.credits?.crew || []).filter((c) => c.job === 'Director');
  const creators = (details?.created_by || []).slice(0, 3);
  const studios = (details?.production_companies || []).slice(0, 3);
  const language = (details?.original_language || '').toUpperCase() || null;
  const status = details?.status || null;
  const seasonsCount = details?.number_of_seasons || null;
  const episodesCount = details?.number_of_episodes || null;
  const releaseDate = formatDate(details?.release_date || details?.first_air_date);
  // Sensible "You Might Also Like": TMDB similar as candidates, scored
  // by shared genres with THIS title, then same language, then same
  // origin country (a US drama suggesting Korean dramas on genre overlap
  // alone is how the shelf goes wrong). Stripped of unrated junk. Topped
  // up from same-genre top-rated when TMDB returns thin air.
  const [similar, setSimilar] = useState([]);
  useEffect(() => {
    let alive = true;
    const genreIds = new Set((details?.genres || []).map((g) => g.id));
    const lang = details?.original_language || null;
    const countries = new Set(details?.origin_country || (details?.origin_country === undefined && details?.production_countries ? details.production_countries.map((c) => c.iso_3166_1) : []));
    const score = (x) =>
      (x.genre_ids || []).filter((g) => genreIds.has(g)).length * 2 +
      (lang && x.original_language === lang ? 3 : 0) +
      ((x.origin_country || []).some((c) => countries.has(c)) ? 2 : 0);
    const clean = (list) =>
      (list || [])
        .filter((x) => !x.adult && x.poster_path && (x.vote_average || 0) > 0 && (x.vote_count || 0) >= 20)
        .sort(
          (a, b) =>
            score(b) - score(a) ||
            (b.vote_average || 0) - (a.vote_average || 0) ||
            (b.popularity || 0) - (a.popularity || 0)
        );
    const base = clean(details?.similar?.results);
    if (base.length >= 8 || genreIds.size === 0) {
      setSimilar(base);
      return () => {
        alive = false;
      };
    }
    const have = new Set(base.map((x) => x.id));
    const genre = [...genreIds][0];
    const fetcher =
      mediaType === 'tv'
        ? tmdb.getSeries({ genre, sort: 'vote_average.desc' })
        : tmdb.getMovies({ genre, sort: 'vote_average.desc' });
    fetcher
      .then((res) => {
        if (!alive) return;
        const extra = clean(res?.results).filter((x) => !have.has(x.id));
        setSimilar([...base, ...extra]);
      })
      .catch(() => {
        if (alive) setSimilar(base);
      });
    return () => {
      alive = false;
    };
  }, [details, mediaType]);
  const trailers = (details?.videos?.results || []).filter(
    (v) => (v.type === 'Trailer' || v.type === 'Teaser') && v.site === 'YouTube'
  ).slice(0, 6);
  const overview = details?.overview || media?.overview || 'No storyline available.';

  return (
    <div className="relative min-h-screen text-white pb-24 animate-in fade-in duration-300">
      {/* Poster tint: the artwork's palette at 30% across the whole page. */}
      <div className="cine-detail-bg" aria-hidden="true">
        <img src={backdrop} alt="" className="cine-detail-bg-img" />
        <div className="cine-detail-bg-shade" />
      </div>
      {/* Hero: still backdrop dissolving straight into the tinted page
          (cinejoy rule: one mask feather + one scrim, no blur stack).
          Trailers play here only when the user picks one below. */}
      <div className="relative w-full h-[86vh] min-h-[600px] overflow-hidden">
        {heroVideo ? (
          <iframe
            key={heroVideo}
            src={`https://www.youtube-nocookie.com/embed/${heroVideo}?autoplay=1&rel=0&modestbranding=1&controls=1&playsinline=1&iv_load_policy=3`}
            
            className="cine-trailer-cover border-0"
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
          />
        ) : (
          <img src={backdrop} alt={title} className="w-full h-full object-cover object-center cine-detail-melt-img" />
        )}
        <div className="absolute inset-0 cine-detail-hero-scrim pointer-events-none" />

        {/* Back to the still backdrop */}
        {heroVideo && (
          <button
            onClick={() => setHeroVideo(null)}
            className="cine-icon-btn absolute top-24 right-8 md:right-14 z-20"
            
            aria-label="Close trailer"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Content Overlay */}
        <div className="absolute bottom-10 left-8 md:left-14 right-8 max-w-4xl z-10 space-y-4">
          {logo ? (
            <img
              src={tmdb.getImageUrl(logo, 'w500')}
              alt={title}
              className="max-h-36 max-w-md w-auto object-contain object-left-bottom drop-shadow-2xl"
            />
          ) : (
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black uppercase tracking-tight text-white drop-shadow-2xl">
              {title}
            </h1>
          )}

          {genres.length > 0 && (
            <p className="text-sm font-medium text-white/85">
              {genres.map((g) => g.name).join('  •  ')}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => onPlay(media, details)}
              className="cine-btn cine-btn-white cine-cta"
              aria-label="Play"
            >
              <Play className="w-[18px] h-[18px]" fill="currentColor" />
              <span>Play</span>
            </button>

            <button
              onClick={() => {
                const added = storage.toggleWatchlist(media);
                setIsWatchlist(!isWatchlist);
                onToast?.(added ? 'Added to Watchlist' : 'Removed from Watchlist');
              }}
              className="cine-btn-circle cine-has-tip"

              aria-label={isWatchlist ? 'Remove from List' : 'Add to Watchlist'}
            >
              {isWatchlist ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              <span className="cine-tip" aria-hidden="true">
                {isWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}
              </span>
            </button>

            {onWatchTogether && (
              <button
                onClick={() => onWatchTogether(media, details)}
                className="cine-btn-circle cine-has-tip"

                aria-label="Watch together in a room"
              >
                <Users className="w-5 h-5" />
                <span className="cine-tip" aria-hidden="true">Watch together</span>
              </button>
            )}

          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm font-semibold text-white/90 pt-1">
            {releaseYear && <span>{releaseYear}</span>}
            {runtime && <span className="text-white/70">{runtime}</span>}
            {cert && (
              <span className="cine-chip cine-chip--solid text-xs font-bold text-white/85 cine-has-tip">
                {cert}
                <span className="cine-tip" aria-hidden="true">
                  {CERT_TIPS[cert] || `Rated ${cert}`}
                </span>
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-white font-bold cine-has-tip">
              <Star className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
              {rating}
              <span className="cine-tip" aria-hidden="true">
                TMDB score {rating}{voteCount ? ` from ${voteCount.toLocaleString()} votes` : ''}
              </span>
            </span>
            {imdb != null && (
              <span className="cine-imdb-tag cine-has-tip" >
                <span className="cine-imdb-logo">IMDb</span>
                {imdb.toFixed(1)}
                <span className="cine-tip" aria-hidden="true">
                  IMDb {imdb.toFixed(1)} (matched by IMDb ID)
                </span>
              </span>
            )}
            {rt?.critic != null && (
              <span className="cine-chip cine-chip--accent cine-has-tip" >
                🍅 {rt.critic}%
                <span className="cine-tip" aria-hidden="true">
                  Rotten Tomatoes Tomatometer (critics)
                </span>
              </span>
            )}
            {rt?.audience != null && (
              <span className="cine-chip cine-chip--neutral cine-has-tip" >
                🍿 {rt.audience}%
                <span className="cine-tip" aria-hidden="true">
                  Rotten Tomatoes Popcornmeter (audience)
                </span>
              </span>
            )}
          </div>

          {directors.length > 0 && (
            <p className="text-sm text-white/50">
              Director{directors.length > 1 ? 's' : ''}:{' '}
              {directors.map((d, i) => (
                <span key={d.id || d.name}>
                  {i > 0 && ', '}
                  <button
                    onClick={() => onSelectPerson?.(d.id)}
                    className="inline-flex items-center gap-0.5 text-white/85 font-medium hover:text-white hover:underline transition cursor-pointer"
                    aria-label={`Open ${d.name}'s profile`}
                  >
                    {d.name}
                    <ChevronRight className="w-3.5 h-3.5 text-white/40" />
                  </button>
                </span>
              ))}
            </p>
          )}

          {creators.length > 0 && (
            <p className="text-sm text-white/50">
              Created by:{' '}
              {creators.map((c, i) => (
                <span key={c.id || c.name}>
                  {i > 0 && ', '}
                  <button
                    onClick={() => onSelectPerson?.(c.id)}
                    className="inline-flex items-center gap-0.5 text-white/85 font-medium hover:text-white hover:underline transition cursor-pointer"
                    aria-label={`Open ${c.name}'s profile`}
                  >
                    {c.name}
                    <ChevronRight className="w-3.5 h-3.5 text-white/40" />
                  </button>
                </span>
              ))}
            </p>
          )}

          <div className="max-w-2xl">
            <p className={`text-sm leading-relaxed text-white/70 ${expanded ? '' : 'line-clamp-3'}`}>
              {overview}
            </p>
            {overview.length > 180 && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="text-xs font-semibold text-white/50 hover:text-white mt-1 transition cursor-pointer"
              >
                {expanded ? 'Show Less' : 'Read More'}
              </button>
            )}
          </div>
        </div>

        {/* Facts column (xl screens only): table up a touch, studios ride
            directly beneath it on the right like the reference. */}
        {(runtime || language || releaseDate || status || seasonsCount || revenue || budget) && (
          <div className="hidden xl:block absolute right-14 bottom-14 z-10 w-72 space-y-4">
          <div className="rounded-2xl cine-glass-panel overflow-hidden">
            {seasonsCount && (
              <div className="flex items-center justify-between px-4 py-3 text-xs border-b border-[var(--cine-glass-border)]">
                <span className="text-white/60 font-medium">Season{seasonsCount > 1 ? 's' : ''}</span>
                <span className="text-white/90 font-semibold">
                  {seasonsCount}
                  {episodesCount && (
                    <span className="text-white/60 font-normal"> · {episodesCount} episode{episodesCount === 1 ? '' : 's'}</span>
                  )}
                </span>
              </div>
            )}
            {status && (
              <div className="flex items-center justify-between px-4 py-3 text-xs border-b border-[var(--cine-glass-border)]">
                <span className="text-white/60 font-medium">Status</span>
                <span className="text-white/90 font-semibold">{status}</span>
              </div>
            )}
            {runtime && (
              <div className="flex items-center justify-between px-4 py-3 text-xs border-b border-white/[0.07]">
                <span className="text-white/45 font-medium">Runtime</span>
                <span className="text-white/90 font-semibold">
                  {runtime}
                  <span className="text-white/60 font-normal"> · {formatEndsAt(runtimeMins)}</span>
                </span>
              </div>
            )}
            {language && (
              <div className="flex items-center justify-between px-4 py-3 text-xs border-b border-white/[0.07]">
                <span className="text-white/45 font-medium">Language</span>
                <span className="text-white/90 font-semibold">{language}</span>
              </div>
            )}
            {releaseDate && (
              <div className="flex items-center justify-between px-4 py-3 text-xs border-b border-white/[0.07]">
                <span className="text-white/45 font-medium">Release Date</span>
                <span className="text-white/90 font-semibold">{releaseDate}</span>
              </div>
            )}
            {revenue && budget ? (
              <div className={`flex items-center justify-between px-4 py-3 text-xs ${studios.length > 0 ? 'border-b border-white/[0.07]' : ''}`}>
                <span className="text-white/45 font-medium">Box Office / Budget</span>
                <span
                  className={`font-semibold cine-has-tip ${boxVerdict === 'profit' ? 'text-[var(--cine-accent)]' : boxVerdict === 'flop' ? 'text-[#ff7070]' : 'text-white/90'}`}
                >
                  {revenue} / {budget}
                  {boxVerdict && (
                    <span className="cine-tip cine-tip--wrap" aria-hidden="true">
                      {boxVerdict === 'profit' ? 'Box office covered the budget' : 'Box office did not cover the budget'}
                    </span>
                  )}
                </span>
              </div>
            ) : revenue ? (
              <div className={`flex items-center justify-between px-4 py-3 text-xs ${studios.length > 0 ? 'border-b border-white/[0.07]' : ''}`}>
                <span className="text-white/45 font-medium">Box Office</span>
                <span className="text-white/90 font-semibold">{revenue}</span>
              </div>
            ) : budget ? (
              <div className={`flex items-center justify-between px-4 py-3 text-xs ${studios.length > 0 ? 'border-b border-white/[0.07]' : ''}`}>
                <span className="text-white/45 font-medium">Budget</span>
                <span className="text-white/90 font-semibold">{budget}</span>
              </div>
            ) : null}
            {studios.length > 0 && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                <span className="text-white/45 font-medium flex-shrink-0">
                  Studio{studios.length > 1 ? 's' : ''}
                </span>
                <span className="text-right leading-snug">
                  {studios.map((s, i) => (
                    <span key={s.id || s.name}>
                      {i > 0 && <span className="text-white/40"> · </span>}
                      <button
                        onClick={() => s.id && onSelectStudio?.(s.id)}
                        className="text-white/90 font-semibold hover:text-white hover:underline transition cursor-pointer"
                        aria-label={s.id ? `Open ${s.name} studio page` : s.name}
                      >
                        {s.name}
                      </button>
                    </span>
                  ))}
                </span>
              </div>
            )}
          </div>
          </div>
        )}
      </div>

      {/* Main Details Body (solid page: the hero mask + scrim land the
          dissolve, no tail or ghost layers) */}
      <div className="relative z-20 max-w-[1560px] mx-auto px-6 md:px-14 mt-8 space-y-10">
        {detailsError && (
          <div className="flex items-center gap-3 text-xs text-white/60">
            <span>{detailsError}</span>
            <button
              onClick={() => setDetailsRetry((r) => r + 1)}
              className="cine-control-btn"
            >
              Retry
            </button>
          </div>
        )}
        {/* Mobile facts (cert already shows in the meta row above) */}
        <section className="xl:hidden flex flex-wrap items-center gap-2 text-xs">
          {runtime && <span className="cine-chip cine-chip--neutral">{runtime} · {formatEndsAt(runtimeMins)}</span>}
          {language && <span className="cine-chip cine-chip--neutral">{language}</span>}
          {releaseDate && <span className="cine-chip cine-chip--neutral">{releaseDate}</span>}
        </section>

        {studios.length > 0 && (
          <p className="xl:hidden text-[11px] font-bold tracking-[0.2em] text-white/50">
            {studios.map((s, i) => (
              <span key={s.id || s.name}>
                {i > 0 && <span> · </span>}
                <button
                  onClick={() => s.id && onSelectStudio?.(s.id)}
                  className="uppercase hover:text-white/80 hover:underline transition cursor-pointer"
                  aria-label={s.id ? `Open ${s.name} studio page` : s.name}
                >
                  {s.name}
                </button>
              </span>
            ))}
          </p>
        )}

        {(revenue || budget) && (
          <section className="xl:hidden flex flex-wrap items-center gap-2 text-xs">
            <span
              className="cine-chip cine-chip--neutral"
              style={boxVerdict === 'profit' ? { color: 'var(--cine-accent)' } : boxVerdict === 'flop' ? { color: '#ff7070' } : undefined}
            >
              {revenue && budget ? `Box Office: ${revenue} / ${budget}` : revenue ? `Box Office: ${revenue}` : `Budget: ${budget}`}
            </span>
          </section>
        )}

        {/* Honours — gold strip, progressive disclosure (same as person
            pages), silent when the title has none indexed. */}
        {awards.length > 0 && (
          <section className="space-y-3">
            <div className="cine-section-head">
              <h3 className="cine-section-title inline-flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[#f5c518]" />
                Honours
              </h3>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {(honoursExpanded ? awards : awards.slice(0, 6)).map((a, i) => (
                <div key={`${a.label}_${a.year}_${i}`} className="cine-award" >
                  <Trophy className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-white">{a.label}</span>
                    <span className="block text-[10px] text-white/60">
                      {[a.year, a.work].filter(Boolean).join(' • ')}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            {awards.length > 6 && (
              <button
                onClick={() => setHonoursExpanded((e) => !e)}
                aria-expanded={honoursExpanded}
                className="text-xs font-semibold text-white/50 hover:text-white transition cursor-pointer"
              >
                {honoursExpanded ? 'Show less' : `Show all ${awards.length}`}
              </button>
            )}
          </section>
        )}

        {/* Episodes — above cast for shows: seasons, stills, synopses. */}
        {mediaType === 'tv' && (
          <EpisodesSection
            mediaId={mediaId}
            media={media}
            details={details}
            onPlay={onPlay}
            onToast={onToast}
            onSelectPerson={onSelectPerson}
          />
        )}

        {/* Cast */}
        {cast.length > 0 && (
          <section className="space-y-4">
            <h3 className="cine-section-title">Cast</h3>
            <div className="cine-cast-rail flex gap-5 overflow-x-auto no-scrollbar pb-2">
              {cast.map((actor) => (
                <div
                  key={actor.id}
                  onClick={() => onSelectPerson?.(actor.id)}
                  
                  className="cine-cast-card flex-shrink-0 w-32 text-center space-y-2 cursor-pointer group"
                >
                  <div className="cine-cast-avatar w-28 h-28 mx-auto rounded-full overflow-hidden bg-[var(--cine-glass-tint)] border border-[var(--cine-glass-border)] shadow-lg">
                    <img
                      src={tmdb.getImageUrl(actor.profile_path, 'w185', FALLBACK_PROFILE)}
                      alt={actor.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = FALLBACK_PROFILE;
                      }}
                    />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-bold text-white truncate">{actor.name}</h4>
                    <p className="text-[11px] text-white/70 truncate">{actor.character}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Trailers */}
        {trailers.length > 0 && (
          <section className="space-y-4">
            <h3 className="cine-section-title">Trailers</h3>
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
              {trailers.map((t) => (
                <div
                  key={t.key}
                  onClick={() => {
                    setHeroVideo(t.key);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                   className={`group relative flex-shrink-0 w-72 md:w-80 aspect-video rounded-2xl overflow-hidden cursor-pointer border transition ${
                     heroVideo === t.key
                       ? 'border-[var(--cine-accent)]/60'
                       : 'border-[var(--cine-glass-border)] hover:border-white/25'
                   }`}
                >
                  <img
                    src={`https://i.ytimg.com/vi/${t.key}/hqdefault.jpg`}
                    alt={t.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition duration-300 group-hover:scale-[1.04]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute bottom-2.5 left-3 right-3">
                    <p className="cine-trailer-cap text-[11px] font-semibold text-white/90 truncate">{t.name}</p>
                    <p className="cine-trailer-cap text-[11px] text-white/60">{t.type}</p>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                    <div className="cine-card-play" style={{ width: 44, height: 44 }}>
                      <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Similar */}
        {similar.length > 0 && (
          <RowRail
            title="You Might Also Like"
            items={similar}
            showRating
            expandable
            onSelect={(item) => {
              onSelectMedia(item);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            mediaType={mediaType}
          />
        )}

        {loading && (
          <p className="text-center py-8 text-xs text-white/60">Loading details...</p>
        )}
      </div>
    </div>
  );
}
