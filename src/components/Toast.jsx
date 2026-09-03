import React, { useEffect } from 'react';

export default function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#14141cf0] border border-white/15 backdrop-blur-2xl shadow-[0_12px_40px_rgba(0,0,0,0.8)] text-xs font-semibold text-white">
        <span
          className={`w-2 h-2 rounded-full ${
            type === 'error' ? 'bg-red-400' : type === 'success' ? 'bg-[#95ff50]' : 'bg-blue-400'
          }`}
        />
        <span>{message}</span>
      </div>
    </div>
  );
}
