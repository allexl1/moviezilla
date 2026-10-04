import React, { useState } from 'react';
import { ListVideo, X, Check, Play, History, Clapperboard } from 'lucide-react';
import { tmdb, MOVIE_GENRES, TV_GENRES } from '../services/tmdb';
import { storage, progressLabel, formatClock, WATCHED_PCT } from '../services/storage';
import { letterboxd } from '../services/letterboxd';
import Card from './ui/Card';
import Picker from './Picker';
import Row from './ui/Row';
import SegmentedControl from './ui/SegmentedControl';
import EmptyState from './ui/EmptyState';

const GENRE_NAME = {};
[...MOVIE_GENRES, ...TV_GENRES].forEach((g) => {
  if (g.id !== '' && !GENRE_NAME[g.id]) GENRE_NAME[g.id] = g.name;
});

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// History grouping: recent weeks stay weekly, then calendar months, then
// years — no Today/Yesterday noise, and old titles stay findable.
function groupLabel(ts) {
  const day = 24 * 60 * 60 * 1000;
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / day);
  if (diff <= 7) return 'This Week';
  if (diff <= 14) return 'Last Week';
  const d = new Date(ts);
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'long' });
  }
  return String(d.getFullYear());
}

function inWhenFilter(ts, filter) {
  if (filter === 'all') return true;
  const day = 24 * 60 * 60 * 1000;
  const diff = Date.now() - ts;
  if (filter === 'week') return diff <= 7 * day;
  if (filter === 'month') return diff <= 30 * day;
  if (filter === 'year') return diff <= 365 * day;
  return true;
}

const WHEN_FILTERS = [
  { id: 'all', name: 'All Time' },
  { id: 'week', name: 'This Week' },
  { id: 'month', name: 'This Month' },
  { id: 'year', name: 'This Year' },
];

const TYPE_FILTERS = [
  { id: 'all', name: 'Movies & Shows' },
  { id: 'movie', name: 'Movies' },
  { id: 'tv', name: 'Shows' },
];

const VIEW_OPTIONS = [
  { id: 'history', name: 'History' },
  { id: 'watchlater', name: 'Watch Later' },
  { id: 'watched', name: 'Watched' },
];

export default function WatchlistView({ onSelectMedia, onResume, letterboxdUser, onToast, onSaveLetterboxd }) {
  const [view, setView] = useState('history');
  const [whenFilter, setWhenFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [genreFilter, setGenreFilter] = useState('');
  const [letterboxdList, setLetterboxdList] = useState([]);
  const [letterboxdError, setLetterboxdError] = useState('');
  const [resolvingId, setResolvingId] = useState(null);
  const [resolveError, setResolveError] = useState('');
  // Bumped by storage changes so toggles/removals re-render immediately.
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  React.useEffect(() => storage.subscribeWatchlist(bump), []);

  // Letterboxd rows carry a URL id, not a TMDB id — resolve lazily on tap
  // so the detail/playback flow always receives a real TMDB ID + type.
  const handleLetterboxdSelect = async (item) => {
    if (resolvingId) return;
    setResolvingId(item.id);
    setResolveError('');
    try {
      const match = await tmdb.resolveTitle(item.title, item.release_date);
      if (match) {
        onSelectMedia(match);
      } else {
        setResolveError(`No TMDB match found for "${item.title}".`);
      }
    } catch (err) {
      console.error('Letterboxd resolve failed:', err);
      setResolveError(`Could not look up "${item.title}". Check connection and retry.`);
    } finally {
      setResolvingId(null);
    }
  };

  const history = storage.getWatchHistory();
  const watchlist = storage.getWatchlist();

  const progressByKey = new Map(history.map((h) => [`${h.type}_${h.mediaId}`, h]));

  const [editingLb, setEditingLb] = useState(false);
  const [lbDraft, setLbDraft] = useState('');

  const handleRemoveHistory = (h) => {
    storage.removeProgress(h.type, h.mediaId);
    bump();
    onToast?.('Removed from History');
  };

  const handleMarkWatched = (h) => {
    storage.saveProgress({
      mediaId: h.mediaId,
      type: h.type,
      season: h.season || 1,
      episode: h.episode || 1,
      currentTime: 1,
      duration: 1,
      title: h.title,
      poster: h.poster,
      genres: h.genres || [],
    });
    bump();
    onToast?.('Marked as Watched');
  };

  const handleRemoveWatchlist = (id, title) => {
    storage.removeFromWatchlist(id);
    bump();
    onToast?.(title ? `Removed "${title}"` : 'Removed from Watchlist');
  };

  const handleHideLetterboxd = (item) => {
    storage.hideLetterboxd(item.id);
    bump();
    onToast?.(item.title ? `Hidden "${item.title}"` : 'Hidden from Watch Later');
  };

  const handleSaveLbUser = () => {
    const clean = lbDraft.trim();
    if (!clean) return;
    setLetterboxdList([]);
    setLetterboxdError('');
    onSaveLetterboxd?.(clean);
    setEditingLb(false);
    onToast?.(`Letterboxd: ${clean}`);
  };

  React.useEffect(() => {
    if (!letterboxdUser) {
      setLetterboxdList([]);
      return;
    }
    let isMounted = true;
    letterboxd.fetchUserWatchlist(letterboxdUser).then((list) => {
      if (!isMounted) return;
      setLetterboxdList(list);
      setLetterboxdError('');
    }).catch((err) => {
      console.error('Letterboxd sync failed:', err);
      if (isMounted) setLetterboxdError('Letterboxd sync failed. Check the username and connection.');
    });
    return () => {
      isMounted = false;
    };
  }, [letterboxdUser]);

  // Letterboxd poster backfill: the LB grid carries no art, so rows used
  // to render fallback clappers in a wall. Resolve each title via TMDB
  // once, cache poster paths persistently (later opens cost zero
  // requests), concurrency-limited with progressive repaint as matches
  // land. Titles still resolve lazily on tap via handleLetterboxdSelect.
  const readArtCache = () => {
    try {
      const raw = localStorage.getItem('mz_lb_art');
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };
  const [lbArt, setLbArt] = useState(readArtCache);

  React.useEffect(() => {
    if (!letterboxdList || letterboxdList.length === 0) return;
    let cancelled = false;
    (async () => {
      const cache = readArtCache();
      const queue = letterboxdList.filter(
        (r) => r.source === 'letterboxd' && !cache[r.id]
      );
      for (let i = 0; i < queue.length && !cancelled; i += 4) {
        const batch = queue.slice(i, i + 4);
        const found = await Promise.all(
          batch.map(async (r) => {
            try {
              const m = await tmdb.resolveTitle(r.title, r.release_date);
              return m?.poster_path ? [r.id, m.poster_path] : null;
            } catch {
              return null;
            }
          })
        );
        if (cancelled) break;
        let changed = false;
        for (const hit of found) {
          if (hit) {
            cache[hit[0]] = hit[1];
            changed = true;
          }
        }
        if (changed) {
          try {
            localStorage.setItem('mz_lb_art', JSON.stringify(cache));
          } catch {
            // Storage full/blocked — art just won't persist.
          }
          setLbArt({ ...cache });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letterboxdList]);

  const matchType = (t) => typeFilter === 'all' || t === typeFilter;
  const matchGenre = (ids) =>
    !genreFilter || (ids || []).map(String).includes(String(genreFilter));
  const genreOptions = (() => {
    const ids = new Set();
    history.forEach((h) => (h.genres || []).forEach((g) => ids.add(String(g))));
    watchlist.forEach((w) => (w.genre_ids || []).forEach((g) => ids.add(String(g))));
    return [{ value: '', label: 'Genre' }].concat(
      [...ids]
        .filter((id) => GENRE_NAME[id])
        .sort((a, b) => GENRE_NAME[a].localeCompare(GENRE_NAME[b]))
        .map((id) => ({ value: id, label: GENRE_NAME[id] }))
    );
  })();

  const watchedItems = history.filter(
    (h) => h.percent >= WATCHED_PCT && matchType(h.type) && matchGenre(h.genres) && inWhenFilter(h.updatedAt, whenFilter)
  );

  const historyGroups = (() => {
    const groups = new Map();
    history
      // Watched titles live in the Watched tab only — History is the
      // unfinished lane (tapping ✓ moves the row out immediately).
      .filter((h) => h.percent < WATCHED_PCT && matchType(h.type) && matchGenre(h.genres) && inWhenFilter(h.updatedAt, whenFilter))
      .forEach((h) => {
        const label = groupLabel(h.updatedAt);
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(h);
      });
    return [...groups.entries()];
  })();

  const myList = watchlist.filter((w) => {
    const t = w.media_type || (w.first_air_date ? 'tv' : 'movie');
    return matchType(t) && matchGenre(w.genre_ids);
  });

  // Letterboxd lives INSIDE Watch Later as its own group (history-style
  // heads), never as a separate menu and never mixed into the local rows:
  // remote rows carry no genre/type metadata, so they can't be filtered
  // honestly — the group simply shows all synced titles.
  const letterboxdVisible = (() => {
    if (!letterboxdUser) return [];
    const hidden = new Set(storage.getHiddenLetterboxd());
    return (letterboxdList || []).filter((r) => !hidden.has(r.id));
  })();

  // Group separator (All / Mine / Letterboxd) — only when both sides have
  // something to separate.
  const [lbFilter, setLbFilter] = useState('all');
  const showLbGroups = letterboxdUser && myList.length > 0 && letterboxdVisible.length > 0;
  const showMine = !showLbGroups || lbFilter !== 'letterboxd';
  const showRemote = letterboxdUser && (!showLbGroups || lbFilter !== 'mine') && letterboxdVisible.length > 0;

  // Progress strings come straight from storage.progressLabel so every
  // row in the app agrees.

  const resumePayload = (h) => ({
    media: {
      id: h.mediaId,
      media_type: h.type,
      title: h.title,
      name: h.title,
      poster_path: h.poster,
    },
    fallback: {
      title: h.title,
      name: h.title,
      poster_path: h.poster,
      media_type: h.type,
    },
  });

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex-shrink-0">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
            Watchlist
          </h1>
          <p className="text-sm text-white/60 mt-1">
            What you've watched and what you're saving for later
          </p>
        </div>

        {letterboxdUser ? (
          <div className="self-start lg:self-auto flex flex-col items-start lg:items-end gap-1.5">
            {editingLb ? (
              <div className="flex items-center gap-2">
                <div className="w-44">
                <input
                  value={lbDraft}
                  onChange={(e) => setLbDraft(e.target.value)}
                  placeholder="letterboxd username"
                  aria-label="Letterboxd username"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveLbUser();
                    if (e.key === 'Escape') setEditingLb(false);
                  }}
                  className="cine-input"
                />
                </div>
                <button onClick={handleSaveLbUser} className="cine-control-btn px-4 h-10" aria-label="Save username">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => setEditingLb(false)} className="cine-icon-btn cine-icon-btn--sm" aria-label="Cancel">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-white/45">Letterboxd:</span>
                <span className="cine-chip cine-chip--neutral" style={{ color: 'var(--cine-accent)' }}>
                  {letterboxdUser}
                </span>
                <button
                  onClick={() => {
                    setLbDraft(letterboxdUser);
                    setEditingLb(true);
                  }}
                  className="text-[11px] font-semibold text-white/40 hover:text-white/80 transition cursor-pointer"
                >
                  Change
                </button>
              </div>
            )}
            {letterboxdError && (
              <p className="text-[11px] text-red-400/90">{letterboxdError}</p>
            )}
          </div>
        ) : editingLb ? (
          <div className="self-start lg:self-auto flex flex-col items-start lg:items-end gap-1.5">
            <div className="flex items-center gap-2">
              <div className="w-44">
              <input
                value={lbDraft}
                onChange={(e) => setLbDraft(e.target.value)}
                placeholder="letterboxd username"
                aria-label="Letterboxd username"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveLbUser();
                  if (e.key === 'Escape') setEditingLb(false);
                }}
                className="cine-input"
              />
              </div>
              <button onClick={handleSaveLbUser} className="cine-control-btn px-4 h-10" aria-label="Save username">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => setEditingLb(false)} className="cine-icon-btn cine-icon-btn--sm" aria-label="Cancel">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {letterboxdError && (
              <p className="text-[11px] text-red-400/90">{letterboxdError}</p>
            )}
          </div>
        ) : (
          <div className="mat-row self-start lg:self-auto flex items-center gap-3 pl-3 pr-2 py-2 max-w-sm">
            <span className="cine-disc cine-disc--dim w-9 h-9" aria-hidden="true">
              <Clapperboard className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-white">Letterboxd sync</span>
              <span className="block text-[11px] text-white/55 truncate">Watchlist + diary with posters</span>
            </span>
            <button
              onClick={() => {
                setLbDraft('');
                setEditingLb(true);
              }}
              className="cine-pill cine-pill--sm flex-shrink-0"
            >
              Connect
            </button>
          </div>
        )}
      </div>

      {/* One control block: the segment picks the library, the row below
          filters it. No eyebrows, no repeated headings — the active segment
          already says where you are. */}
      <div className="flex flex-col gap-3">
        <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={setView} size="lg" />
        {/* One filter row (Netflix My List pattern): compact dropdowns, no
            labeled pill groups. History keeps When; every view keeps Type
            + Genre. */}
        <div className="flex flex-wrap items-center gap-2.5">
          {view === 'history' && (
            <Picker
              value={whenFilter}
              onChange={setWhenFilter}
              ariaLabel="Filter by time"
              menuLabel="Time ranges"
              placeholder="When"
              options={WHEN_FILTERS}
            />
          )}
          <Picker
            value={typeFilter}
            onChange={setTypeFilter}
            ariaLabel="Filter by type"
            menuLabel="Types"
            placeholder="Type"
            options={TYPE_FILTERS}
          />
          <Picker
            value={genreFilter}
            onChange={setGenreFilter}
            ariaLabel="Filter by genre"
            menuLabel="Genres"
            placeholder="Genre"
            options={genreOptions}
          />
        </div>
      </div>

      {view === 'watchlater' && (
      <>
      {/* Watch Later — local and Letterboxd rows stay in their own groups
          (history-style heads), never mixed: remote rows carry no
          genre/type metadata. A separator appears only when both sides
          have something to separate. */}
      <section className="space-y-6">
        {showLbGroups && (
          <SegmentedControl
            label="Show"
            options={[
              { id: 'all', name: 'All' },
              { id: 'mine', name: 'Watchlist' },
              { id: 'letterboxd', name: 'Letterboxd' },
            ]}
            value={lbFilter}
            onChange={setLbFilter}
          />
        )}
        {resolvingId && (
          <p className="text-xs text-white/60">Looking up title on TMDB…</p>
        )}
        {!resolvingId && resolveError && (
          <p className="text-xs text-red-400/90">{resolveError}</p>
        )}
        {showMine && myList.length > 0 && (
          <div className="space-y-3">
            {showLbGroups && <h4 className="cine-group-head">Watchlist • {myList.length}</h4>}
            <div className="cine-grid">
            {myList.map((item) => {
              const key = `${item.id}_${item.title}`;
              const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
              const prog = progressByKey.get(`${mediaType}_${item.id}`);
              // Clock-only rows (duration unknown) badge the position,
              // not a dishonest "0% watched".
              const badge = !prog
                ? 'To Watch'
                : prog.percent >= WATCHED_PCT
                  ? 'Watched'
                  : prog.duration > 0
                    ? `${prog.percent}% watched`
                    : prog.currentTime > 0
                      ? `${formatClock(prog.currentTime)} in`
                      : 'To Watch';
              return (
              <div key={key} className="relative">
                <Card
                  media={item}
                  size="fluid"
                  onClick={(m) => onSelectMedia(m)}
                  showRating={false}
                />
                <span className="cine-chip cine-chip--solid absolute left-2 top-2">
                  {badge}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveWatchlist(item.id, item.title || item.name);
                  }}
                  className="cine-icon-btn cine-icon-btn--sm absolute right-2 top-2"
                  aria-label={`Remove "${item.title || item.name}" from Watch Later`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              );
            })}
            </div>
          </div>
        )}
        {showRemote && (
          <div className="space-y-3">
            {showLbGroups && <h4 className="cine-group-head">Letterboxd • {letterboxdVisible.length}</h4>}
            <div className="cine-grid">
              {letterboxdVisible.map((item) => (
                <div key={item.id} className="relative">
                  <Card
                    media={{
                      ...item,
                      poster_path: lbArt[item.id] || item.poster_path,
                    }}
                    size="fluid"
                    onClick={(m) => handleLetterboxdSelect(m)}
                    showRating={false}
                  />
                  <span className="cine-chip cine-chip--solid absolute left-2 top-2">
                    Letterboxd
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleHideLetterboxd(item);
                    }}
                    className="cine-icon-btn cine-icon-btn--sm absolute right-2 top-2"
                    aria-label={`Hide "${item.title}" from Letterboxd`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {(showMine && myList.length > 0) || showRemote ? null : (
          <EmptyState
            icon={<ListVideo className="w-5 h-5" />}
            title="Nothing saved yet"
            description="Tap + on any title to park it here for later."
          />
        )}
      </section>
      </>
      )}

      {view === 'watched' && (
      <section className="space-y-3">
        {watchedItems.length > 0 && (
          <div className="flex justify-end">
            <span className="text-xs text-white/40">{watchedItems.length} title{watchedItems.length === 1 ? '' : 's'}</span>
          </div>
        )}
        {watchedItems.length === 0 ? (
          <EmptyState
            icon={<Check className="w-5 h-5" />}
            title="Nothing marked watched yet"
            description="Finish a title past 95%, or tap ✓ on any history row."
          />
        ) : (
        <div className="space-y-2 cine-history-group">
          {watchedItems.map((h) => {
            const { media, fallback } = resumePayload(h);
            const posterUrl = tmdb.getImageUrl(h.poster, 'w185');
            return (
              <Row
                key={`${h.type}_${h.mediaId}_${h.updatedAt}`}
                poster={posterUrl}
                title={h.title}
                meta={`${h.type === 'tv' ? `S${h.season} E${h.episode}` : 'Movie'} • Watched • ${groupLabel(h.updatedAt)}`}
                onClick={() => onResume(media, fallback)}
                thumbClassName="w-20 h-28"
                titleClassName="text-sm md:text-base font-semibold text-white truncate"
                overlay={(
                  <span className="cine-cw-play-btn">
                    <Play className="w-3 h-3" fill="currentColor" />
                  </span>
                )}
                right={
                  <div className="flex items-center gap-2">
                    <span className="cine-chip cine-chip--accent">
                      <Check className="w-3 h-3" strokeWidth={3} />
                      Watched
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveHistory(h);
                      }}
                      className="cine-icon-btn cine-icon-btn--sm cine-has-tip"

                      aria-label={`Remove "${h.title}" from watched`}
                    >
                      <X className="w-3.5 h-3.5" />
                      <span className="cine-tip cine-tip--below" aria-hidden="true">Remove from watched</span>
                    </button>
                  </div>
                }
              />
            );
          })}
        </div>
        )}
      </section>
      )}

      {view === 'history' && (
      <section className="space-y-6">
        {historyGroups.length === 0 && (
          <EmptyState
            icon={<History className="w-5 h-5" />}
            title="No history yet"
            description="Press play on anything and it will show up here with your position."
          />
        )}
        {historyGroups.map(([label, items]) => (
          <div key={label} className="space-y-2 cine-history-group">
            <h4 className="cine-group-head">{label} • {items.length}</h4>
            <div className="space-y-2">
              {items.map((h) => {
                // History holds unfinished titles only (Watched lives in
                // its own tab) — no watched branch needed below.
                const { media, fallback } = resumePayload(h);
                const posterUrl = tmdb.getImageUrl(h.poster, 'w185');
                return (
                  <Row
                    key={`${h.type}_${h.mediaId}_${h.updatedAt}`}
                    poster={posterUrl}
                    title={h.title}
                    meta={`${h.type === 'tv' ? `S${h.season} E${h.episode}` : 'Movie'} • ${progressLabel(h)}`}
                    onClick={() => onResume(media, fallback)}
                    thumbClassName="w-20 h-28"
                    titleClassName="text-sm md:text-base font-semibold text-white truncate"
                    progress={h.percent > 0 ? h.percent : h.currentTime > 0 ? 4 : 0}
                    overlay={(
                      <span className="cine-cw-play-btn">
                        <Play className="w-3 h-3" fill="currentColor" />
                      </span>
                    )}
                    right={
                      <div className="flex items-center gap-2">
                        <span className="cine-chip cine-chip--neutral">
                          {h.type === 'tv' ? 'Show' : 'Movie'}
                        </span>
                        <div className="flex items-center gap-1" role="group" aria-label={`Actions for ${h.title}`}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkWatched(h);
                            }}
                            className="cine-icon-btn cine-icon-btn--xs cine-has-tip"
                            aria-label={`Mark "${h.title}" as watched`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span className="cine-tip cine-tip--below" aria-hidden="true">Mark watched</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveHistory(h);
                            }}
                            className="cine-icon-btn cine-icon-btn--xs cine-has-tip"
                            aria-label={`Remove "${h.title}" from history`}
                          >
                            <X className="w-3.5 h-3.5" />
                            <span className="cine-tip cine-tip--below" aria-hidden="true">Remove</span>
                          </button>
                        </div>
                      </div>
                    }
                  />
                );
              })}
            </div>
          </div>
        ))}
      </section>
      )}
    </div>
  );
}
