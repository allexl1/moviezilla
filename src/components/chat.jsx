import { useState, useEffect, useRef } from 'react';
import { Send, Smile, X, Pencil, Trash2, CornerUpLeft, ChevronDown, MoreHorizontal } from 'lucide-react';
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
        {reply.kind === 'gif' ? 'GIF' : reply.text || ''}
      </span>
    </button>
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
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.text || '');
  // One anchor, two surfaces (B6/B7): the … menu and the emoji picker share
  // placement and are NEVER open together. Right click opens the menu
  // directly. Default is BELOW the message (asks); only near the list
  // bottom do they flip above to escape the scroller clip.
  const [menuOpen, setMenuOpen] = useState(false);
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
  const togglePicker = () => {
    if (!pickerOpen) setPickerBelow(placeBelow());
    setPickerOpen((o) => !o);
    setMenuOpen(false);
  };
  const toggleMenu = () => {
    if (!menuOpen) setPickerBelow(placeBelow());
    setMenuOpen((o) => !o);
    setPickerOpen(false);
  };
  // Tap-anywhere dismissal: an open menu/picker closes when the pointer
  // lands outside this message (it opens on right click, so it must also
  // close on any other click — a stuck menu is nonsense).
  useEffect(() => {
    if (!menuOpen && !pickerOpen) return;
    const onDown = (e) => {
      if (msgRef.current && !msgRef.current.contains(e.target)) {
        setMenuOpen(false);
        setPickerOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menuOpen, pickerOpen]);
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
        setPickerOpen(false);
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
          <span className={`cine-gif-bubble${mine ? ' cine-gif-bubble--mine' : ''}`}>
            <img
              src={m.preview || m.url}
              alt={m.title || 'GIF'}
              loading="lazy"
              decoding="async"
              className="cine-gif-img"
            />
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
        {/* Hover action (B6): one … button, never four overlapping icons.
            Touch keeps it faintly visible — no hover there. */}
        {!editing && (
          <button
            onClick={toggleMenu}

            aria-label="Message actions"
            aria-expanded={menuOpen}
            className={`absolute top-1/2 -translate-y-1/2 cine-icon-btn cine-icon-btn--xs opacity-60 md:opacity-0 md:group-hover/msg:opacity-100 focus:opacity-100 ${
              mine ? '-left-8' : '-right-8'
            }`}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {/* … menu (B6): Reply / React / Edit / Delete with labels. Shares the
          edge-aware placement with the picker; the two never co-exist. */}
      {menuOpen && !editing && (
        <div
          role="menu"
          aria-label="Message actions"
          className={`absolute z-10 w-44 rounded-2xl cine-glass-panel p-1.5 space-y-0.5 ${mine ? 'right-0' : 'left-0'} ${
            pickerBelow ? 'top-full mt-1.5' : 'bottom-full mb-1.5'
          }`}
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
          <button
            role="menuitem"
            onClick={togglePicker}
            className="cine-msg-menu-item"
          >
            <Smile className="w-3.5 h-3.5" /> React
          </button>
          {mine && m.kind !== 'gif' && (
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
                onDeleteRequest?.(m.id);
              }}
              className="cine-msg-menu-item cine-msg-menu-item--danger"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          )}
        </div>
      )}
      {/* Reaction picker: below the message unless the list bottom is
          near (then it flips above to escape the scroller clip). */}
      {pickerOpen && (
        <div
          role="menu"
          aria-label="Choose a reaction"
          className={`absolute z-10 flex gap-0.5 p-1 rounded-full cine-glass-panel ${mine ? 'right-0' : 'left-0'} ${
            pickerBelow ? 'top-full mt-1.5' : 'bottom-full mb-1.5'
          }`}
        >
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onToggleReact(m.id, emoji);
                setPickerOpen(false);
              }}

              aria-label={`React ${emoji}`}
              className="w-7 h-7 rounded-full hover:bg-white/15 transition cursor-pointer flex items-center justify-center"
            >
              <Emoji char={emoji} size={18} />
            </button>
          ))}
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
// reloads via the room's draft cache).
function Composer({ nickname, muted, input, setInput, replyTo, setReplyTo, onSend, onSendGif }) {
  const [gifOpen, setGifOpen] = useState(false);
  const areaRef = useRef(null);
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
  if (muted) {
    return (
      <div className="p-3 border-t border-[var(--cine-glass-border)] flex-shrink-0">
        <p className="text-center text-[11px] text-white/40">The host muted your chat.</p>
      </div>
    );
  }
  const send = () => {
    const text = input.trim().slice(0, 500);
    if (!text) return;
    onSend(text, replyTo);
    setReplyTo(null);
  };
  return (
    <div className="p-3 border-t border-[var(--cine-glass-border)] flex-shrink-0 relative">
      {gifOpen && (
        <GifPicker
          onPick={(g) => {
            setGifOpen(false);
            onSendGif(g.url, g.preview);
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
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <textarea
            ref={areaRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              fit();
            }}
            placeholder={`Message as ${nickname}…`}
            aria-label="Chat message"
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
          className={`cine-pill cine-pill--sm flex-shrink-0${gifOpen ? ' cine-pill--active' : ''}`}
        >
          GIF
        </button>
        <button onClick={send} className="cine-icon-btn flex-shrink-0" aria-label="Send message">
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
  onToggleReact,
  receipts,
  replyTo,
  setReplyTo,
  onEdit,
  onDeleteRequest,
}) {
  const scrollerRef = useRef(null);
  const pinnedRef = useRef(true);
  const lenRef = useRef(0);
  const [newCount, setNewCount] = useState(0);

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
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {
      // gone (tombstoned/capped) — stay put
    }
  };

  const startReply = (m) => {
    setReplyTo(
      m ? { id: m.id, name: m.name, text: (m.text || '').slice(0, 140), kind: m.kind || 'text' } : null
    );
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
            Say hi — chat lives only while the room is open.
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
      />
    </div>
  );
}

// Floating chat panel for fullscreen: the same ChatView as the side rail,
// so both can never diverge. Used by the embed Player and the YouTube room
// player alike — the panel lives inside the fullscreen element. Player
// passes its legacy floatEndRef/seenInfo through — both are inert now (the
// pane owns its scroll and receipts), keeping Player.jsx untouched.
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
  onToggleReact,
  receipts,
  replyTo,
  setReplyTo,
  onEdit,
  onDeleteRequest,
}) {
  if (!open) return null;
  return (
    <div className="absolute right-3 top-24 bottom-24 z-40 w-[320px] max-w-[80vw] rounded-2xl cine-glass-panel flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--cine-glass-border)] flex-shrink-0">
        <p className="text-xs font-bold text-white">Room chat</p>
        <button
          onClick={onToggle}
          className="cine-icon-btn cine-icon-btn--sm"

          aria-label="Close room chat"
        >
          <X className="w-3.5 h-3.5" />
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
        onToggleReact={onToggleReact}
        receipts={receipts}
        replyTo={replyTo}
        setReplyTo={setReplyTo}
        onEdit={onEdit}
        onDeleteRequest={onDeleteRequest}
      />
    </div>
  );
}
