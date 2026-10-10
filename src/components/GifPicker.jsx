import { useState, useEffect } from 'react';
import { Search, X, Heart } from 'lucide-react';
import { gifTrending, gifSearch } from '../services/gif';

// Tenor GIF picker: trending on open, debounced search. Lazy data —
// nothing loads until the user taps GIF. Missing API key surfaces the
// proxy's error instead of a blank grid. Favorites persist locally;
// the heart on each cell toggles them.
const FAV_KEY = 'mz_gif_favs';

function loadFavs() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((g) => g && g.url) : [];
  } catch {
    return [];
  }
}

export default function GifPicker({ onPick, onClose }) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [favs, setFavs] = useState(loadFavs);

  const toggleFav = (g) => {
    setFavs((prev) => {
      const has = prev.some((f) => f.id === g.id || f.url === g.url);
      const next = has
        ? prev.filter((f) => f.id !== g.id && f.url !== g.url)
        : [...prev, { id: g.id, url: g.url, preview: g.preview, title: g.title || '' }].slice(0, 60);
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(next));
      } catch {
        // private mode — session only
      }
      return next;
    });
  };

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
    if (favOnly || !query.trim()) return;
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
  }, [query, favOnly]);

  const shown = favOnly
    ? favs.filter((g) => !query.trim() || (g.title || '').toLowerCase().includes(query.trim().toLowerCase()))
    : gifs;
  return (
    <div className="absolute bottom-full mb-2 right-0 w-80 sm:w-[340px] max-w-[86vw] rounded-2xl cine-glass-panel overflow-hidden z-30">
      <div className="flex items-center gap-2 p-2.5 border-b border-[var(--cine-glass-border)]">
        <Search className="w-3.5 h-3.5 text-white/50 flex-shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search GIFs…"
          aria-label="Search GIFs"
          autoFocus
          className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
        />
        <button
          onClick={() => setFavOnly((f) => !f)}
          aria-label="Show favorite GIFs"
          aria-pressed={favOnly}
          className={`cine-icon-btn cine-icon-btn--sm flex-shrink-0${favOnly ? ' cine-pill--active' : ''}`}
        >
          <Heart className={`w-3 h-3${favOnly ? ' fill-current' : ''}`} />
        </button>
        <button
          onClick={onClose}
          aria-label="Close GIF picker"
          className="cine-icon-btn cine-icon-btn--sm"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      {/* Whole-gif cells: object-contain letterboxes instead of cropping —
          Klipy previews are mixed aspects, and cover-cut "half a GIF" was
          the complaint. Fixed row height keeps the grid aligned. */}
      <div className="grid grid-cols-2 gap-1.5 p-2.5 max-h-80 overflow-y-auto">
        {loading && (
          <p className="col-span-2 text-center text-[11px] text-white/50 py-6">Loading GIFs…</p>
        )}
        {!loading && error && (
          <p className="col-span-2 text-center text-[11px] text-white/50 py-6">{error}</p>
        )}
        {!loading &&
          !error &&
          shown.map((g) => {
            const fav = favs.some((f) => f.id === g.id || f.url === g.url);
            return (
              <div key={g.id} className="relative rounded-xl overflow-hidden bg-black/50 h-28 group/gif">
                <button
                  onClick={() => onPick(g)}
                  aria-label={`Send GIF${g.title ? `: ${g.title}` : ''}`}
                  className="w-full h-full hover:ring-2 hover:ring-white/60 transition cursor-pointer block"
                >
                  <img
                    src={g.preview}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-contain"
                  />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFav(g);
                  }}
                  aria-label={fav ? 'Remove GIF from favorites' : 'Add GIF to favorites'}
                  aria-pressed={fav}
                  className="absolute top-1 right-1 cine-icon-btn cine-icon-btn--xs bg-black/60"
                >
                  <Heart className={`w-3 h-3${fav ? ' fill-current text-red-400' : ''}`} />
                </button>
              </div>
            );
          })}
        {!loading && !error && shown.length === 0 && (
          <p className="col-span-2 text-center text-[11px] text-white/50 py-6">
            {favOnly ? 'No favorites yet — tap the heart on any GIF.' : 'No GIFs found.'}
          </p>
        )}
      </div>
      <p className="px-2 pb-1.5 text-[9px] text-white/30">GIFs by Klipy</p>
    </div>
  );
}
