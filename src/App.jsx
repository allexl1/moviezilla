import React, { useState, useEffect } from 'react';
import { tmdb, GUARANTEED_TITLES } from './services/tmdb';
import { storage } from './services/storage';
import { letterboxd } from './services/letterboxd';
import Navbar from './components/Navbar';
import FilterBar from './components/FilterBar';
import MediaDetailPage from './components/MediaDetailPage';
import SearchModal from './components/SearchModal';
import SettingsModal from './components/SettingsModal';
import Player from './components/Player';

const PROVIDERS = [
  { id: '8', name: 'Netflix', color: '#E50914' },
  { id: '9', name: 'Prime Video', color: '#00A8E1' },
  { id: '337', name: 'Disney+', color: '#113CCF' },
  { id: '350', name: 'Apple TV+', color: '#FFFFFF' },
  { id: '384', name: 'HBO Max', color: '#9933FF' },
  { id: '15', name: 'Hulu', color: '#1CE783' },
  { id: '531', name: 'Paramount+', color: '#0064FF' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [items, setItems] = useState(GUARANTEED_TITLES);
  const [featuredItem, setFeaturedItem] = useState(GUARANTEED_TITLES[0]);
  const [continueWatching, setContinueWatching] = useState([]);

  const [letterboxdUser, setLetterboxdUser] = useState(() => localStorage.getItem('mz_letterboxd_user') || '');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Filters
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedYear, setSelectedYear] = useState('All Years');
  const [selectedSort, setSelectedSort] = useState('popularity.desc');
  const [selectedProvider, setSelectedProvider] = useState('');

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [activePlayer, setActivePlayer] = useState(null);

  useEffect(() => {
    setContinueWatching(storage.getAllContinueWatching());
  }, [activePlayer, activeTab]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        let res;
        if (activeTab === 'watchlist') {
          const localList = storage.getWatchlist();
          let letterboxdList = [];
          if (letterboxdUser) {
            letterboxdList = await letterboxd.fetchUserWatchlist(letterboxdUser);
          }
          if (isMounted) setItems([...localList, ...letterboxdList]);
          return;
        } else if (activeTab === 'movie') {
          res = await tmdb.getMovies({ genre: selectedGenre, year: selectedYear, sort: selectedSort, provider: selectedProvider });
        } else if (activeTab === 'tv') {
          res = await tmdb.getSeries({ genre: selectedGenre, sort: selectedSort });
        } else if (activeTab === 'anime') {
          res = await tmdb.getAnime();
        } else {
          res = await tmdb.getTrending();
        }

        if (isMounted) {
          const list = (res?.results || []).filter((x) => x.poster_path);
          if (list.length > 0) {
            setItems(list);
            setFeaturedItem(list[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load catalog:', err);
      }
    }

    load();
    return () => { isMounted = false; };
  }, [activeTab, selectedGenre, selectedYear, selectedSort, selectedProvider, letterboxdUser]);

  const heroItem = featuredItem || items[0] || GUARANTEED_TITLES[0];

  return (
    <div className="relative min-h-screen bg-[#05000d] text-white select-none">
      {/* Contextual Ambient Aurora Mesh Canvas */}
      <div className={`cine-aurora-canvas ${activeTab === 'movie' ? 'opacity-90' : ''}`} />

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
          }
        }}
        isDetailView={Boolean(selectedMedia)}
        onBack={() => setSelectedMedia(null)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {selectedMedia ? (
        <MediaDetailPage
          media={selectedMedia}
          mediaType={activeTab === 'tv' || activeTab === 'anime' ? 'tv' : 'movie'}
          onPlay={(media, details) => setActivePlayer({ media, details })}
          onSelectMedia={(item) => setSelectedMedia(item)}
        />
      ) : (
        <>
          {activeTab === 'home' && (
            <section className="cine-hero">
              <img
                src={tmdb.getImageUrl(heroItem.backdrop_path, 'original', heroItem.backdrop_fallback)}
                alt={heroItem.title || heroItem.name}
                className="cine-hero-img"
              />
              <div className="cine-hero-overlay" />

              <div className="cine-hero-content">
                <h1 className="cine-hero-title">
                  {heroItem.title || heroItem.name}
                </h1>

                <div className="cine-hero-meta">
                  <span className="cine-star-tag">★ {(heroItem.vote_average || 8.4).toFixed(1)}/10</span>
                  <span>•</span>
                  <span>{(heroItem.release_date || heroItem.first_air_date || '2026').split('-')[0]}</span>
                  <span>•</span>
                  <span className="text-white/60">Trending Spotlight</span>
                </div>

                <p className="cine-hero-desc">
                  {heroItem.overview}
                </p>

                <div className="cine-actions">
                  <button
                    onClick={() => setActivePlayer({ media: heroItem, details: heroItem })}
                    className="cine-play-btn"
                  >
                    <span>▶</span>
                    <span>Play</span>
                  </button>

                  <button
                    onClick={() => storage.toggleWatchlist(heroItem)}
                    className="cine-circle-btn"
                    title="Add to Watchlist"
                  >
                    +
                  </button>

                  <button
                    onClick={() => setSelectedMedia(heroItem)}
                    className="cine-circle-btn"
                    title="Details"
                  >
                    ⓘ
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Main Container */}
          <main className={`cine-container ${activeTab !== 'home' ? 'pt-32' : 'pt-4'}`}>
            {/* Cinejoy Movies/Shows Page Header & Filter Rail */}
            {activeTab === 'movie' && (
              <div className="space-y-4">
                <div>
                  <h1 className="text-3xl font-extrabold text-white tracking-tight">Movies</h1>
                  <p className="text-xs text-white/50 mt-0.5">Discover new movies to watch</p>
                </div>
                <FilterBar
                  selectedGenre={selectedGenre}
                  onSelectGenre={setSelectedGenre}
                  selectedYear={selectedYear}
                  onSelectYear={setSelectedYear}
                  selectedSort={selectedSort}
                  onSelectSort={setSelectedSort}
                  selectedProvider={selectedProvider}
                  onSelectProvider={setSelectedProvider}
                />
              </div>
            )}

            {activeTab === 'tv' && (
              <div className="space-y-4">
                <div>
                  <h1 className="text-3xl font-extrabold text-white tracking-tight">TV Shows</h1>
                  <p className="text-xs text-white/50 mt-0.5">Explore hit series and episodic dramas</p>
                </div>
                <FilterBar
                  selectedGenre={selectedGenre}
                  onSelectGenre={setSelectedGenre}
                  selectedYear={selectedYear}
                  onSelectYear={setSelectedYear}
                  selectedSort={selectedSort}
                  onSelectSort={setSelectedSort}
                  selectedProvider={selectedProvider}
                  onSelectProvider={setSelectedProvider}
                />
              </div>
            )}

            {activeTab === 'anime' && (
              <div className="space-y-2">
                <h1 className="text-3xl font-extrabold text-white tracking-tight">Anime</h1>
                <p className="text-xs text-white/50">Japanese animation and top-tier series</p>
              </div>
            )}

            {activeTab === 'home' && continueWatching.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-white/80 tracking-wide">Continue Watching</h3>
                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                  {continueWatching.map((item) => (
                    <div
                      key={`${item.type}_${item.mediaId}`}
                      onClick={() =>
                        setActivePlayer({
                          media: { id: item.mediaId, media_type: item.type, name: item.title, title: item.title },
                          details: { title: item.title, name: item.title },
                        })
                      }
                      className="relative w-64 flex-shrink-0 p-3 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-white/20 backdrop-blur-xl transition cursor-pointer group"
                    >
                      <div className="relative aspect-video rounded-xl overflow-hidden bg-black/50 mb-2.5">
                        <img
                          src={tmdb.getImageUrl(item.poster, 'w300')}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                          <div className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center font-bold text-xs">
                            ▶
                          </div>
                        </div>
                      </div>

                      <h4 className="text-xs font-semibold text-white/90 truncate">{item.title}</h4>
                      <p className="text-[11px] text-white/40 mt-0.5">
                        {item.type === 'tv' ? `Season ${item.season} • Episode ${item.episode}` : 'Movie'} • {item.percent}%
                      </p>

                      <div className="w-full bg-white/10 h-1 rounded-full mt-2 overflow-hidden">
                        <div className="bg-[#95ff50] h-full rounded-full" style={{ width: `${item.percent}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'home' && (
              <section>
                <h3 className="text-sm font-semibold text-white/80 mb-3 tracking-wide">Browse by Provider</h3>
                <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
                  {PROVIDERS.map((p) => (
                    <div
                      key={p.name}
                      onClick={() => {
                        setActiveTab('movie');
                        setSelectedProvider(p.id);
                      }}
                      className="provider-pill"
                    >
                      <span className="text-xs font-bold" style={{ color: p.color }}>
                        {p.name}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              {activeTab === 'home' && (
                <div className="cine-section-head">
                  <h2 className="cine-section-title">Recommended For You</h2>
                  <span className="text-xs text-white/40">{items.length} titles</span>
                </div>
              )}

              <div className="cine-grid-cards">
                {items.map((media) => {
                  const title = media.title || media.name;
                  const poster = tmdb.getImageUrl(media.poster_path, 'w500');
                  const rating = media.vote_average ? media.vote_average.toFixed(1) : null;
                  const year = (media.release_date || media.first_air_date || '').split('-')[0];

                  return (
                    <div
                      key={`${media.id}_${title}`}
                      onClick={() => setSelectedMedia(media)}
                      className="cine-card-item"
                    >
                      <div className="cine-card-poster">
                        <img
                          src={poster}
                          alt={title}
                          loading="lazy"
                          onError={(e) => {
                            e.target.src = 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=500&q=80';
                          }}
                        />
                        {rating && <span className="cine-card-badge">★ {rating}</span>}
                      </div>
                      <h4 className="cine-card-title">{title}</h4>
                      <p className="cine-card-year">{year}</p>
                    </div>
                  );
                })}
              </div>
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
