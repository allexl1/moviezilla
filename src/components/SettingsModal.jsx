import React, { useState, useEffect } from 'react';
import { X, Clapperboard, Play, Trash2 } from 'lucide-react';
import { storage } from '../services/storage';
import Modal from './ui/Modal';
import Input from './ui/Input';
import Select from './ui/Select';

const SERVERS = [
  { value: 'vidy', label: 'Vidy (Recommended)' },
  { value: 'vidlink', label: 'VidLink (Ultra Fast)' },
  { value: 'vidsrc', label: 'VidSrc Provider' },
];

function SettingRow({ icon, title, desc, control, danger = false }) {
  return (
    <div className="flex items-start justify-between gap-4 py-5 first:pt-1 last:pb-1">
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border ${
            danger
              ? 'bg-red-500/10 border-red-500/20 text-red-400'
              : 'bg-white/5 border-white/10 text-[var(--cine-accent)]'
          }`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-xs text-white/45 leading-relaxed mt-0.5">{desc}</p>
        </div>
      </div>
      <div className="flex-shrink-0 w-52">{control}</div>
    </div>
  );
}

export default function SettingsModal({ isOpen, onClose, onSaveLetterboxd, currentUsername }) {
  const [username, setUsername] = useState(currentUsername || '');
  const [defaultServer, setDefaultServer] = useState(() => storage.getPreferredServer('vidy'));

  useEffect(() => {
    if (isOpen) setUsername(currentUsername || '');
  }, [isOpen, currentUsername]);

  const handleSave = () => {
    localStorage.setItem('mz_letterboxd_user', username.trim());
    storage.setPreferredServer(defaultServer);
    if (onSaveLetterboxd) onSaveLetterboxd(username.trim());
    onClose();
  };

  const handleClearHistory = () => {
    if (confirm('Clear all resume timestamps and continue watching history?')) {
      storage.clearPlaybackHistory();
      window.location.reload();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-xl"
      align="center"
      showCloseButton={false}
      panelClassName="p-6"
      label="Settings"
    >
      <div className="flex items-center justify-between pb-2">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Settings</h2>
          <p className="text-xs text-white/45 mt-0.5">Preferences & sync</p>
        </div>
        <button onClick={onClose} className="cine-icon-btn" title="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="divide-y divide-white/[0.07]">
        <SettingRow
          icon={<Clapperboard className="w-4 h-4" />}
          title="Letterboxd Sync"
          desc="Syncs your public Letterboxd watchlist into My List."
          control={
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
            />
          }
        />

        <SettingRow
          icon={<Play className="w-4 h-4" fill="currentColor" />}
          title="Default Server"
          desc="First player tried for every title."
          control={
            <Select value={defaultServer} onChange={setDefaultServer} options={SERVERS} />
          }
        />

        <SettingRow
          danger
          icon={<Trash2 className="w-4 h-4" />}
          title="Watch History"
          desc="Clears resume timestamps and continue watching."
          control={
            <button
              onClick={handleClearHistory}
              className="cine-control-btn w-full"
            >
              Clear
            </button>
          }
        />
      </div>

      <div className="pt-5 mt-1 border-t border-white/10 flex justify-end">
        <button
          onClick={handleSave}
          className="cine-btn cine-btn-primary cine-btn-shimmer h-11 px-6 text-sm"
        >
          Save Changes
        </button>
      </div>

      <p className="pt-4 text-[11px] leading-relaxed text-white/35">
        Movie and TV data provided by TMDB. This product uses the TMDB API
        but is not endorsed or certified by TMDB.
      </p>
    </Modal>
  );
}
