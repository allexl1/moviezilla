import { useState, Fragment } from 'react';
import { notoUrl, splitEmojiParts } from '../../services/emoji';

// Cross-platform emoji rendering (Telegram move): everyone sees identical
// glyphs regardless of OS. Uses Noto Color Emoji PNGs (Google, OFL — the
// closest open set to the Apple look) from CDN, with native-char fallback
// if a glyph is missing/offline. Apple's own artwork is proprietary and
// cannot be bundled — Noto is the nearest legal match.

export default function Emoji({ char, size = 18, className = '' }) {
  const [failed, setFailed] = useState(false);
  const url = notoUrl(char);
  if (!url || failed) {
    return (
      <span className={className} style={{ fontSize: size, lineHeight: 1 }}>
        {char}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={char}
      aria-hidden="true"
      draggable={false}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={className}
      style={{ width: size, height: size, display: 'inline-block', verticalAlign: '-0.15em' }}
      onError={() => setFailed(true)}
    />
  );
}

// Renders chat text with emoji swapped for identical-everywhere images.
// Plain text segments pass through untouched.
export function RichText({ text, emojiSize = 17 }) {
  const parts = splitEmojiParts(text);
  if (!parts) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        p.emoji ? (
          <Emoji key={i} char={p.text} size={emojiSize} />
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        )
      )}
    </>
  );
}
