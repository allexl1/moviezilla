import React from 'react';

const GENRES = [
  { id: '', name: 'All Genres' },
  { id: '28', name: 'Action' },
  { id: '12', name: 'Adventure' },
  { id: '16', name: 'Animation' },
  { id: '35', name: 'Comedy' },
  { id: '18', name: 'Drama' },
  { id: '878', name: 'Sci-Fi' },
  { id: '53', name: 'Thriller' },
];

const YEARS = ['All Years', '2026', '2025', '2024', '2023', '2022', '2020s'];
const SORTS = [
  { id: 'popularity.desc', name: 'Most Popular' },
  { id: 'vote_average.desc', name: 'Top Rated' },
  { id: 'primary_release_date.desc', name: 'Newest' },
];

export default function FilterBar({
  selectedGenre,
  onSelectGenre,
  selectedYear,
  onSelectYear,
  selectedSort,
  onSelectSort,
  selectedProvider,
  onSelectProvider,
}) {
  return (
    <div className="w-full flex flex-col gap-4 py-4 animate-in fade-in duration-200">
      {/* Top Segmented Filter Rail */}
      <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-1">
        {/* Genre Selector */}
        <div className="relative flex-shrink-0">
          <select
            value={selectedGenre}
            onChange={(e) => onSelectGenre(e.target.value)}
            className="appearance-none h-9 px-4 pr-9 rounded-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-xs font-semibold text-white focus:outline-none focus:border-white/30 cursor-pointer backdrop-blur-xl"
          >
            {GENRES.map((g) => (
              <option key={g.id} value={g.id} className="bg-[#121218] text-white">
                {g.name === 'All Genres' ? 'Genre: All' : g.name}
              </option>
            ))}
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/40 text-[10px]">▼</span>
        </div>

        {/* Year Selector */}
        <div className="relative flex-shrink-0">
          <select
            value={selectedYear}
            onChange={(e) => onSelectYear(e.target.value)}
            className="appearance-none h-9 px-4 pr-9 rounded-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-xs font-semibold text-white focus:outline-none focus:border-white/30 cursor-pointer backdrop-blur-xl"
          >
            {YEARS.map((y) => (
              <option key={y} value={y} className="bg-[#121218] text-white">
                {y === 'All Years' ? 'Year: All' : y}
              </option>
            ))}
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/40 text-[10px]">▼</span>
        </div>

        {/* Sort Selector */}
        <div className="relative flex-shrink-0">
          <select
            value={selectedSort}
            onChange={(e) => onSelectSort(e.target.value)}
            className="appearance-none h-9 px-4 pr-9 rounded-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-xs font-semibold text-white focus:outline-none focus:border-white/30 cursor-pointer backdrop-blur-xl"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id} className="bg-[#121218] text-white">
                {s.name}
              </option>
            ))}
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/40 text-[10px]">▼</span>
        </div>
      </div>
    </div>
  );
}
