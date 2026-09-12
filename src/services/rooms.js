import { getSupabase } from './supabase';

// Unambiguous alphabet for 6-char room codes (no 0/O/1/I).
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function safeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode etc. — identity simply doesn't persist.
  }
}

// Stable per-device id. Host = the device that created the room (no
// accounts in v1, so hosting from a second device won't carry the crown).
export function myDeviceId() {
  let id = null;
  try {
    id = localStorage.getItem('mz_device_id');
  } catch {
    // ignore
  }
  if (!id) {
    id = `d_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    try {
      localStorage.setItem('mz_device_id', id);
    } catch {
      // ignore
    }
  }
  return id;
}

export function myNickname() {
  try {
    return localStorage.getItem('mz_nickname') || '';
  } catch {
    return '';
  }
}

export function setNickname(name) {
  const clean = String(name || '').trim().slice(0, 24);
  try {
    localStorage.setItem('mz_nickname', clean);
  } catch {
    // ignore
  }
  return clean;
}

export function makeCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// Rooms I created or joined on this device (for the lobby list).
export function myRooms() {
  const list = safeGet('mz_my_rooms', []);
  return Array.isArray(list) ? list : [];
}

export function rememberRoom(code, title) {
  const list = myRooms().filter((r) => r.code !== code);
  safeSet('mz_my_rooms', [{ code, title: title || code }, ...list].slice(0, 20));
}

export function forgetRoom(code) {
  safeSet(
    'mz_my_rooms',
    myRooms().filter((r) => r.code !== code)
  );
}

function rowToRoom(row) {
  if (!row) return null;
  return {
    code: row.code,
    title: row.title,
    media: row.media || {},
    season: row.season ?? 1,
    episode: row.episode ?? 1,
    server: row.server || 'vidy',
    state: row.state || 'live',
    position: row.position ?? 0,
    hostDevice: row.host_device,
    grants: row.grants || {},
    updatedAt: row.updated_at,
  };
}

export async function createRoom({ title, media, season = 1, episode = 1, server = 'vidy' }) {
  const sb = getSupabase();
  if (!sb) throw new Error('Rooms not configured.');
  const device = myDeviceId();
  // Retry on code collision (PK conflict).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    const { data, error } = await sb
      .from('rooms')
      .insert({
        code,
        title: (title || media?.title || media?.name || 'Untitled room').slice(0, 80),
        media: {
          kind: media?.kind || 'tmdb',
          id: media?.id,
          type: media?.media_type || media?.type || (media?.first_air_date ? 'tv' : 'movie'),
          title: media?.title || media?.name || '',
          poster: media?.poster_path || media?.poster || '',
          youtubeId: media?.youtubeId || null,
        },
        season,
        episode,
        server,
        state: 'live',
        position: 0,
        host_device: device,
        grants: {},
      })
      .select()
      .single();
    if (!error) {
      const room = rowToRoom(data);
      rememberRoom(room.code, room.title);
      return room;
    }
    if (error.code !== '23505') throw new Error(error.message || 'Could not create room.');
  }
  throw new Error('Could not pick a room code, try again.');
}

export async function fetchRoom(code) {
  const sb = getSupabase();
  if (!sb) throw new Error('Rooms not configured.');
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return null;
  const { data, error } = await sb.from('rooms').select('*').eq('code', clean).single();
  if (error) return null;
  return rowToRoom(data);
}

export async function patchRoom(code, patch) {
  const sb = getSupabase();
  if (!sb) throw new Error('Rooms not configured.');
  const { data, error } = await sb
    .from('rooms')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('code', code)
    .select()
    .single();
  if (error) throw new Error(error.message || 'Room update failed.');
  return rowToRoom(data);
}

export async function deleteRoom(code) {
  const sb = getSupabase();
  if (!sb) throw new Error('Rooms not configured.');
  const { error } = await sb.from('rooms').delete().eq('code', code);
  if (error) throw new Error(error.message || 'Delete failed.');
  forgetRoom(code);
}

// Live channel per room: broadcast (actions/chat, self excluded) +
// presence (who's here). Returns { send, close }.
export function openRoomChannel({ code, name, onEvent, onPresence }) {
  const sb = getSupabase();
  if (!sb) throw new Error('Rooms not configured.');
  const device = myDeviceId();
  const channel = sb.channel(`room:${code}`, {
    config: { broadcast: { self: false }, presence: { key: device } },
  });
  channel
    .on('broadcast', { event: '*' }, ({ event, payload }) => {
      try {
        onEvent?.({ type: event, payload });
      } catch (err) {
        console.error('[rooms] event handler failed:', err);
      }
    })
    .on('presence', { event: 'sync' }, () => {
      try {
        const state = channel.presenceState();
        const members = Object.entries(state).map(([deviceId, metas]) => ({
          device: deviceId,
          name: metas?.[0]?.name || 'Guest',
        }));
        onPresence?.(members);
      } catch (err) {
        console.error('[rooms] presence failed:', err);
      }
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ device, name: name || 'Guest' });
      }
    });
  return {
    send(type, payload) {
      // Message kind must be 'broadcast' — `type` collision meant nothing
      // was ever routed (chat/seeks silently lost). Event name rides along.
      channel.send({ type: 'broadcast', event: type, payload });
    },
    async close() {
      try {
        await channel.untrack();
      } catch {
        // ignore
      }
      try {
        await sb.removeChannel(channel);
      } catch {
        // ignore
      }
    },
  };
}

// Shareable invite link: opening it lands straight in the room (the
// nickname gate inside saves the name to that device on entry).
// Canonical shape is /room/CODE (legacy ?room=CODE links still resolve).
export function roomLink(code) {
  try {
    return `${window.location.origin}/room/${code}`;
  } catch {
    return String(code || '');
  }
}

// Display color per nickname (stable hue, glass-friendly).
export function nameColor(name) {
  let h = 0;
  for (const c of String(name || '?')) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 70%, 65%)`;
}
