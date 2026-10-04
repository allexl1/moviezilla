import { useState, useEffect, useRef } from 'react';
import { Building2, ExternalLink } from 'lucide-react';
import { tmdb, FALLBACK_PROFILE, COUNTRIES } from '../services/tmdb';
import Card from './ui/Card';
import { SkelGrid } from './ui';

// Dark-logo rescue: black logos vanish on our background. Sample the
// pixels on load — near-black monochrome marks get inverted to white,
// colored and light logos pass through untouched.
function useInvertedLogo(src) {
  const [invert, setInvert] = useState(false);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    setInvert(false);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = 8;
          c.height = 8;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, 8, 8);
          const d = ctx.getImageData(0, 0, 8, 8).data;
          let lum = 0;
          let n = 0;
          for (let i = 0; i < d.length; i += 16) {
            const a = d[i + 3];
            if (a < 24) continue;
            lum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
            n += 1;
          }
          if (alive && n > 0 && lum / n < 0.35) setInvert(true);
        } catch {
          // tainted canvas or no 2d — logo shows as shipped
        }
      };
      img.src = src;
    } catch {
      // ignore
    }
    return () => { alive = false; };
  }, [src]);
  return invert;
}

// Joined segmented filter (actor-page language): one track, sliding white
// thumb. 2 options only here.
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
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`cine-seg-btn${value === o.id ? ' is-active' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

// Studio page (actor-derived): big bare logo (no box), origin/HQ/homepage
// info line, segmented Movies/Shows rail, top billed faces aggregated
// from the most popular titles, full grid with load more. Same
// loading/empty/error contract as every shelf.
export default function StudioView({ studioId, onSelectMedia, onSelectPerson, onToast }) {
  const [company, setCompany] = useState(null);
  const [tab, setTab] = useState('movie');
  const [movies, setMovies] = useState([]);
  const [shows, setShows] = useState([]);
  const [moviePage, setMoviePage] = useState(1);
  const [tvPage, setTvPage] = useState(1);
  const [movieTotal, setMovieTotal] = useState(0);
  const [tvTotal, setTvTotal] = useState(0);
  const [faces, setFaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!studioId) return;
    let alive = true;
    setLoading(true);
    setError('');
    setMovies([]);
    setShows([]);
    setFaces([]);
    setTab('movie');
    setMoviePage(1);
    setTvPage(1);
    Promise.all([
      tmdb.getCompany(studioId).catch(() => null),
      tmdb.getCompanyTitles(studioId, 'movie', 1).catch(() => ({ results: [], total_results: 0 })),
      tmdb.getCompanyTitles(studioId, 'tv', 1).catch(() => ({ results: [], total_results: 0 })),
    ])
      .then(async ([co, mv, tv]) => {
        if (!alive) return;
        if (!co && (mv?.results || []).length === 0 && (tv?.results || []).length === 0) {
          setError('Could not load this studio. Check your connection.');
        }
        setCompany(co);
        setMovies(mv?.results || []);
        setShows(tv?.results || []);
        setMovieTotal(mv?.total_results || 0);
        setTvTotal(tv?.total_results || 0);
        // No movies (e.g. TV-only studios): open on Shows, no dead tab.
        if ((mv?.results || []).length === 0 && (tv?.results || []).length > 0) setTab('tv');
        setLoading(false);
        // Top billed faces: cast of the 8 most popular titles, deduped in
        // credit order. Details ride the 5-minute cache, one pass only.
        try {
          const top = [...(mv?.results || []), ...(tv?.results || [])]
            .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
            .slice(0, 8);
          const seen = new Set();
          const out = [];
          for (const t of top) {
            if (!alive || out.length >= 12) break;
            const type = t.first_air_date ? 'tv' : 'movie';
            try {
              const d = await tmdb.getMediaDetails(type, t.id);
              for (const c of d?.credits?.cast || []) {
                if (out.length >= 12) break;
                if (!c?.id || seen.has(c.id) || !c.profile_path) continue;
                seen.add(c.id);
                out.push(c);
              }
            } catch {
              // one title failing never blocks the strip
            }
          }
          if (alive) setFaces(out);
        } catch {
          // faces are a bonus, never an error
        }
      })
      .catch(() => {
        if (alive) {
          setError('Could not load this studio. Check your connection.');
          setLoading(false);
        }
      });
    return () => { alive = false; };
  }, [studioId, retry]);

  const loadMore = () => {
    const isMovie = tab === 'movie';
    const next = (isMovie ? moviePage : tvPage) + 1;
    setLoadingMore(true);
    tmdb
      .getCompanyTitles(studioId, isMovie ? 'movie' : 'tv', next)
      .then((res) => {
        const list = res?.results || [];
        if (isMovie) {
          setMovies((prev) => [...prev, ...list]);
          setMoviePage(next);
        } else {
          setShows((prev) => [...prev, ...list]);
          setTvPage(next);
        }
      })
      .catch(() => {
        onToast?.('Could not load more. Retry.');
      })
      .finally(() => setLoadingMore(false));
  };

  const items = tab === 'movie' ? movies : shows;
  const total = tab === 'movie' ? movieTotal : tvTotal;
  const hasMore = items.length > 0 && items.length < total;
  const hasMovies = movieTotal > 0 || movies.length > 0;
  const hasShows = tvTotal > 0 || shows.length > 0;
  const countryName =
    COUNTRIES.find((c) => c.id === company?.origin_country)?.name || company?.origin_country || null;
  const logoSrc = company?.logo_path ? tmdb.getImageUrl(company.logo_path, 'w500') : null;
  const invertLogo = useInvertedLogo(logoSrc);

  return (
    <div className="relative min-h-screen text-white pb-24 animate-in fade-in duration-300">
      <div className="relative z-20 max-w-[1560px] mx-auto px-6 md:px-14 pt-24 md:pt-28 space-y-10">
        {loading ? (
          <SkelGrid count={12} />
        ) : error && !company && items.length === 0 ? (
          <div className="flex items-center justify-center gap-3 py-16 text-xs text-white/60">
            <span>{error}</span>
            <button onClick={() => setRetry((r) => r + 1)} className="cine-control-btn">
              Retry
            </button>
          </div>
        ) : (
          <>
            <section className="space-y-4 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/50 flex items-center justify-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> Studio
              </p>
              {logoSrc ? (
                <img
                  src={logoSrc}
                  alt={company.name || 'Studio'}
                  className="max-h-36 md:max-h-44 w-auto max-w-full object-contain object-center mx-auto"
                  style={invertLogo ? { filter: 'invert(1)' } : undefined}
                  loading="lazy"
                />
              ) : null}
              <h1 className="text-3xl md:text-5xl font-black tracking-tight">
                {company?.name || 'Studio'}
              </h1>
              <p className="text-xs text-white/60 flex flex-wrap items-center justify-center gap-2">
                {countryName && (
                  <span className="cine-chip cine-chip--neutral">{countryName}</span>
                )}
                {company?.headquarters && <span>{company.headquarters}</span>}
                <span>{movieTotal + tvTotal} title{(movieTotal + tvTotal) === 1 ? '' : 's'}</span>
                {company?.homepage && (
                  <a
                    href={company.homepage}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-white/80 font-semibold hover:text-white hover:underline transition"
                  >
                    Website <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </p>
            </section>

            {faces.length > 0 && (
              <section className="space-y-3">
                <h2 className="cine-section-title">Top billed</h2>
                <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2">
                  {faces.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => onSelectPerson?.(a.id)}
                      className="group flex-shrink-0 w-28 text-center space-y-2 cursor-pointer"
                      aria-label={`Open ${a.name}'s profile`}
                    >
                      <span className="block w-28 h-28 mx-auto rounded-full overflow-hidden bg-white/5 border border-white/10 group-hover:border-white/30 transition group-hover:-translate-y-1">
                        <img
                          src={tmdb.getImageUrl(a.profile_path, 'w185', FALLBACK_PROFILE)}
                          alt={a.name}
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={(e) => { e.target.src = FALLBACK_PROFILE; }}
                        />
                      </span>
                      <span className="block text-xs font-bold text-white/85 leading-tight line-clamp-2 group-hover:text-white group-hover:underline">
                        {a.name}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-4">
              <div className="flex justify-center">
                {hasMovies && hasShows ? (
                  <SegFilter
                    label="Studio catalog"
                    value={tab}
                    onChange={setTab}
                    options={[
                      { id: 'movie', label: `Movies${movieTotal ? ` (${movieTotal})` : ''}` },
                      { id: 'tv', label: `Shows${tvTotal ? ` (${tvTotal})` : ''}` },
                    ]}
                  />
                ) : (
                  <p className="text-xs font-semibold text-white/60">
                    {hasMovies ? `Movies${movieTotal ? ` (${movieTotal})` : ''}` : `Shows${tvTotal ? ` (${tvTotal})` : ''}`}
                  </p>
                )}
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-white/60 py-10 text-center">
                  No {tab === 'movie' ? 'movies' : 'shows'} indexed for this studio yet.
                </p>
              ) : (
                <div className="cine-grid">
                  {items.map((m) => (
                    <Card
                      key={`${tab}_${m.id}`}
                      media={{ ...m, media_type: tab }}
                      onClick={onSelectMedia}
                      size="fluid"
                      posterOnly
                    />
                  ))}
                </div>
              )}
              {hasMore && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="cine-control-btn h-11 px-6 text-sm disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
