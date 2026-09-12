// Pure emoji helpers (no components — react-refresh requires components
// and utilities to live in separate files).

// U+FE0F (variation selector) is stripped: Noto filenames omit it
// (❤️ U+2764 U+FE0F → emoji_u2764.png).
export function codepointsOf(emoji) {
  const cps = [];
  for (const ch of String(emoji)) {
    const cp = ch.codePointAt(0);
    if (cp === 0xfe0f) continue;
    cps.push(cp.toString(16));
  }
  return cps.join('_');
}

export function notoUrl(emoji) {
  const cps = codepointsOf(emoji);
  if (!cps) return null;
  return `https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@main/png/128/emoji_u${cps}.png`;
}

// Single emoji cluster (ZWJ sequences, modifiers, flags, keycaps).
const EMOJI_UNIT =
  '(?:\\u00a9|\\u00ae|[\\u2000-\\u3300]|\\ud83c[\\ud000-\\udfff]|\\ud83d[\\ud000-\\udfff]|\\ud83e[\\ud000-\\udfff])(?:\\u200d(?:\\u00a9|\\u00ae|[\\u2000-\\u3300]|\\ud83c[\\ud000-\\udfff]|\\ud83d[\\ud000-\\udfff]|\\ud83e[\\ud000-\\udfff]))*[\\ufe0f\\u200d]?';

// Telegram-style quick reaction set (their default row order, plus the
// two requested extras: snowman and whale are both in Telegram's set).
export const QUICK_REACTIONS = ['👍', '❤️', '🔥', '🎉', '😁', '👏', '😱', '👎', '☃️', '🐳'];

// Splits text into plain/emoji segments for rendering. Fresh regexes per
// call — global-flag regexes are stateful and must never be shared.
export function splitEmojiParts(text) {
  const s = String(text || '');
  const parts = s.split(new RegExp(`(${EMOJI_UNIT})`, 'g'));
  if (parts.length <= 1) return null;
  const isEmoji = new RegExp(`^(?:${EMOJI_UNIT})$`);
  return parts.map((p) => ({ text: p, emoji: p !== '' && isEmoji.test(p) }));
}
