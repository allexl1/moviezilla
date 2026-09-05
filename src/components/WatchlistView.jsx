import React, { useState } from 'react';
import { Play, ListVideo } from 'lucide-react';
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

function dayLabel(ts) {
  const day = 24 * 60 * 60 * 1000;
  const today = startOfDay(Date.now());
  const t = startOfDay(ts);
  const diff = Math.round((today - t) / day);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function inDayFilter(ts, filter) {
  if (filter === 'all') return true;
  const day = 24 * 60 * 60 * 1000;
  const today = startOfDay(Date.now());
  const t = startOfDay(ts);
  const diff = Math.round((today - t) / day);
  if (filter === 'today') return diff <= 0;
  if (filter === 'yesterday') return diff === 1;
  if (filter === 'week') return diff <= 7;
  return true;
}

const DAY_FILTERS = [
  { id: 'all', name: 'All Days' },
  { id: 'today', name: 'Today' },
  { id: 'yesterday', name: 'Yesterday' },
  { id: 'week', name: 'This Week' },
];

const TYPE_FILTERS = [
  { id: 'all', name: 'Movies & Shows' },
  { id: 'movie', name: 'Movies' },
  { id: 'tv', name: 'Shows' },
];

export default function WatchlistView({ onSelectMedia, onResume, onOpenSettings, letterboxdUser }) {
  const [dayFilter, setDayFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [genreFilter, setGenreFilter] = useState('');
  const [letterboxdList, setLetterboxdList] = useState([]);
  const [resolvingId, setResolvingId] = useState(null);
  const [resolveError, setResolveError] = useState('');

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

  React.useEffect(() => {
    if (!letterboxdUser) return;
    let isMounted = true;
    letterboxd.fetchUserWatchlist(letterboxdUser).then((list) => {
      if (isMounted) setLetterboxdList(list);
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
    (h) => h.percent > 2 && h.percent < 95 && matchType(h.type) && matchGenre(h.genres) && inDayFilter(h.updatedAt, dayFilter)
  );

  const historyGroups = (() => {
    const groups = new Map();
    history
      .filter((h) => matchType(h.type) && matchGenre(h.genres) && inDayFilter(h.updatedAt, dayFilter))
      .forEach((h) => {
        const label = dayLabel(h.updatedAt);
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
    // the user is filtering by something they can't match.
    const remote = !genreFilter
      ? (letterboxdList || []).filter(() => matchType('movie'))
      : [];
    return [...local, ...remote];
  })();

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
    <div className="space-y-8">
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
          <span className="cine-chip cine-chip--accent self-start lg:self-auto">
            Letterboxd: {letterboxdUser}
          </span>
        ) : (
          <button onClick={onOpenSettings} className="cine-control-btn self-start lg:self-auto">
            Connect Letterboxd
          </button>
        )}
      </div>

      {/* Filters — labeled groups */}
      <div className="flex flex-col gap-3 lg:items-end">
        <SegmentedControl label="When" options={DAY_FILTERS} value={dayFilter} onChange={setDayFilter} />
        <div className="flex items-center gap-2.5">
          <SegmentedControl label="Type" options={TYPE_FILTERS} value={typeFilter} onChange={setTypeFilter} />
          <Select value={genreFilter} onChange={setGenreFilter} options={genreOptions} />
        </div>
      </div>

      {/* Continue Watching */}
      {continueItems.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-white/80 tracking-wide">Continue Watching</h3>
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
                    • {dayLabel(item.updatedAt)}
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

      {/* History by day */}
      <section className="space-y-6">
        <h3 className="text-sm font-semibold text-white/80 tracking-wide">History</h3>
        {historyGroups.length === 0 && (
          <p className="text-xs text-white/40">Nothing watched yet — press play on anything.</p>
        )}
        {historyGroups.map(([label, items]) => (
          <div key={label} className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white/40">{label}</h4>
            <div className="space-y-2">
              {items.map((h) => {
                const { media, fallback } = resumePayload(h);
                return (
                  <Row
                    key={`${h.type}_${h.mediaId}_${h.updatedAt}`}
                    poster={tmdb.getImageUrl(h.poster, 'w185')}
                    title={h.title}
                    meta={`${h.type === 'tv' ? `S${h.season} E${h.episode}` : 'Movie'} • ${h.percent}%`}
                    onClick={() => onResume(media, fallback)}
                    right={
                      <span className="cine-chip cine-chip--neutral">
                        {h.type === 'tv' ? 'Show' : 'Movie'}
                      </span>
                    }
                  />
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* My List */}
      <section className="space-y-3">
        <div className="cine-section-head">
          <h3 className="text-sm font-semibold text-white/80 tracking-wide">My List</h3>
          <span className="text-xs text-white/40">{myList.length} titles</span>
        </div>
        {resolvingId && (
          <p className="text-xs text-white/40">Looking up title on TMDB…</p>
        )}
        {!resolvingId && resolveError && (
          <p className="text-xs text-red-400/90">{resolveError}</p>
        )}
        {myList.length === 0 ? (
          <EmptyState
            icon={<ListVideo className="w-5 h-5" />}
            title="No lists yet"
            description="Save movies and shows to start organizing your list."
          />
        ) : (
          <div className="cine-grid">
            {myList.map((item) => (
              <Card
                key={`${item.id}_${item.title}`}
                media={item}
                onClick={(m) =>
                  m.source === 'letterboxd' ? handleLetterboxdSelect(m) : onSelectMedia(m)
                }
                showRating={false}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
