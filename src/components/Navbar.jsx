import React from 'react';
import { Film, Search, Settings, User } from 'lucide-react';

export default function Navbar({
  activeTab = 'home',
  setActiveTab = () => {},
  onOpenSearch = () => {},
  onOpenSettings = () => {},
  letterboxdUser = null,
  onOpenLetterboxd = () => {},
}) {
  const navItems = [
    { id: 'home', label: 'Home' },
    { id: 'movies', label: 'Movies' },
    { id: 'tv', label: 'TV Shows' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex flex-col items-center px-3 pt-3 pb-1 sm:px-4 sm:pt-4">
      <div className="w-full max-w-7xl">
        <div className="flex items-center justify-between gap-2 sm:gap-4 px-3 py-2 sm:px-4 sm:py-2.5 rounded-2xl bg-[#09090b]/80 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.08)] transition-all">
          {/* Logo */}
          <button
            onClick={() => setActiveTab('home')}
            className="flex items-center gap-2 group focus:outline-none"
            aria-label="MovieZilla Home"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-lime-400/10 border border-lime-400/20 text-lime-400 group-hover:bg-lime-400/20 group-hover:border-lime-400/30 transition-colors">
              <Film className="w-4 h-4" />
            </div>
            <span className="text-base sm:text-lg font-bold tracking-tight text-white group-hover:text-lime-400 transition-colors">
              Movie<span className="text-lime-400">Zilla</span>
            </span>
          </button>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-white/[0.02] border border-white/[0.04] p-1 rounded-xl">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`relative px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'text-white bg-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full bg-lime-400" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Desktop Search Trigger */}
            <button
              onClick={onOpenSearch}
              className="hidden sm:flex items-center gap-2.5 h-9 px-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-white/[0.12] text-zinc-400 hover:text-zinc-200 text-xs transition-all"
            >
              <Search className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-zinc-400 font-normal">Search titles...</span>
              <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/40 border border-white/[0.08] text-zinc-500">
                ⌘K
              </kbd>
            </button>

            {/* Mobile Search Icon */}
            <button
              onClick={onOpenSearch}
              className="sm:hidden flex items-center justify-center w-9 h-9 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] text-zinc-400 hover:text-zinc-100 transition-colors"
              aria-label="Search"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Letterboxd Action */}
            <button
              onClick={onOpenLetterboxd}
              className={`flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-xl border text-xs font-medium transition-all ${
                letterboxdUser
                  ? 'bg-lime-400/10 border-lime-400/25 text-lime-400 hover:bg-lime-400/15'
                  : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/[0.06] hover:border-white/[0.12] text-zinc-400 hover:text-zinc-200'
              }`}
              title={letterboxdUser ? `Synced: @${letterboxdUser}` : 'Connect Letterboxd'}
            >
              <User className="w-3.5 h-3.5" />
              <span className="hidden sm:inline max-w-[90px] truncate">
                {letterboxdUser ? `@${letterboxdUser}` : 'Letterboxd'}
              </span>
            </button>

            {/* Settings Button */}
            <button
              onClick={onOpenSettings}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.12] text-zinc-400 hover:text-zinc-100 transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Sub-Navigation Bar */}
        <nav className="md:hidden flex items-center justify-center gap-1 mt-1.5 p-1 rounded-xl bg-[#09090b]/75 backdrop-blur-lg border border-white/[0.06] shadow-lg">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex-1 py-1.5 rounded-lg text-xs font-medium transition-all text-center ${
                  isActive
                    ? 'text-white bg-white/[0.08]'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-2.5 h-0.5 rounded-full bg-lime-400" />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
