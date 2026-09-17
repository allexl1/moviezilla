import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Chromium-only refraction upgrade (real liquid glass): the #lg-dist SVG
// displacement filter only refracts inside backdrop-filter on Chromium.
// Firefox parses url() as valid but renders nothing, Safari has no support
// at all — so this is UA-gated, never @supports-gated. Everyone else keeps
// the frost scaffold, which is the shipped look.
try {
  const ua = navigator.userAgent || '';
  const isChromium =
    /Chrom(e|ium)\//.test(ua) && !/Firefox\/|FxiOS\//.test(ua);
  if (
    isChromium &&
    window.CSS &&
    CSS.supports &&
    CSS.supports('backdrop-filter', 'blur(1px)')
  ) {
    document.body.classList.add('mz-refract');
  }
} catch {
  // Frost everywhere — no enhancement, no breakage.
}

// Apply the saved power preference before first paint (no flash of motion).
try {
  const v = localStorage.getItem('mz_low_power');
  if (v === '2') {
    document.body.classList.add('mz-max-power');
  } else if (v === '1') {
    document.body.classList.add('mz-low-power');
  }
} catch {
  // Storage unavailable — motion stays on.
}

// Apply saved prefs before first paint (no flash): accent + chat size.
try {
  const accent = localStorage.getItem('mz_accent');
  if (accent && /^#[0-9a-f]{6}$/i.test(accent)) {
    const n = parseInt(accent.slice(1), 16);
    const lift = (c) => Math.min(255, Math.round(c + (255 - c) * 0.12));
    const hover = `#${((1 << 24) + (lift(n >> 16 & 255) << 16) + (lift(n >> 8 & 255) << 8) + lift(n & 255)).toString(16).slice(1)}`;
    document.documentElement.style.setProperty('--cine-accent', accent);
    document.documentElement.style.setProperty('--cine-accent-hover', hover);
  }
  const size = Number(localStorage.getItem('mz_chat_size'));
  if (Number.isFinite(size) && size >= 13 && size <= 19) {
    document.body.style.setProperty('--mz-chat-size', `${size}px`);
  }
} catch {
  // Storage unavailable — defaults stand.
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
