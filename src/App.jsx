import { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { tmdb } from './services/tmdb';
import { storage, formatClock, WATCHED_PCT } from './services/storage';
import { resolveMediaType, defaultSortFor } from './services/catalog';
import { parseLocation, parseLocationSafe, buildLocation } from './services/routing';
import Navbar from './components/Navbar';
import SearchModal from './components/SearchModal';
import SettingsModal from './components/SettingsModal';
import AccountModal from './components/AccountModal';
import ErrorBoundary from './components/ErrorBoundary';
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
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  // Discovery filters (shared shape for Movies/Shows views; tab switches
  // reset them exactly like before).
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const patchFilters = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const [toast, setToast] = useState('');

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(() => parseLocationSafe().media);
  const [selectedPerson, setSelectedPerson] = useState(() => parseLocationSafe().personId);
  // Back-stack: every Person↔Media hop pushes the context you came from,
  // so Back restores the real page (Heath Ledger → movie → Back returns
  // to Heath Ledger, not /movies). Tab switches, home and rooms clear it
  // (new root). Capped at 20.
  const [backStack, setBackStack] = useState([]);
  const pushBack = (entry) => {
    if (!entry) return;
    setBackStack((s) => [...s, entry].slice(-20));
  };
  const [activePlayer, setActivePlayer] = useState(null);
  const [activeRoomCode, setActiveRoomCode] = useState(() => parseLocationSafe().roomCode);
  const [roomDraft, setRoomDraft] = useState(null);

  // Deep-link mirror: state → URL pushes, popstate → state restore.
  // Covers tabs, details, people, player (?play=1) and rooms. Search and
  // settings are transient UI and stay out of the URL on purpose.
  const autoPlayed = useRef(false);
  const firstPush = useRef(true);
  // Set when popstate kicks off an async autoplay: the states it sets would
  // otherwise trigger the mirror below with play still false, clobbering
  // the ?play=1 entry before playMedia resolves. Consumed once.
  const skipMirrorOnce = useRef(false);
  // Previous play flag: closing the player (?play=1 off) REPLACES instead
  // of pushing, so Back never reopens a just-closed player (back-loop).
  // Opening the player pushes, so Back closes it.
  const prevPlay = useRef(false);
  // Previous room flag: same contract as the player — leaving a room
  // replaces, so Back can't rejoin a room you just left.
  const prevRoom = useRef(null);
  // Previous route (tab|media|person|room): a player-close that coincides
  // with real navigation (another title from Search, a tab switch) must
  // PUSH — replacing would eat the new page's history entry and Back
  // would skip it. Pure closes (same route) still replace.
  const prevRoute = useRef(null);
  // Tab-root playback origin (?from=): set when play starts with no
  // detail open (Watchlist/Home resume). Closing then returns to the
  // origin tab instead of stranding a phantom detail. Detail playback
  // carries none — close stays on the detail.
  const [playerFrom, setPlayerFrom] = useState(() => parseLocationSafe().from);
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
    if (r.from) setPlayerFrom(r.from);
    if (r.media && r.play && !autoPlayed.current) {
      autoPlayed.current = true;
      playMedia({ id: r.media.id, media_type: r.media.media_type });
    }
    const onPop = () => {
      const p = parseLocation();
      if (!p.play) {
        autoPlayed.current = false;
        setPlayerFrom(null);
      } else if (p.from) {
        setPlayerFrom(p.from);
      }
      setActiveTab(p.tab);
      setSelectedMedia(p.media);
      setSelectedPerson(p.personId);
      // A draft lobby card dies when the browser leaves rooms context —
      // otherwise a stale "Room opens on this title" resurfaces later.
      if (p.tab !== 'rooms' || p.roomCode) setRoomDraft(null);
      // Browser already went back: drop the matching stack top so the
      // in-app Back doesn't restore a page we're already on. A tab-level
      // arrival clears the chain (new root).
      setBackStack((prev) => {
        if (!prev.length) return prev;
        const top = prev[prev.length - 1];
        if (p.media && top.kind === 'media' && top.media.id === p.media.id) return prev.slice(0, -1);
        if (p.personId && top.kind === 'person' && top.id === p.personId) return prev.slice(0, -1);
        if (!p.media && !p.personId && !p.roomCode) return [];
        return prev;
      });
      setActiveRoomCode(p.roomCode);
      if (!p.play) {
        setActivePlayer(null);
      } else if (!autoPlayed.current && p.media) {
        autoPlayed.current = true;
        skipMirrorOnce.current = true;
        playMedia({ id: p.media.id, media_type: p.media.media_type });
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // Mount-only: playMedia is stable for this purpose (setters + services).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror nav state to the URL. Pushes (back-button-able), except the very
  // first run which replaces junk/unknown paths canonically, pure player
  // closes and pure room leaves which replace (Back must not resurrect
  // dismissed UI), and navigations coinciding with a close which push.
  // Home-hero Play has no selectedMedia, so the player media backs the URL
  // (?play=1 would otherwise desync to '/' and lose its history entry).
  useEffect(() => {
    if (skipMirrorOnce.current) {
      skipMirrorOnce.current = false;
      prevPlay.current = Boolean(activePlayer);
      prevRoom.current = activeRoomCode;
      return;
    }
    const mediaForUrl = selectedPerson ? null : selectedMedia || activePlayer?.media || null;
    const url = buildLocation({
      tab: activeTab,
      media: mediaForUrl,
      personId: selectedPerson,
      play: Boolean(activePlayer),
      roomCode: activeRoomCode,
      // Origin shelf for tab-root playback (Watchlist/Home resume,
      // incl. its reloads) — detail playback carries none (close stays
      // on the detail). playerFrom is only ever set with no detail
      // open, and cleared on any detail/tab navigation or close.
      from: activePlayer && playerFrom ? playerFrom : null,
    });
    const routeId = `${activeTab}|${selectedMedia?.id ?? ''}|${selectedPerson ?? ''}|${activeRoomCode ?? ''}`;
    const routeChanged = prevRoute.current !== null && prevRoute.current !== routeId;
    prevRoute.current = routeId;
    try {
      const cur = window.location.pathname + window.location.search;
      if (url !== cur) {
        if (firstPush.current) {
          firstPush.current = false;
          // Reload on ?play=1: the autoplay above will set the player —
          // stripping the param now would destroy the history entry and
          // desync Back. Let the autoplay drive the mirror instead.
          const awaitingAutoplay =
            !activePlayer &&
            selectedMedia &&
            new URLSearchParams(window.location.search).get('play') === '1';
          if (!awaitingAutoplay) {
            window.history.replaceState({}, '', url);
          }
        } else if (prevPlay.current && !activePlayer && !routeChanged) {
          window.history.replaceState({}, '', url);
        } else if (prevRoom.current && !activeRoomCode && !routeChanged) {
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
    prevPlay.current = Boolean(activePlayer);
    prevRoom.current = activeRoomCode;
  }, [activeTab, selectedMedia, selectedPerson, activePlayer, activeRoomCode, playerFrom]);

  // Route changes reset scroll (state-router keeps DOM scroll otherwise).
  // Player toggles excluded — the page underneath must not jump.
  const routeId = `${activeTab}|${selectedMedia?.id ?? ''}|${selectedPerson ?? ''}|${activeRoomCode ?? ''}`;
  useEffect(() => {
    try {
      window.scrollTo(0, 0);
    } catch {
      // ignore
    }
  }, [routeId]);

  // Per-route document titles (share/bookmark/switcher readable).
  useEffect(() => {
    try {
      let t = 'Moviezilla — Movies & Shows';
      if (activePlayer?.media) {
        const m = activePlayer.media;
        t = `▶ ${m.title || m.name || 'Playing'} — Moviezilla`;
      } else if (selectedPerson) {
        t = 'Person — Moviezilla';
      } else if (selectedMedia) {
        const y = (selectedMedia.release_date || selectedMedia.first_air_date || '').split('-')[0];
        t = `${selectedMedia.title || selectedMedia.name || 'Details'}${y ? ` (${y})` : ''} — Moviezilla`;
      } else if (activeRoomCode) {
        t = `Room ${activeRoomCode} — Moviezilla`;
      } else if (activeTab === 'movie') {
        t = 'Movies — Moviezilla';
      } else if (activeTab === 'tv') {
        t = 'Shows — Moviezilla';
      } else if (activeTab === 'watchlist') {
        t = 'Watchlist — Moviezilla';
      } else if (activeTab === 'rooms') {
        t = 'Rooms — Moviezilla';
      } else if (activeTab === 'football') {
        t = 'Football — Moviezilla';
      }
      document.title = t;
    } catch {
      // ignore
    }
  }, [activeTab, selectedMedia, selectedPerson, activePlayer, activeRoomCode]);

  const leaveRoom = () => {
    // URL follows via the mirror effect (replaces → /rooms, so Back
    // can't rejoin the room just left).
    setActiveRoomCode(null);
  };

  // Any navigation away from playback resets ?play=1: a stale player over
  // a new screen is a desync (wrong title, wrong URL, back-button ghosts).
  // Opening a title also syncs the navbar tab to its type (a show picked
  // from Home/Search/Watchlist lights up Shows, not Home).
  const selectMedia = (item) => {
    setActivePlayer(null);
    setPlayerFrom(null);
    // Same-title re-tap (double-click) is a no-op: without this the
    // current page lands on the stack and one Back appears stuck.
    if (
      item && selectedMedia && !selectedPerson &&
      selectedMedia.id === item.id &&
      resolveMediaType(selectedMedia) === resolveMediaType(item)
    ) {
      return;
    }
    // Tab roots push too: opening from Watchlist/Movies (which flips the
    // tab to the title type) must Back-return to the shelf, not the grid.
    if (selectedMedia) pushBack({ kind: 'media', media: selectedMedia });
    else if (selectedPerson) pushBack({ kind: 'person', id: selectedPerson });
    else pushBack({ kind: 'tab', tab: activeTab });
    setSelectedPerson(null);
    setSelectedMedia(item);
    if (item) setActiveTab(resolveMediaType(item) === 'tv' ? 'tv' : 'movie');
  };
  const selectPerson = (id) => {
    setActivePlayer(null);
    setPlayerFrom(null);
    if (selectedMedia) pushBack({ kind: 'media', media: selectedMedia });
    else if (selectedPerson && selectedPerson !== id) pushBack({ kind: 'person', id: selectedPerson });
    else if (!selectedMedia && !selectedPerson) pushBack({ kind: 'tab', tab: activeTab });
    setSelectedMedia(null);
    setSelectedPerson(id);
  };
  // Tab-root navigation contract (navbar, logo, home rails): new root —
  // player off, detail gone, stack + draft cleared, filters reset.
  const openTab = (tab) => {
    setActivePlayer(null);
    setPlayerFrom(null);
    setSelectedMedia(null);
    setSelectedPerson(null);
    setBackStack([]);
    setRoomDraft(null);
    // Tabs and the logo work from inside a room too (RoomView held
    // render precedence while the tab changed invisibly underneath).
    setActiveRoomCode(null);
    setActiveTab(tab);
    setFilters({ ...DEFAULT_FILTERS, sort: defaultSortFor(tab) });
  };
  const goHome = () => {
    setActivePlayer(null);
    setPlayerFrom(null);
    setSelectedMedia(null);
    setSelectedPerson(null);
    setBackStack([]);
    setActiveRoomCode(null);
    setRoomDraft(null);
    setActiveTab('home');
  };

  // Freeze ambient animation while the tab is hidden, any overlay
  // covers the page (search/settings/account/player/details), or we're on a
  // utility tab (movies/shows/watchlist): the aurora keeps compositing
  // behind fixed overlays and dense lists otherwise (thermal).
  useEffect(() => {
    const apply = () => {
      const covered = isSearchOpen || isSettingsOpen || isAccountOpen || Boolean(activePlayer) || Boolean(selectedMedia) || activeTab !== 'home';
      document.body.classList.toggle('mz-paused', covered || document.hidden);
    };
    apply();
    document.addEventListener('visibilitychange', apply);
    return () => {
      document.removeEventListener('visibilitychange', apply);
      document.body.classList.remove('mz-paused');
    };
  }, [isSearchOpen, isSettingsOpen, isAccountOpen, activePlayer, selectedMedia, activeTab]);

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

    // Tab-root playback (Watchlist/Home resume, hero Play) stamps its
    // origin shelf: the URL carries ?from= and closing the player
    // returns there instead of a phantom detail. Detail playback
    // carries none — close stays on the detail.
    if (!selectedMedia && !selectedPerson) setPlayerFrom(activeTab);

    const mediaType =
      (media.media_type === 'tv' || media.media_type === 'movie') ? media.media_type :
      (media.type === 'tv' || media.type === 'movie') ? media.type :
      (fallbackDetails?.media_type === 'tv' || fallbackDetails?.media_type === 'movie') ? fallbackDetails.media_type :
      (fallbackDetails?.type === 'tv' || fallbackDetails?.type === 'movie') ? fallbackDetails.type :
      (media?.first_air_date || fallbackDetails?.first_air_date || fallbackDetails?.number_of_seasons) ? 'tv' : 'movie';

    // "Resuming from 17:41" — makes the history system feel true. Only
    // when there's a real position worth announcing (30s+, not watched:
    // a finished film must never toast "Resuming from 1:30:00").
    const announceResume = () => {
      try {
        const saved = storage.getProgress(mediaType, media.id);
        if (saved && saved.currentTime >= 30 && (saved.percent || 0) < WATCHED_PCT) {
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

  // Player close: tab-root playback (?from=) returns to its origin
  // shelf instead of stranding a phantom detail (reload or resume
  // flows). Detail playback carries no origin — close stays put.
  const closePlayer = () => {
    if (playerFrom) {
      const t = playerFrom;
      setPlayerFrom(null);
      setSelectedMedia(null);
      setSelectedPerson(null);
      setActiveTab(t);
    }
    setActivePlayer(null);
  };

  const overlaid = isSearchOpen || isSettingsOpen || isAccountOpen || Boolean(activePlayer);

  return (
    <div className="relative min-h-screen bg-[var(--cine-bg-deep)] text-white">
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
            openTab(tab);
          }
        }}
        isDetailView={Boolean(selectedMedia) || Boolean(selectedPerson)}
        onBack={() => {
          // Player open: Back only closes it (browser-Back parity) —
          // never pops the stack underneath, or the detail gets skipped.
          // Tab-root playback returns to its origin shelf (?from=).
          if (activePlayer) {
            closePlayer();
            return;
          }
          // Pop the back-stack: Person opened from a title goes back TO
          // that title, a title opened from a person back TO the person,
          // a title opened from a tab back TO the tab (not the flipped
          // grid). Empty stack → clear as before.
          const top = backStack[backStack.length - 1];
          if (top) {
            setBackStack((s) => s.slice(0, -1));
            if (top.kind === 'media') {
              setSelectedPerson(null);
              setSelectedMedia(top.media);
              setActiveTab(resolveMediaType(top.media) === 'tv' ? 'tv' : 'movie');
            } else if (top.kind === 'person') {
              setSelectedMedia(null);
              setSelectedPerson(top.id);
            } else {
              setSelectedMedia(null);
              setSelectedPerson(null);
              setActiveTab(top.tab);
            }
            return;
          }
          setSelectedMedia(null);
          setSelectedPerson(null);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAccount={() => setIsAccountOpen(true)}
      />
      <ErrorBoundary key={routeId} onHome={goHome}>
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
              selectMedia(item);
            }}
          />
        ) : selectedMedia ? (
          <MediaDetailPage
            media={selectedMedia}
            mediaType={selectedMediaType}
            onToast={showToast}
            onPlay={(media, details) => {
              // Detail playback: no origin shelf (close stays put).
              setPlayerFrom(null);
              setActivePlayer({
                media: { ...media, media_type: resolveMediaType(media) },
                details,
              });
            }}
            onSelectMedia={(item) => selectMedia(item)}
            onSelectPerson={(id) => {
              selectPerson(id);
            }}
            onWatchTogether={(media) => {
              setActivePlayer(null);
              setSelectedMedia(null);
              setSelectedPerson(null);
              setBackStack([]);
              setRoomDraft(media);
              setActiveTab('rooms');
            }}
          />
        ) : activeTab === 'home' ? (
          <HomeView
            onSelectMedia={selectMedia}
            onPlay={playMedia}
            onToast={showToast}
            onOpenTopRated={() => {
              openTab('movie');
              patchFilters({ sort: 'vote_average.desc' });
            }}
            onOpenTab={openTab}
            overlaid={overlaid}
            playerSignal={activePlayer}
          />
        ) : activeTab === 'movie' ? (
          <main className="cine-container cine-container--page">
            <MoviesView
              filters={filters}
              onFilters={patchFilters}
              letterboxdUser={letterboxdUser}
              onSelectMedia={selectMedia}
            />
          </main>
        ) : activeTab === 'tv' ? (
          <main className="cine-container cine-container--page">
            <ShowsView
              filters={filters}
              onFilters={patchFilters}
              letterboxdUser={letterboxdUser}
              onSelectMedia={selectMedia}
            />
          </main>
        ) : activeTab === 'watchlist' ? (
          <main className="cine-container cine-container--page">
            <WatchlistView
              onSelectMedia={(item) => selectMedia(item)}
              onResume={(media, fallback) => playMedia(media, fallback)}
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
                setActivePlayer(null);
                setBackStack([]);
                setActiveRoomCode(code);
              }}
              onToast={showToast}
            />
          </main>
        )}
      </Suspense>
      </ErrorBoundary>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <AccountModal
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
      />

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectMedia={(item) => selectMedia(item)}
        onSelectPerson={(id) => selectPerson(id)}
      />

      {activePlayer && (
        <ErrorBoundary onHome={closePlayer} homeLabel="Close player">
        <Player
          key={`${activePlayer.media?.media_type || 'media'}_${activePlayer.media?.id}`}
          media={activePlayer.media}
          details={activePlayer.details}
          onClose={closePlayer}
        />
        </ErrorBoundary>
      )}

      {/* Watchlist toast */}
      <div className={`cine-toast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
