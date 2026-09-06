import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Copy,
  Check,
  Send,
  Users,
  MessageCircle,
  Pause,
  Play,
  Crown,
  LogOut,
  Trash2,
  RefreshCw,
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
import { tmdb } from '../services/tmdb';
import Player from './Player';
import YouTubeRoomPlayer from './YouTubeRoomPlayer';
import Input from './ui/Input';
import EmptyState from './ui/EmptyState';

function msgId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function RoomView({ code, onLeave, onToast }) {
  const device = myDeviceId();
  const [nickname, setNicknameState] = useState(() => myNickname());
  const [room, setRoom] = useState(null);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [tab, setTab] = useState('chat');
  const [pausedBy, setPausedBy] = useState(null);
  const [syncNote, setSyncNote] = useState('In sync');
  const [roomTarget, setRoomTarget] = useState(null);

  const channelRef = useRef(null);
  const roomRef = useRef(null);
  // Just applied someone else's target — don't echo it back as my own seek.
  const followGraceRef = useRef(0);
  // Mirrors pausedBy for channel callbacks (their closures go stale).
  const pausedByRef = useRef(null);
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

  // Live channel: chat + playback actions + host/grants/state.
  useEffect(() => {
    if (!room || !nickname) return;
    const ch = openRoomChannel({
      code,
      name: nickname,
      onEvent: ({ type, payload }) => {
        if (!payload || payload.device === device) return;
        const yt = roomRef.current?.media?.kind === 'youtube';
        if (type === 'chat') {
          pushMsg({ id: payload.id, name: payload.name, text: payload.text, at: payload.at });
        } else if (type === 'tick') {
          // Host heartbeat over realtime (5s): continuous catch-up so the
          // follower trails by seconds, not by poll intervals. Paused or
          // waiting followers ignore ticks — lock rules win.
          if (payload.device === device || pausedByRef.current || !roomRef.current) return;
          if (!canControlRef.current) {
            const travel = Math.max(0, (Date.now() - (payload.at || Date.now())) / 1000);
            const expected = (payload.second || 0) + Math.min(travel, 10);
            const mine = myPos.current.second || 0;
            if (Math.abs(mine - expected) > 5 && expected > 3) {
              setSyncNote('Catching up…');
              followGraceRef.current = Date.now();
              setRoomTarget({
                key: `tick:${payload.at || Date.now()}`,
                second: Math.floor(expected),
                season: payload.season,
                episode: payload.episode,
                server: payload.server,
              });
              setTimeout(() => setSyncNote('In sync'), 3000);
            }
          }
        } else if (type === 'seek' || type === 'play') {
          setPausedBy(null);
          pausedAtRef.current = 0;
          frozenPosRef.current = null;
          setSyncNote('Catching up…');
          followGraceRef.current = Date.now();
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
          if (yt) {
            // YouTube has a real command API — truly pause at the second.
            setRoomTarget({
              key: `evt:${payload.at || Date.now()}`,
              action: 'pause',
              second: payload.second || 0,
            });
          } else {
            setPausedBy(payload.name || 'Host');
            pausedAtRef.current = Date.now();
          }
        } else if (type === 'host' || type === 'grants' || type === 'state') {
          fetchRoom(code).then((r) => {
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
        if (newcomers.length > 0 && pausedByRef.current === nickname) {
          const second = Math.floor((frozenPosRef.current || myPos.current).second || 0);
          channelRef.current?.send('pause', { device, name: nickname, second, at: Date.now() });
        }
      },
    });
    channelRef.current = ch;
    return () => {
      ch.close();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, room?.code, nickname]);

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
    channelRef.current?.send('seek', {
      device,
      name: nickname,
      second: pos.second,
      season: pos.season,
      episode: pos.episode,
      server: pos.server,
      at: Date.now(),
    });
  };

  // Host heartbeat: stamp position + episode + server so rejoiners land
  // on the exact S/E/second even with no recent seek event. Frozen while
  // the room is paused (see above). Plus a 5s realtime tick so followers
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
        name: nickname,
        second: Math.floor(p.second || 0),
        season: p.season,
        episode: p.episode,
        server: p.server,
        at: Date.now(),
      });
    }, 5000);
    return () => {
      clearInterval(beat);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, room?.code, isHost]);

  // Follower drift check against the host-stamped row.
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
          setRoomTarget({
            key: `heal:${Date.now()}`,
            second: r.position || 0,
            season: r.season,
            episode: r.episode,
            server: r.server,
          });
          return;
        }
        if (pausedBy) return;
        const elapsed = r.updatedAt ? Math.max(0, (Date.now() - new Date(r.updatedAt).getTime()) / 1000) : 0;
        const expected = (r.position || 0) + Math.min(elapsed, 30);
        const mine = myPos.current.second || 0;
        if (Math.abs(mine - expected) > 10 && expected > 5) {
          setSyncNote('Catching up…');
          setRoomTarget({ key: `drift:${Date.now()}`, second: Math.floor(expected) });
          setTimeout(() => setSyncNote('In sync'), 4000);
        }
      } catch {
        // Offline blip — next check retries.
      }
    }, 15000);
    return () => clearInterval(check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, room?.code, canControl, pausedBy]);

  // Chat autoscroll.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  if (!nickname) {
    return <NickGate onSave={(n) => setNicknameState(n)} onLeave={onLeave} />;
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
    const msg = { id: msgId(), name: nickname, text, at: Date.now() };
    channelRef.current?.send('chat', { ...msg, device });
    pushMsg({ ...msg, mine: true });
    setInput('');
  };

  const broadcastPause = async () => {
    const second = Math.floor(myPos.current.second || 0);
    // Pause is the one event that must not be lost: a follower who misses
    // it plays on. Triple-send (idempotent) + presence resend for late
    // joiners + row-state poll healing on the follower side.
    const payload = { device, name: nickname, second, at: Date.now() };
    channelRef.current?.send('pause', payload);
    setTimeout(() => channelRef.current?.send('pause', { ...payload, at: Date.now() }), 700);
    setTimeout(() => channelRef.current?.send('pause', { ...payload, at: Date.now() }), 1400);
    frozenPosRef.current = { ...myPos.current, second };
    if (room?.media?.kind === 'youtube') {
      setRoomTarget({ key: `me:${Date.now()}`, action: 'pause', second });
    } else {
      setPausedBy(nickname);
    }
    try {
      await patchRoom(code, { state: 'paused', position: Math.floor(myPos.current.second || 0) });
    } catch {
      // broadcast already told the room
    }
  };

  // Follower's manual sync: jump to the host's stamped second RIGHT NOW
  // instead of waiting for the next tick/poll. The deterministic answer
  // to "host's time doesn't matter".
  const syncToHost = async () => {
    try {
      const r = await fetchRoom(code);
      if (!r) {
        onToast?.('Room not found.');
        return;
      }
      setRoom(r);
      if (r.state === 'paused') {
        onToast?.('Room is paused — resume lands you on the host.');
        return;
      }
      setSyncNote('Catching up…');
      followGraceRef.current = Date.now();
      setRoomTarget({
        key: `manual:${Date.now()}`,
        second: r.position || 0,
        season: r.season,
        episode: r.episode,
        server: r.server,
      });
      onToast?.("Synced to host's position");
      setTimeout(() => setSyncNote('In sync'), 3000);
    } catch {
      onToast?.('Sync failed — retry.');
    }
  };

  const broadcastPlay = async () => {
    const second = Math.floor(myPos.current.second || 0);
    channelRef.current?.send('play', {
      device, name: nickname, second, at: Date.now(),
    });
    setPausedBy(null);
    frozenPosRef.current = null;
    // Own broadcasts don't echo (self:false) — apply YouTube locally too
    // (embed owners just press play in their own frame).
    if (room?.media?.kind === 'youtube') {
      setRoomTarget({ key: `me:${Date.now()}`, action: 'play', second });
    }
    try {
      await patchRoom(code, { state: 'live', position: second });
    } catch {
      // ignore
    }
  };

  const grantToggle = async (memberDevice, key) => {
    const grants = { ...(room.grants || {}) };
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
      channelRef.current?.send('host', { device, name: nickname, host_device: memberDevice });
      const r = await fetchRoom(code);
      if (r) setRoom(r);
      onToast?.(`${memberName} is now hosting`);
    } catch (err) {
      onToast?.('Transfer failed — retry.');
    }
  };

  const takeOver = async () => {
    try {
      await patchRoom(code, { host_device: device, state: 'live' });
      channelRef.current?.send('host', { device, name: nickname, host_device: device });
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
  // Hard lock (embed rooms): locked-out followers get NO iframe while
  // paused or waiting — unmount kills video+audio, so nothing can drift.
  // Resume remounts at the room's second. Drivers (host + granted) are
  // never locked: they keep the controls that move the room.
  const suspended = !isYouTube && !canControl && (!!pausedBy || waitingForHost);
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
              {members.length} watching • {syncNote}
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
          {canControl ? (
            <>
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
              {pausedBy ? (
                <button onClick={broadcastPlay} className="cine-control-btn h-9 px-4 text-xs" title="Resume for everyone">
                  <Play className="w-3.5 h-3.5" /> Resume
                </button>
              ) : (
                <button onClick={broadcastPause} className="cine-control-btn h-9 px-4 text-xs" title="Pause for everyone">
                  <Pause className="w-3.5 h-3.5" /> Pause
                </button>
              )}
            </>
          ) : (
            <button
              onClick={syncToHost}
              className="cine-control-btn h-9 px-4 text-xs"
              title="Jump to the host's second right now"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Sync
            </button>
          )}
        </div>

        <div className="h-[42vh] md:h-auto md:flex-1 md:min-h-0 flex-shrink-0 md:flex-shrink">
          {isYouTube && room.media?.youtubeId ? (
            <YouTubeRoomPlayer
              key={`room_${room.code}_${room.media.youtubeId}`}
              videoId={room.media.youtubeId}
              roomTarget={roomTarget}
              onPosition={handlePosition}
            />
          ) : media.id ? (
            <Player
              key={`room_${room.code}_${room.media?.id}`}
              media={media}
              details={details}
              onClose={() => handleLeave(false)}
              onPosition={handlePosition}
              roomTarget={roomTarget}
              roomOverlay={overlay}
              roomLocked={!canControl}
              suspended={suspended}
              framed
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

      {/* Side rail */}
      <aside className="flex-1 min-h-0 md:flex-none md:w-[380px] border-t md:border-t-0 md:border-l border-[var(--cine-glass-border)] bg-[var(--cine-panel-dark)] backdrop-blur-2xl flex flex-col">
        <div className="flex items-center gap-2 p-3 border-b border-[var(--cine-glass-border)] flex-shrink-0">
          <button
            onClick={() => setTab('chat')}
            className={`flex-1 h-9 rounded-full text-xs font-bold transition cursor-pointer ${tab === 'chat' ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5" /> Chat
            </span>
          </button>
          <button
            onClick={() => setTab('people')}
            className={`flex-1 h-9 rounded-full text-xs font-bold transition cursor-pointer ${tab === 'people' ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> People ({members.length})
            </span>
          </button>
        </div>

        {tab === 'chat' ? (
          <>
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
              {messages.length === 0 && (
                <p className="text-center text-[11px] text-white/40 pt-6">
                  Say hi — chat lives only while the room is open.
                </p>
              )}
              {messages.map((m) =>
                m.sys ? (
                  <p key={m.id} className="text-center text-[11px] text-white/40">
                    {m.text}
                  </p>
                ) : (
                  <div key={m.id} className={`flex flex-col gap-0.5 ${m.mine ? 'items-end' : 'items-start'}`}>
                    <span className="text-[10px] font-bold" style={{ color: nameColor(m.name) }}>
                      {m.name}
                    </span>
                    <span
                      className={`max-w-[85%] px-3 py-1.5 rounded-2xl text-[13px] leading-snug break-words ${
                        m.mine ? 'bg-white text-black rounded-br-md' : 'bg-white/[0.08] text-white/90 border border-white/10 rounded-bl-md'
                      }`}
                    >
                      {m.text}
                    </span>
                  </div>
                )
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="p-3 border-t border-[var(--cine-glass-border)] flex-shrink-0">
              {chatMuted ? (
                <p className="text-center text-[11px] text-white/40">The host muted your chat.</p>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={`Message as ${nickname}…`}
                      aria-label="Chat message"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') sendChat();
                      }}
                    />
                  </div>
                  <button onClick={sendChat} className="cine-icon-btn" title="Send" aria-label="Send message">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </>
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
                <div key={m.device} className="mat-row flex items-center gap-3 p-2.5">
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-black flex-shrink-0"
                    style={{ backgroundColor: nameColor(m.name) }}
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
                        className={`h-7 px-2.5 rounded-full text-[10px] font-bold border transition cursor-pointer ${
                          g.control ? 'bg-[var(--cine-accent)]/15 text-[var(--cine-accent)] border-[var(--cine-accent)]/30' : 'text-white/50 border-white/10 hover:text-white'
                        }`}
                        title="Let them drive playback for the room"
                      >
                        Control
                      </button>
                      <button
                        onClick={() => grantToggle(m.device, 'chat')}
                        className={`h-7 px-2.5 rounded-full text-[10px] font-bold border transition cursor-pointer ${
                          g.chat === false ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'text-white/50 border-white/10 hover:text-white'
                        }`}
                        title="Mute / unmute their chat"
                      >
                        Chat
                      </button>
                      <button
                        onClick={() => transferHost(m.device, m.name)}
                        className="h-7 px-2.5 rounded-full text-[10px] font-bold text-white/50 border border-white/10 hover:text-white transition cursor-pointer"
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
    </div>
  );
}

function NickGate({ onSave, onLeave }) {
  const [draft, setDraft] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--cine-bg-deep)] p-6">
      <div className="rounded-3xl cine-glass-panel p-8 w-full max-w-sm space-y-4 text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-[var(--cine-glass-tint)] border border-[var(--cine-glass-border)] flex items-center justify-center text-white/60">
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
