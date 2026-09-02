import React, { useState, useEffect } from 'react';
import { Search, Play, Star, X, Film, Info, Server } from 'lucide-react';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/original';
const POSTER_BASE = 'https://image.tmdb.org/t/p/w500';

const SERVERS = [
  { name: 'Server 1 (VidSrc ICU)', url: (id) => `https://vidsrc.icu/embed/movie/${id}` },
  { name: 'Server 2 (Embed.su)',   url: (id) => `https://embed.su/embed/movie/${id}` },
  { name: 'Server 3 (2Embed)',     url: (id) => `https://www.2embed.cc/embed/${id}` },
  { name: 'Server 4 (VidSrc CC)',  url: (id) => `https://vidsrc.cc/v2/embed/movie/${id}` },
];

export default function App() {
  const [trending, setTrending] = useState([]);
  const [topRated, setTopRated] = useState([]);
  const [heroMovie, setHeroMovie] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeServer, setActiveServer] = useState(0);

  useEffect(() => {
    if (!API_KEY) return;

    fetch(`${TMDB_BASE}/trending/movie/week?api_key=${API_KEY}`)
      .then(res => res.json())
      .then(data => {
        if (data.results?.length > 0) {
          setTrending(data.results);
          setHeroMovie(data.results[0]);
        }
      });

    fetch(`${TMDB_BASE}/movie/top_rated?api_key=${API_KEY}`)
      .then(res => res.json())
      .then(data => {
        if (data.results) setTopRated(data.results);
      });
  }, []);

  const handleSearch = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.trim().length > 2) {
      fetch(`${TMDB_BASE}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(q)}`)
        .then(res => res.json())
        .then(data => setSearchResults(data.results || []));
    } else {
      setSearchResults([]);
    }
  };

  const openMovie = (movie) => {
    setSelectedMovie(movie);
    setIsPlaying(false);
    setActiveServer(0);
  };

  return (
    <div className="min-h-screen relative selection:bg-white selection:text-black">
      {/* Floating Glass Header */}
      <header className="fixed top-5 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-5xl rounded-full glass-panel px-6 py-3 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setSearchQuery(''); setSelectedMovie(null); }}>
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
            <Film className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold tracking-tight text-lg">MovieZilla</span>
        </div>

        <div className="relative w-48 sm:w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            placeholder="Search movies..."
            value={searchQuery}
            onChange={handleSearch}
            className="w-full bg-white/5 border border-white/10 rounded-full py-1.5 pl-10 pr-4 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/40 transition-colors"
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-24 pb-20 px-6 max-w-7xl mx-auto">
        {searchQuery.trim().length > 2 ? (
          <div className="mt-8">
            <h2 className="text-xl font-medium tracking-tight mb-6 text-white/80">Search Results</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
              {searchResults.map((m) => (
                <MovieCard key={m.id} movie={m} onClick={() => openMovie(m)} />
              ))}
            </div>
          </div>
        ) : (
          <>
            {heroMovie && (
              <section className="relative rounded-3xl overflow-hidden min-h-[500px] flex items-end p-8 sm:p-12 mb-16 border border-white/10 shadow-2xl">
                <div 
                  className="absolute inset-0 bg-cover bg-center transition-all duration-700 scale-105"
                  style={{ backgroundImage: `url(${IMG_BASE}${heroMovie.backdrop_path})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#08090a] via-[#08090a]/60 to-transparent" />
                <div className="relative z-10 max-w-2xl">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60 mb-3">
                    <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/15">Featured</span>
                    <span>•</span>
                    <span className="flex items-center gap-1"><Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> {heroMovie.vote_average.toFixed(1)}</span>
                  </div>
                  <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">{heroMovie.title}</h1>
                  <p className="text-sm sm:text-base text-white/70 line-clamp-3 mb-6 font-normal leading-relaxed">{heroMovie.overview}</p>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => openMovie(heroMovie)}
                      className="flex items-center gap-2 px-6 py-3 rounded-full bg-white text-black font-semibold hover:bg-white/90 transition-all cursor-pointer shadow-lg active:scale-95"
                    >
                      <Play className="w-4 h-4 fill-black" /> Watch Now
                    </button>
                    <button 
                      onClick={() => openMovie(heroMovie)}
                      className="flex items-center gap-2 px-5 py-3 rounded-full glass-panel font-medium hover:bg-white/10 transition-all cursor-pointer"
                    >
                      <Info className="w-4 h-4" /> Details
                    </button>
                  </div>
                </div>
              </section>
            )}

            <section className="mb-14">
              <h2 className="text-xl font-medium tracking-tight mb-5 text-white/90">Trending This Week</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {trending.slice(0, 12).map((m) => (
                  <MovieCard key={m.id} movie={m} onClick={() => openMovie(m)} />
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-xl font-medium tracking-tight mb-5 text-white/90">Highest Rated</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {topRated.slice(0, 12).map((m) => (
                  <MovieCard key={m.id} movie={m} onClick={() => openMovie(m)} />
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      {/* Modal / Video Player */}
      {selectedMovie && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-5xl rounded-3xl glass-panel overflow-hidden border border-white/15 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/30">
              <div className="flex items-center gap-2 overflow-x-auto pr-4">
                <span className="text-xs uppercase tracking-wider text-white/40 flex items-center gap-1.5 font-medium ml-1 mr-2">
                  <Server className="w-3.5 h-3.5" /> Source:
                </span>
                {SERVERS.map((server, idx) => (
                  <button
                    key={server.name}
                    onClick={() => { setActiveServer(idx); setIsPlaying(true); }}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                      activeServer === idx && isPlaying
                        ? 'bg-white text-black font-semibold'
                        : 'bg-white/5 text-white/70 hover:bg-white/15'
                    }`}
                  >
                    {server.name}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => setSelectedMovie(null)}
                className="w-8 h-8 rounded-full bg-white/5 border border-white/15 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 transition-all cursor-pointer shrink-0 ml-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isPlaying ? (
              <div className="aspect-video w-full bg-black">
                <iframe
                  src={SERVERS[activeServer].url(selectedMovie.id)}
                  className="w-full h-full border-0"
                  allowFullScreen
                  allow="autoplay; encrypted-media; picture-in-picture"
                  title="Player"
                />
              </div>
            ) : (
              <div className="p-6 sm:p-8 flex flex-col md:flex-row gap-6 items-start">
                <img 
                  src={`${POSTER_BASE}${selectedMovie.poster_path}`} 
                  alt={selectedMovie.title}
                  className="w-44 rounded-2xl shadow-xl hidden sm:block border border-white/10"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-white/60 mb-2">
                    <span>{selectedMovie.release_date?.split('-')[0]}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1"><Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> {selectedMovie.vote_average.toFixed(1)}</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">{selectedMovie.title}</h2>
                  <p className="text-sm sm:text-base text-white/70 leading-relaxed mb-6">{selectedMovie.overview}</p>
                  
                  <button 
                    onClick={() => setIsPlaying(true)}
                    className="flex items-center gap-2 px-6 py-3 rounded-full bg-white text-black font-semibold hover:bg-white/90 transition-all cursor-pointer shadow-lg active:scale-95"
                  >
                    <Play className="w-4 h-4 fill-black" /> Start Stream
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MovieCard({ movie, onClick }) {
  return (
    <div 
      onClick={onClick}
      className="group relative flex flex-col cursor-pointer rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.02]"
    >
      <div className="aspect-[2/3] w-full rounded-2xl overflow-hidden bg-white/5 border border-white/10 relative">
        {movie.poster_path ? (
          <img 
            src={`${POSTER_BASE}${movie.poster_path}`} 
            alt={movie.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20">No Image</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
          <span className="text-xs font-medium text-white flex items-center gap-1">
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> {movie.vote_average?.toFixed(1)}
          </span>
        </div>
      </div>
      <h3 className="text-sm font-medium text-white/90 truncate mt-2 px-0.5">{movie.title}</h3>
      <span className="text-xs text-white/40 px-0.5">{movie.release_date?.split('-')[0]}</span>
    </div>
  );
}
