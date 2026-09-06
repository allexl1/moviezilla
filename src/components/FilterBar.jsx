import React from 'react';
import { Shuffle } from 'lucide-react';
import Select from './ui/Select';
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

const PROVIDERS = [
  { id: '', name: 'All Providers' },
  { id: '8', name: 'Netflix' },
  { id: '9', name: 'Prime Video' },
  { id: '337', name: 'Disney+' },
  { id: '350', name: 'Apple TV+' },
  { id: '1899', name: 'HBO Max' },
  { id: '15', name: 'Hulu' },
  { id: '531', name: 'Paramount+' },
];

export default function FilterBar({
  genres = [],
  sorts = [],
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
}) {
  return (
    <div className="w-full flex flex-col gap-3 py-1">
      <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-1 lg:justify-end">
        {onRandom && (
          <button
            onClick={onRandom}
            className="cine-icon-btn flex-shrink-0"
            title="Surprise me"
            aria-label="Random title"
          >
            <Shuffle className="w-4 h-4" />
          </button>
        )}

        <Select
          value={selectedGenre}
          onChange={onSelectGenre}
          label="Genre"
          className="cine-select--wide"
          options={(genres.length ? genres : [{ id: '', name: 'All Genres' }]).map((g) => ({
            value: g.id,
            label: g.name === 'All Genres' ? 'Genre' : g.name,
          }))}
        />

        <Select
          value={selectedYear}
          onChange={onSelectYear}
          label="Year"
          options={YEARS.map((y) => ({
            value: y,
            label: y === 'All Years' ? 'Year' : y,
          }))}
        />

        <Select
          value={selectedSort}
          onChange={onSelectSort}
          label="Sort"
          options={sorts.map((s) => ({ value: s.id, label: s.name }))}
        />

        <Select
          value={selectedProvider}
          onChange={onSelectProvider}
          label="Provider"
          options={PROVIDERS.map((p) => ({
            value: p.id,
            label: p.id === '' ? 'Provider' : p.name,
          }))}
        />

        <Select
          value={selectedCountry}
          onChange={onSelectCountry}
          label="Country"
          options={COUNTRIES.map((c) => ({
            value: c.id,
            label: c.id === '' ? 'Country' : c.name,
          }))}
        />

        <Select
          value={selectedLanguage}
          onChange={onSelectLanguage}
          label="Language"
          options={LANGUAGES.map((l) => ({
            value: l.id,
            label: l.id === '' ? 'Language' : l.name,
          }))}
        />
      </div>
    </div>
  );
}
