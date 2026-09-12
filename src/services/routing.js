// Deep-link mirror: the URL reflects navigation state (tabs, details,
// people, player, rooms) so links share and the back button works.
//
// STATE IS THE SOURCE OF TRUTH — the URL only mirrors it. App pushes on
// state change and restores on popstate. No router dependency, history
// API only. Keep this module pure (no React) so the mapping stays testable.

const TAB_TO_PATH = {
  home: '/',
  movie: '/movies',
  tv: '/shows',
  watchlist: '/watchlist',
  rooms: '/rooms',
  football: '/football',
};

const PATH_TO_TAB = {
  '/': 'home',
  '/movies': 'movie',
  '/shows': 'tv',
  '/watchlist': 'watchlist',
  '/rooms': 'rooms',
  '/football': 'football',
};

const ROOM_RE = /^\/room\/([A-Za-z0-9]{6})\/?$/;
const MEDIA_RE = /^\/(movie|tv)\/(\d+)\/?$/;
const PERSON_RE = /^\/person\/(\d+)\/?$/;
const LEGACY_ROOM_RE = /^[A-Z0-9]{6}$/i;

function empty(tab = 'home') {
  return { tab, media: null, personId: null, play: false, roomCode: null, legacy: false };
}

// Total-safe parse for useState initializers (pure — StrictMode-safe,
// unlike stashing the first parse in a ref during render).
export function parseLocationSafe(loc) {
  try {
    return parseLocation(loc);
  } catch {
    return empty('home');
  }
}

export function parseLocation(loc = window.location) {
  try {
    const path = (loc.pathname || '/').replace(/\/+$/, '') || '/';
    const q = new URLSearchParams(loc.search || '');

    // Legacy invite links (?room=ABC123) keep resolving — App canonicalizes
    // them to /room/ABC123 on entry.
    const legacyRoom = (q.get('room') || '').trim();
    if (path === '/' && LEGACY_ROOM_RE.test(legacyRoom)) {
      return { ...empty('rooms'), roomCode: legacyRoom.toUpperCase(), legacy: true };
    }

    let m = path.match(ROOM_RE);
    if (m) return { ...empty('rooms'), roomCode: m[1].toUpperCase() };

    m = path.match(MEDIA_RE);
    if (m) {
      return {
        ...empty('home'),
        media: { id: Number(m[2]), media_type: m[1] },
        play: q.get('play') === '1',
      };
    }

    m = path.match(PERSON_RE);
    if (m) return { ...empty('home'), personId: Number(m[1]) };

    if (PATH_TO_TAB[path]) return empty(PATH_TO_TAB[path]);

    return empty('home');
  } catch {
    return empty('home');
  }
}

function mediaTypeOf(media) {
  if (!media) return 'movie';
  if (media.media_type === 'tv' || media.type === 'tv') return 'tv';
  return 'movie';
}

export function buildLocation({ tab = 'home', media = null, personId = null, play = false, roomCode = null } = {}) {
  if (roomCode) return `/room/${roomCode}`;
  if (personId) return `/person/${personId}`;
  if (media && media.id != null) {
    return `/${mediaTypeOf(media)}/${media.id}${play ? '?play=1' : ''}`;
  }
  return TAB_TO_PATH[tab] || '/';
}
