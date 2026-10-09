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
    queue: Array.isArray(row.queue) ? row.queue : [],
    season: row.season ?? 1,
    episode: row.episode ?? 1,
    server: row.server || 'vidy',
    state: row.state || 'live',
    // Explicit playback life: a fresh room is NOT started (nobody pressed
    // play). Run once in Supabase SQL:
    //   alter table public.rooms add column if not exists
    //     started boolean not null default true;
    // Null = pre-migration row: the UI decides (creator flag → presence
    // inference → old behavior), never crashes.
    started: row.started ?? null,
    position: row.position ?? 0,
    hostDevice: row.host_device,
    grants: row.grants || {},
    updatedAt: row.updated_at,
  };
}

// Pre-migration device flag (T1): rooms this device created or swapped
// while the `started` column didn't exist yet are known-unstarted here.
// Cleared on the first real play. The SQL migration makes it obsolete.
function localUnstarted(code) {
  try {
    return localStorage.getItem(`mz_unstarted_${code}`) === '1';
  } catch {
    return false;
  }
}

export function localRoomUnstarted(code) {
  return localUnstarted(code);
}

export function clearLocalUnstarted(code) {
  try {
    localStorage.removeItem(`mz_unstarted_${code}`);
  } catch {
    // ignore
  }
}

export async function createRoom({ title, media, season = 1, episode = 1, server = 'vidy' }) {
  const sb = getSupabase();
  if (!sb) throw new Error('Rooms not configured.');
  const device = myDeviceId();
  // Retry on code collision (PK conflict).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    // Fresh rooms start un-started (T1): the host really hasn't pressed
    // play. Pre-migration schemas lack the column — fall back to the
    // legacy insert (behaves as before) instead of failing creation.
    let payload = {
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
      started: false,
      position: 0,
      host_device: device,
      grants: {},
    };
    let { data, error } = await sb
      .from('rooms')
      .insert(payload)
      .select()
      .single();
    if (error && /started/i.test(error.message || '')) {
      const legacy = { ...payload };
      delete legacy.started;
      ({ data, error } = await sb.from('rooms').insert(legacy).select().single());
    }
    if (!error) {
      const room = rowToRoom(data);
      rememberRoom(room.code, room.title);
      // Pre-migration the row can't say un-started — this device knows.
      if (room.started !== false) {
        try {
          localStorage.setItem(`mz_unstarted_${room.code}`, '1');
        } catch {
          // ignore
        }
        room.started = false;
      }
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
  // Allowlist: never let a caller write arbitrary columns (code,
  // host_device takeover aside — host transfer is explicit below).
  // Unknown keys are dropped, values are coerced to sane ranges.
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) throw new Error('Room code required.');
  const p = patch && typeof patch === 'object' ? patch : {};
  const out = {};
  if (p.state === 'live' || p.state === 'paused') out.state = p.state;
  if (Number.isFinite(Number(p.position))) {
    out.position = Math.max(0, Math.min(24 * 3600, Math.floor(Number(p.position))));
  }
  for (const k of ['season', 'episode']) {
    if (Number.isFinite(Number(p[k]))) {
      out[k] = Math.max(1, Math.min(99, Math.floor(Number(p[k]))));
    }
  }
  if (typeof p.server === 'string' && ['vidy', 'vidlink', 'vaplayer', 'youtube'].includes(p.server)) {
    out.server = p.server;
  }
  if (p.grants && typeof p.grants === 'object' && !Array.isArray(p.grants)) {
    out.grants = p.grants;
  }
  // Explicit playback life (T1): false until someone really presses play.
  // No-op on schemas predating the column — callers degrade to broadcast.
  if (typeof p.started === 'boolean') {
    out.started = p.started;
  }
  if (typeof p.host_device === 'string' && p.host_device.length > 0 && p.host_device.length <= 64) {
    out.host_device = p.host_device;
  }
  if (typeof p.title === 'string' && p.title.trim()) {
    out.title = p.title.trim().slice(0, 80);
  }
  if (p.media && typeof p.media === 'object' && !Array.isArray(p.media)) {
    out.media = p.media;
  }
  // Room playlist queue: capped + field-sanitized so a hostile client
  // can't stuff the row. Items: {key,kind,title,by,id,type,poster |
  // youtubeId}. Empty/missing key or title drops the item.
  if (Array.isArray(p.queue)) {
    out.queue = p.queue.slice(0, 50).map((it) => {
      if (!it || typeof it !== 'object') return null;
      const kind = it.kind === 'youtube' ? 'youtube' : 'tmdb';
      const title = String(it.title || '').slice(0, 120);
      const key = String(it.key || '').slice(0, 80);
      if (!key || !title) return null;
      const clean = { key, kind, title, by: String(it.by || '').slice(0, 24) };
      if (kind === 'youtube') {
        clean.youtubeId = String(it.youtubeId || '').slice(0, 16);
      } else {
        clean.id = Math.floor(Number(it.id)) || 0;
        clean.type = it.type === 'tv' ? 'tv' : 'movie';
        clean.poster = String(it.poster || '').slice(0, 200);
      }
      return clean;
    }).filter(Boolean);
  }
  if (Object.keys(out).length === 0) throw new Error('Nothing to update.');
  const runUpdate = (body) =>
    sb
      .from('rooms')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('code', clean)
      .select()
      .single();
  let { data, error } = await runUpdate(out);
  // Pre-migration schemas lack `started`: retry without it so media swaps
  // and positions still persist (the lifecycle degrades to broadcast).
  if (error && out.started !== undefined && /started/i.test(error.message || '')) {
    const rest = { ...out };
    delete rest.started;
    ({ data, error } = await runUpdate(rest));
  }
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
// presence (who's here + their playback state). Returns { send, close,
// update, presenceState, status }. `update` re-tracks presence meta
// (pos/paused/started) on DISCRETE transitions only (pause/play/seek/
// swap/rename) — never on a timer: periodic re-tracks trip Supabase's
// presence rate limiter, which closes the channel. Roster code must treat
// syncs as ADD/refresh-only (see RoomView pruner): one partial sync must
// never read as everyone leaving.
//
// Async: Supabase reuses channel instances by topic (StrictMode remounts,
// fast room switches), and realtime-js throws when `.on()` runs on an
// already-subscribed instance. So any stale channel for this topic is
// removed first, then a fresh one is built.
export async function openRoomChannel({ code, name, onEvent, onPresence, onLeave, onStatus }) {
  const sb = getSupabase();
  if (!sb) throw new Error('Rooms not configured.');
  const clean = String(code || '').trim().toUpperCase();
  // Drain stale instances for this topic BEFORE creating: realtime-js
  // throws on `.on()` for an already-subscribed channel, and StrictMode
  // (dev) plus fast switches otherwise hand us a live one.
  try {
    const stale = (sb.getChannels?.() || []).filter((c) =>
      String(c?.topic || '').endsWith(`:${clean}`)
    );
    for (const c of stale) {
      try {
        await sb.removeChannel(c);
      } catch {
        // one stuck channel never blocks the fresh one
      }
    }
  } catch {
    // getChannels unavailable — creation below still tries
  }
  const device = myDeviceId();
  // Last tracked presence body: update() merges into it so the name and
  // earlier meta survive (re-subscribes reset it with the fresh name).
  // Updates before SUBSCRIBED would vanish — they wait in pendingMeta and
  // flush on subscribe (the room-load report always races the handshake).
  let tracked = { device, name: name || 'Guest' };
  let pendingMeta = null;
  let liveChannel = null;
  // Last channel status (SUBSCRIBED / CLOSED / CHANNEL_ERROR / TIMED_OUT).
  // The room watches it to reopen dead sockets (see RoomView).
  let lastStatus = 'JOINING';
  const applyPresence = (state) => {
    try {
      const members = Object.entries(state).map(([deviceId, metas]) => ({
        device: deviceId,
        name: metas?.[0]?.name || 'Guest',
        // Playback state of that device (T14): absent = unknown.
        pos: metas?.[0]?.pos ?? null,
        paused: metas?.[0]?.paused ?? null,
        watching: metas?.[0]?.watching ?? null,
      }));
      onPresence?.(members);
    } catch (err) {
      console.error('[rooms] presence failed:', err);
    }
  };
  const channel = sb.channel(`room:${code}`, {
    config: { broadcast: { self: false }, presence: { key: device } },
  });
  liveChannel = channel;
  // DEBUG-ONLY (socket diagnosis, temporary): tap the shared realtime
  // socket. 1006 = killed mid-flight (network/firewall), 1000 = hung up
  // cleanly. Re-tapped on every status (the client swaps the socket on
  // auto-reconnect). The channel.socket attempt was a dead end (wrong
  // object — that tap never attached, which is why no line ever printed).
  const tapSocket = () => {
    try {
      const conn = sb && sb.realtime && sb.realtime.conn;
      if (!conn || conn.__mzCloseTap || typeof conn.addEventListener !== 'function') return;
      conn.__mzCloseTap = true;
      conn.addEventListener('close', (e) => {
        try {
          console.debug(
            '[rooms-presence]',
            new Date().toISOString().slice(11, 23),
            'socket-close',
            `code ${e && e.code}`,
            `clean ${e && e.wasClean}`,
            String((e && e.reason) || '').slice(0, 120) || '(no reason)'
          );
        } catch {
          // logging never breaks the room
        }
      });
    } catch {
      // socket internals unavailable — channel-status lines still apply
    }
  };
  tapSocket();
      });
    }
  } catch {
    // socket internals unavailable — channel-status lines still apply
  }
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
        applyPresence(channel.presenceState());
      } catch (err) {
        console.error('[rooms] presence failed:', err);
      }
    })
    // Server-sent untrack: the pruner fast-tracks collection (a missing
    // key in one sync is a flap, not a leave — see RoomView).
    .on('presence', { event: 'leave' }, ({ key } = {}) => {
      try {
        if (key) onLeave?.({ key });
      } catch (err) {
        console.error('[rooms] presence leave failed:', err);
      }
    })
    .subscribe(async (status) => {
      lastStatus = status;
      tapSocket();
      try {
        onStatus?.(status);
      } catch (err) {
        console.error('[rooms] status handler failed:', err);
      }
      try {
        console.debug('[rooms-presence]', new Date().toISOString().slice(11, 23), 'channel-status', clean, status);
      } catch {
        // logging never breaks the room
      }
      if (status === 'SUBSCRIBED') {
        tracked = { device, name: name || 'Guest', ...(pendingMeta || {}) };
        pendingMeta = null;
        await channel.track(tracked);
      }
    });
  return {
    // Authoritative snapshot for the roster poller: listing is liveness,
    // never removal (a quiet room sends no syncs, which must not read as
    // leaving — see RoomView pruner).
    presenceState() {
      try {
        return channel.presenceState();
      } catch {
        return {};
      }
    },
    status() {
      return lastStatus;
    },
    send(type, payload) {
      // Message kind must be 'broadcast' — `type` collision meant nothing
      // was ever routed (chat/seeks silently lost). Event name rides along.
      channel.send({ type: 'broadcast', event: type, payload });
    },
    // Merge playback meta into my presence (throttled by the caller).
    update(patch) {
      tracked = { ...tracked, ...(patch || {}) };
      pendingMeta = { ...(pendingMeta || {}), ...(patch || {}) };
      try {
        const r = liveChannel?.track(tracked);
        if (r?.catch) {
          r.catch(() => {
            // pre-subscribe: the SUBSCRIBED flush carries pendingMeta
          });
        }
      } catch {
        // presence unavailable — states just read stale
      }
    },
    async close(reason) {
      try {
        console.debug('[rooms-presence]', new Date().toISOString().slice(11, 23), 'channel-close-called', String(reason || 'no-reason'));
      } catch {
        // logging never breaks the room
      }
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
