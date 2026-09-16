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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
