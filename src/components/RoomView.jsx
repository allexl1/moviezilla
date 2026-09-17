import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Copy,
  Users,
  MessageCircle,
  Pause,
  Play,
  Crown,
  LogOut,
  Trash2,
  RefreshCw,
  Maximize,
  Settings,
  Search,
  Link2,
  ListMusic,
  Plus,
  X,
  Check,
} from 'lucide-react';
import {
  myDeviceId,
  myNickname,
  setNickname,
  fetchRoom,
  patchRoom,
  deleteRoom,
  openRoomChannel,
  nameColor,
  roomLink,
} from '../services/rooms';
import { tmdb, FALLBACK_POSTER } from '../services/tmdb';
import { formatClock } from '../services/storage';
import Player from './Player';
import { ChatList, ChatInput, FloatingRoomChat } from './chat';
import { useAccount } from '../services/account';
import YouTubeRoomPlayer, { parseYouTubeId, fetchYouTubeMeta } from './YouTubeRoomPlayer';
import Input from './ui/Input';
import EmptyState from './ui/EmptyState';

function msgId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Playlist identity: stable key per title across TMDB/YouTube shapes.
function keyOfMedia(m) {
  if (!m) return '';
  if (m.kind === 'youtube') return `yt:${m.youtubeId || ''}`;
  return `tmdb:${m.type || m.media_type || 'movie'}:${m.id ?? ''}`;
}

// Normalized queue item from a TMDB search hit or YouTube meta.
// Module scope (not render scope) so the timestamp never trips purity.
function makeQueueItem(picked, by) {
  const base =
    picked.kind === 'youtube'
      ? { kind: 'youtube', youtubeId: picked.youtubeId, title: picked.title || 'YouTube video', poster: picked.thumb || '' }
      : {
          kind: 'tmdb',
          id: picked.id,
          type: picked.media_type || 'movie',
          title: picked.title || '',
          poster: picked.poster_path || '',
        };
  return { ...base, key: keyOfMedia(base.kind === 'youtube' ? base : { ...base, media_type: base.type }), by: by || '', at: Date.now() };
}

// Queue item back into the {kind,...} shape doSwap expects.
function pickedOfItem(item) {
  if (item.kind === 'youtube') {
    return { kind: 'youtube', youtubeId: item.youtubeId, title: item.title, thumb: item.poster };
  }
  return { kind: 'tmdb', id: item.id, media_type: item.type, title: item.title, poster_path: item.poster };
}

export default function RoomView({ code, onLeave, onToast }) {
  const device = myDeviceId();
  // Identity: account display name wins when signed in (device nickname
  // is the logged-out fallback). `name` below is the ONLY name sent or
  // displayed; deviceNick feeds it when logged out.
  const { displayName: acctName } = useAccount();
  const [deviceNick, setDeviceNick] = useState(() => myNickname());
  const name = acctName || deviceNick;
  const [room, setRoom] = useState(null);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [tab, setTab] = useState('chat');
  // Read receipts (X-style text, never checkmarks): device -> newest
  // message id it has loaded. Presence-bounded, broadcast-throttled.
  const [seenMap, setSeenMap] = useState({});
  const lastSeenSent = useRef({ at: 0, msgId: '' });
  // Follower's picture of the host clock (from ticks): shown in the
  // header so "where is the host" is always answerable. Display only —
  // nothing auto-follows anymore (manual Sync is the only mover).
  const [hostPos, setHostPos] = useState(null);
  // Room prefs (per-device): chat text size, shared with Settings.
  const [chatSize, setChatSize] = useState(() => {
    try {
      return Number(localStorage.getItem('mz_chat_size')) || 15;
    } catch {
      return 15;
    }
  });
  const changeChatSize = (n) => {
    setChatSize(n);
    try {
      document.body.style.setProperty('--mz-chat-size', `${n}px`);
      localStorage.setItem('mz_chat_size', String(n));
    } catch {
      // ignore
    }
  };
  // Host media swap (settings tab): TMDB search + YouTube link.
  const [swapQuery, setSwapQuery] = useState('');
  const [swapResults, setSwapResults] = useState([]);
  const [swapYt, setSwapYt] = useState('');
  const [swapYtMeta, setSwapYtMeta] = useState(null);
  const [swapBusy, setSwapBusy] = useState(false);
  // Reactions: { [msgId]: { [emoji]: { devices: [], names: [] } } }.
  // Broadcast-only like chat itself (no table): same lifetime as messages,
  // late joiners miss both equally. Capped so long sessions can't grow it.
  const [reactions, setReactions] = useState({});
  // Floating chat (fullscreen overlay): open state + unread count. Unread
  // ticks only while neither surface shows the conversation.
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  // YouTube fullscreen wrapper: our own chrome (fullscreen + chat) lives
  // in this element, so both survive the jump to fullscreen — YouTube's
  // in-iframe button would fullscreen only the video and hide our chat.
  const ytWrapRef = useRef(null);
  const [ytFs, setYtFs] = useState(false);
  useEffect(() => {
    const onFs = () => setYtFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const toggleYtFs = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else ytWrapRef.current?.requestFullscreen().catch(() => {});
    } catch {
      // ignore
    }
  };
  const chatOpenRef = useRef(false);
  const tabRef = useRef('chat');
  useEffect(() => {
    tabRef.current = tab;
    if (tab === 'chat') setUnread(0);
  }, [tab]);
  useEffect(() => {
    chatOpenRef.current = chatOpen;
    if (chatOpen) setUnread(0);
  }, [chatOpen]);
  const [pausedBy, setPausedBy] = useState(null);
  const [syncNote, setSyncNote] = useState('In sync');
  const [roomTarget, setRoomTarget] = useState(null);
  // Room playlist queue (persisted on the row, broadcast live).
  const [queue, setQueue] = useState([]);
  const [playlistOpen, setPlaylistOpen] = useState(false);

  const channelRef = useRef(null);
  const roomRef = useRef(null);
  // Just applied someone else's target — don't echo it back as my own seek.
  const followGraceRef = useRef(0);
  // Last follow applied (any source) — followers skip re-following inside
  // the convergence window so a reload can't chase its own tail.
  const followAppliedRef = useRef(0);
  // Pending pause re-sends — cancelled the moment a newer action (play /
  // seek) goes out, so a stale retry can never re-pause after a resume.
  const pauseRetryRef = useRef([]);
  const clearPauseRetries = () => {
    for (const t of pauseRetryRef.current) clearTimeout(t);
    pauseRetryRef.current = [];
  };
  // Mirrors pausedBy for channel callbacks (their closures go stale).
  const pausedByRef = useRef(null);
  // Which device froze the room (me vs someone else) — only the pauser's
  // own in-player resume re-opens it. Last pause sys-message key so the
  // triple-send retries can't spam the chat.
  const pausedByDeviceRef = useRef(null);
  const [pausedByDevice, setPausedByDevice] = useState(null);
  const pauseSysRef = useRef('');
  // When the paused overlay was last (re)asserted — guards the heal path
  // against clearing an overlay the host just set (patch lands async).
  const pausedAtRef = useRef(0);
  // A paused room's stamped position must not keep growing: the embed has
  // no remote-pause, so the wall clock would inflate the resume second.
  // Freeze at the pause moment; resume unfreezes.
  const frozenPosRef = useRef(null);
  const myPos = useRef({ second: 0, season: 1, episode: 1, server: 'vidy' });
  const lastSeekSent = useRef({ at: 0, second: -1, season: -1, episode: -1 });
  const canControlRef = useRef(false);
  const seenDevices = useRef(new Set([device]));
  const chatEndRef = useRef(null);

  roomRef.current = room;
  const isHost = room?.hostDevice === device;
  const myGrant = room?.grants?.[device] || {};
  const canControl = isHost || myGrant.control === true;
  const chatMuted = !isHost && myGrant.chat === false;
  canControlRef.current = canControl;
  const hostPresent = room ? members.some((m) => m.device === room.hostDevice) : true;

  const pushMsg = (m) =>
    setMessages((prev) => [...prev.slice(-119), m]);

  const pushSys = (text) => pushMsg({ id: msgId(), sys: true, text });

  const applyReaction = (msgId, emoji, dev, nm, on) =>
    setReactions((prev) => {
      const entry = { ...(prev[msgId] || {}) };
      const cur = entry[emoji] || { devices: [], names: [] };
      let devices = (cur.devices || []).filter((d) => d !== dev);
      let names = (cur.names || []).filter((n) => n !== nm);
      if (on) {
        devices = [...devices, dev];
        if (nm && !names.includes(nm)) names = [...names, nm];
      }
      if (devices.length === 0) delete entry[emoji];
      else entry[emoji] = { devices, names };
      const next = { ...prev, [msgId]: entry };
      const keys = Object.keys(next);
      if (keys.length > 200) {
        for (const k of keys.slice(0, keys.length - 200)) delete next[k];
      }
      return next;
    });

  const toggleReact = (msgId, emoji) => {
    const mine = ((reactions[msgId]?.[emoji]?.devices) || []).includes(device);
    channelRef.current?.send(mine ? 'unreact' : 'react', { msgId, emoji, device, name: name });
    applyReaction(msgId, emoji, device, name, !mine);
  };

  useEffect(() => {
    pausedByRef.current = pausedBy;
  }, [pausedBy]);

  // Room row + media details.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const row = await fetchRoom(code);
        if (!alive) return;
        if (!row) {
          setError('Room not found — it may have been deleted.');
          setLoading(false);
          return;
        }
        setRoom(row);
        // Followers and host alike start at the room's saved second.
        setQueue(Array.isArray(row.queue) ? row.queue : []);
        // Followers and host alike start at the room's saved second.
        setRoomTarget({
          key: `init:${row.updatedAt || Date.now()}`,
          second: row.position || 0,
          season: row.season,
          episode: row.episode,
          server: row.server,
        });
        if (row.media?.kind !== 'youtube' && row.media?.id && row.media?.type) {
          try {
            const d = await tmdb.getMediaDetails(row.media.type, row.media.id);
            if (alive) setDetails(d);
          } catch {
            // Details optional — Player falls back to room media.
          }
        }
      } catch (err) {
        if (alive) setError(err.message || 'Could not load room.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [code]);

  // Host swapped what's playing (local host action or a remote 'media'
  // event): adopt wholesale, restart at 0:00, clear every lock. Player
  // keys include the media id, so frames remount exactly once, on purpose.
  function adoptMedia(mediaObj, server, title, sysName) {
    const m = mediaObj || {};
    setRoom((prev) =>
      prev
        ? { ...prev, media: m, title: title || m.title || prev.title, season: 1, episode: 1, server, position: 0, state: 'live' }
        : prev
    );
    setPausedBy(null);
    setPausedByDevice(null);
    pausedByDeviceRef.current = null;
    pausedAtRef.current = 0;
    frozenPosRef.current = null;
    myPos.current = { second: 0, season: 1, episode: 1, server };
    setHostPos(null);
    lastSeekSent.current = { at: 0, second: -1, season: -1, episode: -1 };
    if (m.kind === 'youtube') {
      setDetails(null);
    } else if (m.id && m.type) {
      tmdb.getMediaDetails(m.type, m.id).then((d) => setDetails(d)).catch(() => setDetails(null));
    } else {
      setDetails(null);
    }
    followGraceRef.current = Date.now();
    followAppliedRef.current = Date.now();
    setRoomTarget({ key: `media:${Date.now()}`, second: 0, season: 1, episode: 1, server });
    setSyncNote('In sync');
    if (sysName) pushSys(`${sysName} changed what's playing`);
  }

  // Live channel: chat + playback actions + host/grants/state.
  useEffect(() => {
    if (!room || !name) return;
    const ch = openRoomChannel({
      code,
      name: name,
      onEvent: ({ type, payload }) => {
        if (!payload || payload.device === device) return;
        const yt = roomRef.current?.media?.kind === 'youtube';
        if (type === 'chat') {
          pushMsg({
            id: payload.id,
            name: payload.name,
            text: payload.text,
            kind: payload.kind,
            url: payload.url,
            preview: payload.preview,
            title: payload.title,
            at: payload.at,
          });
          // Unread ticks while neither surface shows the conversation. Note
          // fullscreen hides the side rail entirely, so a message the rail
          // "shows" is still unseen — the floating-panel badge must tick.
          if (!chatOpenRef.current && (tabRef.current !== 'chat' || document.fullscreenElement)) {
            setUnread((u) => u + 1);
          }
        } else if (type === 'react') {
          applyReaction(payload.msgId, payload.emoji, payload.device, payload.name, true);
        } else if (type === 'unreact') {
          applyReaction(payload.msgId, payload.emoji, payload.device, payload.name, false);
        } else if (type === 'tick') {
          // Host heartbeat over realtime (2.5s): followers use it ONLY as
          // a clock display ("Host 12:34"). Nothing auto-follows anymore —
          // the tick/drift auto-remounts were the reload-every-5s loop
          // (each rebuild reloaded the iframe, reset the wall clock, and
          // diverged again). Manual Sync is the only mover now.
          if (payload.device === device || !roomRef.current) return;
          if (!canControlRef.current) {
            const s = Math.floor(payload.second || 0);
            setHostPos((prev) =>
              prev && Math.abs(prev.second - s) < 2
                ? prev
                : { second: s, at: payload.at || Date.now(), season: payload.season, episode: payload.episode }
            );
          }
        } else if (type === 'seek' || type === 'play') {
          setPausedBy(null);
          setPausedByDevice(null);
          pausedByDeviceRef.current = null;
          pausedAtRef.current = 0;
          frozenPosRef.current = null;
          // The blank-time complaint: a remounted frame shows 0:00 until
          // the provider ticks, so announce where playback continues.
          if (type === 'play' && (payload.second || 0) > 2) {
            onToast?.(`Resuming from ${formatClock(payload.second)}`);
          }
          setSyncNote('Catching up…');
          followGraceRef.current = Date.now();
          followAppliedRef.current = Date.now();
          setRoomTarget({
            key: `evt:${payload.at || Date.now()}`,
            action: type,
            second: payload.second || 0,
            season: payload.season,
            episode: payload.episode,
            server: payload.server,
          });
          setTimeout(() => setSyncNote('In sync'), 4000);
        } else if (type === 'pause') {
          pausedByDeviceRef.current = payload.device;
          setPausedByDevice(payload.device);
          const sysKey = `${payload.device}:${payload.second || 0}`;
          if (pauseSysRef.current !== sysKey) {
            pauseSysRef.current = sysKey;
            pushSys(`${payload.name || 'Host'} stopped the player`);
          }
          // pausedBy drives the status line on BOTH media kinds (embed
          // overlay/suspend stay embed-only via their own gates). YouTube
          // used to skip this — followers then showed "In sync" for up to
          // 10s until the row poll healed it.
          setPausedBy(payload.name || 'Host');
          pausedAtRef.current = Date.now();
          if (yt) {
            // YouTube has a real command API — truly pause at the second.
            setRoomTarget({
              key: `evt:${payload.at || Date.now()}`,
              action: 'pause',
              second: payload.second || 0,
            });
          }
          // Embeds: no remote orders exist — the overlay + unmount in the
          // render path below IS the pause (see `suspended`).
        } else if (type === 'media') {
          // Host swapped what's playing: adopt wholesale and restart at
          // 0:00 for everyone. The Player/YouTube keys below include the
          // media id, so frames remount exactly once, on purpose.
          if (Array.isArray(payload.queue)) setQueue(payload.queue);
          adoptMedia(payload.media || {}, payload.server || 'vidy', payload.title || '', payload.name || 'Host');
        } else if (type === 'seen') {
          if (payload.device && payload.msgId) {
            setSeenMap((prev) => ({ ...prev, [payload.device]: { msgId: payload.msgId, name: payload.name || 'Someone' } }));
          }
        } else if (type === 'queue') {
          if (Array.isArray(payload.queue)) setQueue(payload.queue);
          if (payload.notice) pushSys(payload.notice);
        } else if (type === 'host' || type === 'grants' || type === 'state') {          fetchRoom(code).then((r) => {
            if (r) {
              setRoom(r);
              if (type === 'host') pushSys(`${payload.name || 'Someone'} is now hosting`);
            }
          });
        }
      },
      onPresence: (list) => {
        setMembers(list);
        const newcomers = [];
        for (const m of list) {
          if (!seenDevices.current.has(m.device)) {
            seenDevices.current.add(m.device);
            pushSys(`${m.name} joined`);
            if (m.device !== device) newcomers.push(m);
          }
        }
        // I paused the room: newcomers subscribed after the broadcast, so
        // hand them the paused state directly (else they play until the
        // next heartbeat/poll notices).
        if (newcomers.length > 0 && pausedByRef.current === name) {
          const second = Math.floor((frozenPosRef.current || myPos.current).second || 0);
          channelRef.current?.send('pause', { device, name: name, second, at: Date.now() });
        }
        // The pauser left without resuming: unstick the room instead of
        // holding everyone on their paused card forever. (Host keeps the
        // manual Resume as the ultimate fallback regardless.)
        if (pausedByDeviceRef.current && !list.some((m) => m.device === pausedByDeviceRef.current)) {
          pausedByDeviceRef.current = null;
          setPausedByDevice(null);
          setPausedBy(null);
          pushSys('The room resumed — the pauser left');
        }
      },
    });
    channelRef.current = ch;
    return () => {
      ch.close();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, room?.code, name]);

  // My position reports: broadcast jumps (seeks / episode changes) when
  // I'm allowed to drive. Normal playback (<12s steps) stays silent.
  const handlePosition = (pos) => {
    myPos.current = pos;
    if (!canControlRef.current) return;
    const last = lastSeekSent.current;
    const jumped =
      Math.abs(pos.second - last.second) > 12 ||
      pos.season !== last.season ||
      pos.episode !== last.episode;
    if (!jumped) return;
    lastSeekSent.current = { at: Date.now(), second: pos.second, season: pos.season, episode: pos.episode };
    // I just followed someone — sync silently, never echo.
    if (Date.now() - followGraceRef.current < 4000) return;
    clearPauseRetries();
    channelRef.current?.send('seek', {
      device,
      name: name,
      second: pos.second,
      season: pos.season,
      episode: pos.episode,
      server: pos.server,
      at: Date.now(),
    });
  };

  // Host heartbeat: stamp position + episode + server so rejoiners land
  // on the exact S/E/second even with no recent seek event. Frozen while
  // the room is paused (see above). Plus a 2.5s realtime tick so followers
  // trail by seconds instead of poll intervals.
  useEffect(() => {
    if (!room || !isHost) return;
    const beat = setInterval(() => {
      const p = frozenPosRef.current || myPos.current;
      patchRoom(code, {
        position: Math.floor(p.second || 0),
        season: p.season || roomRef.current?.season || 1,
        episode: p.episode || roomRef.current?.episode || 1,
        server: p.server || roomRef.current?.server || 'vidy',
      }).catch(() => {});
    }, 10000);
    const tick = setInterval(() => {
      if (pausedByRef.current) return;
      const p = myPos.current;
      channelRef.current?.send('tick', {
        device,
        name: name,
        second: Math.floor(p.second || 0),
        season: p.season,
        episode: p.episode,
        server: p.server,
        at: Date.now(),
      });
    }, 2500);
    return () => {
      clearInterval(beat);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, room?.code, isHost]);

  // Follower drift check against the host-stamped row: DISPLAY ONLY.
  // It heals missed pause/resume broadcasts off the stamped row state
  // (broadcasts are ephemeral — a late subscriber misses them) and shows
  // how far behind you are — but it never moves your player. Manual Sync
  // is the only mover (auto-follows were the reload loop).
  useEffect(() => {
    if (!room || canControl) return;
    const check = setInterval(async () => {
      try {
        const r = await fetchRoom(code);
        if (!r) return;
        setRoom((prev) => (prev ? { ...prev, position: r.position, state: r.state, grants: r.grants, hostDevice: r.hostDevice } : prev));
        // Heal missed pause/resume broadcasts off the stamped row state
        // (broadcasts are ephemeral — a late subscriber misses them). The
        // timestamp guard keeps us from clearing an overlay the host set
        // more recently than the row we just read.
        const rowTs = r.updatedAt ? new Date(r.updatedAt).getTime() : 0;
        if (r.state === 'paused') {
          if (!pausedBy) {
            setPausedBy('Host');
            pausedAtRef.current = rowTs || Date.now();
          }
          return;
        }
        if (pausedBy && rowTs > pausedAtRef.current) {
          setPausedBy(null);
          followAppliedRef.current = Date.now();
          setRoomTarget({
            key: `heal:${Date.now()}`,
            action: 'play',
            second: r.position || 0,
            season: r.season,
            episode: r.episode,
            server: r.server,
          });
          return;
        }
        if (pausedBy) return;
        if (Date.now() - followAppliedRef.current < 6000) return;
        const elapsed = r.updatedAt ? Math.max(0, (Date.now() - new Date(r.updatedAt).getTime()) / 1000) : 0;
        const expected = (r.position || 0) + Math.min(elapsed, 30);
        const mine = myPos.current.second || 0;
        const behind = Math.floor(expected - mine);
        if (expected > 5 && behind > 15) {
          setSyncNote(`Host +${behind}s — tap Sync`);
        } else {
          setSyncNote((prev) => (prev.startsWith('Host +') ? 'In sync' : prev));
        }
      } catch {
        // Offline blip — next check retries.
      }
    }, 10000);
    return () => clearInterval(check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, room?.code, canControl, pausedBy]);

  // Chat autoscroll.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  // Read receipts: while I'm looking at the conversation, report the
  // newest message I've loaded (throttled — not per message). Own
  // messages never count: reporting them puts "Seen by me" under my own
  // bubble on the other side, which is nonsense.
  useEffect(() => {
    if (!channelRef.current || (!chatOpenRef.current && tabRef.current !== 'chat')) return;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.sys || m.mine) continue;
      if (m.id === lastSeenSent.current.msgId || Date.now() - lastSeenSent.current.at < 3000) return;
      lastSeenSent.current = { at: Date.now(), msgId: m.id };
      channelRef.current?.send('seen', { device, name: name, msgId: m.id, at: Date.now() });
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, chatOpen, tab]);

  // Newest message the other side has loaded (X-style "Seen by …").
  // Computed over render order; sys rows never count.
  const seenInfo = (() => {
    const idxById = new Map();
    messages.forEach((m, i) => {
      if (!m.sys) idxById.set(m.id, i);
    });
    const groups = {};
    for (const [dev, s] of Object.entries(seenMap)) {
      if (dev === device || !s?.msgId || !idxById.has(s.msgId)) continue;
      (groups[s.msgId] = groups[s.msgId] || []).push(s.name || 'Someone');
    }
    let best = null;
    for (const [mid, names] of Object.entries(groups)) {
      if (!best || idxById.get(mid) > idxById.get(best.msgId)) best = { msgId: mid, names };
    }
    return best;
  })();

  // Host media swap search (settings tab): debounced, poster-only.
  // Empty query clears in the input handler (not here) so the effect
  // body never sets state synchronously.
  useEffect(() => {
    const q = swapQuery.trim();
    if (!q) return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const res = await tmdb.searchMulti(q);
        if (!alive) return;
        setSwapResults(
          (res?.results || [])
            .filter((x) => !x.adult && x.poster_path && (x.title || x.name) && (x.media_type === 'movie' || x.media_type === 'tv'))
            .slice(0, 6)
        );
      } catch {
        if (alive) setSwapResults([]);
      }
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [swapQuery]);

  // Host media swap YouTube preview.
  useEffect(() => {
    const url = swapYt.trim();
    if (!url || !parseYouTubeId(url)) return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const meta = await fetchYouTubeMeta(url);
        if (alive) setSwapYtMeta(meta);
      } catch {
        // ignore — preview only
      }
    }, 500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [swapYt]);

  // Host-only: swap what's playing mid-room. Resets to 0:00, live.
  // queueNext carries the playlist along so followers adopt both in one
  // round trip (media event carries the queue with it).
  const doSwap = async (picked, queueNext = null) => {
    if (!isHost || swapBusy) return;
    setSwapBusy(true);
    try {
      const media =
        picked.kind === 'youtube'
          ? { kind: 'youtube', youtubeId: picked.youtubeId, title: picked.title, poster: picked.thumb }
          : {
              kind: 'tmdb',
              id: picked.id,
              type: picked.media_type || 'movie',
              title: picked.title || '',
              poster: picked.poster_path || '',
            };
      const server = picked.kind === 'youtube' ? 'youtube' : 'vidy';
      const title = picked.title || 'Room';
      const patch = { media, title, season: 1, episode: 1, server, position: 0, state: 'live' };
      if (queueNext) patch.queue = queueNext;
      const row = await patchRoom(code, patch);
      if (row) setRoom(row);
      if (queueNext) setQueue(queueNext);
      channelRef.current?.send('media', {
        device,
        name: name,
        media,
        title,
        server,
        queue: queueNext || undefined,
      });
      adoptMedia(media, server, title, null);
      setSwapQuery('');
      setSwapYt('');
      onToast?.('Changed what\'s playing — restarted at 0:00');
    } catch {
      onToast?.('Swap failed — retry.');
    } finally {
      setSwapBusy(false);
    }
  };

  // Playlist mutations (host-only). Optimistic local apply + row persist
  // + live broadcast; failures toast (needs the `queue` column — see the
  // migration note — otherwise followers won't receive them).
  const persistQueue = async (next, notice) => {
    setQueue(next);
    try {
      const row = await patchRoom(code, { queue: next });
      if (row) setRoom(row);
    } catch {
      onToast?.('Playlist save failed — run the rooms migration.');
    }
    channelRef.current?.send('queue', { device, name: name, queue: next, notice });
  };

  const queueAdd = (picked, playNow = false) => {
    if (!isHost || !picked) return;
    const item = makeQueueItem(picked, name);
    const exists = queue.some((q) => q.key === item.key);
    const next = exists ? queue : [...queue, item];
    if (playNow) {
      doSwap(picked, next);
      if (!exists) pushSys(`${name} added ${item.title} to the playlist`);
    } else {
      if (exists) {
        onToast?.('Already in the playlist');
        return;
      }
      persistQueue(next, `${name} added ${item.title} to the playlist`);
    }
  };

  const queueRemove = (key) => {
    if (!isHost) return;
    persistQueue(queue.filter((q) => q.key !== key));
  };

  const queueClearWatched = () => {
    if (!isHost) return;
    const cur = keyOfMedia(roomRef.current?.media);
    const idx = queue.findIndex((q) => q.key === cur);
    if (idx <= 0) return;
    persistQueue(queue.slice(idx));
  };

  const queuePlay = (key) => {
    if (!isHost) return;
    const item = queue.find((q) => q.key === key);
    if (item) doSwap(pickedOfItem(item), queue);
  };

  if (!name) {
    return <NickGate onSave={(n) => setDeviceNick(n)} onLeave={onLeave} />;
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--cine-bg-deep)]">
        <p className="text-xs text-white/60">Joining room {code}…</p>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--cine-bg-deep)] p-6">
        <EmptyState
          title="Couldn't open room"
          description={error || 'Unknown error.'}
          action={
            <button onClick={onLeave} className="cine-control-btn">
              Back to rooms
            </button>
          }
        />
      </div>
    );
  }

  const isYouTube = room.media?.kind === 'youtube';
  const media = {
    id: room.media?.id,
    media_type: room.media?.type || 'movie',
    title: room.media?.title || room.title,
    name: room.media?.title || room.title,
    poster_path: room.media?.poster,
  };

  const sendChat = () => {
    const text = input.trim().slice(0, 500);
    if (!text || chatMuted) return;
    const msg = { id: msgId(), name: name, text, at: Date.now() };
    channelRef.current?.send('chat', { ...msg, device });
    pushMsg({ ...msg, mine: true });
    setInput('');
  };

  const sendGif = (url, preview) => {
    if (!url || chatMuted) return;
    const msg = { id: msgId(), name: name, kind: 'gif', url, preview, at: Date.now() };
    channelRef.current?.send('chat', { ...msg, device });
    pushMsg({ ...msg, mine: true });
  };

  const broadcastPause = async () => {
    const second = Math.floor(myPos.current.second || 0);
    // Pause is the one event that must not be lost: a follower who misses
    // it plays on. Triple-send (idempotent) + presence resend for late
    // joiners + row-state poll healing on the follower side. Retries die
    // the moment play/seek goes out — a stale retry must never re-pause
    // after a resume.
    clearPauseRetries();
    // pausedBy on the pauser too (all media kinds): it swaps Pause for
    // Resume in this header. Without it the host pauses the room and is
    // left staring at a Pause button with no way back.
    pausedByDeviceRef.current = device;
    setPausedByDevice(device);
    setPausedBy(name);
    pushSys(`${name} stopped the player`);
    const payload = { device, name: name, second, at: Date.now() };
    channelRef.current?.send('pause', payload);
    for (const delay of [700, 1400]) {
      pauseRetryRef.current.push(
        setTimeout(() => channelRef.current?.send('pause', { ...payload, at: Date.now() }), delay)
      );
    }
    frozenPosRef.current = { ...myPos.current, second };
    if (room?.media?.kind === 'youtube') {
      // True remote pause for our own frame as well.
      setRoomTarget({ key: `me:${Date.now()}`, action: 'pause', second });
    }
    try {
      await patchRoom(code, { state: 'paused', position: Math.floor(myPos.current.second || 0) });
    } catch {
      // broadcast already told the room
    }
  };

  // Follower's manual sync: jump to the host's stamped second RIGHT NOW
  // — always, even when the room is paused. Paused stays paused (the
  // overlay holds; embeds have no frame to move while parked, YouTube
  // seeks in place), live follows and plays on. This is the ONLY thing
  // that moves a follower's player, so it can never loop or surprise.
  const syncToHost = async () => {
    try {
      const r = await fetchRoom(code);
      if (!r) {
        onToast?.('Room not found.');
        return;
      }
      setRoom(r);
      const paused = r.state === 'paused';
      const targetSecond = Math.max(0, r.position || 0);
      setSyncNote('Catching up…');
      followGraceRef.current = Date.now();
      followAppliedRef.current = Date.now();
      if (!isYouTube && paused) {
        // Parked embed: no iframe to move — remember the host second so
        // the resume lands together. The overlay stays until resume.
        myPos.current = { ...myPos.current, second: targetSecond };
      }
      setRoomTarget({
        key: `manual:${Date.now()}`,
        second: targetSecond,
        season: r.season,
        episode: r.episode,
        server: r.server,
      });
      onToast?.(
        targetSecond > 2
          ? `Synced to ${formatClock(targetSecond)}${paused ? ' — resumes with host' : ''}`
          : 'Host is at the start — synced to 0:00'
      );
      setTimeout(() => setSyncNote('In sync'), 3000);
    } catch {
      onToast?.('Sync failed — retry.');
    }
  };

  const broadcastPlay = async () => {
    const second = Math.floor(myPos.current.second || 0);
    channelRef.current?.send('play', {
      device, name: name, second, at: Date.now(),
    });
    setPausedBy(null);
    setPausedByDevice(null);
    pausedByDeviceRef.current = null;
    // Resume remounts suspended followers at the frozen second — and resets
    // my clock so no phantom "seek" fires on the way back up. (My own frame
    // was never unmounted: the pauser keeps their player, so no reload and
    // no blank time on my side.)
    const isYt = room?.media?.kind === 'youtube';
    setRoomTarget({ key: `me:${Date.now()}`, action: isYt ? 'play' : undefined, second });
    followGraceRef.current = Date.now();
    followAppliedRef.current = Date.now();
    frozenPosRef.current = null;
    clearPauseRetries();
    try {
      await patchRoom(code, { state: 'live', position: second });
    } catch {
      // ignore
    }
  };

  // Auto-pause from an unlocked local player: pausing inside the video
  // (embed pause event or YouTube state) locks the whole room — this is
  // what retires the manual Pause button on event-capable servers.
  // Idempotent via pausedByRef: double events can't double-lock.
  // Followers get one exemption: right after THEY were moved (manual
  // sync / host seek), YouTube blinks PAUSED on the way to the new
  // second — that blink is travel, not intent, and must never lock the
  // room ("paused" while everyone is watching). Hosts are unaffected.
  const handleProviderPause = () => {
    if (!canControlRef.current && Date.now() - followAppliedRef.current < 5000) return;
    if (!pausedByRef.current) broadcastPause();
  };
  // ...and only the pauser's own resume re-opens it (a load/seek 'play'
  // blip from anyone else must never unlock the room).
  const handleProviderPlay = () => {
    if (pausedByDeviceRef.current === device) broadcastPlay();
  };

  const grantToggle = async (memberDevice, key) => {    const grants = { ...(room.grants || {}) };
    const cur = grants[memberDevice] || {};
    grants[memberDevice] = { ...cur, [key]: !(cur[key] === true) };
    setRoom({ ...room, grants });
    try {
      await patchRoom(code, { grants });
      channelRef.current?.send('grants', { device, grants });
    } catch {
      // optimistic UI stands
    }
  };

  const transferHost = async (memberDevice, memberName) => {
    try {
      await patchRoom(code, { host_device: memberDevice, state: 'live' });
      channelRef.current?.send('host', { device, name: name, host_device: memberDevice });
      const r = await fetchRoom(code);
      if (r) setRoom(r);
      onToast?.(`${memberName} is now hosting`);
    } catch {
      onToast?.('Transfer failed — retry.');
    }
  };

  const takeOver = async () => {
    try {
      await patchRoom(code, { host_device: device, state: 'live' });
      channelRef.current?.send('host', { device, name: name, host_device: device });
      const r = await fetchRoom(code);
      if (r) setRoom(r);
      pushSys('You took over hosting');
    } catch {
      onToast?.('Takeover failed — retry.');
    }
  };

  const handleLeave = async (deleteIfHost = false) => {
    if (isHost && !deleteIfHost) {
      try {
        await patchRoom(code, { state: 'paused' });
      } catch {
        // best effort
      }
    }
    if (isHost && deleteIfHost) {
      try {
        await deleteRoom(code);
      } catch {
        // best effort
      }
    }
    try {
      await channelRef.current?.close();
    } catch {
      // ignore
    }
    onLeave();
  };

  const waitingForHost = !hostPresent && !canControl;
  // Single status line: paused and catching-up can never print together
  // anymore (that contradiction was the "in sync + paused + catching up
  // at the same time" report). Pause wins, host clock shows for watchers.
  const statusText = pausedBy
    ? `Paused by ${pausedBy}`
    : waitingForHost && !canControl
      ? 'Waiting for host'
      : syncNote;
  const hostClock = !canControl && hostPos ? ` • Host ${formatClock(hostPos.second)}` : '';

  // Playlist derivation: the room's current media splits the queue into
  // watched (before), now (match), up next (after). Titles played outside
  // the queue simply show no match — list still renders.
  const currentKey = keyOfMedia(room?.media);
  const curIdx = queue.findIndex((q) => q.key === currentKey);
  const watchedItems = curIdx > 0 ? queue.slice(0, curIdx) : [];
  const upNextItems = curIdx >= 0 ? queue.slice(curIdx + 1) : [...queue];
  const thumbFor = (item) =>
    item.kind === 'youtube'
      ? item.poster || FALLBACK_POSTER
      : item.poster
        ? tmdb.getImageUrl(item.poster, 'w185')
        : FALLBACK_POSTER;
  // Hard lock (embed rooms): while paused, everyone EXCEPT the pauser loses
  // the iframe — the pauser paused their own video, so their frame stays
  // exactly where it stopped: no reload, no blank time on resume for them.
  // Followers keep the old deal (unmount/remount — providers take no remote
  // orders, so there is no other way to stop them). A paused room shows
  // paused cards, not video; resume remounts follower frames at the frozen
  // second. Unmounting is the only true pause these providers allow (they
  // take no remote orders).
  const suspended =
    !isYouTube && (!!pausedBy || waitingForHost) && pausedByDevice !== device;
  // YouTube pauses for real via the command API — no overlay needed.
  const overlay = !isYouTube && pausedBy && !canControl ? (
    <div className="text-center space-y-3 max-w-xs">
      <p className="text-sm font-bold text-white">Paused by {pausedBy}</p>
      <p className="text-xs text-white/60">Your player is held here — press play when the room resumes and you'll re-sync automatically.</p>
    </div>
  ) : waitingForHost ? (
    <div className="text-center space-y-3 max-w-xs">
      <p className="text-sm font-bold text-white">Waiting for host…</p>
      <p className="text-xs text-white/60">The room is paused until the host returns or hands over control.</p>
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 z-50 bg-[var(--cine-bg-deep)] flex flex-col md:flex-row text-white select-none">
      {/* Video column */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div className="flex items-center gap-2.5 px-4 md:px-6 py-3 border-b border-[var(--cine-glass-border)] flex-shrink-0">
          <button onClick={() => handleLeave(false)} className="cine-icon-btn cine-icon-btn--sm" title="Leave room" aria-label="Leave room">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold truncate">{room.title}</h2>
            <p className="text-[11px] text-white/60">
              {members.length} watching • {statusText}
              {hostClock}
              {room.state === 'paused' && !pausedBy ? ' • paused' : ''}
            </p>
          </div>
          <button
            onClick={() => {
              try {
                navigator.clipboard?.writeText(roomLink(room.code));
                onToast?.('Invite link copied — anyone opening it joins directly');
              } catch {
                // ignore
              }
            }}
            className="cine-chip cine-chip--accent cursor-pointer"
            title="Copy invite link"
          >
            <Copy className="w-3 h-3" />
            {room.code}
          </button>
          {canControl && (
            <button
              onClick={() => setPlaylistOpen((o) => !o)}
              className="cine-control-btn h-9 px-4 text-xs relative"
              title="Room playlist — queue, history, what's next"
              aria-label="Open room playlist"
              aria-expanded={playlistOpen}
            >
              <ListMusic className="w-3.5 h-3.5" /> Playlist
              {queue.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-[var(--cine-accent)] text-black text-[10px] font-black flex items-center justify-center">
                  {queue.length > 9 ? '9+' : queue.length}
                </span>
              )}
            </button>
          )}
          {!canControl && (
            <button
              onClick={() => setPlaylistOpen((o) => !o)}
              className="cine-icon-btn"
              title="Room playlist"
              aria-label="Open room playlist"
              aria-expanded={playlistOpen}
            >
              <ListMusic className="w-4 h-4" />
            </button>
          )}
          {canControl && (
            <button
              onClick={() => {
                broadcastPlay();
                onToast?.('Room synced to your position');
              }}
              className="cine-control-btn h-9 px-4 text-xs"
              title="Pull everyone to your second right now"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Sync all
            </button>
          )}
          {/* Manual pause: the deterministic fallback on EVERY server,
              including YouTube. In-player pause events auto-lock
              event-capable servers, but providers are best-effort (some
              never emit pause) — so the host always keeps this button.
              Pausing inside the video and tapping here do the same thing;
              double events are idempotent. */}
          {isHost && !pausedBy && (
            <button onClick={broadcastPause} className="cine-control-btn h-9 px-4 text-xs" title="Pause for everyone">
              <Pause className="w-3.5 h-3.5" /> Pause
            </button>
          )}
          {isHost && pausedBy && (
            <button onClick={broadcastPlay} className="cine-control-btn h-9 px-4 text-xs" title="Resume for everyone">
              <Play className="w-3.5 h-3.5" /> Resume
            </button>
          )}
          {!canControl && (
            <button
              onClick={syncToHost}
              className="cine-control-btn h-9 px-4 text-xs"
              title={hostPos ? `Jump to the host's ${formatClock(hostPos.second)} right now` : "Jump to the host's second right now"}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Sync{hostPos ? ` ${formatClock(hostPos.second)}` : ''}
            </button>
          )}
        </div>

        <div className="h-[42vh] md:h-auto md:flex-1 md:min-h-0 flex-shrink-0 md:flex-shrink">
          {isYouTube && room.media?.youtubeId ? (
            <div ref={ytWrapRef} className="relative w-full h-full bg-black">
              <YouTubeRoomPlayer
                key={`room_${room.code}_youtube_${room.media.youtubeId}`}
                videoId={room.media.youtubeId}
                roomTarget={waitingForHost && !canControl ? { key: 'hold', action: 'pause' } : roomTarget}
                onPosition={handlePosition}
                onPause={canControl ? handleProviderPause : null}
                onPlay={canControl ? handleProviderPlay : null}
              />
              {/* Our chrome survives OUR fullscreen (not YouTube's own
                  button, which would hide the chat). Offset below
                  YouTube's top bar so we never cover its settings. */}
              <div className="absolute top-14 right-3 z-30 flex items-center gap-2">
                <button
                  onClick={() => setChatOpen((o) => !o)}
                  className="cine-icon-btn relative"
                  title="Room chat"
                  aria-label="Toggle room chat"
                >
                  <MessageCircle className="w-4 h-4" />
                  {unread > 0 && !chatOpen && (
                    <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-[var(--cine-accent)] text-black text-[10px] font-black flex items-center justify-center">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </button>
                <button
                  onClick={toggleYtFs}
                  className="cine-icon-btn"
                  title={ytFs ? 'Exit fullscreen' : 'Fullscreen'}
                  aria-label="Toggle fullscreen"
                >
                  <Maximize className="w-4 h-4" />
                </button>
              </div>
              {waitingForHost && !canControl && (
                <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
                  <div className="text-center space-y-3 max-w-xs">
                    <p className="text-sm font-bold text-white">Waiting for host…</p>
                    <p className="text-xs text-white/60">The room is paused until the host returns or hands over control.</p>
                  </div>
                </div>
              )}
              <FloatingRoomChat
                open={chatOpen}
                onToggle={() => setChatOpen((o) => !o)}
                messages={messages}
                reactions={reactions}
                myDevice={device}
                nickname={name}
                input={input}
                setInput={setInput}
                muted={chatMuted}
                onSend={sendChat}
                onSendGif={sendGif}
                onToggleReact={toggleReact}
                endRef={chatEndRef}
                seenInfo={seenInfo}
              />
            </div>
          ) : media.id ? (
            <Player
              key={`room_${room.code}_${media.media_type || 'media'}_${media.id}`}
              media={media}
              details={details}
              onClose={() => handleLeave(false)}
              onPosition={handlePosition}
              roomTarget={roomTarget}
              roomOverlay={overlay}
              roomLocked={!canControl}
              suspended={suspended}
              framed
              onProviderPause={canControl ? handleProviderPause : null}
              onProviderPlay={canControl ? handleProviderPlay : null}
              chat={{
                unread,
                open: chatOpen,
                onToggle: () => setChatOpen((o) => !o),
                messages,
                reactions,
                myDevice: device,
                nickname: name,
                input,
                setInput,
                muted: chatMuted,
                onSend: sendChat,
                onSendGif: sendGif,
                onToggleReact: toggleReact,
                seenInfo,
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-6">
              <EmptyState
                title="No title attached"
                description="This room was created without a title. Open any title and use Watch together."
                action={
                  <button onClick={() => handleLeave(false)} className="cine-control-btn">
                    Back to rooms
                  </button>
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Side rail — washed with the movie's own backdrop so it stops
          reading as an admin panel. Translucent panel dims it to a hint. */}
      <aside className="relative overflow-hidden flex-1 min-h-0 md:flex-none md:w-[380px] border-t md:border-t-0 md:border-l border-[var(--cine-glass-border)] bg-[var(--cine-panel-dark)] backdrop-blur-2xl flex flex-col">
        {details?.backdrop_path && (
          <img
            src={tmdb.getImageUrl(details.backdrop_path, 'w780')}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 -z-10 w-full h-full object-cover opacity-20 pointer-events-none"
          />
        )}
        <div className="flex items-center gap-2 p-3 border-b border-[var(--cine-glass-border)] flex-shrink-0" role="tablist" aria-label="Room panels">
          <button
            onClick={() => setTab('chat')}
            role="tab"
            aria-selected={tab === 'chat'}
            className={`cine-pill relative flex-1 ${tab === 'chat' ? 'cine-pill--active' : ''}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5" /> Chat
            </span>
            {unread > 0 && tab !== 'chat' && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-[var(--cine-accent)] text-black text-[10px] font-black flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('people')}
            role="tab"
            aria-selected={tab === 'people'}
            className={`cine-pill flex-1 ${tab === 'people' ? 'cine-pill--active' : ''}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> People ({members.length})
            </span>
          </button>
          <button
            onClick={() => setTab('settings')}
            role="tab"
            aria-selected={tab === 'settings'}
            className={`cine-pill flex-1 ${tab === 'settings' ? 'cine-pill--active' : ''}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5" /> Settings
            </span>
          </button>
        </div>

        {tab === 'chat' ? (
          <>
            <ChatList
              messages={messages}
              reactions={reactions}
              myDevice={device}
              onToggleReact={toggleReact}
              endRef={chatEndRef}
              seenInfo={seenInfo}
            />
            <ChatInput
              nickname={name}
              muted={chatMuted}
              input={input}
              setInput={setInput}
              onSend={sendChat}
              onSendGif={sendGif}
            />
          </>
        ) : tab === 'settings' ? (
          <div className="flex-1 overflow-y-auto p-3 space-y-4 min-h-0">
            {/* Now playing */}
            <div className="mat-row p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/50 mb-1">Now playing</p>
              <p className="text-sm font-semibold text-white/90 truncate">{room.title}</p>
              <p className="text-[11px] text-white/50 mt-0.5">
                {room.media?.kind === 'youtube' ? 'YouTube' : `${room.media?.type === 'tv' ? 'Show' : 'Movie'} • ${room.server || 'vidy'}`}
              </p>
            </div>
            {/* Chat size — per-device pref, applies instantly */}
            <div className="mat-row p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white/90">Chat text size</p>
                <p className="text-[11px] tabular-nums text-white/50">{chatSize}px</p>
              </div>
              <input
                type="range"
                min={13}
                max={19}
                step={1}
                value={chatSize}
                onChange={(e) => changeChatSize(Number(e.target.value))}
                aria-label="Chat text size"
                className="w-full cine-range"
              />
              <div className="flex items-center gap-2">
                <span className="msg-text block px-3.5 py-2 rounded-2xl leading-[1.45] bg-white text-black w-fit">
                  Hello there
                </span>
                <span className="cine-react cine-react--mine" aria-hidden="true">👍 1</span>
              </div>
            </div>
            {/* Invite: the code chip lives in the header — here is the
                full link with room to explain it. Playlist owns media
                changes (header button). */}
            <div className="mat-row p-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white/90">Invite friends</p>
                <p className="text-[11px] text-white/50 truncate mt-0.5">
                  Anyone opening the link joins {room.code} directly
                </p>
              </div>
              <button
                onClick={() => {
                  try {
                    navigator.clipboard?.writeText(roomLink(room.code));
                    onToast?.('Invite link copied — anyone opening it joins directly');
                  } catch {
                    // ignore
                  }
                }}
                className="cine-pill cine-pill--sm flex-shrink-0"
                title="Copy invite link"
              >
                <Copy className="w-3 h-3" /> Copy link
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {!hostPresent && (
              <div className="mat-row p-3 text-center space-y-2">
                <p className="text-xs text-white/60">Host is away — the room is paused.</p>
                {canControl && (
                  <button onClick={takeOver} className="cine-control-btn h-9 px-4 text-xs w-full">
                    <Crown className="w-3.5 h-3.5" /> Take over hosting
                  </button>
                )}
              </div>
            )}
            {members.map((m) => {
              const memberIsHost = m.device === room.hostDevice;
              const g = memberIsHost ? { control: true, chat: true } : room.grants?.[m.device] || {};
              return (
                <div
                  key={m.device}
                  className="mat-row flex items-center gap-3 p-2.5"
                  style={
                    memberIsHost
                      ? { background: 'color-mix(in srgb, var(--cine-accent) 7%, transparent)' }
                      : undefined
                  }
                >
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-black flex-shrink-0"
                    style={{
                      backgroundColor: nameColor(m.name),
                      boxShadow: memberIsHost
                        ? '0 0 0 2px var(--cine-accent)'
                        : '0 0 0 2px rgba(255, 255, 255, 0.15)',
                    }}
                  >
                    {(m.name || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      {m.name}
                      {m.device === device && <span className="text-white/40 font-medium"> (you)</span>}
                    </p>
                    <p className="text-[10px] text-white/50">
                      {memberIsHost ? 'Host' : g.control ? 'Can control' : 'Watching'}
                      {g.chat === false ? ' • muted' : ''}
                    </p>
                  </div>
                  {memberIsHost && <Crown className="w-3.5 h-3.5 text-[var(--cine-accent)] flex-shrink-0" />}
                  {isHost && !memberIsHost && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => grantToggle(m.device, 'control')}
                        aria-pressed={g.control === true}
                        className={`cine-pill cine-pill--sm ${g.control ? 'cine-pill--active' : ''}`}
                        title="Let them drive playback for the room"
                      >
                        Control
                      </button>
                      <button
                        onClick={() => grantToggle(m.device, 'chat')}
                        aria-pressed={g.chat === false}
                        className={`cine-pill cine-pill--sm ${g.chat === false ? 'cine-pill--active' : ''}`}
                        title="Mute / unmute their chat"
                      >
                        Chat
                      </button>
                      <button
                        onClick={() => transferHost(m.device, m.name)}
                        className="cine-pill cine-pill--sm"
                        title="Make them the host (you step down)"
                      >
                        Host
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {isHost && (
              <button
                onClick={() => {
                  if (confirm(`Delete room ${room.code} for everyone?`)) handleLeave(true);
                }}
                className="w-full h-9 rounded-full text-xs font-bold text-red-400/80 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 transition cursor-pointer inline-flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete room
              </button>
            )}
            <button
              onClick={() => handleLeave(false)}
              className="w-full h-9 rounded-full text-xs font-bold text-white/60 hover:text-white border border-white/10 transition cursor-pointer inline-flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Leave room
            </button>
          </div>
        )}
      </aside>

      {/* Playlist drawer: the room's queue — watched, now, up next.
          Everyone sees it; only the host edits. Slides over the rail. */}
      {playlistOpen && (
        <div
          role="dialog"
          aria-label="Room playlist"
          className="absolute inset-y-0 right-0 w-[380px] max-w-[94vw] z-40 flex flex-col cine-glass-panel border-l border-[var(--cine-glass-border)] animate-in fade-in slide-in-from-right-4 duration-200"
        >
          <div className="flex items-center gap-2.5 p-3 border-b border-[var(--cine-glass-border)] flex-shrink-0">
            <div className="cine-disc w-9 h-9">
              <ListMusic className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-white tracking-tight">Playlist</h3>
              <p className="text-[11px] text-white/60">
                {queue.length === 0 ? 'Nothing queued yet' : `${queue.length} title${queue.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <button
              onClick={() => setPlaylistOpen(false)}
              className="cine-icon-btn cine-icon-btn--sm"
              title="Close playlist"
              aria-label="Close playlist"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-4 min-h-0">
            {/* Now playing */}
            <div
              className="mat-row p-2.5 flex items-center gap-3"
              style={{ borderColor: 'color-mix(in srgb, var(--cine-accent) 45%, transparent)' }}
            >
              <div className="w-10 h-14 rounded-xl overflow-hidden bg-black/50 flex-shrink-0">
                <img
                  src={
                    room.media?.kind === 'youtube'
                      ? room.media?.poster || FALLBACK_POSTER
                      : room.media?.poster
                        ? tmdb.getImageUrl(room.media.poster, 'w185')
                        : FALLBACK_POSTER
                  }
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--cine-accent)]">Now playing</p>
                <p className="text-xs font-bold text-white truncate mt-0.5">{room.title}</p>
              </div>
              {pausedBy ? (
                <Pause className="w-4 h-4 text-[var(--cine-accent)] flex-shrink-0" />
              ) : (
                <Play className="w-4 h-4 text-[var(--cine-accent)] flex-shrink-0" fill="currentColor" />
              )}
            </div>

            {/* Up next */}
            {upNextItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Up next</p>
                {upNextItems.map((item) => (
                  <div key={item.key} className="mat-row p-2 flex items-center gap-2.5">
                    <div className="w-10 h-14 rounded-xl overflow-hidden bg-black/50 flex-shrink-0">
                      <img src={thumbFor(item)} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white/90 truncate">{item.title}</p>
                      <p className="text-[10px] text-white/50 mt-0.5 truncate">
                        {item.kind === 'youtube' ? 'YouTube' : item.type === 'tv' ? 'Show' : 'Movie'}
                        {item.by ? ` • ${item.by}` : ''}
                      </p>
                    </div>
                    {isHost && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => queuePlay(item.key)}
                          disabled={swapBusy}
                          className="cine-icon-btn cine-icon-btn--sm"
                          title={`Play ${item.title} now`}
                          aria-label={`Play ${item.title} now`}
                        >
                          <Play className="w-3.5 h-3.5" fill="currentColor" />
                        </button>
                        <button
                          onClick={() => queueRemove(item.key)}
                          className="cine-icon-btn cine-icon-btn--sm"
                          title={`Remove ${item.title}`}
                          aria-label={`Remove ${item.title} from playlist`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Watched */}
            {watchedItems.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Watched here</p>
                  {isHost && (
                    <button
                      onClick={queueClearWatched}
                      className="text-[11px] font-semibold text-white/50 hover:text-white transition cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {watchedItems.map((item) => (
                  <div key={item.key} className="mat-row p-2 flex items-center gap-2.5 opacity-60">
                    <div className="w-10 h-14 rounded-xl overflow-hidden bg-black/50 flex-shrink-0">
                      <img src={thumbFor(item)} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white/80 truncate">{item.title}</p>
                      <p className="text-[10px] text-white/40 mt-0.5 truncate">
                        {item.kind === 'youtube' ? 'YouTube' : item.type === 'tv' ? 'Show' : 'Movie'}
                        {item.by ? ` • ${item.by}` : ''}
                      </p>
                    </div>
                    <Check className="w-4 h-4 text-[var(--cine-accent)] flex-shrink-0" />
                    {isHost && (
                      <button
                        onClick={() => queueRemove(item.key)}
                        className="cine-icon-btn cine-icon-btn--sm flex-shrink-0"
                        title={`Remove ${item.title}`}
                        aria-label={`Remove ${item.title} from playlist`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add — host only */}
            {isHost ? (
              <div className="space-y-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Add to playlist</p>
                <div className="flex items-center gap-3 rounded-2xl cine-glass-panel px-4 py-3 focus-within:border-white/25 transition">
                  <Search className="w-4 h-4 text-white/60 flex-shrink-0" />
                  <input
                    type="text"
                    value={swapQuery}
                    onChange={(e) => {
                      setSwapQuery(e.target.value);
                      if (!e.target.value.trim()) setSwapResults([]);
                    }}
                    placeholder="Search a movie or show…"
                    aria-label="Search a title for the playlist"
                    className="w-full bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
                  />
                </div>
                {swapResults.length > 0 && (
                  <div className="space-y-2">
                    {swapResults.map((r) => (
                      <div key={`${r.media_type}_${r.id}`} className="mat-row p-2 flex items-center gap-2.5">
                        <div className="w-10 h-14 rounded-xl overflow-hidden bg-black/50 flex-shrink-0">
                          <img src={tmdb.getImageUrl(r.poster_path, 'w185')} alt="" className="w-full h-full object-cover" loading="lazy" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white/90 truncate">{r.title || r.name}</p>
                          <p className="text-[10px] text-white/50 uppercase mt-0.5">
                            {(r.media_type || '')} • {((r.release_date || r.first_air_date) || '').split('-')[0]}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() =>
                              queueAdd({ kind: 'tmdb', id: r.id, media_type: r.media_type, title: r.title || r.name, poster_path: r.poster_path })
                            }
                            disabled={swapBusy}
                            className="cine-icon-btn cine-icon-btn--sm"
                            title="Add to playlist"
                            aria-label={`Add ${r.title || r.name} to playlist`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              queueAdd({ kind: 'tmdb', id: r.id, media_type: r.media_type, title: r.title || r.name, poster_path: r.poster_path }, true)
                            }
                            disabled={swapBusy}
                            className="cine-icon-btn cine-icon-btn--sm"
                            title="Play now"
                            aria-label={`Play ${r.title || r.name} now`}
                          >
                            <Play className="w-3.5 h-3.5" fill="currentColor" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3 rounded-2xl cine-glass-panel px-4 py-3 focus-within:border-white/25 transition">
                  <Link2 className="w-4 h-4 text-white/60 flex-shrink-0" />
                  <input
                    type="text"
                    value={swapYt}
                    onChange={(e) => {
                      setSwapYt(e.target.value);
                      setSwapYtMeta(null);
                    }}
                    placeholder="…or paste a YouTube link"
                    aria-label="YouTube link for the playlist"
                    inputMode="url"
                    className="w-full bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
                  />
                </div>
                {swapYtMeta && (
                  <div className="flex items-center gap-2.5 mat-row p-2">
                    <div className="w-20 h-12 rounded-xl overflow-hidden bg-black/50 flex-shrink-0">
                      <img src={swapYtMeta.thumb} alt="" className="w-full h-full object-cover" />
                    </div>
                    <p className="text-xs font-semibold text-white/90 truncate flex-1 min-w-0">{swapYtMeta.title}</p>
                    <button
                      onClick={() => queueAdd({ kind: 'youtube', youtubeId: swapYtMeta.id, title: swapYtMeta.title, thumb: swapYtMeta.thumb })}
                      disabled={swapBusy}
                      className="cine-icon-btn cine-icon-btn--sm"
                      title="Add to playlist"
                      aria-label="Add YouTube video to playlist"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => queueAdd({ kind: 'youtube', youtubeId: swapYtMeta.id, title: swapYtMeta.title, thumb: swapYtMeta.thumb }, true)}
                      disabled={swapBusy}
                      className="cine-btn cine-btn-primary h-9 px-4 text-xs flex-shrink-0 disabled:opacity-50"
                    >
                      Play
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-white/40">Only the host can edit the playlist.</p>
            )}

            {queue.length === 0 && (
              <p className="text-center text-[11px] text-white/40 pt-2">
                The queue is empty — what plays now is all there is.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NickGate({ onSave, onLeave }) {
  const [draft, setDraft] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--cine-bg-deep)] p-6">
      <div className="rounded-3xl cine-glass-panel p-8 w-full max-w-sm space-y-4 text-center">
        <div className="cine-disc cine-disc--dim w-12 h-12 mx-auto">
          <Users className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Pick a nickname</h2>
          <p className="text-xs text-white/60 mt-1">Shown in chat and the people list.</p>
        </div>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. allexl1"
          aria-label="Nickname"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) onSave(setNickname(draft));
          }}
        />
        <div className="flex gap-2">
          <button onClick={onLeave} className="cine-control-btn flex-1">
            Cancel
          </button>
          <button
            onClick={() => draft.trim() && onSave(setNickname(draft))}
            className="cine-btn cine-btn-primary cine-btn-shimmer h-11 px-6 text-sm flex-1"
          >
            Join
          </button>
        </div>
        <p className="text-[11px] text-white/40 inline-flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Remembered on this device only.
        </p>
      </div>
    </div>
  );
}
