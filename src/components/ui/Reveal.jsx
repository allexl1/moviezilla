import { useEffect, useRef, useState } from 'react';

// One-shot scroll reveal (motion P6): sections rise subtly the first
// time they enter the viewport, then stay put — never on scroll-back,
// never parallax. Content renders visible when IntersectionObserver is
// missing so nothing can strand hidden; reduced-motion shows everything
// instantly via CSS. Rooms lobby first; other screens keep their
// existing entrances until their round.
export default function Reveal({ children, className = '', as: Tag = 'div', ...rest }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            setSeen(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref}
      className={`mz-reveal${seen ? ' is-visible' : ''}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
