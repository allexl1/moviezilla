// Room message-notification tones (WebAudio — no assets, offline-safe).
// Prefs (all localStorage):
//   mz_notif_enabled — master on/off (default on)
//   mz_notif_sound   — pop / chime / soft (default chime; a legacy 'off'
//                      migrates to master-off + chime)
//   mz_notif_inchat  — also notify while looking at the chat (default on)
//   mz_notif_vol     — 0..100 loudness (default 80)
// Tapping a sound previews it at the current volume, so the pick is made
// by ear.

export const NOTIF_SOUNDS = [
  { id: 'pop', name: 'Pop' },
  { id: 'chime', name: 'Chime' },
  { id: 'soft', name: 'Soft' },
];

const boolGet = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    if (v == null) return fallback;
    return v === '1';
  } catch {
    return fallback;
  }
};

const boolSet = (key, on) => {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    // ignore
  }
};

export function getNotifEnabled() {
  try {
    const v = localStorage.getItem('mz_notif_enabled');
    if (v != null) return v === '1';
    // Migrate the old single-pref: stored 'off' meant master-off.
    return localStorage.getItem('mz_notif_sound') !== 'off';
  } catch {
    return true;
  }
}

export function setNotifEnabled(on) {
  boolSet('mz_notif_enabled', on);
}

export function getInChat() {
  return boolGet('mz_notif_inchat', true);
}

export function setInChat(on) {
  boolSet('mz_notif_inchat', on);
}

export function getVolume() {
  try {
    const raw = localStorage.getItem('mz_notif_vol');
    if (raw == null || raw === '') return 80;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 80;
  } catch {
    return 80;
  }
}

export function setVolume(n) {
  try {
    localStorage.setItem('mz_notif_vol', String(Math.max(0, Math.min(100, Math.round(n)))));
  } catch {
    // ignore
  }
}

export function getSoundPref() {
  try {
    const v = localStorage.getItem('mz_notif_sound');
    if (v === 'off') return 'chime';
    return NOTIF_SOUNDS.some((s) => s.id === v) ? v : 'chime';
  } catch {
    return 'chime';
  }
}

export function setSoundPref(id) {
  try {
    localStorage.setItem('mz_notif_sound', id);
  } catch {
    // ignore
  }
  // Tap = preview at the current volume, so the choice is made by ear.
  if (id) playNotifyTone(id, getVolume() / 100);
}

let toneCtx = null;
export function playNotifyTone(kind = 'chime', vol01 = 0.8) {
  if (!kind) return;
  // Audible headroom: the old fixed gains were whisper-quiet. Volume
  // scales 20%..100% of these bases.
  const vol = 0.2 + 0.8 * Math.max(0, Math.min(1, Number(vol01) || 0));
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    toneCtx = toneCtx || new AC();
    if (toneCtx.state === 'suspended') {
      toneCtx.resume().catch(() => {});
      if (toneCtx.state === 'suspended') return;
    }
    const now = toneCtx.currentTime;
    const blip = (freq, at, dur, base, type = 'sine', slideTo = null) => {
      const o = toneCtx.createOscillator();
      const g = toneCtx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, now + at);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, now + at + dur);
      g.gain.setValueAtTime(0.0001, now + at);
      g.gain.exponentialRampToValueAtTime(base * vol, now + at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
      o.connect(g).connect(toneCtx.destination);
      o.start(now + at);
      o.stop(now + at + dur + 0.05);
    };
    if (kind === 'chime') {
      blip(880, 0, 0.14, 0.3);
      blip(1318, 0.1, 0.2, 0.26);
    } else if (kind === 'soft') {
      blip(392, 0, 0.22, 0.2, 'triangle');
    } else {
      blip(540, 0, 0.11, 0.34, 'sine', 190);
    }
  } catch {
    // Audio unavailable — badge + pill still carry the signal.
  }
}
