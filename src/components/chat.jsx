import { useState, useEffect, useRef } from 'react';
import { Send, X, Pencil, Trash2, CornerUpLeft, ChevronDown, MoreHorizontal, ImagePlus } from 'lucide-react';
import Emoji, { RichText } from './ui/Emoji';
import { QUICK_REACTIONS } from '../services/emoji';
import GifPicker from './GifPicker';
import { nameColor } from '../services/rooms';

// Shared room-chat: message bubbles (Telegram language — replies, edits,
// tombstones, single receipts), scroll list with new-message pill, and an
// autogrowing input. One ChatView pane drives the side rail AND the
// fullscreen floating panel so both can never diverge. Player imports
// FloatingRoomChat (kept as a thin wrapper — the player file itself is
// untouched). Notification tones live in services/notify.js.

export function ReactionChips({ msgId, forMsg, myDevice, onToggleReact }) {
  const entries = Object.entries(forMsg || {}).filter(([, v]) => (v?.devices?.length || 0) > 0);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {entries.map(([emoji, v]) => {
        const mine = (v.devices || []).includes(myDevice);
        return (
          <button
            key={emoji}
            onClick={() => onToggleReact(msgId, emoji)}
            aria-label={(v.names || []).join(', ') || emoji}
            aria-pressed={mine}
            className={`cine-react${mine ? ' cine-react--mine' : ''}`}
          >
            <Emoji char={emoji} size={14} />
            <span>{v.devices.length}</span>
          </button>
        );
      })}
    </div>
  );
}

function QuoteSnippet({ reply, onJump }) {
  if (!reply) return null;
  return (
    <button
      onClick={() => reply.id && onJump?.(reply.id)}
      className="cine-reply-quote"
      aria-label={`Go to quoted message from ${reply.name}`}
    >
      <span className="cine-reply-quote-name" style={{ color: nameColor(reply.name) }}>
        {reply.name}
      </span>
      <span className="cine-reply-quote-text">
        {reply.kind === 'gif' ? 'GIF' : reply.kind === 'image' ? 'Photo' : reply.text || ''}
      </span>
    </button>
  );
}

// Sent-gif bubble: plays animated, tap freezes the current frame
// (canvas snapshot), tap again resumes. Falls back to a plain image
// when no animated source exists.
function GifBubble({ url, preview, title, time, mine }) {
  const [frozen, setFrozen] = useState(false);
  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const canFreeze = Boolean(url && preview && url !== preview);
  const freeze = () => {
    try {
      const img = imgRef.current;
      const cv = canvasRef.current;
      if (!img || !cv || !img.naturalWidth) return;
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      cv.getContext('2d').drawImage(img, 0, 0);
      setFrozen(true);
    } catch {
      // tainted/undecodable frame — stay animated
    }
  };
  return (
    <span
      className={`cine-gif-bubble${mine ? ' cine-gif-bubble--mine' : ''}`}
      onClick={() => {
        if (!canFreeze) return;
        if (frozen) setFrozen(false);
        else freeze();
      }}
      role={canFreeze ? 'button' : undefined}
      aria-label={canFreeze ? (frozen ? 'Play GIF' : 'Pause GIF') : undefined}
    >
      <img
        ref={imgRef}
        src={url || preview}
        alt={title || 'GIF'}
        loading="lazy"
        decoding="async"
        className="cine-gif-img"
        style={frozen ? { display: 'none' } : undefined}
      />
      {canFreeze && (
        <canvas ref={canvasRef} className="cine-gif-img" style={frozen ? undefined : { display: 'none' }} aria-hidden="true" />
      )}
      {time && (
        <span className="cine-gif-time">
          {time}
        </span>
      )}
    </span>
  );
}

export function ChatMessage({
  m,
  reactions,
  myDevice,
  canModerate,
  onToggleReact,
  receipt,
  onReply,
  onEdit,
  onDeleteRequest,
  onJump,
  onViewPhoto,
  compact,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.text || '');
  // One anchor, one surface (B6/B7): the … button and right click open
  // the menu with the quick-reaction strip fused on top (Telegram
  // pattern — one tap reacts, no menu diving). Placement flips above
  // near the list bottom to escape the scroller clip.
  const [pickerBelow, setPickerBelow] = useState(true);
  const msgRef = useRef(null);
  const placeBelow = () => {
    if (!msgRef.current) return true;
    try {
      const scroller = msgRef.current.closest('.overflow-y-auto');
      const r = msgRef.current.getBoundingClientRect();
      if (!scroller) return true;
      const bottom = scroller.getBoundingClientRect().bottom;
      return bottom - r.bottom > 200;
    } catch {
      return true;
    }
  };
  const toggleMenu = () => {
    if (!menuOpen) setPickerBelow(placeBelow());
    setMenuOpen((o) => !o);
  };
  // Tap-anywhere dismissal: an open menu closes when the pointer lands
  // outside this message (it opens on right click, so it must also
  // close on any other click — a stuck menu is nonsense).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => {
      if (msgRef.current && !msgRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menuOpen]);
  if (m.sys) {
    return (
      <p className="text-center text-[11px] text-white/40">
        {m.text}
      </p>
    );
  }
  // Delete-for-everyone leaves a tombstone (Telegram rule): scroll stays
  // stable, reactions vanish, no actions.
  if (m.del) {
    return (
      <div className="flex flex-col gap-1 items-start">
        <p className="cine-msg-deleted">This message was deleted for everyone</p>
      </div>
    );
  }
  const mine = !!m.mine;
  const sentAt = m.at
    ? new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const saveEdit = () => {
    const clean = draft.trim().slice(0, 500);
    setEditing(false);
    if (clean && clean !== m.text) onEdit?.(m.id, clean);
    else setDraft(m.text || '');
  };
  return (
    <div
      ref={msgRef}
      data-mid={m.id}
      onContextMenu={(e) => {
        e.preventDefault();
        setPickerBelow(placeBelow());
        setMenuOpen(true);
      }}
      className={`cine-msg-copy flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'} group/msg relative`}
    >
      <span className="text-[11px] font-bold" style={{ color: nameColor(m.name) }}>
        {m.name}
      </span>
      <div className="relative max-w-[85%]">
        <QuoteSnippet reply={m.reply} onJump={onJump} />
        {m.kind === 'gif' ? (
          <GifBubble url={m.url} preview={m.preview} title={m.title} time={sentAt} mine={mine} />
        ) : m.kind === 'image' ? (
          <span className={`cine-gif-bubble${mine ? ' cine-gif-bubble--mine' : ''}`}>
            <button onClick={() => onViewPhoto?.(m.url, m.title)} aria-label={m.title ? `Open photo: ${m.title}` : 'Open photo'} className="block cursor-zoom-in">
              <img
                src={m.preview || m.url}
                alt={m.title || 'Photo'}
                loading="lazy"
                decoding="async"
                className="cine-gif-img"
              />
            </button>
            {sentAt && (
              <span className="cine-gif-time">
                {sentAt}
              </span>
            )}
          </span>
        ) : editing ? (
          <div className="cine-msg-edit">
            <textarea
              value={draft}
              autoFocus
              rows={2}
              maxLength={500}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  saveEdit();
                } else if (e.key === 'Escape') {
                  setEditing(false);
                  setDraft(m.text || '');
                }
              }}
              aria-label="Edit message"
              className="cine-input cine-chat-textarea"
            />
            <div className="flex items-center justify-end gap-1.5 mt-1.5">
              <button
                onClick={() => {
                  setEditing(false);
                  setDraft(m.text || '');
                }}
                className="text-[11px] font-semibold text-white/50 hover:text-white transition cursor-pointer px-2 py-1"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                className="cine-pill cine-pill--sm"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <span
            className={`msg-text block px-3.5 py-2 rounded-2xl leading-[1.45] break-words ${
              mine ? 'bg-white text-black rounded-br-md' : 'bg-white/[0.08] text-white/90 border border-white/10 rounded-bl-md'
            }`}
          >
            <RichText text={m.text} />
            {m.edited && (
              <span className="ml-1.5 text-[10px] font-medium opacity-50">edited</span>
            )}
            {/* Messenger-style: the clock lives inside the bubble at the
                end of the last line, dimmed via inherited color. */}
            {sentAt && (
              <span className="ml-2 inline-block translate-y-[3px] text-[10px] font-medium tabular-nums opacity-60">
                {sentAt}
              </span>
            )}
          </span>
        )}
        {/* Hover action: one … button overlaid on the bubble corner
            (bottom, sender side). It used to sit outside the bubble
            (-left-8/-right-8) where the floating panel's overflow-hidden
            cut it off — overlaying kills the clip on both surfaces.
            Touch keeps it faintly visible — no hover there. */}
        {!editing && (
          <button
            onClick={toggleMenu}

            aria-label="Message actions"
            aria-expanded={menuOpen}
            className={`absolute bottom-1 cine-icon-btn cine-icon-btn--xs bg-black/40 opacity-60 md:opacity-0 md:group-hover/msg:opacity-100 focus:opacity-100 ${
              mine ? 'right-1' : 'left-1'
            }`}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {/* … menu (B6): quick-reaction strip fused on top, then Reply /
          Edit / Delete with labels. Shares edge-aware placement; the
          strip is the react path, so no separate React row. */}
      {menuOpen && !editing && (
        <div
          className={`absolute z-10 ${mine ? 'right-0' : 'left-0'} ${
            pickerBelow ? 'top-full mt-1.5' : 'bottom-full mb-1.5'
          }`}
        >
          <div
            role="menu"
            aria-label="Choose a reaction"
            className={`gap-0.5 p-1 rounded-full cine-glass-panel mb-1.5 flex${
              // 12 emoji overflow the 320px popup: scroll there, full row
              // on the rail.
              compact ? ' flex-nowrap overflow-x-auto max-w-[248px]' : ''
            }`}
          >
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  onToggleReact(m.id, emoji);
                  setMenuOpen(false);
                }}
                aria-label={`React ${emoji}`}
                className={`w-7 h-7 rounded-full hover:bg-white/15 transition cursor-pointer flex items-center justify-center${compact ? ' flex-shrink-0' : ''}`}
              >
                <Emoji char={emoji} size={18} />
              </button>
            ))}
          </div>
          <div
            role="menu"
            aria-label="Message actions"
            className="w-44 rounded-2xl cine-glass-panel p-1.5 space-y-0.5"
          >
          <button
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onReply?.(m);
            }}
            className="cine-msg-menu-item"
          >
            <CornerUpLeft className="w-3.5 h-3.5" /> Reply
          </button>
          {mine && m.kind !== 'gif' && m.kind !== 'image' && (
            <button
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setDraft(m.text || '');
                setEditing(true);
              }}
              className="cine-msg-menu-item"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          {(mine || canModerate) && (
            <button
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onDeleteRequest?.(m.id, m);
              }}
              className="cine-msg-menu-item cine-msg-menu-item--danger"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          )}
          </div>
        </div>
      )}
      <ReactionChips msgId={m.id} forMsg={reactions?.[m.id]} myDevice={myDevice} onToggleReact={onToggleReact} />
      {/* Telegram receipt: exactly one status in the whole thread — Sent on
          my newest message until someone loads it, Seen by … on the newest
          message anyone has loaded. Never per-message, never checkmarks. */}
      {receipt && (
        <span className="text-[10px] font-semibold text-white/45 leading-none px-1">
          {receipt.kind === 'seen' && receipt.names?.length > 0
            ? `Seen by ${receipt.names.slice(0, 3).join(', ')}${receipt.names.length > 3 ? ` +${receipt.names.length - 3}` : ''}`
            : 'Sent'}
        </span>
      )}
    </div>
  );
}

// Autogrowing composer (T9): grows to 5 lines, Enter sends,
// Shift+Enter breaks. Draft lives in the parent (survives tab switches,
// reloads via the room's draft cache). focusKey nudges the keyboard open
// whenever a reply starts (friend: answer writes immediately).
// Paste / drag-drop (P6.31): a screenshot pasted or a file dropped onto
// the composer lands in a preview strip (thumbnail + remove + Send).
// Single file MVP, image/* only; send reuses the photo upload path with
// the active reply attached. `compact` shrinks the buttons for the 320px
// floating panel; the input is unchanged.
function Composer({ nickname, muted, input, setInput, replyTo, setReplyTo, onSend, onSendGif, onSendPhoto, focusKey, photoBusy, compact }) {
  const [gifOpen, setGifOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const areaRef = useRef(null);
  const photoRef = useRef(null);
  const pendingUrlRef = useRef('');
  const fit = () => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const line = 22;
    el.style.height = `${Math.min(el.scrollHeight, line * 5)}px`;
  };
  useEffect(() => {
    if (!input) {
      const el = areaRef.current;
      if (el) el.style.height = 'auto';
    }
  }, [input]);
  useEffect(() => {
    if (focusKey > 0) areaRef.current?.focus?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);
  // Object URLs die with the composer so pastes never leak.
  useEffect(() => () => {
    if (pendingUrlRef.current) {
      try {
        URL.revokeObjectURL(pendingUrlRef.current);
      } catch {
        // already gone
      }
    }
  }, []);
  const clearPending = () => {
    if (pendingUrlRef.current) {
      try {
        URL.revokeObjectURL(pendingUrlRef.current);
      } catch {
        // already gone
      }
      pendingUrlRef.current = '';
    }
    setPending(null);
  };
  const pickFile = (f) => {
    if (!f || photoBusy) return;
    const url = objectUrlFor(f);
    if (!url) return;
    clearPending();
    pendingUrlRef.current = url;
    setPending({ file: f, url });
  };
  const sendPending = () => {
    if (!pending || photoBusy) return;
    const file = pending.file;
    clearPending();
    onSendPhoto?.(file, replyTo);
    setReplyTo(null);
  };
  const firstImage = (list) => Array.from(list || []).find((f) => f?.type?.startsWith('image/')) || null;
  const objectUrlFor = (f) => {
    try {
      return URL.createObjectURL(f);
    } catch {
      return null;
    }
  };
  if (muted) {
    return (
      <div className="p-3 border-t border-[var(--cine-glass-border)] flex-shrink-0">
        <p className="text-center text-[11px] text-white/40">The host muted your chat.</p>
      </div>
    );
  }
  const send = () => {
    const text = input.trim().slice(0, 500);
    if (text) {
      onSend(text, replyTo);
      setReplyTo(null);
      return;
    }
    // Empty input with a staged photo: the send button sends the photo.
    if (pending) sendPending();
  };
  const gifBtn = compact ? 'h-9 px-3 text-[11px]' : 'h-11 px-4 text-xs';
  const sendBtn = compact ? 'w-9 h-9' : 'w-11 h-11';
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = firstImage(e.dataTransfer?.files);
        if (f) pickFile(f);
      }}
      className={`p-3 border-t border-[var(--cine-glass-border)] flex-shrink-0 relative${dragOver ? ' ring-2 ring-white/60 rounded-b-2xl' : ''}`}
    >
      {gifOpen && (
        <GifPicker
          compact={compact}
          onPick={(g) => {
            setGifOpen(false);
            onSendGif(g.url, g.preview, replyTo);
            setReplyTo(null);
          }}
          onClose={() => setGifOpen(false)}
        />
      )}
      {replyTo && (
        <div className="cine-reply-strip">
          <div className="min-w-0 flex-1">
            <p className="cine-reply-strip-name" style={{ color: nameColor(replyTo.name) }}>
              Replying to {replyTo.name}
            </p>
            <p className="cine-reply-strip-text">
              {replyTo.kind === 'gif' ? 'GIF' : replyTo.text || ''}
            </p>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="cine-icon-btn cine-icon-btn--xs flex-shrink-0"
            aria-label="Cancel reply"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {pending && (
        <div className="flex items-center gap-2 mb-2 rounded-2xl border border-white/15 bg-white/5 p-2" aria-label="Photo ready to send">
          <img
            src={pending.url}
            alt="Photo to send"
            className="h-16 w-16 rounded-xl object-cover border border-white/15 flex-shrink-0"
          />
          <span className="min-w-0 flex-1 text-[11px] text-white/60 truncate">
            {(pending.file.name || 'Photo').slice(0, 60)}
          </span>
          <button
            onClick={clearPending}
            className="cine-icon-btn cine-icon-btn--xs flex-shrink-0"
            aria-label="Remove photo"
          >
            <X className="w-3 h-3" />
          </button>
          <button
            onClick={sendPending}
            disabled={photoBusy}
            className="cine-pill cine-pill--sm flex-shrink-0 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <textarea
            ref={areaRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              fit();
            }}
            onPaste={(e) => {
              const f = firstImage(e.clipboardData?.files);
              if (!f) return;
              e.preventDefault();
              pickFile(f);
            }}
            placeholder="Send message"
            aria-label={nickname ? `Send message as ${nickname}` : 'Send message'}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            className="cine-input cine-chat-textarea"
          />
        </div>
        <button
          onClick={() => setGifOpen((o) => !o)}

          aria-label="Send a GIF"
          aria-pressed={gifOpen}
          className={`cine-control-btn flex-shrink-0 ${gifBtn}${gifOpen ? ' cine-pill--active' : ''}`}
        >
          GIF
        </button>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          aria-hidden="true"
          tabIndex={-1}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onSendPhoto?.(f, replyTo);
            setReplyTo(null);
          }}
        />
        <button
          onClick={() => photoRef.current?.click()}
          disabled={photoBusy}
          aria-label="Send a photo"
          className={`cine-control-btn flex-shrink-0 ${gifBtn} disabled:opacity-50`}
        >
          <ImagePlus className="w-4 h-4" />
        </button>
        <button onClick={send} className={`flex-shrink-0 ${sendBtn} rounded-full bg-white text-black flex items-center justify-center hover:bg-[#f2f2f5] active:scale-95 transition`} aria-label="Send message">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// One chat pane: pinned-aware list (T4 — arrivals only move you when you
// were already at the bottom, otherwise a ↓ N pill (T8) appears),
// Telegram receipts, replies, edits, tombstones.
export function ChatView({
  messages,
  reactions,
  myDevice,
  isHost,
  nickname,
  input,
  setInput,
  muted,
  onSend,
  onSendGif,
  onSendPhoto,
  photoBusy,
  onToggleReact,
  receipts,
  replyTo,
  setReplyTo,
  onEdit,
  onDeleteRequest,
  compact,
}) {
  const scrollerRef = useRef(null);
  const pinnedRef = useRef(true);
  const lenRef = useRef(0);
  const [newCount, setNewCount] = useState(0);
  // Reply-to-write focus: selecting a reply bumps the key, the composer
  // opens the keyboard at once (no second tap into the input).
  const [focusKey, setFocusKey] = useState(0);
  // Full-photo viewer (actors-page pattern): tap a photo message to open.
  const [viewingPhoto, setViewingPhoto] = useState(null);
  useEffect(() => {
    if (!viewingPhoto) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setViewingPhoto(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewingPhoto]);

  const scrollToEnd = (smooth) => {
    const el = scrollerRef.current;
    if (!el) return;
    try {
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    } catch {
      el.scrollTop = el.scrollHeight;
    }
  };

  // Arrivals: pinned → stay glued; scrolled up → pill (never yanked).
  // Length-gated so edits/deletes/reactions (same length) never move you.
  useEffect(() => {
    const prev = lenRef.current;
    lenRef.current = messages.length;
    if (messages.length <= prev) return;
    const fresh = messages.slice(prev).filter((m) => !m.sys && !m.mine).length;
    if (pinnedRef.current) {
      scrollToEnd(false);
      setNewCount(0);
    } else if (fresh > 0) {
      setNewCount((c) => c + fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
    pinnedRef.current = near;
    if (near) setNewCount(0);
  };

  const jumpToLatest = () => {
    pinnedRef.current = true;
    setNewCount(0);
    scrollToEnd(true);
  };

  const jumpToMessage = (id) => {
    if (!id) return;
    try {
      const el = scrollerRef.current?.querySelector(`[data-mid="${id}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Highlight flash so the jumped-to message stands out among rest.
      el.classList.remove('cine-flash');
      requestAnimationFrame(() => {
        try {
          el.classList.add('cine-flash');
          setTimeout(() => el.classList.remove('cine-flash'), 1700);
        } catch {
          // gone — stay put
        }
      });
    } catch {
      // gone (tombstoned/capped) — stay put
    }
  };

  const startReply = (m) => {
    setReplyTo(
      m ? { id: m.id, name: m.name, text: (m.text || '').slice(0, 140), kind: m.kind || 'text' } : null
    );
    if (m) setFocusKey((k) => k + 1);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col relative">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0"
      >
        {messages.length === 0 && (
          <p className="text-center text-[11px] text-white/40 pt-6">
            Say hi. Chat lives only while the room is open.
          </p>
        )}
        {messages.map((m) => (
          <ChatMessage
            key={m.id}
            m={m}
            reactions={reactions}
            myDevice={myDevice}
            canModerate={isHost}
            onToggleReact={onToggleReact}
            receipt={receipts?.[m.id] || null}
            onReply={startReply}
            onEdit={onEdit}
            onDeleteRequest={onDeleteRequest}
            onJump={jumpToMessage}
            onViewPhoto={(url, title) => setViewingPhoto({ url, title })}
            compact={compact}
          />
        ))}
      </div>
      {newCount > 0 && (
        <button onClick={jumpToLatest} className="cine-chat-jump" aria-label={`Jump to ${newCount} new messages`}>
          <ChevronDown className="w-3.5 h-3.5" />
          {newCount} new
        </button>
      )}
      <Composer
        nickname={nickname}
        muted={muted}
        input={input}
        setInput={setInput}
        replyTo={replyTo}
        setReplyTo={setReplyTo}
        onSend={onSend}
        onSendGif={onSendGif}
        onSendPhoto={onSendPhoto}
        photoBusy={photoBusy}
        focusKey={focusKey}
        compact={compact}
      />
      {/* Full-photo viewer */}
      {viewingPhoto && (
        <div
          onClick={() => setViewingPhoto(null)}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-md p-6 animate-in fade-in duration-200 cursor-zoom-out"
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
        >
          <button
            onClick={() => setViewingPhoto(null)}
            className="cine-icon-btn absolute top-5 right-5"
            aria-label="Close photo viewer"
          >
            <X className="w-4 h-4" />
          </button>
          <img
            src={viewingPhoto.url}
            alt={viewingPhoto.title || 'Photo'}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-full w-auto rounded-3xl border border-[var(--cine-glass-border)] shadow-2xl object-contain cursor-default"
          />
        </div>
      )}
    </div>
  );
}

// Floating chat panel for fullscreen: the same ChatView as the side rail,
// so both can never diverge. Used by the embed Player and the YouTube room
// player alike — the panel lives inside the fullscreen element. Player
// passes its legacy floatEndRef/seenInfo through — both are inert now (the
// pane owns its scroll and receipts), keeping Player.jsx untouched.
// P6.35: the panel drags by its header and resizes from one corner
// handle (bottom-left, clear of the composer send button), pointer
// events cover mouse + touch. Position clamps to the player container
// so it can't be lost off-screen; size clamps w 260-560 / h 320-90vh.
// Geometry persists per device (localStorage), which is also what
// restores it across close/reopen (the panel unmounts when closed).
const FLOAT_SIZE_KEY = 'mz_float_chat_size';
const FLOAT_POS_KEY = 'mz_float_chat_pos';
const FLOAT_MIN_W = 260;
const FLOAT_MAX_W = 560;
const FLOAT_MIN_H = 320;

const clampNum = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function loadFloatSize() {
  try {
    const raw = JSON.parse(localStorage.getItem(FLOAT_SIZE_KEY) || 'null');
    if (!raw) return null;
    const h = Number(raw.h);
    if (!Number.isFinite(h) || h < FLOAT_MIN_H) return null;
    return {
      w: clampNum(Number(raw.w) || 320, FLOAT_MIN_W, FLOAT_MAX_W),
      h: Math.min(h, window.innerHeight * 0.9),
    };
  } catch {
    return null;
  }
}

function loadFloatPos() {
  try {
    const raw = JSON.parse(localStorage.getItem(FLOAT_POS_KEY) || 'null');
    if (!raw) return null;
    const x = Number(raw.x);
    const y = Number(raw.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      x: clampNum(x, 0, Math.max(0, window.innerWidth - 120)),
      y: clampNum(y, 0, Math.max(0, window.innerHeight - 80)),
    };
  } catch {
    return null;
  }
}
export function FloatingRoomChat({
  open,
  onToggle,
  messages,
  reactions,
  myDevice,
  isHost,
  nickname,
  input,
  setInput,
  muted,
  onSend,
  onSendGif,
  onSendPhoto,
  photoBusy,
  onToggleReact,
  receipts,
  replyTo,
  setReplyTo,
  onEdit,
  onDeleteRequest,
}) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState(loadFloatPos);
  const [size, setSize] = useState(loadFloatSize);
  const dragRef = useRef(null);
  // A stored position without a stored size is stale — re-dock instead
  // of rendering an unconstrained panel.
  const docked = !pos || !size;
  // Drag state is plain data (never functions): every read/write below
  // happens in pointer handlers, and React drops the handlers on unmount,
  // so there is nothing to unregister. Pointer capture (guarded — synthetic
  // probe events have no active pointer to capture) keeps the gesture on
  // the surface for mouse + touch alike.
  const onDragMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const host = panelRef.current?.offsetParent;
    const bw = host?.clientWidth || window.innerWidth;
    const bh = host?.clientHeight || window.innerHeight;
    if (d.mode === 'move') {
      const p = {
        x: clampNum(d.ax + e.clientX - d.sx, 0, Math.max(0, bw - 120)),
        y: clampNum(d.ay + e.clientY - d.sy, 0, Math.max(0, bh - 80)),
      };
      d.pos = p;
      setPos(p);
    } else {
      // Bottom-left handle: the right edge stays fixed, the top stays
      // fixed, the panel grows left and down.
      const w = clampNum(d.ow - (e.clientX - d.sx), FLOAT_MIN_W, Math.min(FLOAT_MAX_W, bw));
      const hMax = Math.max(FLOAT_MIN_H, Math.min(bh - d.ay, window.innerHeight * 0.9));
      const h = clampNum(d.oh + (e.clientY - d.sy), FLOAT_MIN_H, hMax);
      const p = {
        x: clampNum(d.ax + d.ow - w, 0, Math.max(0, bw - 120)),
        y: d.ay,
      };
      const s = { w, h };
      d.pos = p;
      d.size = s;
      setPos(p);
      setSize(s);
    }
  };
  const onDragEnd = () => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    try {
      if (d.pos) localStorage.setItem(FLOAT_POS_KEY, JSON.stringify(d.pos));
      if (d.size) localStorage.setItem(FLOAT_SIZE_KEY, JSON.stringify(d.size));
    } catch {
      // private mode — session only (same rule as GIF favorites)
    }
  };
  const beginDrag = (e, mode) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = panelRef.current;
    if (!el || dragRef.current) return;
    e.preventDefault();
    // Adopt the live rect so a first drag never jumps: docked placement
    // becomes explicit left/top/width/height from here on. Measured live
    // at gesture time via getBoundingClientRect (not a thumb measurer —
    // no font-drift class, so no fonts.ready re-measure is owed).
    const r = el.getBoundingClientRect();
    const host = el.offsetParent?.getBoundingClientRect();
    const ax = r.left - (host?.left ?? 0);
    const ay = r.top - (host?.top ?? 0);
    dragRef.current = {
      mode,
      sx: e.clientX,
      sy: e.clientY,
      ax,
      ay,
      ow: r.width,
      oh: r.height,
      pos: null,
      size: null,
    };
    if (!pos) setPos({ x: ax, y: ay });
    if (!size) setSize({ w: r.width, h: r.height });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // synthetic events (probes/tests) have no active pointer to capture
    }
  };
  const onHeaderPointerDown = (e) => {
    // The header holds the close button — its taps must stay clicks.
    if (e.target.closest?.('button')) return;
    beginDrag(e, 'move');
  };
  const onHandlePointerDown = (e) => beginDrag(e, 'resize');
  if (!open) return null;
  return (
    <div
      ref={panelRef}
      aria-label="Room chat panel"
      className={`absolute z-40 rounded-2xl cine-glass-panel flex flex-col overflow-hidden${docked ? ' right-3 top-24 bottom-24' : ''}`}
      style={docked
        ? { width: 320, maxWidth: '80vw' }
        : { left: pos.x, top: pos.y, width: size.w, height: size.h, maxWidth: '80vw' }}
    >
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        className="flex items-center justify-between px-3 py-2 border-b border-[var(--cine-glass-border)] flex-shrink-0 cursor-move touch-none select-none"
      >
        <p className="text-xs font-bold text-white">Room chat</p>
        <button
          onClick={onToggle}
          className="cine-icon-btn"
          aria-label="Close room chat"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <ChatView
        messages={messages}
        reactions={reactions}
        myDevice={myDevice}
        isHost={isHost}
        nickname={nickname}
        input={input}
        setInput={setInput}
        muted={muted}
        onSend={onSend}
        onSendGif={onSendGif}
        onSendPhoto={onSendPhoto}
        photoBusy={photoBusy}
        onToggleReact={onToggleReact}
        receipts={receipts}
        replyTo={replyTo}
        setReplyTo={setReplyTo}
        onEdit={onEdit}
        onDeleteRequest={onDeleteRequest}
        compact
      />
      {/* Resize corner, bottom-left only (one handle, not all edges):
          the composer send button owns the bottom-right. Diagonal grip,
          pointer events like the header (mouse + touch). */}
      <div
        onPointerDown={onHandlePointerDown}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        role="separator"
        aria-label="Resize chat panel"
        className="absolute left-1.5 bottom-1.5 z-50 h-4 w-4 cursor-nesw-resize touch-none rounded-sm opacity-50 hover:opacity-100"
        style={{ background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.65) 0 2px, transparent 2px 5px)' }}
      />
    </div>
  );
}
