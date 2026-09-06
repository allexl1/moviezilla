import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

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
