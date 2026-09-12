import { useState } from 'react';
import { Send, Smile } from 'lucide-react';
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
            className={`inline-flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded-full text-[11px] font-bold border transition cursor-pointer ${
              mine
                ? 'bg-[var(--cine-accent)]/15 border-[var(--cine-accent)]/40 text-white'
                : 'bg-black/50 border-white/15 text-white/80 hover:border-white/30'
            }`}
          >
            <Emoji char={emoji} size={14} />
            <span>{v.devices.length}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ChatMessage({ m, reactions, myDevice, onToggleReact }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  if (m.sys) {
    return (
      <p className="text-center text-[11px] text-white/40">
        {m.text}
      </p>
    );
  }
  const mine = !!m.mine;
  return (
    <div className={`flex flex-col gap-0.5 ${mine ? 'items-end' : 'items-start'} group/msg relative`}>
      <span className="text-[10px] font-bold" style={{ color: nameColor(m.name) }}>
        {m.name}
      </span>
      <div className="relative max-w-[85%]">
        {m.kind === 'gif' ? (
          <img
            src={m.preview || m.url}
            alt={m.title || 'GIF'}
            loading="lazy"
            decoding="async"
            className="max-h-48 rounded-2xl border border-white/10 object-cover"
          />
        ) : (
          <span
            className={`block px-3 py-1.5 rounded-2xl text-[13px] leading-snug break-words ${
              mine ? 'bg-white text-black rounded-br-md' : 'bg-white/[0.08] text-white/90 border border-white/10 rounded-bl-md'
            }`}
          >
            <RichText text={m.text} />
          </span>
        )}
        <button
          onClick={() => setPickerOpen((o) => !o)}
          title="React"
          aria-label="React to message"
          className={`absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/70 border border-white/15 items-center justify-center text-white/70 hover:text-white transition cursor-pointer flex opacity-60 md:opacity-0 md:group-hover/msg:opacity-100 focus:opacity-100 ${
            mine ? '-left-8' : '-right-8'
          }`}
        >
          <Smile className="w-3.5 h-3.5" />
        </button>
      </div>
      {pickerOpen && (
        <div className="flex gap-0.5 p-1 rounded-full bg-black/80 border border-white/15 backdrop-blur-xl">
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
    </div>
  );
}

export function ChatList({ messages, reactions, myDevice, onToggleReact, endRef }) {
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
        />
      ))}
      <div ref={endRef} />
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
          className={`h-10 px-2.5 rounded-xl text-[11px] font-black tracking-wide border transition cursor-pointer flex-shrink-0 ${
            gifOpen
              ? 'bg-[var(--cine-accent)]/15 border-[var(--cine-accent)]/40 text-[var(--cine-accent)]'
              : 'bg-[var(--cine-glass-tint)] border-[var(--cine-glass-border)] text-white/60 hover:text-white'
          }`}
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
