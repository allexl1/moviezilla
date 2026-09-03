import React, { useState } from 'react';
import { storage } from '../services/storage';

export default function SettingsModal({ isOpen, onClose, onSaveLetterboxd, currentUsername }) {
  const [username, setUsername] = useState(currentUsername || '');
  const [defaultServer, setDefaultServer] = useState(() => storage.getPreferredServer('vidlink'));

  if (!isOpen) return null;

  const handleSave = () => {
    localStorage.setItem('mz_letterboxd_user', username.trim());
    storage.setPreferredServer(defaultServer);
    if (onSaveLetterboxd) onSaveLetterboxd(username.trim());
    onClose();
  };

  const handleClearHistory = () => {
    if (confirm('Clear all resume timestamps and continue watching history?')) {
      localStorage.removeItem('mz_continue_watching');
      window.location.reload();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-2xl animate-in fade-in duration-200">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md rounded-3xl bg-[#0e0e14]/95 border border-white/15 backdrop-blur-3xl shadow-[0_24px_80px_rgba(0,0,0,0.85)] p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <h2 className="text-base font-bold text-white tracking-tight">Preferences & Sync</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Letterboxd Sync Input */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white/80">Letterboxd Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. your_username"
            className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#95ff50]"
          />
          <p className="text-[11px] text-white/40">
            Syncs your public Letterboxd watchlist RSS directly into "My List".
          </p>
        </div>

        {/* Default Provider */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white/80">Default Embed Server</label>
          <select
            value={defaultServer}
            onChange={(e) => setDefaultServer(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-[#121218] border border-white/10 text-xs text-white focus:outline-none focus:border-[#95ff50]"
          >
            <option value="vidlink">VidLink (Fastest / Recommended)</option>
            <option value="vidy">Vidy Stream</option>
            <option value="vidsrc">VidSrc Provider</option>
          </select>
        </div>

        {/* Cache / Storage Clean */}
        <div className="pt-2 border-t border-white/10 flex items-center justify-between">
          <button
            onClick={handleClearHistory}
            className="text-xs text-red-400/80 hover:text-red-400 font-medium transition cursor-pointer"
          >
            Clear Watch History
          </button>

          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-full bg-white text-black font-semibold text-xs hover:bg-white/90 transition cursor-pointer shadow-md"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
