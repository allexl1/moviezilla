import React from 'react';
import { ArrowLeft, Search, Settings, House, Clapperboard, Tv, Bookmark } from 'lucide-react';

export default function Navbar({ activeTab, onTabChange, onBack, isDetailView, onOpenSettings }) {
  const tabs = [
    { id: 'home', label: 'Home', icon: House },
    { id: 'movie', label: 'Movies', icon: Clapperboard },
    { id: 'tv', label: 'Shows', icon: Tv },
    { id: 'watchlist', label: 'My List', icon: Bookmark },
  ];

  return (
    <>
      <header className="cine-topbar fixed top-0 inset-x-0 z-50 flex items-center justify-between pointer-events-none">
        {/* Top Left: Back Arrow + Logo */}
        <div className="flex items-center gap-4 pointer-events-auto">
          {isDetailView && (
            <button
              onClick={onBack}
              className="w-11 h-11 rounded-full flex items-center justify-center text-white/80 hover:text-white bg-[var(--cine-glass-tint)] hover:bg-[var(--cine-glass-tint-hover)] border border-[var(--cine-glass-border)] backdrop-blur-2xl transition cursor-pointer"
              title="Back"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" strokeWidth={2.4} />
            </button>
          )}

          <div onClick={() => onTabChange('home')} className="cursor-pointer select-none">
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-2xl flex items-center justify-center text-white font-black text-xl shadow-2xl">
              MZ
            </div>
          </div>
        </div>

        {/* Top Right: Cinejoy Floating Pill Navigation */}
        <div className="hidden md:flex cine-nav-pill-box pointer-events-auto">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id && !isDetailView;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`cine-nav-btn ${isActive ? 'is-active' : ''}`}
              >
                {isActive && <Icon className="w-4 h-4" strokeWidth={2.4} />}
                {tab.label}
              </button>
            );
          })}

          <span className="w-px self-stretch my-2 bg-white/10 mx-1" />

          <button
            onClick={() => onTabChange('search')}
            className="cine-nav-icon-btn"
            title="Search"
            aria-label="Search"
          >
            <Search className="w-4 h-4" strokeWidth={2.2} />
          </button>

          <button
            onClick={onOpenSettings}
            className="cine-nav-icon-btn"
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      </header>

      {/* Mobile Bottom Dock */}
      <nav className="md:hidden fixed bottom-5 inset-x-0 z-50 flex justify-center px-4 pointer-events-none" aria-label="Primary">
        <div className="pointer-events-auto flex items-center gap-1 p-1.5 rounded-full cine-nav-pill-box shadow-2xl">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id && !isDetailView;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`cine-nav-btn px-3.5 py-2 text-xs ${isActive ? 'is-active' : ''}`}
              >
                {tab.label}
              </button>
            );
          })}
          <button
            onClick={() => onTabChange('search')}
            className="cine-nav-btn px-3.5 py-2 text-xs"
            aria-label="Search"
          >
            <Search className="w-4 h-4" strokeWidth={2.2} />
          </button>
          <button
            onClick={onOpenSettings}
            className="cine-nav-btn px-3.5 py-2 text-xs"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      </nav>
    </>
  );
}
