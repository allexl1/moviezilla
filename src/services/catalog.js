import { Flame, Swords, Laugh, Skull, Rocket, Heart, Clapperboard } from 'lucide-react';
import { MOVIE_GENRES, TV_GENRES } from './tmdb';

// Shared catalog helpers (single source of truth for every discovery view).
// Extracted from App during the route split — semantics unchanged.

export const GENRE_NAME = {};
[...MOVIE_GENRES, ...TV_GENRES].forEach((g) => {
  if (g.id !== '' && !GENRE_NAME[g.id]) GENRE_NAME[g.id] = g.name;
});

// Genre → icon (cinejoy hero meta parity).
export const GENRE_ICON = {
  Action: Swords,
  Adventure: Rocket,
  Comedy: Laugh,
  Horror: Skull,
  'Sci-Fi': Rocket,
  'Sci-Fi & Fantasy': Rocket,
  Romance: Heart,
  Thriller: Flame,
};

// Resolve the item's own type — never the nav tab. discover/* items lack
// media_type, so fall back to first_air_date (TV) before defaulting to movie.
export function resolveMediaType(media) {
  if (media?.media_type === 'tv' || media?.media_type === 'movie') return media.media_type;
  if (media?.type === 'tv' || media?.type === 'movie') return media.type;
  if (media?.first_air_date) return 'tv';
  return 'movie';
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Strict first, relaxed fallback so the shelf never renders empty while
// the endpoint returns data. Movies: future-dated only, soonest first.
// TV: pass dateKey='first_air_date' (upcoming-series discover results).
export function pickUpcoming(results, dateKey = 'release_date') {
  const today = todayISO();
  const dateOf = (x) => x?.[dateKey] || '';
  const strict = (results || []).filter(
    (x) =>
      x.backdrop_path &&
      x.poster_path &&
      (x.overview || '').trim().length > 20 &&
      dateOf(x) &&
      dateOf(x) >= today
  );
  if (strict.length >= 4) {
    return strict.sort((a, b) => dateOf(a).localeCompare(dateOf(b))).slice(0, 10);
  }
  return (results || [])
    .filter((x) => x.backdrop_path && x.poster_path && dateOf(x))
    .sort((a, b) => {
      const fa = dateOf(a) >= today ? 0 : 1;
      const fb = dateOf(b) >= today ? 0 : 1;
      return fa - fb || dateOf(a).localeCompare(dateOf(b));
    })
    .slice(0, 10);
}

export function pickAiring(results) {
  const strict = (results || []).filter(
    (x) => x.backdrop_path && x.poster_path && (x.overview || '').trim().length > 20
  );
  if (strict.length >= 4) return strict.slice(0, 10);
  return (results || [])
    .filter((x) => x.backdrop_path && x.poster_path)
    .slice(0, 10);
}

// Unrated titles (vote_average 0) are hidden from Released grids and
// home rails — nobody watches them. NOT applied to Coming Soon / On The
// Air, which are unreleased by definition and have no votes yet.
export function hasRating(item) {
  return (item?.vote_average || 0) > 0;
}

// Released grids must never contain future-dated titles — those belong
// in Coming Soon / On The Air. Missing dates are kept (can't judge).
export function isReleased(item, tab) {
  const today = todayISO();
  if (tab === 'movie') {
    return !(item.release_date && item.release_date > today);
  }
  return !(item.first_air_date && item.first_air_date > today);
}

// Default shelf: recent (last year) + popular + voted — "newest most
// popular". Pure newest-first is 20/20 zero-vote day-0 releases.
export const defaultSortFor = () => 'new.popular';

// Remount hydration window: route views unmount under detail/person/
// player overlays (same as the old conditional render), so a fresh mount
// within this window reuses data instead of flashing skeletons. Matches
// the old instant-back behavior; trending-class data moves slowly anyway.
export const DATA_TTL = 5 * 60 * 1000;

// Provider shortlist for the home "Movies on provider" picker.
export const PROVIDERS = [
  { id: '8', name: 'Netflix', color: '#E50914' },
  { id: '9', name: 'Prime Video', color: '#00A8E1' },
  { id: '337', name: 'Disney+', color: '#113CCF' },
  { id: '350', name: 'Apple TV+', color: '#FFFFFF' },
  { id: '1899', name: 'HBO Max', color: '#9933FF' },
  { id: '15', name: 'Hulu', color: '#1CE783' },
  { id: '531', name: 'Paramount+', color: '#0064FF' },
];
