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
  return { tab, media: null, personId: null, play: false, roomCode: null, legacy: false, from: null };
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
    const tabParam = q.get('tab');
    const tabOf = tabParam && TAB_TO_PATH[tabParam] ? tabParam : null;
    const fromParam = q.get('from');
    const fromOf = fromParam && TAB_TO_PATH[fromParam] ? fromParam : null;

    let m = path.match(ROOM_RE);
    if (m) return { ...empty('rooms'), roomCode: m[1].toUpperCase() };

    m = path.match(MEDIA_RE);
    if (m) {
      return {
        // Tab follows the title type (navbar lights up Movies/Shows even
        // on reload or a shared link — same as in-app selectMedia).
        ...empty(m[1] === 'tv' ? 'tv' : 'movie'),
        media: { id: Number(m[2]), media_type: m[1] },
        play: q.get('play') === '1',
        // Tab-root playback stamps its origin (?from=watchlist): closing
        // the player (or its history entry) returns to the real shelf,
        // not a phantom detail. Only honored on ?play=1 URLs.
        from: q.get('play') === '1' ? fromOf : null,
      };
    }

    m = path.match(PERSON_RE);
    // Person links keep the sender's tab (?tab=tv) so a shared profile
    // lights up the same tab as in-app (selectPerson never switches).
    if (m) return { ...empty(tabOf || 'home'), personId: Number(m[1]) };

    // Legacy invite links (?room=ABC123) resolve from any path — old
    // invites sometimes carry one. Explicit /room/CODE above wins.
    const legacyRoom = (q.get('room') || '').trim();
    if (LEGACY_ROOM_RE.test(legacyRoom)) {
      return { ...empty('rooms'), roomCode: legacyRoom.toUpperCase(), legacy: true };
    }

    if (PATH_TO_TAB[path]) return empty(PATH_TO_TAB[path]);

    return empty('home');
  } catch {
    return empty('home');
  }
}

function mediaTypeOf(media) {
  if (!media) return 'movie';
  if (media.media_type === 'tv' || media.type === 'tv') return 'tv';
  // discover/* + stored rows lack media_type: same fallback as
  // resolveMediaType (catalog.js), or show URLs build as /movie/<showId>
  // and reload onto the wrong tab + wrong details endpoint.
  if (media.first_air_date) return 'tv';
  return 'movie';
}

export function buildLocation({ tab = 'home', media = null, personId = null, play = false, roomCode = null, from = null } = {}) {
  if (roomCode) return `/room/${roomCode}`;
  if (personId) return `/person/${personId}${tab && tab !== 'home' && TAB_TO_PATH[tab] ? `?tab=${tab}` : ''}`;
  if (media && media.id != null) {
    const base = `/${mediaTypeOf(media)}/${media.id}`;
    if (!play) return base;
    return `${base}?play=1${from && TAB_TO_PATH[from] ? `&from=${from}` : ''}`;
  }
  return TAB_TO_PATH[tab] || '/';
}
