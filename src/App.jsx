import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { tmdb } from './services/tmdb';
import { storage, formatClock } from './services/storage';
import { resolveMediaType, defaultSortFor } from './services/catalog';
import { parseLocation, parseLocationSafe, buildLocation } from './services/routing';
import Navbar from './components/Navbar';
import SearchModal from './components/SearchModal';
import SettingsModal from './components/SettingsModal';
import { SkelRail } from './components/ui';

// Route views: code-split per route so first paint stays lean (the old
// single-bundle tripped the 500kB chunk warning). Each view owns its data;
// the shell owns routing mirror, global UI state, playback and toasts.
const HomeView = lazy(() => import('./views/HomeView'));
const MoviesView = lazy(() => import('./views/MoviesView'));
const ShowsView = lazy(() => import('./views/ShowsView'));
const MediaDetailPage = lazy(() => import('./components/MediaDetailPage'));
const PersonView = lazy(() => import('./components/PersonView'));
const Player = lazy(() => import('./components/Player'));
const RoomsView = lazy(() => import('./components/RoomsView'));
const RoomView = lazy(() => import('./components/RoomView'));
const WatchlistView = lazy(() => import('./components/WatchlistView'));
const FootballView = lazy(() => import('./components/FootballView'));

const DEFAULT_FILTERS = {
  genre: '',
  year: 'All Years',
  sort: 'new.popular',
  provider: '',
  country: '',
  language: '',
};

export default function App() {
  // Deep-link entry: each state initializes from the URL (pure parsers —
  // StrictMode-safe). State owns navigation from here on; the push effect
  // mirrors it to the URL.
  const [activeTab, setActiveTab] = useState(() => parseLocationSafe().tab);

  const [letterboxdUser, setLetterboxdUser] = useState(
    () => localStorage.getItem('mz_letterboxd_user') || ''
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Discovery filters (shared shape for Movies/Shows views; tab switches
  // reset them exactly like before).
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const patchFilters = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const [toast, setToast] = useState('');

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(() => parseLocationSafe().media);
  const [selectedPerson, setSelectedPerson] = useState(() => parseLocationSafe().personId);
  const [activePlayer, setActivePlayer] = useState(null);
  const [activeRoomCode, setActiveRoomCode] = useState(() => parseLocationSafe().roomCode);
  const [roomDraft, setRoomDraft] = useState(null);

  // Deep-link mirror: state → URL pushes, popstate → state restore.
  // Covers tabs, details, people, player (?play=1) and rooms. Search and
  // settings are transient UI and stay out of the URL on purpose.
  const autoPlayed = useRef(false);
  const firstPush = useRef(true);
  useEffect(() => {
    const r = parseLocationSafe();
    // Legacy ?room= links canonicalize to /room/CODE (resolvable forever).
    if (r.legacy && r.roomCode) {
      try {
        window.history.replaceState({}, '', buildLocation(r));
      } catch {
        // ignore
      }
    }
    if (r.media && r.play && !autoPlayed.current) {
      autoPlayed.current = true;
      playMedia({ id: r.media.id, media_type: r.media.media_type });
    }
    const onPop = () => {
      const p = parseLocation();
      if (!p.play) autoPlayed.current = false;
      setActiveTab(p.tab);
      setSelectedMedia(p.media);
      setSelectedPerson(p.personId);
      setActiveRoomCode(p.roomCode);
      if (!p.play) {
        setActivePlayer(null);
      } else if (!autoPlayed.current && p.media) {
        autoPlayed.current = true;
        playMedia({ id: p.media.id, media_type: p.media.media_type });
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // Mount-only: playMedia is stable for this purpose (setters + services).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror nav state to the URL. Pushes (back-button-able), except the very
  // first run which replaces junk/unknown paths canonically.
  useEffect(() => {
    const url = buildLocation({
      tab: activeTab,
      media: selectedPerson ? null : selectedMedia,
      personId: selectedPerson,
      play: Boolean(activePlayer),
      roomCode: activeRoomCode,
    });
    try {
      const cur = window.location.pathname + window.location.search;
      if (url !== cur) {
        if (firstPush.current) {
          firstPush.current = false;
          window.history.replaceState({}, '', url);
        } else {
          window.history.pushState({}, '', url);
        }
      } else {
        firstPush.current = false;
      }
    } catch {
      // ignore
    }
  }, [activeTab, selectedMedia, selectedPerson, activePlayer, activeRoomCode]);

  const leaveRoom = () => {
    // URL follows via the mirror effect (→ /rooms).
    setActiveRoomCode(null);
  };

  // Freeze ambient animation while the tab is hidden, any overlay
  // covers the page (search/settings/player/details), or we're on a
  // utility tab (movies/shows/watchlist): the aurora keeps compositing
  // behind fixed overlays and dense lists otherwise (thermal).
  useEffect(() => {
    const apply = () => {
      const covered = isSearchOpen || isSettingsOpen || Boolean(activePlayer) || Boolean(selectedMedia) || activeTab !== 'home';
      document.body.classList.toggle('mz-paused', covered || document.hidden);
    };
    apply();
    document.addEventListener('visibilitychange', apply);
    return () => {
      document.removeEventListener('visibilitychange', apply);
      document.body.classList.remove('mz-paused');
    };
  }, [isSearchOpen, isSettingsOpen, activePlayer, selectedMedia, activeTab]);

  // Minimal toast (watchlist add/remove), auto-dismissed.
  const toastTimer = useRef(null);
  const showToast = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const handleSaveLetterboxd = (user) => {
    try {
      localStorage.setItem('mz_letterboxd_user', user);
    } catch {
      // Storage unavailable — session-only.
    }
    setLetterboxdUser(user);
  };

  // The detail page must follow the selected item's own type, not the nav tab
  // (a TV pick from Search/Watchlist/Home must stay 'tv').
  const selectedMediaType = selectedMedia ? resolveMediaType(selectedMedia) : 'movie';

  // Always fetch full TMDB details before starting playback.
  // Catalog/trending objects do not contain all TV metadata such as
  // number_of_seasons. Function declaration (not const arrow) so the
  // routing-mirror effect above can reference it — hoisted, identical
  // first-render closure in either form.
  async function playMedia(media, fallbackDetails = null) {
    if (!media?.id) return;

    const mediaType =
      (media.media_type === 'tv' || media.media_type === 'movie') ? media.media_type :
      (media.type === 'tv' || media.type === 'movie') ? media.type :
      (fallbackDetails?.media_type === 'tv' || fallbackDetails?.media_type === 'movie') ? fallbackDetails.media_type :
      (fallbackDetails?.type === 'tv' || fallbackDetails?.type === 'movie') ? fallbackDetails.type :
      (media?.first_air_date || fallbackDetails?.first_air_date || fallbackDetails?.number_of_seasons) ? 'tv' : 'movie';

    // "Resuming from 17:41" — makes the history system feel true. Only
    // when there's a real position worth announcing (30s+).
    const announceResume = () => {
      try {
        const saved = storage.getProgress(mediaType, media.id);
        if (saved && saved.currentTime >= 30) {
          showToast(`Resuming from ${formatClock(saved.currentTime)}`);
        }
      } catch {
        // never block playback for a toast
      }
    };

    try {
      const details = await tmdb.getMediaDetails(mediaType, media.id);

      setActivePlayer({
        media: {
          ...media,
          media_type: mediaType,
        },
        details: details || fallbackDetails || media,
      });
      announceResume();
    } catch (err) {
      console.error('Failed to load media details for playback:', err);

      // Policy: play with partial metadata rather than blocking. The embed
      // URL needs only id/type/season/episode (all resolved above), and the
      // episode drawer loads real season data on demand — so a details
      // failure degrades (season count may fall back to 1) instead of
      // refusing playback. The failure is logged, never disguised as success.
      setActivePlayer({
        media: {
          ...media,
          media_type: mediaType,
        },
        details: fallbackDetails || media,
      });
      announceResume();
    }
  }

  const overlaid = isSearchOpen || isSettingsOpen || Boolean(activePlayer);

  return (
    <div className="relative min-h-screen bg-[var(--cine-bg-deep)] text-white select-none">
      {/* Contextual Ambient Aurora Mesh Canvas */}
      <div
        className={`cine-aurora-canvas ${
          activeTab === 'movie' ? 'opacity-90' : ''
        }`}
      />
      {/* Per-tab tint wash (green Movies / indigo Shows parity) */}
      {(activeTab === 'movie' || activeTab === 'tv') && !selectedMedia && (
        <div
          className={`cine-tab-tint ${activeTab === 'movie' ? 'cine-tab-tint--movie' : 'cine-tab-tint--tv'}`}
          aria-hidden="true"
        />
      )}

      <Navbar
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === 'search') {
            setIsSearchOpen(true);
          } else {
            setSelectedMedia(null);
            setSelectedPerson(null);
            setActiveTab(tab);
            setFilters({ ...DEFAULT_FILTERS, sort: defaultSortFor(tab) });
          }
        }}
        isDetailView={Boolean(selectedMedia) || Boolean(selectedPerson)}
        onBack={() => {
          setSelectedMedia(null);
          setSelectedPerson(null);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <Suspense
        fallback={
          <main className="cine-container cine-container--page">
            <div className="flex flex-col gap-10">
              <SkelRail title />
              <SkelRail title />
            </div>
          </main>
        }
      >
        {activeRoomCode ? (
          <RoomView
            code={activeRoomCode}
            onLeave={leaveRoom}
            onToast={showToast}
          />
        ) : selectedPerson ? (
          <PersonView
            personId={selectedPerson}
            onSelectMedia={(item) => {
              setSelectedPerson(null);
              setSelectedMedia(item);
            }}
          />
        ) : selectedMedia ? (
          <MediaDetailPage
            media={selectedMedia}
            mediaType={selectedMediaType}
            onToast={showToast}
            onPlay={(media, details) =>
              setActivePlayer({
                media: { ...media, media_type: resolveMediaType(media) },
                details,
              })
            }
            onSelectMedia={(item) => setSelectedMedia(item)}
            onSelectPerson={(id) => {
              setSelectedMedia(null);
              setSelectedPerson(id);
            }}
            onWatchTogether={(media) => {
              setSelectedMedia(null);
              setRoomDraft(media);
              setActiveTab('rooms');
            }}
          />
        ) : activeTab === 'home' ? (
          <HomeView
            onSelectMedia={setSelectedMedia}
            onPlay={playMedia}
            onToast={showToast}
            onOpenProvider={(id) => {
              setActiveTab('movie');
              patchFilters({ provider: id });
            }}
            onOpenTopRated={() => {
              patchFilters({ sort: 'vote_average.desc' });
              setActiveTab('movie');
            }}
            onOpenTab={setActiveTab}
            overlaid={overlaid}
            playerSignal={activePlayer}
          />
        ) : activeTab === 'movie' ? (
          <main className="cine-container cine-container--page">
            <MoviesView
              filters={filters}
              onFilters={patchFilters}
              letterboxdUser={letterboxdUser}
              onSelectMedia={setSelectedMedia}
            />
          </main>
        ) : activeTab === 'tv' ? (
          <main className="cine-container cine-container--page">
            <ShowsView
              filters={filters}
              onFilters={patchFilters}
              letterboxdUser={letterboxdUser}
              onSelectMedia={setSelectedMedia}
            />
          </main>
        ) : activeTab === 'watchlist' ? (
          <main className="cine-container cine-container--page">
            <WatchlistView
              onSelectMedia={(item) => setSelectedMedia(item)}
              onResume={(media, fallback) => playMedia(media, fallback)}
              onOpenSettings={() => setIsSettingsOpen(true)}
              letterboxdUser={letterboxdUser}
              onToast={showToast}
              onSaveLetterboxd={handleSaveLetterboxd}
            />
          </main>
        ) : activeTab === 'football' ? (
          <main className="cine-container cine-container--page">
            <FootballView onToast={showToast} />
          </main>
        ) : (
          <main className="cine-container cine-container--page">
            <RoomsView
              draftMedia={roomDraft}
              onEnter={(code) => {
                setRoomDraft(null);
                setActiveRoomCode(code);
              }}
              onToast={showToast}
            />
          </main>
        )}
      </Suspense>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentUsername={letterboxdUser}
        onSaveLetterboxd={handleSaveLetterboxd}
      />

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectMedia={(item) => setSelectedMedia(item)}
        onSelectPerson={(id) => setSelectedPerson(id)}
      />

      {activePlayer && (
        <Player
          key={`${activePlayer.media?.media_type || 'media'}_${activePlayer.media?.id}`}
          media={activePlayer.media}
          details={activePlayer.details}
          onClose={() => setActivePlayer(null)}
        />
      )}

      {/* Watchlist toast */}
      <div className={`cine-toast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
