import { Shuffle } from 'lucide-react';
import Picker from './Picker';
import ProviderPicker from './ProviderPicker';
import { COUNTRIES, LANGUAGES } from '../services/tmdb';

// Full year range (TMDB has no year-list endpoint, so generate it):
// every year back to 1970, then decades back to the 1900s.
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [
  'All Years',
  ...Array.from({ length: CURRENT_YEAR - 1969 }, (_, i) => String(CURRENT_YEAR - i)),
  '1960s',
  '1950s',
  '1940s',
  '1930s',
  '1920s',
  '1910s',
  '1900s',
];

const FALLBACK_PROVIDERS = [
  { id: '', name: 'All Providers' },
  { id: '8', name: 'Netflix' },
  { id: '9', name: 'Prime Video' },
  { id: '337', name: 'Disney+' },
  { id: '350', name: 'Apple TV+' },
  { id: '1899', name: 'HBO Max' },
  { id: '15', name: 'Hulu' },
  { id: '531', name: 'Paramount+' },
];

// Provider options come from the same TMDB catalog as the home wall
// (views fetch + pass them) so a service tapped on Home always exists
// in the Movies/Shows filter. Falls back to the short list offline.
export default function FilterBar({
  genres = [],
  sorts = [],
  providers = FALLBACK_PROVIDERS,
  selectedGenre,
  onSelectGenre,
  selectedYear,
  onSelectYear,
  selectedSort,
  onSelectSort,
  selectedProvider,
  onSelectProvider,
  selectedCountry,
  onSelectCountry,
  selectedLanguage,
  onSelectLanguage,
  onRandom,
  extra = null,
}) {
  return (
    <div className="w-full flex flex-col gap-3 py-1">
      {/* Headroom above the row lives inside the scroller (pt-8/-mt-8 net
          zero) so hover tooltips never clip against the overflow edge.
          Desktop shows the row unclipped (tips paint whole); small screens
          keep the scroll (touch has no hover anyway). */}
      <div className="flex items-center gap-2.5 overflow-x-auto lg:overflow-visible no-scrollbar px-1 pt-8 -mt-8 pb-1 lg:justify-end">
        {onRandom && (
          <span className="relative inline-flex flex-shrink-0">
            <button
              onClick={onRandom}
              className="cine-icon-btn cine-has-tip"
              aria-label="Random pick"
            >
              <Shuffle className="w-4 h-4" />
            </button>
            <span className="cine-tip cine-tip--left" aria-hidden="true">Random pick</span>
          </span>
        )}
        {extra && <div className="flex-shrink-0">{extra}</div>}

        <Picker
          value={selectedGenre}
          onChange={onSelectGenre}
          ariaLabel="Genre"
          menuLabel="Genres"
          placeholder="Genre"
          options={(genres.length ? genres : [{ id: '', name: 'All Genres' }]).map((g) => ({
            value: g.id,
            label: g.name === 'All Genres' ? 'Genre' : g.name,
          }))}
        />

        <Picker
          value={selectedYear}
          onChange={onSelectYear}
          ariaLabel="Year"
          menuLabel="Years"
          placeholder="Year"
          options={YEARS.map((y) => ({
            value: y,
            label: y === 'All Years' ? 'Year' : y,
          }))}
        />

        <Picker
          value={selectedSort}
          onChange={onSelectSort}
          ariaLabel="Sort"
          menuLabel="Sort by"
          placeholder="Sort"
          options={sorts.map((s) => ({ value: s.id, label: s.name }))}
        />

        <ProviderPicker
          value={selectedProvider}
          onChange={onSelectProvider}
          options={[{ id: '', name: 'All Providers' }].concat((providers || []).filter((p) => p.id !== ''))}
          placeholder="Provider"
        />

        <Picker
          value={selectedCountry}
          onChange={onSelectCountry}
          ariaLabel="Country"
          menuLabel="Countries"
          placeholder="Country"
          options={COUNTRIES.map((c) => ({
            value: c.id,
            label: c.id === '' ? 'Country' : c.name,
          }))}
        />

        <Picker
          value={selectedLanguage}
          onChange={onSelectLanguage}
          ariaLabel="Language"
          menuLabel="Languages"
          placeholder="Language"
          options={LANGUAGES.map((l) => ({
            value: l.id,
            label: l.id === '' ? 'Language' : l.name,
          }))}
        />
      </div>
    </div>
  );
}
