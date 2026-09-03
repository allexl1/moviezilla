import React from 'react';

export default function Navbar({ activeTab, onTabChange, onBack, isDetailView, onOpenSettings }) {
  const tabs = [
    { id: 'home', label: 'Home' },
    { id: 'movie', label: 'Movies' },
    { id: 'tv', label: 'Shows' },
    { id: 'watchlist', label: 'My List' },
  ];

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-12 py-7 pointer-events-none">
        {/* Top Left: Back Arrow + Logo with proper spacing */}
        <div className="flex items-center gap-4 pointer-events-auto">
          {isDetailView && (
            <button
              onClick={onBack}
              className="w-11 h-11 rounded-full flex items-center justify-center text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 backdrop-blur-xl transition cursor-pointer"
              title="Back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
          )}

          <div onClick={() => onTabChange('home')} className="cursor-pointer select-none">
            <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-2xl flex items-center justify-center text-white font-black text-lg shadow-xl">
              MZ
            </div>
          </div>
        </div>

        {/* Top Right: Cinejoy Floating Pill Navigation with correct margins */}
        <div className="hidden md:flex cine-nav-pill-box pointer-events-auto">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id && !isDetailView;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`cine-nav-btn ${isActive ? 'is-active' : ''}`}
              >
                {tab.label}
              </button>
            );
          })}

          <button
            onClick={() => onTabChange('search')}
            className="cine-nav-icon-btn"
            title="Search"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          <button
            onClick={onOpenSettings}
            className="cine-nav-icon-btn"
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile Bottom Dock */}
      <nav className="md:hidden fixed bottom-5 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
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
        </div>
      </nav>
    </>
  );
}
