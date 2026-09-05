import React, { useState, useEffect } from 'react';
import { Play, Plus, Info, Star, CalendarDays, Flame, Swords, Laugh, Skull, Rocket, Heart, Clapperboard } from 'lucide-react';
import { tmdb, MOVIE_GENRES, TV_GENRES, SORTS, TV_SORTS } from './services/tmdb';
import { storage } from './services/storage';
import Navbar from './components/Navbar';
import FilterBar from './components/FilterBar';
import RowRail from './components/RowRail';
import WatchlistView from './components/WatchlistView';
import Card from './components/ui/Card';
import Select from './components/ui/Select';
import MediaDetailPage from './components/MediaDetailPage';
import SearchModal from './components/SearchModal';
import SettingsModal from './components/SettingsModal';
import Player from './components/Player';

const GENRE_NAME = {};
[...MOVIE_GENRES, ...TV_GENRES].forEach((g) => {
  if (g.id !== '' && !GENRE_NAME[g.id]) GENRE_NAME[g.id] = g.name;
});

// Genre → icon (cinejoy hero meta parity).
const GENRE_ICON = {
  Action: Swords,
  Adventure: Rocket,
  Comedy: Laugh,
  Horror: Skull,
  'Sci-Fi': Rocket,
  'Sci-Fi & Fantasy': Rocket,
  Romance: Heart,
  Thriller: Flame,
};

const PROVIDERS = [
  { id: '8', name: 'Netflix', color: '#E50914' },
  { id: '9', name: 'Prime Video', color: '#00A8E1' },
  { id: '337', name: 'Disney+', color: '#113CCF' },
  { id: '350', name: 'Apple TV+', color: '#FFFFFF' },
  { id: '384', name: 'HBO Max', color: '#9933FF' },
  { id: '15', name: 'Hulu', color: '#1CE783' },
  { id: '531', name: 'Paramount+', color: '#0064FF' },
];

// Resolve the item's own type — never the nav tab. discover/* items lack
// media_type, so fall back to first_air_date (TV) before defaulting to movie.
function resolveMediaType(media) {
  if (media?.media_type === 'tv' || media?.media_type === 'movie') return media.media_type;
  if (media?.type === 'tv' || media?.type === 'movie') return media.type;
  if (media?.first_air_date) return 'tv';
  return 'movie';
}

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [items, setItems] = useState([]);
  const [featuredItem, setFeaturedItem] = useState(null);
  const [continueWatching, setContinueWatching] = useState([]);

  const [letterboxdUser, setLetterboxdUser] = useState(
    () => localStorage.getItem('mz_letterboxd_user') || ''
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Filters
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedYear, setSelectedYear] = useState('All Years');
  const [selectedSort, setSelectedSort] = useState('popularity.desc');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [activePlayer, setActivePlayer] = useState(null);

  // Home rails
  const [popularMovies, setPopularMovies] = useState([]);
  const [popularTV, setPopularTV] = useState([]);
  const [topRated, setTopRated] = useState([]);
  const [animeSpotlight, setAnimeSpotlight] = useState([]);
  const [homeProvider, setHomeProvider] = useState('8');
  const [providerMovies, setProviderMovies] = useState([]);

  useEffect(() => {
    setContinueWatching(storage.getAllContinueWatching());
  }, [activePlayer, activeTab]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        let res;

        if (activeTab === 'watchlist') {
          // WatchlistView owns its data (history + list + Letterboxd).
          return;
        } else if (activeTab === 'movie') {
          res = await tmdb.getMovies({
            genre: selectedGenre,
            year: selectedYear,
            sort: selectedSort,
            provider: selectedProvider,
            country: selectedCountry,
          });
        } else if (activeTab === 'tv') {
          res = await tmdb.getSeries({
            genre: selectedGenre,
            year: selectedYear,
            sort: selectedSort,
            provider: selectedProvider,
            country: selectedCountry,
          });
        } else {
          res = await tmdb.getTrending();
        }

        if (isMounted) {
          const list = (res?.results || []).filter((x) => x.poster_path);

          setItems(list);
          setFeaturedItem(list.length > 0 ? list[0] : null);
        }
      } catch (err) {
        console.error('Failed to load catalog:', err);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [
    activeTab,
    selectedGenre,
    selectedYear,
    selectedSort,
    selectedProvider,
    selectedCountry,
    letterboxdUser,
  ]);

  const playRandom = () => {
    if (items.length === 0) return;
    const pick = items[Math.floor(Math.random() * items.length)];
    setSelectedMedia(pick);
  };

  // Home rails load once per visit to Home (independent of filters).
  useEffect(() => {
    if (activeTab !== 'home') return;
    let isMounted = true;

    async function loadRails() {
      try {
        const [movies, series, rated, anime] = await Promise.all([
          tmdb.getPopularMovies(),
          tmdb.getPopularTV(),
          tmdb.getTopRatedMovies(),
          tmdb.getAnime(),
        ]);

        if (!isMounted) return;

        const clean = (res) =>
          (res?.results || []).filter((x) => x.poster_path).slice(0, 14);

        setPopularMovies(clean(movies));
        setPopularTV(clean(series));
        setTopRated(clean(rated));
        setAnimeSpotlight(clean(anime));
      } catch (err) {
        console.error('Failed to load home rails:', err);
      }
    }

    loadRails();

    return () => {
      isMounted = false;
    };
  }, [activeTab]);

  // "Movies on {provider}" rail follows the home provider picker.
  useEffect(() => {
    if (activeTab !== 'home') return;
    let isMounted = true;

    tmdb
      .getMovies({ provider: homeProvider })
      .then((res) => {
        if (!isMounted) return;
        setProviderMovies(
          (res?.results || []).filter((x) => x.poster_path).slice(0, 14)
        );
      })
      .catch((err) => console.error('Failed to load provider rail:', err));

    return () => {
      isMounted = false;
    };
  }, [activeTab, homeProvider]);

  // Home hero carousel (cinejoy spotlight parity)
  const heroItems = activeTab === 'home' ? items.slice(0, 6) : [];
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroLogo, setHeroLogo] = useState(null);

  useEffect(() => {
    setHeroIndex(0);
    setHeroLogo(null);
  }, [activeTab, items.length > 0 ? items[0].id : null]);

  const heroItem = heroItems[heroIndex] || featuredItem || items[0] || null;
  const heroMediaType = heroItem ? resolveMediaType(heroItem) : 'movie';

  // Rotate spotlight; pause while reading details or watching.
  useEffect(() => {
    if (activeTab !== 'home' || selectedMedia || activePlayer || heroItems.length < 2) return;
    const timer = setTimeout(() => {
      setHeroIndex((i) => (i + 1) % heroItems.length);
    }, 8000);
    return () => clearTimeout(timer);
  }, [activeTab, selectedMedia, activePlayer, heroIndex, heroItems.length]);

  // Title logo for the spotlight treatment.
  useEffect(() => {
    if (activeTab !== 'home' || !heroItem?.id) return;
    let isMounted = true;
    setHeroLogo(null);
    tmdb.getLogos(heroMediaType, heroItem.id).then((logo) => {
      if (isMounted && logo?.file_path) setHeroLogo(logo.file_path);
    });
    return () => {
      isMounted = false;
    };
  }, [activeTab, heroItem?.id]);

  // Discovery pages (Movies / Shows) are poster-only rails like cinejoy.
  const posterOnly = activeTab === 'movie' || activeTab === 'tv';

  // The detail page must follow the selected item's own type, not the nav tab
  // (a TV pick from Search/Watchlist/Home must stay 'tv').
  const selectedMediaType = selectedMedia ? resolveMediaType(selectedMedia) : 'movie';

  // Always fetch full TMDB details before starting playback.
  // Catalog/trending objects do not contain all TV metadata such as
  // number_of_seasons.
  const playMedia = async (media, fallbackDetails = null) => {
    if (!media?.id) return;

    const mediaType =
      (media.media_type === 'tv' || media.media_type === 'movie') ? media.media_type :
      (media.type === 'tv' || media.type === 'movie') ? media.type :
      (fallbackDetails?.media_type === 'tv' || fallbackDetails?.media_type === 'movie') ? fallbackDetails.media_type :
      (fallbackDetails?.type === 'tv' || fallbackDetails?.type === 'movie') ? fallbackDetails.type :
      (media?.first_air_date || fallbackDetails?.first_air_date || fallbackDetails?.number_of_seasons) ? 'tv' : 'movie';

    try {
      const details = await tmdb.getMediaDetails(mediaType, media.id);

      setActivePlayer({
        media: {
          ...media,
          media_type: mediaType,
        },
        details: details || fallbackDetails || media,
      });
    } catch (err) {
      console.error('Failed to load media details for playback:', err);

      // Keep playback usable even if the details request fails.
      setActivePlayer({
        media: {
          ...media,
          media_type: mediaType,
        },
        details: fallbackDetails || media,
      });
    }
  };

  return (
    <div className="relative min-h-screen bg-[var(--cine-bg-deep)] text-white select-none">
      {/* Contextual Ambient Aurora Mesh Canvas */}
      <div
        className={`cine-aurora-canvas ${
          activeTab === 'movie' ? 'opacity-90' : ''
        }`}
      />

      <Navbar
        activeTab={activeTab}
          onTabChange={(tab) => {
            if (tab === 'search') {
              setIsSearchOpen(true);
            } else {
              setSelectedMedia(null);
              setActiveTab(tab);
              setSelectedGenre('');
              setSelectedYear('All Years');
              setSelectedSort('popularity.desc');
              setSelectedProvider('');
              setSelectedCountry('');
            }
          }}
        isDetailView={Boolean(selectedMedia)}
        onBack={() => setSelectedMedia(null)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {selectedMedia ? (
        <MediaDetailPage
          media={selectedMedia}
          mediaType={selectedMediaType}
          onPlay={(media, details) =>
            setActivePlayer({
              media: { ...media, media_type: resolveMediaType(media) },
              details,
            })
          }
          onSelectMedia={(item) => setSelectedMedia(item)}
        />
      ) : (
        <>
          {activeTab === 'home' && heroItem && (
            <div className="cine-home-bg" aria-hidden="true">
              <img
                key={heroItem.id}
                src={tmdb.getImageUrl(
                  heroItem.backdrop_path,
                  'w1280',
                  heroItem.backdrop_fallback
                )}
                alt=""
                className="cine-home-bg-img cine-ghost-fade"
              />
              <div className="cine-home-bg-shade" />
            </div>
          )}

          {activeTab === 'home' && heroItem && (
            <section className="cine-hero">
              <div className="cine-hero-media" aria-hidden="true">
                <img
                  key={heroItem.id}
                  src={tmdb.getImageUrl(
                    heroItem.backdrop_path,
                    'w1280',
                    heroItem.backdrop_fallback
                  )}
                  alt=""
                  className="cine-hero-fade"
                />
                <div className="cine-hero-scrim" />
              </div>

              <div className="cine-hero-content">
                {heroLogo ? (
                  <img
                    src={tmdb.getImageUrl(heroLogo, 'w500')}
                    alt={heroItem.title || heroItem.name}
                    className="cine-hero-logo"
                  />
                ) : (
                  <h1 className="cine-hero-title">
                    {heroItem.title || heroItem.name}
                  </h1>
                )}

                <div className="cine-hero-meta">
                  <span className="cine-star-tag">
                    <Star className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
                    {(heroItem.vote_average || 8.4).toFixed(1)}/10
                  </span>

                  <span className="cine-hero-meta-item">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {(
                      heroItem.release_date ||
                      heroItem.first_air_date ||
                      '2026'
                    ).split('-')[0]}
                  </span>

                  {(heroItem.genre_ids || []).slice(0, 1).map((gid) => {
                    const gname = GENRE_NAME[String(gid)] || GENRE_NAME[gid] || 'Featured';
                    const GIcon = GENRE_ICON[gname] || Clapperboard;
                    return (
                      <span key={gid} className="cine-hero-meta-item">
                        <GIcon className="w-3.5 h-3.5" />
                        {gname}
                      </span>
                    );
                  })}
                </div>

                <p className="cine-hero-desc">
                  {heroItem.overview}
                </p>

                <div className="cine-actions">
                  <button
                    onClick={() => playMedia(heroItem, heroItem)}
                    className="cine-btn cine-btn-primary cine-btn-shimmer cine-cta"
                  >
                    <Play className="w-[18px] h-[18px]" fill="currentColor" />
                    <span>Play</span>
                  </button>

                  <div className="cine-duo-btn">
                    <button
                      onClick={() => storage.toggleWatchlist(heroItem)}
                      title="Add to Watchlist"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                    <span className="cine-duo-divider" />
                    <button
                      onClick={() => setSelectedMedia(heroItem)}
                      title="Details"
                    >
                      <Info className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {heroItems.length > 1 && (
                <div className="cine-hero-dots">
                  {heroItems.map((item, i) => (
                    <button
                      key={item.id}
                      onClick={() => setHeroIndex(i)}
                      title={item.title || item.name}
                      className={`cine-hero-dot ${i === heroIndex ? 'is-active' : ''}`}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
          {activeTab === 'home' && !heroItem && (
            <p className="text-center py-16 text-xs text-white/40">
              Loading catalog…
            </p>
          )}

          {/* Main Container */}
          <main
            className={`cine-container ${
              activeTab !== 'home' ? 'cine-container--page' : ''
            }`}
          >
            {/* Cinejoy Movies/Shows Page Header & Filter Rail */}
            {activeTab === 'movie' && (
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex-shrink-0">
                  <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
                    Movies
                  </h1>

                  <p className="text-sm text-white/60 mt-1">
                    Discover new movies to watch
                  </p>
                </div>

                <FilterBar
                  genres={MOVIE_GENRES}
                  sorts={SORTS}
                  selectedGenre={selectedGenre}
                  onSelectGenre={setSelectedGenre}
                  selectedYear={selectedYear}
                  onSelectYear={setSelectedYear}
                  selectedSort={selectedSort}
                  onSelectSort={setSelectedSort}
                  selectedProvider={selectedProvider}
                  onSelectProvider={setSelectedProvider}
                  selectedCountry={selectedCountry}
                  onSelectCountry={setSelectedCountry}
                  onRandom={playRandom}
                />
              </div>
            )}

            {activeTab === 'tv' && (
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex-shrink-0">
                  <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
                    Shows
                  </h1>

                  <p className="text-sm text-white/60 mt-1">
                    Explore hit series and episodic dramas
                  </p>
                </div>

                <FilterBar
                  genres={TV_GENRES}
                  sorts={TV_SORTS}
                  selectedGenre={selectedGenre}
                  onSelectGenre={setSelectedGenre}
                  selectedYear={selectedYear}
                  onSelectYear={setSelectedYear}
                  selectedSort={selectedSort}
                  onSelectSort={setSelectedSort}
                  selectedProvider={selectedProvider}
                  onSelectProvider={setSelectedProvider}
                  selectedCountry={selectedCountry}
                  onSelectCountry={setSelectedCountry}
                  onRandom={playRandom}
                />
              </div>
            )}

            {activeTab === 'home' && continueWatching.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-white/80 tracking-wide">
                  Continue Watching
                </h3>

                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                  {continueWatching.map((item) => (
                    <div
                      key={`${item.type}_${item.mediaId}`}
                      onClick={() =>
                        playMedia(
                          {
                            id: item.mediaId,
                            media_type: item.type,
                            name: item.title,
                            title: item.title,
                            poster_path: item.poster,
                          },
                          {
                            title: item.title,
                            name: item.title,
                            poster_path: item.poster,
                            media_type: item.type,
                          }
                        )
                      }
                      className="cine-cw-card group"
                    >
                      <div className="cine-cw-thumb">
                        <img
                          src={tmdb.getImageUrl(item.poster, 'w300')}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />

                        <div className="cine-cw-play">
                          <div className="cine-cw-play-btn">
                            <Play className="w-3 h-3" fill="currentColor" />
                          </div>
                        </div>
                      </div>

                      <h4 className="cine-cw-title">
                        {item.title}
                      </h4>

                      <p className="cine-cw-meta">
                        {item.type === 'tv'
                          ? `Season ${item.season} • Episode ${item.episode}`
                          : 'Movie'}{' '}
                        • {item.percent}%
                      </p>

                      <div className="cine-cw-progress">
                        <div
                          className="cine-cw-progress-fill"
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'home' && (
              <section>
                <h3 className="text-sm font-semibold text-white/80 mb-3 tracking-wide">
                  Browse by Provider
                </h3>

                <div className="flex gap-4 overflow-x-auto no-scrollbar py-1">
                  {PROVIDERS.map((p) => (
                    <div
                      key={p.name}
                      onClick={() => {
                        setActiveTab('movie');
                        setSelectedProvider(p.id);
                      }}
                      className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer group"
                      title={p.name}
                    >
                      <div className="cine-provider-pill min-w-[132px]">
                        <span
                          className="text-sm font-bold tracking-tight"
                          style={{ color: p.color }}
                        >
                          {p.name}
                        </span>
                      </div>
                      <span className="text-[11px] font-medium text-white/45 group-hover:text-white/80 transition">
                        {p.name}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              {activeTab === 'home' ? (
                <div className="flex flex-col gap-10">
                  <RowRail title="Trending Now" items={items} onSelect={setSelectedMedia} />
                  <RowRail
                    title="Popular Movies"
                    items={popularMovies}
                    onSelect={setSelectedMedia}
                    mediaType="movie"
                    action={{ label: 'View All', onClick: () => setActiveTab('movie') }}
                  />
                  <RowRail
                    title="Popular Shows"
                    items={popularTV}
                    onSelect={setSelectedMedia}
                    mediaType="tv"
                    action={{ label: 'View All', onClick: () => setActiveTab('tv') }}
                  />
                  <RowRail
                    title="Top Rated Movies"
                    items={topRated}
                    onSelect={setSelectedMedia}
                    mediaType="movie"
                    action={{
                      label: 'View All',
                      onClick: () => {
                        setSelectedSort('vote_average.desc');
                        setActiveTab('movie');
                      },
                    }}
                  />
                  <RowRail
                    titleNode={
                      <div className="flex items-center gap-2">
                        <h2 className="cine-section-title">Movies on</h2>
                        <div className="w-44">
                          <Select
                            value={homeProvider}
                            onChange={setHomeProvider}
                            options={PROVIDERS.filter((p) => p.id !== '').map((p) => ({
                              value: p.id,
                              label: p.name,
                            }))}
                          />
                        </div>
                      </div>
                    }
                    title="Movies on provider"
                    items={providerMovies}
                    onSelect={setSelectedMedia}
                    mediaType="movie"
                  />
                  <RowRail title="Anime Spotlight" items={animeSpotlight} onSelect={setSelectedMedia} mediaType="tv" />
                </div>
              ) : activeTab === 'watchlist' ? (
                <WatchlistView
                  onSelectMedia={(item) => setSelectedMedia(item)}
                  onResume={(media, fallback) => playMedia(media, fallback)}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  letterboxdUser={letterboxdUser}
                />
              ) : (
                <>
                  <div className="cine-grid">
                    {items.map((media) => (
                      <Card
                        key={`${media.id}_${media.title || media.name}`}
                        media={media}
                        onClick={setSelectedMedia}
                        size="fluid"
                        posterOnly={posterOnly}
                      />
                    ))}
                  </div>
                  {items.length === 0 && (
                    <p className="text-center py-16 text-xs text-white/40">
                      No titles found. Try clearing filters.
                    </p>
                  )}
                </>
              )}
            </section>
          </main>
        </>
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentUsername={letterboxdUser}
        onSaveLetterboxd={(user) => setLetterboxdUser(user)}
      />

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectMedia={(item) => setSelectedMedia(item)}
      />

      {activePlayer && (
        <Player
          media={activePlayer.media}
          details={activePlayer.details}
          onClose={() => setActivePlayer(null)}
        />
      )}
    </div>
  );
}