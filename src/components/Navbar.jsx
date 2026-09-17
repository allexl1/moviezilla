import { useState, useEffect } from 'react';
import { ArrowLeft, Search, Settings, House, Clapperboard, Tv, Bookmark, Users, User } from 'lucide-react';
import { useAccount } from '../services/account';

export default function Navbar({ activeTab, onTabChange, onBack, isDetailView, onOpenSettings, onOpenAccount }) {
  const tabs = [
    { id: 'home', label: 'Home', icon: House },
    { id: 'movie', label: 'Movies', icon: Clapperboard },
    { id: 'tv', label: 'Shows', icon: Tv },
    { id: 'watchlist', label: 'Watchlist', icon: Bookmark },
    { id: 'rooms', label: 'Rooms', icon: Users },
  ];

  // Blur handoff: past ~48px the floating bars go solid-blur so content
  // sliding underneath melts instead of clipping. rAF-throttled, one bool.
  const [scrolled, setScrolled] = useState(false);
  const { user, displayName } = useAccount();
  const initial = (displayName || user?.email || '').slice(0, 1).toUpperCase();
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setScrolled((window.scrollY || 0) > 48);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <header className="cine-topbar fixed top-0 inset-x-0 z-50 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-4 pointer-events-auto">
          {isDetailView && (
            <button
              onClick={onBack}
              className="cine-icon-btn"
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

        {/* Top Right: Cinejoy Floating Pill Navigation (desktop only —
            visibility lives in CSS: unlayered .cine-nav-pill-box display
            would beat a Tailwind `hidden` utility) */}
        <div className={`cine-nav-pill-box pointer-events-auto ${scrolled ? 'is-scrolled' : ''}`}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
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

          {user ? (
            <button
              onClick={onOpenAccount}
              className="cine-nav-icon-btn"
              title="Account"
              aria-label="Account"
            >
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
                style={{
                  background: 'color-mix(in srgb, var(--cine-accent) 25%, transparent)',
                  color: 'var(--cine-accent)',
                }}
              >
                {initial}
              </span>
            </button>
          ) : (
            <button
              onClick={onOpenAccount}
              className="cine-nav-icon-btn"
              title="Sign in"
              aria-label="Sign in"
            >
              <User className="w-4 h-4" strokeWidth={2.2} />
            </button>
          )}
        </div>
      </header>

      {/* Mobile Bottom Dock */}
      <nav className="md:hidden fixed bottom-5 inset-x-0 z-50 flex justify-center px-4 pointer-events-none" aria-label="Primary">
        <div className={`pointer-events-auto flex items-center gap-0.5 p-1.5 rounded-full cine-nav-pill-box shadow-2xl ${scrolled ? 'is-scrolled' : ''}`}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
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
            className="cine-nav-btn"
            aria-label="Search"
          >
            <Search className="w-4 h-4" strokeWidth={2.2} />
          </button>
          <button
            onClick={onOpenSettings}
            className="cine-nav-btn"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" strokeWidth={2} />
          </button>
          <button
            onClick={onOpenAccount}
            className="cine-nav-btn"
            aria-label={user ? 'Account' : 'Sign in'}
          >
            {user ? (
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
                style={{
                  background: 'color-mix(in srgb, var(--cine-accent) 25%, transparent)',
                  color: 'var(--cine-accent)',
                }}
              >
                {initial}
              </span>
            ) : (
              <User className="w-4 h-4" strokeWidth={2.2} />
            )}
          </button>
        </div>
      </nav>
    </>
  );
}
