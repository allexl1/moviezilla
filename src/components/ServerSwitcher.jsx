import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Server } from 'lucide-react';
import { storage } from '../services/storage';

export default function ServerSwitcher({ currentServer, onSelectServer }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const servers = [
    { id: 'vidy', name: 'Vidy (Recommended)', quality: 'Multi', ping: 'optimal' },
    { id: 'vidlink', name: 'VidLink (Ultra Fast)', quality: '1080p', ping: 'optimal' },
    { id: 'vidsrc', name: 'VidSrc Provider', quality: '1080p', ping: 'good' },
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
        className="cine-control-btn"
      >
        <span className="w-2 h-2 rounded-full bg-[var(--cine-accent)] animate-pulse" />
        <span>{activeServer.name}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-white/50 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 p-3 rounded-3xl cine-glass-panel z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center gap-2 px-3 pt-1 pb-3 text-[10px] uppercase font-bold tracking-wider text-white/40 border-b border-white/10 mb-2">
            <Server className="w-3.5 h-3.5" />
            Playback Servers
          </div>
          <div className="space-y-1.5">
            {servers.map((s) => {
              const isSelected = s.id === activeServer.id;
              return (
                <button
                  key={s.id}
                  onClick={() => handleSelect(s.id)}
                  className={`mat-row w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-xs transition cursor-pointer ${
                    isSelected ? 'border-[var(--cine-accent)]/50' : ''
                  }`}
                >
                  <div className="flex flex-col min-w-0">
                    <span className={`font-semibold truncate ${isSelected ? 'text-[var(--cine-accent)]' : 'text-white/90'}`}>
                      {s.name}
                    </span>
                    <span className="text-[10px] text-white/40">{s.quality} • {s.ping}</span>
                  </div>
                  {isSelected ? (
                    <Check className="w-4 h-4 text-[var(--cine-accent)] flex-shrink-0" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-white/25 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
