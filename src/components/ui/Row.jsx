import { FALLBACK_POSTER } from '../../services/tmdb';

/**
 * Row — glass list row (search results, history, menus).
 * Thumb + title + meta + right slot. One recipe everywhere.
 * Optional `wash` (image URL): a blurred poster wash behind the content.
 * Plain opacity layer only — never backdrop-filter (nested blurs glitch
 * white on Intel iGPUs, see .mat-row).
 */
export default function Row({
  poster,
  title,
  meta,
  right,
  onClick,
  thumbClassName = 'w-12 h-16',
  titleClassName = 'text-xs md:text-sm font-semibold text-white/90 truncate',
  wash = null,
}) {
  return (
    <div
      onClick={onClick}
      className="mat-row relative flex items-center gap-4 p-2.5 transition cursor-pointer group overflow-hidden"
    >
      {wash && (
        <img
          src={wash}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="cine-row-wash"
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
      )}
      <div className={`${thumbClassName} rounded-xl overflow-hidden bg-black/50 flex-shrink-0`}>
        <img
          src={poster}
          alt={title}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover group-hover:scale-105 transition"
          onError={(e) => {
            e.target.src = FALLBACK_POSTER;
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className={titleClassName}>{title}</h4>
        {meta && <p className="text-[11px] text-white/60 mt-0.5 truncate">{meta}</p>}
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
  );
}
