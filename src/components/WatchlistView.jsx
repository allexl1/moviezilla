import React, { useState } from 'react';
import { Play, ListVideo, X, Check, Pencil } from 'lucide-react';
import { tmdb, FALLBACK_POSTER, MOVIE_GENRES, TV_GENRES } from '../services/tmdb';
import { storage } from '../services/storage';
import { letterboxd } from '../services/letterboxd';
import Card from './ui/Card';
import Select from './ui/Select';
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

export default function WatchlistView({ onSelectMedia, onResume, onOpenSettings, letterboxdUser, onToast, onSaveLetterboxd }) {
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
      setResolveError(`Could not look up "${item.title}" — check connection and retry.`);
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

  const matchType = (t) => typeFilter === 'all' || t === typeFilter;
  const matchGenre = (ids) =>
    !genreFilter || (ids || []).map(String).includes(String(genreFilter));
  const genreOptions = (() => {
    const ids = new Set();
    history.forEach((h) => (h.genres || []).forEach((g) => ids.add(String(g))));
    watchlist.forEach((w) => (w.genre_ids || []).forEach((g) => ids.add(String(g))));
    return [{ value: '', label: 'All Genres' }].concat(
      [...ids]
        .filter((id) => GENRE_NAME[id])
        .sort((a, b) => GENRE_NAME[a].localeCompare(GENRE_NAME[b]))
        .map((id) => ({ value: id, label: GENRE_NAME[id] }))
    );
  })();

  const continueItems = history.filter(
    (h) => h.percent > 2 && h.percent < 95 && matchType(h.type) && matchGenre(h.genres)
  );

  const watchedItems = history.filter(
    (h) => h.percent >= 95 && matchType(h.type) && matchGenre(h.genres) && inWhenFilter(h.updatedAt, whenFilter)
  );

  const historyGroups = (() => {
    const groups = new Map();
    history
      .filter((h) => matchType(h.type) && matchGenre(h.genres) && inWhenFilter(h.updatedAt, whenFilter))
      .forEach((h) => {
        const label = groupLabel(h.updatedAt);
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(h);
      });
    return [...groups.entries()];
  })();

  const myList = (() => {
    const local = watchlist.filter((w) => {
      const t = w.media_type || (w.first_air_date ? 'tv' : 'movie');
      return matchType(t) && matchGenre(w.genre_ids);
    });
    // Letterboxd RSS items carry no genre/type metadata — show them unless
    // the user is filtering by something they can't match. Locally hidden
    // (dismissed) ids stay gone.
    const hidden = new Set(storage.getHiddenLetterboxd());
    const remote = !genreFilter
      ? (letterboxdList || []).filter((r) => !hidden.has(r.id) && matchType('movie'))
      : [];
    return [...local, ...remote];
  })();

  const watchedLabel = (h) => {
    if (h.percent < 95) return `${h.percent}%`;
    return 'Watched';
  };

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
                <span className="cine-chip cine-chip--accent">
                  Letterboxd: {letterboxdUser}
                </span>
                <button
                  onClick={() => {
                    setLbDraft(letterboxdUser);
                    setEditingLb(true);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/50 hover:text-white transition cursor-pointer"
                  title="Change Letterboxd username"
                >
                  <Pencil className="w-3 h-3" />
                  Change
                </button>
              </div>
            )}
            {letterboxdError && (
              <p className="text-[11px] text-red-400/90">{letterboxdError}</p>
            )}
          </div>
        ) : (
          <button onClick={onOpenSettings} className="cine-control-btn self-start lg:self-auto">
            Connect Letterboxd
          </button>
        )}
      </div>

      {/* View switch — the primary control (large, own block). Filters below
          are subordinate (compact) and contextual per view. */}
      <div className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/50">Library</h3>
        <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={setView} size="lg" />
      </div>

      {/* Filters — only the ones that apply to the current view.
          History gets When (week/month/year ranges); every view keeps
          Type + Genre so the two groups never blur together. */}
      <div className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/50">Filters</h3>
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
          {view === 'history' && (
            <SegmentedControl label="When" options={WHEN_FILTERS} value={whenFilter} onChange={setWhenFilter} />
          )}
          <div className="flex items-center gap-2.5">
            <SegmentedControl label="Type" options={TYPE_FILTERS} value={typeFilter} onChange={setTypeFilter} />
            <Select value={genreFilter} onChange={setGenreFilter} options={genreOptions} label="Filter by genre" />
          </div>
        </div>
      </div>

      {view === 'watchlater' && (
      <>
      {/* Continue Watching */}
      {continueItems.length > 0 && (
        <section className="space-y-3">
        <div className="cine-section-head">
          <h2 className="cine-section-title">Continue Watching</h2>
        </div>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {continueItems.map((item) => {
              const { media, fallback } = resumePayload(item);
              return (
                <div
                  key={`${item.type}_${item.mediaId}`}
                  onClick={() => onResume(media, fallback)}
                  className="cine-cw-card group"
                >
                  <div className="cine-cw-thumb">
                    <img
                      src={tmdb.getImageUrl(item.poster, 'w300')}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      onError={(e) => {
                        e.target.src = FALLBACK_POSTER;
                      }}
                    />
                    <div className="cine-cw-play">
                      <div className="cine-cw-play-btn">
                        <Play className="w-3 h-3" fill="currentColor" />
                      </div>
                    </div>
                  </div>
                  <h4 className="cine-cw-title">{item.title}</h4>
                  <p className="cine-cw-meta">
                    {item.type === 'tv'
                      ? `Season ${item.season} • Episode ${item.episode}`
                      : 'Movie'}{' '}
                    • {groupLabel(item.updatedAt)}
                  </p>
                  <div className="cine-cw-progress">
                    <div className="cine-cw-progress-fill" style={{ width: `${item.percent}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Watch Later */}
      <section className="space-y-3">
        <div className="cine-section-head">
          <h2 className="cine-section-title">Watch Later</h2>
          <span className="text-xs text-white/60">{myList.length} titles</span>
        </div>
        {resolvingId && (
          <p className="text-xs text-white/60">Looking up title on TMDB…</p>
        )}
        {!resolvingId && resolveError && (
          <p className="text-xs text-red-400/90">{resolveError}</p>
        )}
        {myList.length === 0 ? (
          <EmptyState
            icon={<ListVideo className="w-5 h-5" />}
            title="Nothing saved yet"
            description="Tap + on any title to park it here for later."
          />
        ) : (
          <div className="cine-grid">
            {myList.map((item) => {
              const key = `${item.id}_${item.title}`;
              const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
              const prog = progressByKey.get(`${mediaType}_${item.id}`);
              const badge = prog
                ? prog.percent >= 95 ? 'Watched' : `${prog.percent}% watched`
                : item.source === 'letterboxd' ? 'Letterboxd' : 'To Watch';
              const isLocal = item.source !== 'letterboxd';
              return (
              <div key={key} className="relative">
                <Card
                  media={item}
                  size="fluid"
                  onClick={(m) =>
                    m.source === 'letterboxd' ? handleLetterboxdSelect(m) : onSelectMedia(m)
                  }
                  showRating={false}
                />
                <span className="cine-chip cine-chip--neutral absolute left-2 top-2">
                  {badge}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isLocal) {
                      handleRemoveWatchlist(item.id, item.title || item.name);
                    } else {
                      handleHideLetterboxd(item);
                    }
                  }}
                  className="cine-icon-btn cine-icon-btn--sm absolute right-2 top-2"
                  title={`Remove "${item.title || item.name}"`}
                  aria-label={`Remove "${item.title || item.name}" from Watch Later`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              );
            })}
          </div>
        )}
      </section>
      </>
      )}

      {view === 'watched' && (
      <section className="space-y-3">
        <div className="cine-section-head">
          <h2 className="cine-section-title">Watched</h2>
          <span className="text-xs text-white/60">{watchedItems.length} titles</span>
        </div>
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
            return (
              <Row
                key={`${h.type}_${h.mediaId}_${h.updatedAt}`}
                poster={tmdb.getImageUrl(h.poster, 'w185')}
                title={h.title}
                meta={`${h.type === 'tv' ? `S${h.season} E${h.episode}` : 'Movie'} • Watched • ${groupLabel(h.updatedAt)}`}
                onClick={() => onResume(media, fallback)}
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
                      className="cine-icon-btn cine-icon-btn--sm"
                      title={`Remove "${h.title}"`}
                      aria-label={`Remove "${h.title}" from history`}
                    >
                      <X className="w-3.5 h-3.5" />
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
        <div className="cine-section-head">
          <h2 className="cine-section-title">History</h2>
        </div>
        {historyGroups.length === 0 && (
          <p className="text-xs text-white/60">Nothing watched yet — press play on anything.</p>
        )}
        {historyGroups.map(([label, items]) => (
          <div key={label} className="space-y-2 cine-history-group">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white/60">{label}</h4>
            <div className="space-y-2">
              {items.map((h) => {
                const { media, fallback } = resumePayload(h);
                const watched = h.percent >= 95;
                return (
                  <Row
                    key={`${h.type}_${h.mediaId}_${h.updatedAt}`}
                    poster={tmdb.getImageUrl(h.poster, 'w185')}
                    title={h.title}
                    meta={`${h.type === 'tv' ? `S${h.season} E${h.episode}` : 'Movie'} • ${watchedLabel(h)}`}
                    onClick={() => onResume(media, fallback)}
                    right={
                      <div className="flex items-center gap-2">
                        <span className="cine-chip cine-chip--neutral">
                          {watched ? 'Watched' : h.type === 'tv' ? 'Show' : 'Movie'}
                        </span>
                        {!watched && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkWatched(h);
                            }}
                            className="cine-icon-btn cine-icon-btn--sm"
                            title={`Mark "${h.title}" watched`}
                            aria-label={`Mark "${h.title}" as watched`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveHistory(h);
                          }}
                          className="cine-icon-btn cine-icon-btn--sm"
                          title={`Remove "${h.title}"`}
                          aria-label={`Remove "${h.title}" from history`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
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
