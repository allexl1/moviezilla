import React from 'react';
import { Shuffle } from 'lucide-react';
import Select from './ui/Select';
import { COUNTRIES } from '../services/tmdb';

const YEARS = ['All Years', '2026', '2025', '2024', '2023', '2022', '2020s'];

const PROVIDERS = [
  { id: '', name: 'All Providers' },
  { id: '8', name: 'Netflix' },
  { id: '9', name: 'Prime Video' },
  { id: '337', name: 'Disney+' },
  { id: '350', name: 'Apple TV+' },
  { id: '384', name: 'HBO Max' },
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
  onRandom,
}) {
  return (
    <div className="w-full flex flex-col gap-3 py-1">
      <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-1 lg:justify-end">
        {onRandom && (
          <button
            onClick={onRandom}
            className="cine-control-btn flex-shrink-0"
            title="Surprise me"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>Random</span>
          </button>
        )}

        <Select
          value={selectedGenre}
          onChange={onSelectGenre}
          label="Genre"
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
          label="Sort by"
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
      </div>
    </div>
  );
}
