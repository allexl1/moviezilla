import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Apply the saved power preference before first paint (no flash of motion).
try {
  if (localStorage.getItem('mz_low_power') === '1') {
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
