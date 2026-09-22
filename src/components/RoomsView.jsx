import { useState, useEffect } from 'react';
import { Users, Trash2, X, Copy, Check, MonitorPlay, Search, Link2, Clapperboard, ArrowLeft } from 'lucide-react';
import { parseYouTubeId, fetchYouTubeMeta } from './YouTubeRoomPlayer';
import { isRoomsConfigured } from '../services/supabase';
import {
  myDeviceId,
  myNickname,
  setNickname,
  createRoom,
  fetchRoom,
  deleteRoom,
  myRooms,
  rememberRoom,
  forgetRoom,
  roomLink,
} from '../services/rooms';
import { tmdb } from '../services/tmdb';
import Input from './ui/Input';
import Modal from './ui/Modal';
import EmptyState from './ui/EmptyState';
import Row from './ui/Row';
import RowRail from './RowRail';
import { useAccount } from '../services/account';

function NickRow({ nickname, isAccount, setNicknameState, onToast }) {
  const [draft, setDraft] = useState(nickname);
  useEffect(() => setDraft(nickname), [nickname]);
  if (nickname) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-white/45">Nickname:</span>
        <span className="cine-chip cine-chip--neutral">{nickname}</span>
        {isAccount ? (
          <span className="text-[11px] font-medium text-white/40">From your account</span>
        ) : (
          <button
            onClick={() => {
              setNickname('');
              setNicknameState('');
            }}
            className="text-[11px] font-semibold text-white/50 hover:text-white transition cursor-pointer"
          >
            Change
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <div className="w-44">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Your nickname"
          aria-label="Your nickname"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              const clean = setNickname(draft);
              setNicknameState(clean);
              onToast?.(`Hello, ${clean}`);
            }
          }}
        />
      </div>
      <button
        onClick={() => {
          if (!draft.trim()) return;
          const clean = setNickname(draft);
          setNicknameState(clean);
          onToast?.(`Hello, ${clean}`);
        }}
        className="cine-control-btn px-4 h-10"
        aria-label="Save nickname"
      >
        <Check className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function RoomsView({ draftMedia = null, onEnter, onToast }) {
  // Account name wins everywhere when signed in (device nickname is the
  // logged-out fallback — forgotten, never merged, by design).
  const { displayName: acctName } = useAccount();
  const [deviceNick, setDeviceNick] = useState(() => myNickname());
  const nickname = acctName || deviceNick;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rooms, setRooms] = useState([]);
  const [copied, setCopied] = useState(false);
  // Pick flow: Create → dedicated pick screen (title search or YouTube
  // link) → room is created on selection. A detail-page draft skips picking.
  const [step, setStep] = useState('main');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [ytUrl, setYtUrl] = useState('');
  const [ytMeta, setYtMeta] = useState(null);
  const [ytLoading, setYtLoading] = useState(false);
  const [trending, setTrending] = useState([]);
  const device = myDeviceId();
  // Create confirmation: every tap that would instantly open a room
  // (trending rail, search result, YouTube link) first shows what you're
  // about to watch. Accidental taps no longer strand you in a room.
  const [pending, setPending] = useState(null);

  // Lobby filler: trending titles, tap = instant room (no pick screen).
  useEffect(() => {
    if (!isRoomsConfigured()) return;
    tmdb
      .getTrending()
      .then((res) =>
        setTrending(
          (res?.results || [])
            .filter((x) => !x.adult && x.poster_path && (x.title || x.name))
            .slice(0, 12)
        )
      )
      .catch(() => {});
  }, []);

  // Title search (debounced, poster-only, top 6).
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await tmdb.searchMulti(query.trim());
        setResults(
          (res?.results || [])
            .filter((x) => !x.adult && x.poster_path && (x.title || x.name) && (x.media_type === 'movie' || x.media_type === 'tv'))
            .slice(0, 6)
        );
      } catch {
        setResults([]);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  // YouTube link → oEmbed preview (selection happens on confirm).
  useEffect(() => {
    const url = ytUrl.trim();
    setYtMeta(null);
    if (!url) return;
    if (!parseYouTubeId(url)) {
      if (url.length > 12) setError('That does not look like a YouTube link.');
      return;
    }
    setError('');
    setYtLoading(true);
    const t = setTimeout(async () => {
      try {
        const meta = await fetchYouTubeMeta(url);
        setYtMeta(meta);
      } finally {
        setYtLoading(false);
      }
    }, 500);
    return () => {
      clearTimeout(t);
      setYtLoading(false);
    };
  }, [ytUrl]);

  // Lobby list: owned rows + locally remembered codes.
  useEffect(() => {
    let alive = true;
    (async () => {
      const local = myRooms();
      const seen = new Map();
      for (const r of local) {
        const row = await fetchRoom(r.code).catch(() => null);
        if (!alive) return;
        if (row) seen.set(row.code, { ...row, owned: row.hostDevice === device });
        // Dead codes (deleted rooms) drop out of the list silently.
      }
      if (alive) setRooms([...seen.values()]);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isRoomsConfigured()) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">Rooms</h1>
          <p className="text-sm text-white/60 mt-1">Watch together, in sync, with chat</p>
        </div>
        <EmptyState
          icon={<Users className="w-5 h-5" />}
          title="Rooms need Supabase"
          description="Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then redeploy."
        />
      </div>
    );
  }

  const needNick = () => {
    if (!nickname) {
      setError('Pick a nickname first.');
      return true;
    }
    return false;
  };

  const doCreate = async (picked) => {
    if (needNick() || busy) return;
    setBusy(true);
    setError('');
    try {
      const media =
        picked.kind === 'youtube'
          ? { kind: 'youtube', youtubeId: picked.youtubeId, title: picked.title, poster: picked.thumb }
          : {
              id: picked.id,
              media_type: picked.media_type || 'movie',
              title: picked.title || '',
              poster_path: picked.poster_path || '',
            };
      const room = await createRoom({
        // Room name is automatic (title, else host) — no name field clutters
        // the lobby.
        title: picked.title || `${nickname}'s room`,
        media,
        season: 1,
        episode: 1,
        server: 'vidy',
      });
      onToast?.(`Room ${room.code} created`);
      onEnter(room.code);
    } catch (err) {
      setError(err.message || 'Could not create room.');
    } finally {
      setBusy(false);
    }
  };

  // Create → pick screen, unless a detail page already chose the title.
  const handleCreateBtn = () => {
    if (needNick() || busy) return;
    if (draftMedia?.id || draftMedia?.youtubeId) {
      const m = draftMedia;
      doCreate(
        m.youtubeId || m.kind === 'youtube'
          ? { kind: 'youtube', youtubeId: m.youtubeId, title: m.title || m.name, thumb: m.thumb || m.poster }
          : {
              kind: 'tmdb',
              id: m.id,
              media_type: m.media_type || m.type || (m.first_air_date ? 'tv' : 'movie'),
              title: m.title || m.name || '',
              poster_path: m.poster_path || '',
            }
      );
    } else {
      setStep('pick');
    }
  };

  const handleJoin = async () => {
    if (needNick() || busy) return;
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    setBusy(true);
    setError('');
    try {
      const row = await fetchRoom(clean);
      if (!row) {
        setError(`No room found for code "${clean}".`);
        return;
      }
      rememberRoom(row.code, row.title);
      onEnter(row.code);
    } catch (err) {
      setError(err.message || 'Could not join room.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (r) => {
    try {
      if (r.owned) await deleteRoom(r.code);
      else forgetRoom(r.code);
      setRooms((prev) => prev.filter((x) => x.code !== r.code));
      onToast?.(r.owned ? 'Room deleted' : 'Room removed');
    } catch (err) {
      setError(err.message || 'Delete failed.');
    }
  };

  const copyCode = (c) => {
    try {
      navigator.clipboard?.writeText(roomLink(c));
      setCopied(c);
      onToast?.('Invite link copied');
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex-shrink-0">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">Rooms</h1>
          <p className="text-sm text-white/60 mt-1">Watch together, in sync, with chat</p>
        </div>
        {/* Nickname is device-only identity: hidden when the account
            already names this user. */}
        {!acctName && (
          <NickRow nickname={nickname} isAccount={false} setNicknameState={setDeviceNick} onToast={onToast} />
        )}
      </div>

      {error && <p className="text-xs text-red-400/90">{error}</p>}

      {step === 'pick' ? (
        <section className="rounded-3xl cine-glass-panel p-6 sm:p-8 space-y-6 w-full max-w-xl mx-auto">          <div className="flex items-center gap-4">
            <button
              onClick={() => setStep('main')}
              className="cine-icon-btn"
              
              aria-label="Back to rooms"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">What are we watching?</h2>
              <p className="text-xs text-white/60 mt-0.5">Tap a title — the room is created instantly</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl cine-glass-panel px-4 py-3.5 focus-within:border-white/25 transition">
            <Search className="w-5 h-5 text-white/60 flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a movie or show…"
              aria-label="Search a title for the room"
              autoFocus
              className="w-full bg-transparent text-base text-white placeholder-white/30 focus:outline-none"
            />
          </div>
          {results.length > 0 && (
            <div className="space-y-2 max-h-80 overflow-y-auto no-scrollbar">
              {results.map((r) => (
                <button
                  key={`${r.media_type}_${r.id}`}
                  disabled={busy}
                  onClick={() =>
                    setPending({
                      kind: 'tmdb',
                      id: r.id,
                      media_type: r.media_type,
                      title: r.title || r.name,
                      poster_path: r.poster_path,
                    })
                  }
                  className="mat-row w-full flex items-center gap-4 p-3 text-left cursor-pointer disabled:opacity-50"
                >
                  <div className="w-12 h-16 rounded-xl overflow-hidden bg-black/50 flex-shrink-0">
                    <img src={tmdb.getImageUrl(r.poster_path, 'w185')} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white/90 truncate">{r.title || r.name}</p>
                    <p className="text-[11px] text-white/50 uppercase mt-0.5">
                      {(r.media_type || '')} • {((r.release_date || r.first_air_date) || '').split('-')[0]}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">or paste a link</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
          <div className="flex items-center gap-3 rounded-2xl cine-glass-panel px-4 py-3.5 focus-within:border-white/25 transition">
            <Link2 className="w-5 h-5 text-white/60 flex-shrink-0" />
            <input
              type="text"
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              placeholder="YouTube link…"
              aria-label="YouTube link for the room"
              inputMode="url"
              className="w-full bg-transparent text-base text-white placeholder-white/30 focus:outline-none"
            />
            {ytLoading && <div className="w-4 h-4 border-2 border-[var(--cine-accent)] border-t-transparent rounded-full animate-spin flex-shrink-0" />}
          </div>
          {!ytUrl && (
            <p className="text-[11px] text-white/40 inline-flex items-center gap-1.5">
              <Clapperboard className="w-3 h-3" /> watch, shorts and youtu.be links supported
            </p>
          )}
          {ytMeta && (
            <div className="flex items-center gap-4 mat-row p-3">
              <div className="w-28 h-16 rounded-xl overflow-hidden bg-black/50 flex-shrink-0">
                <img src={ytMeta.thumb} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white/90 truncate">{ytMeta.title}</p>
                <p className="text-[11px] text-white/60 mt-0.5">YouTube{ytMeta.author ? ` • ${ytMeta.author}` : ''}</p>
              </div>
              <button
                onClick={() =>
                  setPending({ kind: 'youtube', youtubeId: ytMeta.id, title: ytMeta.title, thumb: ytMeta.thumb })
                }
                disabled={busy}
                className="cine-btn cine-btn-white h-10 px-5 text-sm flex-shrink-0 disabled:opacity-50"
              >
                {busy ? 'Creating…' : 'Create'}
              </button>
            </div>
          )}
        </section>
      ) : (
        <>
        {/* Lobby order: trending strip first, one centered action panel,
            then My rooms — nothing important below the fold. */}
        {trending.length > 0 && (
          <RowRail
            title="Trending now — start a room"
            cardSize="sm"
            items={trending}
            onSelect={(m) =>
              setPending({
                kind: 'tmdb',
                id: m.id,
                media_type: m.media_type || 'movie',
                title: m.title || m.name,
                poster_path: m.poster_path,
              })
            }
          />
        )}
        {/* One centered action: create first (white primary), join below.
            No room-name field — rooms take the title's name automatically. */}
        <section className="rounded-3xl cine-glass-panel p-6 sm:p-8 space-y-5 max-w-xl w-full mx-auto">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-extrabold text-white tracking-tight">Start watching together</h2>
            <p className="text-xs text-white/60">One tap to create — or join with a code</p>
          </div>
          {draftMedia && (
            <div className="flex items-center gap-3 mat-row p-2.5">
              <div className="w-10 h-14 rounded-xl overflow-hidden bg-black/50 flex-shrink-0">
                <img
                  src={tmdb.getImageUrl(draftMedia.poster_path, 'w185')}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white/90 truncate">
                  {draftMedia.title || draftMedia.name}
                </p>
                <p className="text-[11px] text-white/60">Room opens on this title</p>
              </div>
            </div>
          )}
          <button
            onClick={handleCreateBtn}
            disabled={busy}
            className="cine-btn cine-btn-white h-12 px-8 text-[15px] w-full disabled:opacity-50"
          >
            <MonitorPlay className="w-[18px] h-[18px]" />
            {busy ? 'Creating…' : draftMedia ? 'Create room' : 'New room'}
          </button>
          <div className="flex items-center gap-3" aria-hidden="true">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">or join</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="flex-1 min-w-0">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="ABC123"
                aria-label="Room code"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleJoin();
                }}
              />
            </div>
            <button
              onClick={handleJoin}
              disabled={busy}
              className="cine-control-btn h-12 px-8 text-[15px] flex-shrink-0 disabled:opacity-50"
            >
              {busy ? 'Joining…' : 'Join'}
            </button>
          </div>
        </section>
        </>
      )}

      {/* My rooms — right under the action, never below the fold filler. */}
      {step === 'main' && rooms.length > 0 && (
      <section className="space-y-3">
        <div className="cine-section-head">
          <h2 className="cine-section-title cine-section-title--lg">My rooms</h2>
        </div>
          <div className="space-y-2">
            {rooms.map((r) => (
              <Row
                key={r.code}
                poster={tmdb.getImageUrl(r.media?.poster, 'w185')}
                title={r.title}
                meta={`${r.code} • ${r.owned ? 'Host' : 'Guest'}`}
                onClick={() => onEnter(r.code)}
                right={
                  <div className="cine-duo-btn cine-duo-btn--sm" role="group" aria-label={`Actions for room ${r.code}`}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyCode(r.code);
                      }}
                      aria-label={`Copy invite link ${r.code}`}
                    >
                      {copied === r.code ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span className="cine-duo-tip cine-duo-tip--below" aria-hidden="true">Copy invite</span>
                    </button>
                    <span className="cine-duo-divider" aria-hidden="true" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(r);
                      }}
                      aria-label={r.owned ? `Delete room ${r.code}` : `Remove room ${r.code}`}
                    >
                      {r.owned ? <Trash2 className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                      <span className="cine-duo-tip cine-duo-tip--below" aria-hidden="true">
                        {r.owned ? 'Delete for everyone' : 'Remove'}
                      </span>
                    </button>
                  </div>
                }
              />
            ))}
          </div>
      </section>
      )}

      <Modal
        isOpen={Boolean(pending)}
        onClose={() => setPending(null)}
        maxWidth="max-w-sm"
        label="Confirm room"
      >
        {pending && (
          <div className="p-6 sm:p-8 space-y-5 text-center">
            <div className="w-20 h-28 rounded-2xl overflow-hidden bg-black/50 mx-auto">
              <img
                src={
                  pending.poster_path
                    ? tmdb.getImageUrl(pending.poster_path, 'w185')
                    : pending.thumb || ''
                }
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white tracking-tight">
                Create a room to watch “{pending.title || 'this title'}”?
              </h2>
              <p className="text-xs text-white/60 mt-1">
                Everyone with the code joins at the start.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPending(null)}
                className="cine-control-btn flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const p = pending;
                  setPending(null);
                  doCreate(p);
                }}
                disabled={busy}
                className="cine-btn cine-btn-white h-11 px-6 text-sm flex-1 disabled:opacity-50"
              >
                {busy ? 'Creating…' : 'Create room'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
