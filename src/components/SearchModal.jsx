import React, { useState, useEffect } from 'react';
import { tmdb } from '../services/tmdb';

export default function SearchModal({ isOpen, onClose, onSelectMedia }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await tmdb.searchMulti(query);
        setResults((res?.results || []).filter((x) => x.poster_path));
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 md:pt-28 p-4 bg-black/80 backdrop-blur-2xl animate-in fade-in duration-200">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-2xl rounded-3xl bg-[#0e0e14]/95 border border-white/15 backdrop-blur-3xl shadow-[0_24px_80px_rgba(0,0,0,0.85)] p-6 space-y-6">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
          <svg className="w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies, shows, or anime..."
            autoFocus
            className="w-full bg-transparent text-sm md:text-base text-white placeholder-white/30 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Results Container */}
        <div className="max-h-[60vh] overflow-y-auto no-scrollbar space-y-2">
          {loading && <p className="text-center py-8 text-xs text-white/40">Searching catalog...</p>}

          {!loading && query && results.length === 0 && (
            <p className="text-center py-8 text-xs text-white/40">No titles found for "{query}".</p>
          )}

          {results.map((item) => {
            const title = item.title || item.name;
            const poster = tmdb.getImageUrl(item.poster_path, 'w185');
            const year = (item.release_date || item.first_air_date || '').split('-')[0];
            const rating = item.vote_average ? item.vote_average.toFixed(1) : null;

            return (
              <div
                key={`${item.id}_${title}`}
                onClick={() => {
                  onSelectMedia(item);
                  onClose();
                }}
                className="flex items-center gap-4 p-2.5 rounded-2xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 transition cursor-pointer group"
              >
                <div className="w-12 h-16 rounded-xl overflow-hidden bg-black/50 flex-shrink-0">
                  <img src={poster} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs md:text-sm font-semibold text-white/90 truncate">{title}</h4>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {item.media_type ? item.media_type.toUpperCase() : 'MEDIA'} {year ? `• ${year}` : ''}
                  </p>
                </div>
                {rating && (
                  <span className="text-xs font-bold text-[#95ff50] px-2.5 py-1 rounded-full bg-[#95ff50]/10 border border-[#95ff50]/20">
                    ★ {rating}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
