import React from 'react';

/**
 * Shared Button component — replaces all ad-hoc button implementations.
 * Variants:
 *   - "primary"   → white bg, black text (main CTA)
 *   - "accent"    → lime green bg, black text (alternate CTA)
 *   - "ghost"     → transparent with glass border
 *   - "icon"      → circular icon-only button
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon = false,
  onClick,
  title = '',
  disabled = false,
  className = '',
  ...props
}) {
  const sizeMap = {
    sm: 'h-10 px-5 text-xs',
    md: 'h-11 px-6 text-sm',
    lg: 'cine-cta',
  };

  const baseClass = 'cine-btn';

  let variantClass = '';
  let extraClass = sizeMap[size] || sizeMap.md;

  if (icon) {
    extraClass = 'w-10 h-10 text-base';
    variantClass = 'cine-btn-circle';
  } else {
    switch (variant) {
      case 'primary':
        variantClass = 'cine-btn-primary';
        break;
      case 'accent':
        variantClass = 'cine-btn-accent';
        break;
      case 'ghost':
        variantClass = 'cine-btn-ghost';
        break;
      default:
        variantClass = 'cine-btn-primary';
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`${baseClass} ${variantClass} ${extraClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
