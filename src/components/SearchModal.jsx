import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { tmdb, FALLBACK_PROFILE } from '../services/tmdb';
import { storage } from '../services/storage';
import Modal from './ui/Modal';
import Row from './ui/Row';
import Card from './ui/Card';
import { SkelRow } from './ui';

export default function SearchModal({ isOpen, onClose, onSelectMedia, onSelectPerson }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchRetry, setSearchRetry] = useState(0);
  const [history, setHistory] = useState([]);
  const [trending, setTrending] = useState([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const activeRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSearchError('');
      return;
    }
    setHistory(storage.getSearchHistory());
    let isMounted = true;
    tmdb
      .getTrending()
      .then((res) => {
        if (isMounted) {
          setTrending(
            (res?.results || [])
              .filter((x) => x.poster_path && (x.title || x.name))
              .slice(0, 8)
          );
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setPeople([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setSearchError('');
      try {
        const [multi, persons] = await Promise.all([
          tmdb.searchMulti(query),
          tmdb.searchPerson(query).catch(() => null),
        ]);
        setResults((multi?.results || []).filter((x) => x.poster_path));
        setPeople(
          (persons?.results || [])
            .filter((x) => x.profile_path && x.name)
            .slice(0, 4)
        );
      } catch (err) {
        console.error('Search failed:', err);
        setSearchError("Search failed. Check your connection.");
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, searchRetry]);

  // Flat keyboard order: people first, then titles.
  const navItems = [
    ...people.map((p) => ({ kind: 'person', id: p.id, data: p })),
    ...results.map((item) => ({ kind: 'media', id: `${item.media_type}_${item.id}`, data: item })),
  ];

  useEffect(() => {
    setActiveIdx(-1);
  }, [query, results.length, people.length]);

  // Keep the highlighted row/card in view while arrowing through results.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const chooseMedia = (item) => {
    if (query.trim()) storage.addSearchHistory(query.trim());
    onSelectMedia(item);
    onClose();
  };

  const choosePerson = (id) => {
    onSelectPerson?.(id);
    onClose();
  };

  const onInputKey = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (navItems.length === 0) return;
      setActiveIdx((i) => {
        const d = e.key === 'ArrowDown' ? 1 : -1;
        return ((i < 0 ? (d > 0 ? -1 : 0) : i) + d + navItems.length) % navItems.length;
      });
    } else if (e.key === 'Enter' && activeIdx >= 0 && navItems[activeIdx]) {
      e.preventDefault();
      const target = navItems[activeIdx];
      if (target.kind === 'person') choosePerson(target.id);
      else chooseMedia(target.data);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-3xl"
      align="top"
      showCloseButton={false}
      panelClassName="p-6 md:p-8 space-y-6"
      label="Search movies and shows"
    >
      {/* Search Input Bar */}
      <div className="flex items-center gap-4 rounded-2xl bg-white/[0.04] border border-white/10 px-5 py-4 focus-within:border-white/25 transition">
        <Search className="w-6 h-6 text-white/60 flex-shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKey}
          placeholder="Search movies, shows, people…"
          aria-label="Search movies, shows, people"
          autoFocus
          className="w-full bg-transparent text-lg md:text-xl font-medium text-white placeholder-white/30 focus:outline-none"
        />
        <button
          onClick={onClose}
          className="cine-icon-btn"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Results Container */}
      <div className="max-h-[60vh] overflow-y-auto no-scrollbar space-y-4">
        {loading && (
          <div className="space-y-2" aria-hidden="true">
            <SkelRow />
            <SkelRow />
            <SkelRow />
            <SkelRow />
          </div>
        )}

        {!loading && !query.trim() && (
          <div className="space-y-5 py-2">
            {history.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">
                    Recent searches
                  </p>
                  <button
                    onClick={() => {
                      storage.clearSearchHistory();
                      setHistory([]);
                    }}
                    className="text-[11px] font-semibold text-white/60 hover:text-white transition cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {history.map((term) => (
                    <span
                      key={term}
                      className="cine-chip cine-chip--neutral pr-1.5"
                    >
                      <button
                        onClick={() => setQuery(term)}
                        className="hover:text-white transition cursor-pointer"
                      >
                        {term}
                      </button>
                      <button
                        onClick={() => {
                          storage.removeSearchHistory(term);
                          setHistory(storage.getSearchHistory());
                        }}
                        className="ml-1 w-5 h-5 rounded-full inline-flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition cursor-pointer"
                        title={`Remove "${term}"`}
                        aria-label={`Remove "${term}" from search history`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {trending.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/50 mb-2">
                  Trending now
                </p>
                <div className="flex flex-wrap gap-2">
                  {trending.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        onSelectMedia(item);
                        onClose();
                      }}
                      className="cine-chip cine-chip--neutral hover:text-white transition cursor-pointer"
                    >
                      {item.title || item.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && query && results.length === 0 && !searchError && (
          <p className="text-center py-8 text-xs text-white/60">No titles found for "{query}".</p>
        )}

        {!loading && searchError && (
          <div className="flex items-center justify-center gap-3 py-8 text-xs text-white/60">
            <span>{searchError}</span>
            <button
              onClick={() => setSearchRetry((r) => r + 1)}
              className="cine-control-btn"
            >
              Retry
            </button>
          </div>
        )}

        {people.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">
              People
            </p>
            {people.map((p, pi) => (
              <div
                key={`person_${p.id}`}
                ref={activeIdx === pi ? activeRef : null}
                className={`rounded-2xl transition ${activeIdx === pi ? 'ring-2 ring-white/70' : ''}`}
              >
                <Row
                  poster={tmdb.getImageUrl(p.profile_path, 'w185', FALLBACK_PROFILE)}
                  title={p.name}
                  meta={p.known_for_department || 'Person'}
                  onClick={() => choosePerson(p.id)}
                />
              </div>
            ))}
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">
              Titles
            </p>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
              {results.map((item, ri) => {
                const gi = people.length + ri;
                return (
                  <div
                    key={`${item.media_type}_${item.id}`}
                    ref={activeIdx === gi ? activeRef : null}
                    className={`rounded-2xl transition ${activeIdx === gi ? 'ring-2 ring-white/70' : ''}`}
                  >
                    <Card
                      media={item}
                      onClick={chooseMedia}
                      size="fluid"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
