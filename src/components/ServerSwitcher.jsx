import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Server } from 'lucide-react';
import { storage } from '../services/storage';

export default function ServerSwitcher({ currentServer, onSelectServer, closeSignal = 0, onOpenChange = null }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // resume: provider reports real position + honors resume param, so
  // History reopens at the exact second. Others only get wall-clock.
  const servers = [
    { id: 'vidy', name: 'Vidy (Recommended)', quality: 'Multi', ping: 'optimal', resume: true },
    { id: 'vidlink', name: 'VidLink (Ultra Fast)', quality: '1080p', ping: 'optimal', resume: true },
    { id: 'vidsrccc', name: 'VidSrc.cc', quality: '1080p', ping: 'good', resume: true },
    { id: 'vidsrc', name: 'VidSrc Provider', quality: '1080p', ping: 'good', resume: false },
    { id: 'embedsu', name: 'Embed.su', quality: 'HD', ping: 'good', resume: false },
    { id: 'smashy', name: 'SmashyStream', quality: 'HD', ping: 'good', resume: false },
    { id: 'autoembed', name: 'AutoEmbed', quality: 'HD', ping: 'good', resume: false },
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

  // External shut signal (e.g. episode popover opened — one at a time).
  const firstSignal = useRef(closeSignal);
  useEffect(() => {
    if (closeSignal !== firstSignal.current) setIsOpen(false);
  }, [closeSignal]);

  const toggle = () => {
    setIsOpen((v) => {
      onOpenChange?.(!v);
      return !v;
    });
  };

  const handleSelect = (id) => {
    storage.setPreferredServer(id);
    onSelectServer(id);
    setIsOpen(false);
    onOpenChange?.(false);
  };

  const activeServer = servers.find((s) => s.id === currentServer) || servers[0];

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        onClick={toggle}
        className="cine-control-btn"
        aria-label="Select playback server"
        aria-expanded={isOpen}
      >
        <span className="w-2 h-2 rounded-full bg-[var(--cine-accent)] animate-pulse" />
        <span className="hidden sm:inline">{activeServer.name}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-white/50 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 max-w-[calc(100vw-2rem)] p-4 rounded-3xl cine-glass-panel z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center gap-2 px-3 pt-1 pb-3 text-[10px] uppercase font-bold tracking-wider text-white/60 border-b border-[var(--cine-glass-border)] mb-2">
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
                  className={`mat-row w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left text-sm transition cursor-pointer ${
                    isSelected ? 'border-[var(--cine-accent)]/50' : ''
                  }`}
                >
                  <div className="flex flex-col min-w-0">
                    <span className={`font-semibold truncate ${isSelected ? 'text-[var(--cine-accent)]' : 'text-white/90'}`}>
                      {s.name}
                    </span>
                    <span className="text-xs text-white/60">{s.quality} • {s.ping}{s.resume ? ' • resumes' : ''}</span>
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
