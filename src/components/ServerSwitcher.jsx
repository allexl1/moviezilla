import React, { useState, useRef, useEffect } from 'react';
import { storage } from '../services/storage';

export default function ServerSwitcher({ currentServer, onSelectServer }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const servers = [
    { id: 'vidlink', name: 'VidLink (Ultra Fast)', quality: '1080p', ping: 'optimal' },
    { id: 'vidy', name: 'Vidy Stream', quality: 'Multi', ping: 'good' },
    { id: 'vidsrc', name: 'VidSrc Provider', quality: '1080p', ping: 'optimal' },
    { id: 'alpha', name: 'Server Alpha (Direct)', quality: 'Original', ping: 'stable' },
  ];

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (id) => {
    storage.setPreferredServer(id);
    onSelectServer(id);
    setIsOpen(false);
  };

  const activeServer = servers.find((s) => s.id === currentServer) || servers[0];

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="h-9 px-4 rounded-full flex items-center gap-2 text-xs font-semibold text-white/90 bg-white/10 hover:bg-white/15 border border-white/15 backdrop-blur-xl transition cursor-pointer shadow-md"
      >
        <span className="w-2 h-2 rounded-full bg-[#95ff50] animate-pulse" />
        <span>{activeServer.name}</span>
        <svg
          className={`w-3.5 h-3.5 text-white/50 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 p-2 rounded-2xl bg-[#0e0e14]/95 border border-white/15 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider text-white/40 border-b border-white/10 mb-1">
            Playback Servers
          </div>
          <div className="space-y-1">
            {servers.map((s) => {
              const isSelected = s.id === activeServer.id;
              return (
                <button
                  key={s.id}
                  onClick={() => handleSelect(s.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs transition cursor-pointer ${
                    isSelected
                      ? 'bg-white/15 text-white font-bold shadow-inner'
                      : 'text-white/70 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className={isSelected ? 'text-[#95ff50]' : ''}>{s.name}</span>
                    <span className="text-[10px] text-white/40">{s.quality}</span>
                  </div>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      s.ping === 'optimal' ? 'bg-[#95ff50]' : 'bg-emerald-400'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
