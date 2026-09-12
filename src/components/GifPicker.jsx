import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { gifTrending, gifSearch } from '../services/gif';

// Tenor GIF picker: trending on open, debounced search. Lazy data —
// nothing loads until the user taps GIF. Missing API key surfaces the
// proxy's error instead of a blank grid.
export default function GifPicker({ onPick, onClose }) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    gifTrending()
      .then((list) => {
        if (!alive) return;
        setGifs(list);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message || 'GIFs unavailable.');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!query.trim()) return;
    const t = setTimeout(() => {
      setLoading(true);
      setError('');
      gifSearch(query.trim())
        .then((list) => {
          setGifs(list);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message || 'GIF search failed.');
          setLoading(false);
        });
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="absolute bottom-full mb-2 right-0 w-72 max-w-[75vw] rounded-2xl cine-glass-panel overflow-hidden z-30">
      <div className="flex items-center gap-2 p-2 border-b border-[var(--cine-glass-border)]">
        <Search className="w-3.5 h-3.5 text-white/50 flex-shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search GIFs…"
          aria-label="Search GIFs"
          autoFocus
          className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder-white/30 focus:outline-none"
        />
        <button
          onClick={onClose}
          aria-label="Close GIF picker"
          className="w-6 h-6 rounded-full inline-flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition cursor-pointer flex-shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1 p-2 max-h-56 overflow-y-auto">
        {loading && (
          <p className="col-span-3 text-center text-[11px] text-white/50 py-6">Loading GIFs…</p>
        )}
        {!loading && error && (
          <p className="col-span-3 text-center text-[11px] text-white/50 py-6">{error}</p>
        )}
        {!loading &&
          !error &&
          gifs.map((g) => (
            <button
              key={g.id}
              onClick={() => onPick(g)}
              title={g.title || 'GIF'}
              aria-label={`Send GIF${g.title ? `: ${g.title}` : ''}`}
              className="rounded-lg overflow-hidden hover:ring-2 hover:ring-white/60 transition cursor-pointer aspect-square bg-white/5"
            >
              <img
                src={g.preview}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
            </button>
          ))}
      </div>
      <p className="px-2 pb-1.5 text-[9px] text-white/30">GIFs by Klipy</p>
    </div>
  );
}
