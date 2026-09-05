import React from 'react';

/**
 * Shared Chip component — for genres, ratings, media types, etc.
 * Variants:
 *   - "accent"   → lime green background (rating, accent)
 *   - "neutral"  → glass background (genre, metadata)
 *   - "solid"    → solid color background
 */
export default function Chip({
  children,
  variant = 'neutral',
  size = 'sm',
  interactive = false,
  selected = false,
  onClick,
  className = '',
}) {
  const sizeClasses = {
    xs: 'px-2 py-0.5 text-[10px]',
    sm: 'px-2.5 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
  };

  const variantClasses = {
    accent: 'cine-chip cine-chip--accent',
    neutral: 'cine-chip cine-chip--neutral',
    solid: 'cine-chip',
  };

  let classes = `${sizeClasses[size] || sizeClasses.sm} ${variantClasses[variant] || variantClasses.neutral}`;

  if (interactive) {
    classes += selected
      ? ' bg-white text-black font-bold border-white/30'
      : ' hover:bg-white/10 hover:text-white';
  }

  if (onClick) {
    classes += ' cursor-pointer';
  }

  return (
    <span
      onClick={onClick}
      className={`${classes} ${className}`}
    >
      {children}
    </span>
  );
}
