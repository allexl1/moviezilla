import { useState, useRef } from 'react';
import { Send, Smile, X } from 'lucide-react';
import Emoji, { RichText } from './ui/Emoji';
import { QUICK_REACTIONS } from '../services/emoji';
import GifPicker from './GifPicker';
import { nameColor } from '../services/rooms';

// Shared room-chat primitives: message bubbles (text/gif + Telegram-style
// reactions), scroll list, and input row. Used by the side rail AND the
// fullscreen floating panel so both can never diverge.

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
            title={(v.names || []).join(', ') || emoji}
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

export function ChatMessage({ m, reactions, myDevice, onToggleReact, seenInfo }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // Picker opens AWAY from the nearest clipped edge (iMessage/Telegram
  // rule): above by default, below when the message sits at the top of
  // the list where an above-picker would slip under the header unseen.
  const [pickerBelow, setPickerBelow] = useState(false);
  const msgRef = useRef(null);
  const togglePicker = () => {
    if (!pickerOpen && msgRef.current) {
      try {
        const scroller = msgRef.current.closest('.overflow-y-auto');
        const r = msgRef.current.getBoundingClientRect();
        const top = scroller ? scroller.getBoundingClientRect().top : 0;
        setPickerBelow(r.top - top < 120);
      } catch {
        setPickerBelow(false);
      }
    }
    setPickerOpen((o) => !o);
  };
  if (m.sys) {
    return (
      <p className="text-center text-[11px] text-white/40">
        {m.text}
      </p>
    );
  }
  const mine = !!m.mine;
  const sentAt = m.at
    ? new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  return (
    <div ref={msgRef} className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'} group/msg relative`}>
      <span className="text-[11px] font-bold" style={{ color: nameColor(m.name) }}>
        {m.name}
      </span>
      <div className="relative max-w-[85%]">
        {m.kind === 'gif' ? (
          <>
            <img
              src={m.preview || m.url}
              alt={m.title || 'GIF'}
              loading="lazy"
              decoding="async"
              className="max-h-48 rounded-2xl border border-white/10 object-cover"
            />
            {sentAt && (
              <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] tabular-nums text-white pointer-events-none">
                {sentAt}
              </span>
            )}
          </>
        ) : (
          <span
            className={`msg-text block px-3.5 py-2 rounded-2xl leading-[1.45] break-words ${
              mine ? 'bg-white text-black rounded-br-md' : 'bg-white/[0.08] text-white/90 border border-white/10 rounded-bl-md'
            }`}
          >
            <RichText text={m.text} />
            {/* Messenger-style: the clock lives inside the bubble at the
                end of the last line, dimmed via inherited color. */}
            {sentAt && (
              <span className="ml-2 inline-block translate-y-[3px] text-[10px] font-medium tabular-nums opacity-60">
                {sentAt}
              </span>
            )}
          </span>
        )}
        <button
          onClick={togglePicker}
          title="React"
          aria-label="React to message"
          aria-expanded={pickerOpen}
          className={`cine-icon-btn cine-icon-btn--xs absolute top-1/2 -translate-y-1/2 opacity-60 md:opacity-0 md:group-hover/msg:opacity-100 focus:opacity-100 ${
            mine ? '-left-8' : '-right-8'
          }`}
        >
          <Smile className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* Reaction picker floats AWAY from the clipped edge (see togglePicker):
          below the message at the top of the list, above everywhere else. */}
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
              title={emoji}
              aria-label={`React ${emoji}`}
              className="w-7 h-7 rounded-full hover:bg-white/15 transition cursor-pointer flex items-center justify-center"
            >
              <Emoji char={emoji} size={18} />
            </button>
          ))}
        </div>
      )}
      <ReactionChips msgId={m.id} forMsg={reactions?.[m.id]} myDevice={myDevice} onToggleReact={onToggleReact} />
      {/* X-style read receipt: presence-based, shown only on the newest
          message the other side has loaded — never checkmarks, and never
          under your own messages (their author obviously saw them). */}
      {seenInfo?.msgId === m.id && (seenInfo.names?.length || 0) > 0 && (
        <span className="text-[10px] font-semibold text-white/45 leading-none px-1">
          Seen by {seenInfo.names.slice(0, 3).join(', ')}
          {seenInfo.names.length > 3 ? ` +${seenInfo.names.length - 3}` : ''}
        </span>
      )}
    </div>
  );
}

export function ChatList({ messages, reactions, myDevice, onToggleReact, endRef, seenInfo }) {
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
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
          onToggleReact={onToggleReact}
          seenInfo={seenInfo}
        />
      ))}
      <div ref={endRef} />
    </div>
  );
}

// Floating chat panel for fullscreen: same conversation as the side rail,
// so both can never diverge. Used by the embed Player and the YouTube
// room player alike — the panel lives inside the fullscreen element.
export function FloatingRoomChat({
  open,
  onToggle,
  messages,
  reactions,
  myDevice,
  nickname,
  input,
  setInput,
  muted,
  onSend,
  onSendGif,
  onToggleReact,
  endRef,
  seenInfo,
}) {
  if (!open) return null;
  return (
    <div className="absolute right-3 top-24 bottom-24 z-40 w-[320px] max-w-[80vw] rounded-2xl cine-glass-panel flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--cine-glass-border)] flex-shrink-0">
        <p className="text-xs font-bold text-white">Room chat</p>
        <button
          onClick={onToggle}
          className="cine-icon-btn cine-icon-btn--sm"
          title="Close chat"
          aria-label="Close room chat"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <ChatList
        messages={messages}
        reactions={reactions}
        myDevice={myDevice}
        onToggleReact={onToggleReact}
        endRef={endRef}
        seenInfo={seenInfo}
      />
      <ChatInput
        nickname={nickname}
        muted={muted}
        input={input}
        setInput={setInput}
        onSend={onSend}
        onSendGif={onSendGif}
      />
    </div>
  );
}

export function ChatInput({ nickname, muted, input, setInput, onSend, onSendGif }) {
  const [gifOpen, setGifOpen] = useState(false);
  if (muted) {
    return (
      <div className="p-3 border-t border-[var(--cine-glass-border)] flex-shrink-0">
        <p className="text-center text-[11px] text-white/40">The host muted your chat.</p>
      </div>
    );
  }
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
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Message as ${nickname}…`}
            aria-label="Chat message"
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSend();
            }}
            className="cine-input"
          />
        </div>
        <button
          onClick={() => setGifOpen((o) => !o)}
          title="Send a GIF"
          aria-label="Send a GIF"
          aria-pressed={gifOpen}
          className={`cine-pill cine-pill--sm${gifOpen ? ' cine-pill--active' : ''}`}
        >
          GIF
        </button>
        <button onClick={onSend} className="cine-icon-btn" title="Send" aria-label="Send message">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
