import React, { useState, useEffect } from 'react';
import {
  Search,
  Play,
  Star,
  X,
  Film,
  Tv,
  Sparkles,
  Bookmark,
  BookmarkCheck,
  History,
  Info,
  ExternalLink,
  Download,
  Upload,
  RefreshCw,
} from 'lucide-react';
import EmbedPlayerModal from './components/EmbedPlayerModal';
import {
  getTrending,
  getTopRated,
  getAnimeList,
  searchMulti,
  IMG_ORIGINAL,
  IMG_W500,
} from './services/tmdb';
import {
  getFavorites,
  toggleFavorite,
  isFavorite,
  getHistory,
  clearHistory,
  getLetterboxdConfig,
  setLetterboxdConfig,
  exportUserData,
  importUserData,
} from './services/storage';

export default function App() {
  const [activeTab, setActiveTab] = useState('movie'); // 'movie' | 'tv' | 'anime' | 'watchlist'
  const [trending, setTrending] = useState([]);
  const [topRated, setTopRated] = useState([]);
  const [heroMedia, setHeroMedia] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const [selectedMedia, setSelectedMedia] = useState(null);
  const [playingMedia, setPlayingMedia] = useState(null);

  // Profile & Personalization State
  const [favorites, setFavorites] = useState([]);
  const [history, setHistory] = useState([]);
  const [lbConfig, setLbConfig] = useState({ username: '', items: [] });
  const [lbInput, setLbInput] = useState('');
  const [isSyncingLb, setIsSyncingLb] = useState(false);
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);

  // Load storage state on mount
  useEffect(() => {
    setFavorites(getFavorites());
    setHistory(getHistory());
    const savedLb = getLetterboxdConfig();
    setLbConfig(savedLb);
    setLbInput(savedLb.username || '');
  }, []);

  // Fetch catalog according to activeTab
  useEffect(() => {
    if (activeTab === 'watchlist') return;

    if (activeTab === 'anime') {
      getAnimeList().then((results) => {
        setTrending(results.slice(0, 12));
        setTopRated(results.slice(12, 24));
        if (results.length > 0) setHeroMedia(results[0]);
      });
    } else {
      getTrending(activeTab).then((results) => {
        setTrending(results);
        if (results.length > 0) setHeroMedia(results[0]);
      });
      getTopRated(activeTab).then((results) => {
        setTopRated(results);
      });
    }
  }, [activeTab]);

  const handleSearch = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.trim().length > 2) {
      searchMulti(q).then((results) => setSearchResults(results));
    } else {
      setSearchResults([]);
    }
  };

  const handleToggleFav = (e, media) => {
    e.stopPropagation();
    const updated = toggleFavorite(media);
    setFavorites(updated);
  };

  const handleSyncLetterboxd = async () => {
    if (!lbInput.trim()) return;
    setIsSyncingLb(true);
    try {
      const res = await fetch(`/api/letterboxd/${encodeURIComponent(lbInput.trim())}`);
      const data = await res.json();
      if (data.items) {
        const newConfig = { username: lbInput.trim(), items: data.items };
        setLetterboxdConfig(newConfig);
        setLbConfig(newConfig);
      }
    } catch (err) {
      console.error('Failed syncing Letterboxd:', err);
    } finally {
      setIsSyncingLb(false);
    }
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string' && importUserData(content)) {
        setFavorites(getFavorites());
        setHistory(getHistory());
        setLbConfig(getLetterboxdConfig());
      }
    };
    reader.readAsText(file);
  };

  const startPlaying = (item) => {
    setSelectedMedia(null);
    setPlayingMedia(item);
    setHistory(getHistory()); // refresh continue watching
  };

  return (
    <div className="min-h-screen relative selection:bg-white selection:text-black bg-[#08090a] text-white">
      {/* Floating Glass Header */}
      <header className="fixed top-5 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-5xl rounded-full px-5 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between shadow-2xl border border-white/10 bg-black/60 backdrop-blur-2xl">
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => {
            setSearchQuery('');
            setSelectedMedia(null);
            setActiveTab('movie');
          }}
        >
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
            <Film className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold tracking-tight text-lg hidden min-[420px]:inline">MovieZilla</span>
        </div>

        {/* Discovery Tab Navigation */}
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/10">
          <button
            onClick={() => setActiveTab('movie')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer ${
              activeTab === 'movie' ? 'bg-white text-black font-semibold' : 'text-white/60 hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Movies</span>
          </button>
          <button
            onClick={() => setActiveTab('tv')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer ${
              activeTab === 'tv' ? 'bg-white text-black font-semibold' : 'text-white/60 hover:text-white'
            }`}
          >
            <Tv className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Series</span>
          </button>
          <button
            onClick={() => setActiveTab('anime')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer ${
              activeTab === 'anime' ? 'bg-white text-black font-semibold' : 'text-white/60 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Anime</span>
          </button>
          <button
            onClick={() => setActiveTab('watchlist')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer ${
              activeTab === 'watchlist' ? 'bg-white text-black font-semibold' : 'text-white/60 hover:text-white'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Library</span>
          </button>
        </div>

        {/* Search & Profile Icons */}
        <div className="flex items-center gap-2">
          <div className="relative w-32 sm:w-52">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={handleSearch}
              className="w-full bg-white/5 border border-white/10 rounded-full py-1.5 pl-8 pr-3 text-xs text-white placeholder-white/40 focus:outline-none focus:border-white/40"
            />
          </div>
          <button
            onClick={() => setShowProfileDrawer(true)}
            className="w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/70 hover:text-white cursor-pointer"
            title="Account & Letterboxd"
          >
            <BookmarkCheck className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="pt-24 pb-20 px-6 max-w-7xl mx-auto">
        {searchQuery.trim().length > 2 ? (
          <div className="mt-8">
            <h2 className="text-xl font-medium tracking-tight mb-6 text-white/80">Search Results</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
              {searchResults.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  onClick={() => setSelectedMedia(item)}
                  isFav={isFavorite(item.id)}
                  onToggleFav={(e) => handleToggleFav(e, item)}
                />
              ))}
            </div>
          </div>
        ) : activeTab === 'watchlist' ? (
          /* Personal Library / Watchlist View */
          <div className="mt-6">
            {/* Continue Watching Section */}
            {history.length > 0 && (
              <section className="mb-12">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-white/60" />
                    <h2 className="text-lg font-semibold tracking-tight text-white/90">Continue Watching</h2>
                  </div>
                  <button
                    onClick={() => {
                      clearHistory();
                      setHistory([]);
                    }}
                    className="text-xs text-white/40 hover:text-white/80 transition cursor-pointer"
                  >
                    Clear History
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => startPlaying(item)}
                      className="group relative flex flex-col cursor-pointer rounded-2xl overflow-hidden transition hover:scale-[1.02] bg-white/5 border border-white/10"
                    >
                      <div className="aspect-video w-full overflow-hidden relative bg-black/40">
                        <img
                          src={item.backdrop_path ? `${IMG_W500}${item.backdrop_path}` : `${IMG_W500}${item.poster_path}`}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                          <Play className="w-6 h-6 fill-white" />
                        </div>
                      </div>
                      <div className="p-3">
                        <h4 className="text-xs font-semibold text-white/90 truncate">{item.title}</h4>
                        {item.season && (
                          <span className="text-[10px] text-white/50">
                            Season {item.season} • Episode {item.episode}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Saved Bookmarks */}
            <section className="mb-14">
              <h2 className="text-lg font-semibold tracking-tight mb-4 text-white/90">Saved Titles</h2>
              {favorites.length === 0 ? (
                <div className="p-12 text-center border border-dashed border-white/10 rounded-2xl text-white/40 text-sm">
                  Your saved library is empty. Click the bookmark icon on any title to save it here.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {favorites.map((item) => (
                    <MediaCard
                      key={item.id}
                      item={item}
                      onClick={() => setSelectedMedia(item)}
                      isFav={true}
                      onToggleFav={(e) => handleToggleFav(e, item)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Letterboxd Synced Watchlist */}
            {lbConfig.items?.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-400" />
                  <h2 className="text-lg font-semibold tracking-tight text-white/90">
                    Letterboxd Watchlist ({lbConfig.username})
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {lbConfig.items.map((lb, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setSearchQuery(lb.title);
                        searchMulti(lb.title).then((res) => setSearchResults(res));
                      }}
                      className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition cursor-pointer"
                    >
                      <div className="truncate">
                        <div className="text-xs font-semibold text-white/90 truncate">{lb.title}</div>
                        <div className="text-[10px] text-white/40">{lb.year}</div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-white/40 shrink-0 ml-2" />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          /* Standard Catalog Shelves */
          <>
            {heroMedia && (
              <section className="relative rounded-3xl overflow-hidden min-h-[480px] flex items-end p-8 sm:p-12 mb-14 border border-white/10 shadow-2xl">
                <div
                  className="absolute inset-0 bg-cover bg-center transition-all duration-700 scale-105"
                  style={{ backgroundImage: `url(${IMG_ORIGINAL}${heroMedia.backdrop_path})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#08090a] via-[#08090a]/60 to-transparent" />
                <div className="relative z-10 max-w-2xl">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60 mb-3">
                    <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/15">Featured</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />{' '}
                      {heroMedia.vote_average?.toFixed(1)}
                    </span>
                  </div>
                  <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">
                    {heroMedia.title || heroMedia.name}
                  </h1>
                  <p className="text-sm sm:text-base text-white/70 line-clamp-3 mb-6 font-normal leading-relaxed">
                    {heroMedia.overview}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => startPlaying(heroMedia)}
                      className="flex items-center gap-2 px-6 py-3 rounded-full bg-white text-black font-semibold hover:bg-white/90 transition cursor-pointer shadow-lg active:scale-95"
                    >
                      <Play className="w-4 h-4 fill-black" /> Watch Now
                    </button>
                    <button
                      onClick={() => setSelectedMedia(heroMedia)}
                      className="flex items-center gap-2 px-5 py-3 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition cursor-pointer text-sm"
                    >
                      <Info className="w-4 h-4" /> Details
                    </button>
                  </div>
                </div>
              </section>
            )}

            <section className="mb-14">
              <h2 className="text-xl font-medium tracking-tight mb-5 text-white/90 capitalize">
                Trending {activeTab === 'movie' ? 'Movies' : activeTab === 'tv' ? 'Series' : 'Anime'}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {trending.slice(0, 12).map((item) => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    onClick={() => setSelectedMedia(item)}
                    isFav={isFavorite(item.id)}
                    onToggleFav={(e) => handleToggleFav(e, item)}
                  />
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-xl font-medium tracking-tight mb-5 text-white/90 capitalize">
                Highest Rated {activeTab === 'movie' ? 'Movies' : activeTab === 'tv' ? 'Series' : 'Anime'}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {topRated.slice(0, 12).map((item) => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    onClick={() => setSelectedMedia(item)}
                    isFav={isFavorite(item.id)}
                    onToggleFav={(e) => handleToggleFav(e, item)}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      {/* Media Detail Modal */}
      {selectedMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-3xl rounded-3xl overflow-hidden border border-white/15 bg-[#0d0e12] shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <span className="text-sm font-semibold text-white/90 truncate ml-2">
                {selectedMedia.title || selectedMedia.name}
              </span>
              <button
                onClick={() => setSelectedMedia(null)}
                className="w-8 h-8 rounded-full bg-white/5 border border-white/15 flex items-center justify-center text-white/70 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-start">
              <img
                src={`${IMG_W500}${selectedMedia.poster_path}`}
                alt={selectedMedia.title || selectedMedia.name}
                className="w-40 rounded-2xl shadow-xl hidden sm:block border border-white/10 shrink-0"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-white/60 mb-2">
                  <span>{(selectedMedia.release_date || selectedMedia.first_air_date || '').split('-')[0]}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />{' '}
                    {selectedMedia.vote_average?.toFixed(1)}
                  </span>
                </div>
                <h2 className="text-2xl font-bold tracking-tight mb-3">
                  {selectedMedia.title || selectedMedia.name}
                </h2>
                <p className="text-sm text-white/70 leading-relaxed mb-6 font-normal">
                  {selectedMedia.overview || 'No description available for this title.'}
                </p>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => startPlaying(selectedMedia)}
                    className="flex items-center gap-2 px-6 py-3 rounded-full bg-white text-black font-semibold hover:bg-white/90 transition cursor-pointer shadow-lg active:scale-95 text-sm"
                  >
                    <Play className="w-4 h-4 fill-black" /> Watch Now
                  </button>
                  <button
                    onClick={(e) => handleToggleFav(e, selectedMedia)}
                    className="p-3 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition cursor-pointer"
                    title="Bookmark Title"
                  >
                    <Bookmark
                      className={`w-4 h-4 ${
                        isFavorite(selectedMedia.id) ? 'fill-white text-white' : 'text-white/60'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Embed Player */}
      {playingMedia && (
        <EmbedPlayerModal media={playingMedia} onClose={() => setPlayingMedia(null)} />
      )}

      {/* Profile & Letterboxd Drawer */}
      {showProfileDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d0e12] border-l border-white/10 h-full p-6 flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
                <h3 className="font-bold text-base">Personalization</h3>
                <button
                  onClick={() => setShowProfileDrawer(false)}
                  className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Letterboxd Section */}
              <div className="mb-8">
                <h4 className="text-sm font-semibold text-white/90 mb-2">Letterboxd Sync</h4>
                <p className="text-xs text-white/50 mb-3">
                  Connect your Letterboxd account to automatically import your watchlist into MovieZilla.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Letterboxd username..."
                    value={lbInput}
                    onChange={(e) => setLbInput(e.target.value)}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/40 focus:outline-none focus:border-white/30"
                  />
                  <button
                    onClick={handleSyncLetterboxd}
                    disabled={isSyncingLb}
                    className="px-4 py-2 rounded-xl bg-white text-black font-semibold text-xs hover:bg-white/90 transition cursor-pointer disabled:opacity-50"
                  >
                    {isSyncingLb ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Sync'}
                  </button>
                </div>
                {lbConfig.username && (
                  <div className="text-[11px] text-green-400 mt-2">
                    Connected to {lbConfig.username} ({lbConfig.items.length} titles synced)
                  </div>
                )}
              </div>

              {/* Backup & Export */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-white/90 mb-2">Data Backup</h4>
                <p className="text-xs text-white/50 mb-3">
                  Export or import your saved bookmarks and continue watching history.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={exportUserData}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Export JSON
                  </button>
                  <label className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs transition cursor-pointer">
                    <Upload className="w-3.5 h-3.5" /> Import JSON
                    <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                  </label>
                </div>
              </div>
            </div>

            <div className="text-center text-[11px] text-white/30 pt-6 border-t border-white/10">
              MovieZilla 2.0 • Data persisted locally
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MediaCard({ item, onClick, isFav, onToggleFav }) {
  const title = item.title || item.name;
  const date = (item.release_date || item.first_air_date || '').split('-')[0];

  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col cursor-pointer rounded-2xl overflow-hidden transition duration-300 hover:scale-[1.02]"
    >
      <div className="aspect-[2/3] w-full rounded-2xl overflow-hidden bg-white/5 border border-white/10 relative">
        {item.poster_path ? (
          <img
            src={`${IMG_W500}${item.poster_path}`}
            alt={title}
            className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">No Poster</div>
        )}

        {/* Favorite bookmark trigger pill */}
        <button
          onClick={onToggleFav}
          className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
        >
          <Bookmark className={`w-3.5 h-3.5 ${isFav ? 'fill-white text-white' : 'text-white/60'}`} />
        </button>

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition flex items-end p-3 pointer-events-none">
          <span className="text-xs font-medium text-white flex items-center gap-1">
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> {item.vote_average?.toFixed(1)}
          </span>
        </div>
      </div>
      <h3 className="text-xs font-medium text-white/90 truncate mt-2 px-0.5">{title}</h3>
      <span className="text-[10px] text-white/40 px-0.5">{date}</span>
    </div>
  );
}
