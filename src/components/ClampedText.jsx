import { useState, useEffect, useRef } from 'react';

// ClampedText — 3-line clamp with an honest toggle: Read More renders only
// when the text actually overflows (length heuristics lie on wide
// screens where 200 chars still fit). Used by detail overviews and
// person bios.
export default function ClampedText({ text, className = 'text-sm leading-relaxed text-white/70' }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      try {
        setOverflows(el.scrollHeight > el.clientHeight + 1);
      } catch {
        // ignore
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [text, expanded]);

  return (
    <>
      <p ref={ref} className={`${className} ${expanded ? '' : 'line-clamp-3'}`}>
        {text}
      </p>
      {overflows && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-xs font-semibold text-white/50 hover:text-white mt-1 transition cursor-pointer"
        >
          {expanded ? 'Show Less' : 'Read More'}
        </button>
      )}
    </>
  );
}
