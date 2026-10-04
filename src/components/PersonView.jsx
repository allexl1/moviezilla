import { useState, useEffect, useRef } from 'react';
import { Cake, MapPin, Trophy, ExternalLink, X, Globe } from 'lucide-react';
import { tmdb, FALLBACK_PROFILE, deptName } from '../services/tmdb';
import { getAwardsByImdb, ageOf } from '../services/wikidata';
import RowRail from './RowRail';
import ClampedText from './ClampedText';
import { SkelRail } from './ui';

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const dateOf = (x) => x?.release_date || x?.first_air_date || '';

// Joined segmented filter (reference pattern): one track, sliding white
// thumb — same FLIP language as the navbar thumb. 2–4 options only.
function SegFilter({ options, value, onChange, label }) {
  const boxRef = useRef(null);
  const [thumb, setThumb] = useState(null);
  useEffect(() => {
    const measure = () => {
      const box = boxRef.current;
      if (!box) return;
      const btn = box.querySelector(`[data-seg="${value}"]`);
      if (!btn) return;
      setThumb((prev) => {
        const next = { x: btn.offsetLeft, w: btn.offsetWidth };
        if (prev && prev.x === next.x && prev.w === next.w) return prev;
        return next;
      });
    };
    measure();
    window.addEventListener('resize', measure);
    // Font load/swap changes button widths without resizing: re-measure
    // when webfonts settle (same as the navbar thumb).
    try {
      document.fonts?.ready?.then(() => measure());
    } catch {
      // ignore
    }
    return () => window.removeEventListener('resize', measure);
  }, [value, options.length]);
  return (
    <span ref={boxRef} className="cine-seg" role="group" aria-label={label}>
      {thumb && (
        <span
          className="cine-seg-thumb"
          aria-hidden="true"
          style={{ transform: `translateX(${thumb.x}px)`, width: thumb.w }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.id}
          data-seg={o.id}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`cine-seg-btn ${value === o.id ? 'is-active' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

// Dedupe combined credits (TMDB repeats ids across cast/crew entries).
function dedupeCredits(list) {
  const seen = new Set();
  return (list || []).filter((x) => {
    const k = `${x.media_type || (x.first_air_date ? 'tv' : 'movie')}_${x.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export default function PersonView({ personId, onSelectMedia }) {
  const [person, setPerson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [honoursExpanded, setHonoursExpanded] = useState(false);
  const [awards, setAwards] = useState([]);
  const [zoom, setZoom] = useState(null);
  // Career slice: All + only non-empty slices (white-active pills, same
  // language as the nav — 4 options max, never a 5+ segment).
  const [careerFilter, setCareerFilter] = useState('all');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    setHonoursExpanded(false);
    // A new person always opens on All: a stale Directing slice from the
    // last profile would otherwise greet them with an empty view.
    setCareerFilter('all');
    tmdb
      .getPersonDetails(personId)
      .then((data) => {
        if (alive) {
          setPerson(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [personId, retry]);

  // Zoomed photo lightbox — Esc or tap anywhere to close. Locks body
  // scroll like Modal does, otherwise the page slides behind the photo.
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setZoom(null);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [zoom]);

  const imdbId = person?.imdb_id || person?.external_ids?.imdb_id || null;

  // Awards resolve through the IMDb id (Wikidata, cached, silent on miss).
  useEffect(() => {
    let alive = true;
    setAwards([]);
    if (!imdbId) return;
    getAwardsByImdb(imdbId).then((list) => {
      if (alive) setAwards(list);
    });
    return () => {
      alive = false;
    };
  }, [imdbId]);

  if (loading) {
    return (
      <div className="relative min-h-screen text-white pb-24 bg-[#161a23]" aria-hidden="true">
        <div className="max-w-[1560px] mx-auto px-6 md:px-14 pt-28 md:pt-32 space-y-10">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="skel w-40 md:w-52 aspect-[2/3] rounded-3xl flex-shrink-0" />
            <div className="flex-1 space-y-3 pt-1">
              <div className="skel h-12 md:h-16 w-2/3 rounded-2xl" />
              <div className="skel h-4 w-1/3 rounded-full" />
              <div className="skel h-4 w-1/2 rounded-full" />
            </div>
          </div>
          <SkelRail title />
        </div>
      </div>
    );
  }

  if (failed || !person) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-xs text-white/60">
        <span>Couldn't load this profile.</span>
        <button onClick={() => setRetry((r) => r + 1)} className="cine-control-btn">
          Retry
        </button>
      </div>
    );
  }

  const age = ageOf(person.birthday, person.deathday);
  const dead = Boolean(person.deathday && formatDate(person.deathday));
  // Talk shows inflate everything: a dozen "Self" appearances outrank the
  // real work by raw popularity (and their backdrops depict strangers, so
  // the hero showed the wrong face). They live outside both pools. TMDB
  // writes them as "Self", "Self - Host", "Self (voice)", "Himself", …
  const isTalkNoise = (x) => {
    if ((x.genre_ids || []).includes(10767)) return true;
    const c = String(x.character || '').trim();
    return /^(self(\s*[-–(]|$)|himself|herself)/i.test(c);
  };
  // Full credit pool: cast first (character kept), then directing crew.
  // Directors who also act keep their cast entry; the job label survives
  // on crew-only titles.
  const castPool = dedupeCredits([
    ...((person.movie_credits?.cast || []).map((x) => ({ ...x, media_type: 'movie' }))),
    ...((person.tv_credits?.cast || []).map((x) => ({ ...x, media_type: 'tv' }))),
  ]).filter((x) => !x.adult && x.poster_path && !isTalkNoise(x));
  const crewPool = dedupeCredits([
    ...((person.movie_credits?.crew || []).filter((x) => x.job === 'Director').map((x) => ({ ...x, media_type: x.media_type || 'movie' }))),
    ...((person.tv_credits?.crew || []).filter((x) => x.job === 'Director').map((x) => ({ ...x, media_type: x.media_type || 'tv' }))),
  ]).filter((x) => !x.adult && x.poster_path);
  const haveIds = new Set(castPool.map((x) => `${x.media_type}_${x.id}`));
  const crewOnly = crewPool.filter((x) => !haveIds.has(`${x.media_type}_${x.id}`));
  const pool = [...castPool, ...crewOnly];
  // Known For: popularity-ranked top 6 of ACTING work (IMDb orientation
  // cue — same acting-only rule as the Movies/Shows slices).
  const knownFor = [...castPool]
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 6);
  // Career: everything newest-first (the story: breakout, peak, now).
  // Dateless strays anchor the end.
  const career = [...pool].sort((a, b) => {
    const da = dateOf(a);
    const db = dateOf(b);
    if (!da && !db) return (b.popularity || 0) - (a.popularity || 0);
    if (!da) return 1;
    if (!db) return -1;
    return db.localeCompare(da) || (b.popularity || 0) - (a.popularity || 0);
  });
  // Hero art is gone (verdict): movie backdrops depicted strangers, and
  // even the portrait blur left dead space. Flat frozen gray instead.
  const bio = person.biography || '';
  const photos = (person.images?.profiles || []).filter((p) => p.file_path).slice(0, 10);

  // Career slice filter. Empty slices never render an option: no
  // Directing pill when they never directed, no Movies/Shows pill when
  // the career has none of that type — a filter must never open an
  // empty view. Movies/Shows are ACTING only (cast credits); directing
  // lives exclusively in Directing, even for titles of that type.
  const crewKeys = new Set(crewOnly.map((x) => `${x.media_type}_${x.id}`));
  const castKeys = new Set(castPool.map((x) => `${x.media_type}_${x.id}`));
  const isActing = (x) => castKeys.has(`${x.media_type}_${x.id}`);
  const careerCounts = { movie: 0, tv: 0, director: 0 };
  for (const x of career) {
    if (x.media_type === 'movie' && isActing(x)) careerCounts.movie += 1;
    if (x.media_type === 'tv' && isActing(x)) careerCounts.tv += 1;
    if (crewKeys.has(`${x.media_type}_${x.id}`)) careerCounts.director += 1;
  }
  const CAREER_FILTERS = [
    { id: 'all', label: 'All' },
    ...(careerCounts.movie > 0 ? [{ id: 'movie', label: 'Movies' }] : []),
    ...(careerCounts.tv > 0 ? [{ id: 'tv', label: 'Shows' }] : []),
    ...(careerCounts.director > 0 ? [{ id: 'director', label: 'Directing' }] : []),
  ];
  // Stale value guard (e.g. Directing persisted into a profile without
  // any): fall back to All instead of an empty view.
  const effectiveFilter = CAREER_FILTERS.some((f) => f.id === careerFilter) ? careerFilter : 'all';
  const careerShown = career.filter((x) => {
    if (effectiveFilter === 'movie') return x.media_type === 'movie' && isActing(x);
    if (effectiveFilter === 'tv') return x.media_type === 'tv' && isActing(x);
    if (effectiveFilter === 'director') return crewKeys.has(`${x.media_type}_${x.id}`);
    return true;
  });

  // Honours glory line: group free-text labels by award family. Says
  // "honours" — never "wins": the source doesn't distinguish, and we
  // don't guess with gold paint. Counts singularize honestly (1 Oscar,
  // not 1 Oscars).
  const AWARD_FAMILIES = [
    [/academy/i, 'Oscar', 'Oscars'],
    [/golden globe/i, 'Globe', 'Globes'],
    [/emmy/i, 'Emmy', 'Emmys'],
    [/bafta/i, 'BAFTA', 'BAFTAs'],
    [/grammy/i, 'Grammy', 'Grammys'],
    [/screen actors guild/i, 'SAG Award', 'SAG Awards'],
  ];
  const famCounts = new Map();
  for (const a of awards) {
    const fam = AWARD_FAMILIES.find(([re]) => re.test(a?.label || ''));
    if (fam) famCounts.set(fam[1], (famCounts.get(fam[1]) || 0) + 1);
  }
  const famName = (one) => AWARD_FAMILIES.find(([, s]) => s === one)?.[2] || `${one}s`;
  const glory = [
    ...[...famCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([one, c]) => `${c} ${c === 1 ? one : famName(one)}`),
    `${awards.length} honour${awards.length === 1 ? '' : 's'}`,
  ].join(' • ');
  const awardsSorted = [...awards].sort(
    (a, b) => (parseInt(b.year, 10) || -1) - (parseInt(a.year, 10) || -1)
  );
  // Honours progressive disclosure: glory + first rows stay visible, the
  // rest opens on tap (Robin Williams has 23 — nobody scrolls 23 gold
  // rows to reach Known For).
  const HONOURS_VISIBLE = 4;
  const honoursShown = honoursExpanded ? awardsSorted : awardsSorted.slice(0, HONOURS_VISIBLE);

  return (
    <div className="relative min-h-screen text-white pb-24 animate-in fade-in duration-300 bg-[#161a23]">
      {/* Light frozen slate, side-anchored identity (reference rule): no
          photographic layers anywhere, no dead half-screen, bio rides the
          right column at full measure. */}
      <div className="relative z-10 max-w-[1560px] mx-auto px-6 md:px-14 pt-28 md:pt-32 space-y-10">
        <header className="flex flex-col sm:flex-row gap-6 sm:items-start">
          <button
            onClick={() => person.profile_path && setZoom(tmdb.getImageUrl(person.profile_path, 'original'))}
            className="group w-40 md:w-52 flex-shrink-0 aspect-[2/3] rounded-3xl overflow-hidden bg-[var(--cine-surface-strong)] border border-[var(--cine-glass-border)] shadow-2xl cursor-zoom-in"
            aria-label={`Enlarge photo of ${person.name}`}
          >
            <img
              src={tmdb.getImageUrl(person.profile_path, 'w500', FALLBACK_PROFILE)}
              alt={person.name}
              className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
              onError={(e) => {
                e.target.src = FALLBACK_PROFILE;
              }}
            />
          </button>

          <div className="min-w-0 flex-1 space-y-3 pt-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">
              {deptName(person.known_for_department)}
            </p>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight">
              {person.name}
            </h1>

            {/* Facts: solid chips, no zodiac. Dead? Lifespan, not a living
                age. */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {person.birthday && !dead && (
                <span className="cine-chip cine-chip--solid">
                  <Cake className="w-3 h-3" />
                  {formatDate(person.birthday)}
                  {age != null && <span className="text-white/60">({age})</span>}
                </span>
              )}
              {person.birthday && dead && (
                <span className="cine-chip cine-chip--solid">
                  <Cake className="w-3 h-3" />
                  {formatDate(person.birthday)} – {formatDate(person.deathday)}
                  {age != null && <span className="text-white/60">({age})</span>}
                </span>
              )}
              {person.place_of_birth && (
                <span className="cine-chip cine-chip--solid">
                  <MapPin className="w-3 h-3" />
                  {person.place_of_birth}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {imdbId && (
                <a
                  href={`https://www.imdb.com/name/${imdbId}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="cine-imdb-tag"
                  aria-label="Open on IMDb"
                >
                  <span className="cine-imdb-logo">IMDb</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {person.homepage && (
                <a
                  href={person.homepage}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-semibold text-white/50 hover:text-white transition inline-flex items-center gap-1"
                  aria-label="Open official site"
                >
                  <Globe className="w-3 h-3" /> Official site
                </a>
              )}
              <a
                href={`https://www.themoviedb.org/person/${person.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-semibold text-white/50 hover:text-white transition inline-flex items-center gap-1"
                aria-label="Open on TMDB"
              >
                TMDB <ExternalLink className="w-3 h-3" />
              </a>
              {awards.length > 0 && (
                <a
                  href="#honours"
                  className="text-[11px] font-semibold text-white/50 hover:text-white transition inline-flex items-center gap-1"
                  aria-label={`Jump to honours, ${awards.length}`}
                >
                  <Trophy className="w-3 h-3" /> Honours ({awards.length})
                </a>
              )}
            </div>

            {/* Bio rides the column at full measure (reference rule) with
                the honest ghost line when TMDB has nothing. */}
            {bio ? (
              <div className="pt-1">
                <ClampedText text={bio} />
              </div>
            ) : (
              <p className="text-sm italic text-white/40 pt-1">
                No biography yet. Nobody has written one for {person.name} on TMDB.
              </p>
            )}
          </div>
        </header>

        {/* Photo gallery — every profile TMDB has, sideways scroll. */}
        {photos.length > 1 && (
          <section className="space-y-3">
            <h3 className="cine-section-title">Photos</h3>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
              {photos.map((p, i) => (
                <button
                  key={`${p.file_path}_${i}`}
                  onClick={() => setZoom(tmdb.getImageUrl(p.file_path, 'original'))}
                  className="group w-28 md:w-36 flex-shrink-0 aspect-[2/3] rounded-2xl overflow-hidden bg-[var(--cine-surface-strong)] border border-[var(--cine-glass-border)] cursor-zoom-in"

                  aria-label={`Enlarge photo ${i + 1} of ${person.name}`}
                >
                  <img
                    src={tmdb.getImageUrl(p.file_path, 'w300')}
                    alt={`${person.name} photo ${i + 1}`}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                  />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Awards — glory line + year-first rows (IMDb scan). Count lives
            in the title as a chip, never floating at the row end. Silent
            when empty. */}
        {awards.length > 0 && (
          <section id="honours" className="space-y-3 scroll-mt-28">
            <div className="cine-section-head">
              <h2 className="cine-section-title inline-flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[#f5c518]" />
                Honours
                <span className="cine-chip cine-chip--solid">{awards.length}</span>
              </h2>
            </div>
            <p className="text-xs font-semibold text-white/60">{glory}</p>
            <div className="space-y-2">
              {honoursShown.map((a, i) => (
                <div key={`${a.label}_${a.year}_${i}`} className="mat-row flex items-center gap-3 px-4 py-3">
                  <span className="text-[11px] font-bold tabular-nums text-white/40 w-10 flex-shrink-0">
                    {a.year || '-'}
                  </span>
                  <Trophy className="w-3.5 h-3.5 text-[#f5c518] flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-white truncate">{a.label}</span>
                    {a.work && (
                      <span className="block text-[11px] text-white/50 truncate">{a.work}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {awards.length > HONOURS_VISIBLE && (
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

        {/* Known For: popularity-ranked orientation (IMDb rule). */}
        {knownFor.length > 0 && (
          <RowRail
            title="Known For"
            items={knownFor}
            onSelect={onSelectMedia}
            showRating
            showRole
            captioned
          />
        )}

        {/* Career: the whole story newest-first with role context —
            joined sliding filter (reference rule), replacing the
            three-way split. */}
        {career.length > 0 && (
          <RowRail
            // Remount per slice: a reused rail DOM keeps the previous
            // slice's scrollLeft, which reads as the rail "going right"
            // into empty space on short lists. Fresh DOM = anchored left.
            key={effectiveFilter}
            title="Career"
            filterNode={
              CAREER_FILTERS.length > 1 ? (
                <SegFilter
                  label="Filter career"
                  options={CAREER_FILTERS}
                  value={effectiveFilter}
                  onChange={setCareerFilter}
                />
              ) : null
            }
            items={careerShown}
            onSelect={onSelectMedia}
            showRating
            showRole
            captioned
            expandable
          />
        )}

        {/* Minimum viable page: portrait + words above always render; this
            only shows when TMDB indexed literally nothing watchable. */}
        {knownFor.length === 0 && career.length === 0 && (
          <p className="text-center py-8 text-xs text-white/60">
            No credits indexed for {person.name} yet.
          </p>
        )}
      </div>

      {/* Full-photo lightbox */}
      {zoom && (
        <div
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-md p-6 animate-in fade-in duration-200 cursor-zoom-out"
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
        >
          <button
            onClick={() => setZoom(null)}
            className="cine-icon-btn absolute top-5 right-5"

            aria-label="Close photo viewer"
          >
            <X className="w-4 h-4" />
          </button>
          <img
            src={zoom}
            alt={person.name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-full w-auto rounded-3xl border border-[var(--cine-glass-border)] shadow-2xl object-contain cursor-default"
          />
        </div>
      )}
    </div>
  );
}
