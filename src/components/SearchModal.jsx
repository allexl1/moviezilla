import React, { useState, useEffect } from 'react';
import { Search, X, Star } from 'lucide-react';
import { tmdb } from '../services/tmdb';
import Modal from './ui/Modal';
import Row from './ui/Row';

export default function SearchModal({ isOpen, onClose, onSelectMedia }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) setQuery('');
  }, [isOpen]);

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-2xl"
      align="top"
      showCloseButton={false}
      panelClassName="p-6 space-y-6"
      label="Search movies and shows"
    >
      {/* Search Input Bar */}
      <div className="flex items-center gap-3 border-b border-white/10 pb-4">
        <Search className="w-5 h-5 text-white/40 flex-shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search movies, shows, or anime..."
          aria-label="Search movies, shows, or anime"
          autoFocus
          className="w-full bg-transparent text-sm md:text-base text-white placeholder-white/30 focus:outline-none"
        />
        <button
          onClick={onClose}
          className="cine-icon-btn"
        >
          <X className="w-4 h-4" />
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
            <Row
              key={`${item.id}_${title}`}
              poster={poster}
              title={title}
              meta={`${item.media_type ? item.media_type.toUpperCase() : 'MEDIA'}${year ? ` • ${year}` : ''}`}
              onClick={() => {
                onSelectMedia(item);
                onClose();
              }}
              right={
                rating && (
                  <span className="cine-chip cine-chip--accent">
                    <Star className="w-3 h-3" fill="currentColor" strokeWidth={0} />
                    {rating}
                  </span>
                )
              }
            />
          );
        })}
      </div>
    </Modal>
  );
}
