import React, { useState, useEffect, useRef } from 'react';
import { tmdb } from '../services/tmdb';

export default function SearchModal({ isOpen, onClose, onSelectMedia }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await tmdb.searchMulti(query.trim());
        if (isMounted) {
          const valid = (res?.results || []).filter((item) => item.poster_path);
          setResults(valid);
          setLoading(false);
        }
      } catch (err) {
        console.error('Search query failed:', err);
        if (isMounted) setLoading(false);
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4 bg-black/80 backdrop-blur-2xl animate-in fade-in duration-200">
      {/* Click outside backdrop */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Main Search Panel */}
      <div className="relative z-10 w-full max-w-3xl rounded-3xl bg-[#0d0d14]/90 border border-white/15 shadow-[0_24px_80px_rgba(0,0,0,0.8)] backdrop-blur-3xl overflow-hidden flex flex-col max-h-[75vh]">
        {/* Search Bar Input */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10">
          <svg className="w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies, TV shows, anime, actors..."
            className="flex-1 bg-transparent text-sm md:text-base text-white placeholder-white/40 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-xs text-white/40 hover:text-white px-2 py-1 rounded-md"
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-white/70 flex items-center justify-center text-xs transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Results Stream */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 no-scrollbar">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-[#95ff50] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="text-center py-12 text-sm text-white/40">
              No titles found matching "<span className="text-white">{query}</span>"
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
              {results.map((item) => {
                const title = item.title || item.name;
                const poster = tmdb.getImageUrl(item.poster_path, 'w342');
                const rating = item.vote_average ? item.vote_average.toFixed(1) : null;
                const year = (item.release_date || item.first_air_date || '').split('-')[0];

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      onSelectMedia(item);
                      onClose();
                    }}
                    className="group flex flex-col cursor-pointer transition-transform duration-200 hover:scale-[1.03]"
                  >
                    <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 border border-white/10 shadow-md">
                      <img src={poster} alt={title} className="w-full h-full object-cover" loading="lazy" />
                      {rating && (
                        <span className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md text-[9px] font-bold text-[#95ff50]">
                          ★ {rating}
                        </span>
                      )}
                    </div>
                    <div className="pt-2 px-1">
                      <h4 className="text-xs font-semibold text-white/90 truncate group-hover:text-[#95ff50] transition">
                        {title}
                      </h4>
                      <p className="text-[10px] text-white/40 mt-0.5">
                        {year} {item.media_type ? `• ${item.media_type.toUpperCase()}` : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!query && (
            <div className="text-center py-12 text-xs text-white/30 space-y-2">
              <p>Type to search across the entire Cinejoy catalog</p>
              <div className="flex items-center justify-center gap-2 pt-2">
                <span className="px-2.5 py-1 rounded-full bg-white/5 text-[11px] text-white/50">Avengers</span>
                <span className="px-2.5 py-1 rounded-full bg-white/5 text-[11px] text-white/50">Game of Thrones</span>
                <span className="px-2.5 py-1 rounded-full bg-white/5 text-[11px] text-white/50">Christopher Nolan</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
