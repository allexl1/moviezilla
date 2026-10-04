# Moviezilla design direction

Studied references: cinejoy.to (live screenshots, Oct 2026), Apple TV web,
Letterboxd, Apple HIG Materials + WWDC25 sessions 219/356, converged
Netflix patterns. The logic below is theirs, not taste.

## Reference logic

- Cinejoy hero: full-bleed photographic backdrop melting into the page via
  a bottom scrim; official title logo first, text title only as fallback;
  icon meta row (rating, year, genre); 2-line overview; white Play pill +
  glass watchlist/details duo; dots + edge chevrons; 8s rotation.
- Cinejoy rails: poster-only cards bleeding off the right edge; section
  titles carrying inline context ("Movies on Netflix"); provider logo wall
  after the hero; skeleton loaders while fetching.
- Netflix: heavy bottom + side vignette for legibility; artwork fills 80%+
  of the frame; one accent for the single primary action per view; cards
  rounded with clear hover states; generous section rhythm.
- Letterboxd: posters always paired with title context; ratings as quiet
  metadata, never decoration; diary/history framing for watched content.
- Apple Liquid Glass: glass only on the navigation layer floating above
  content, never inside it; no glass-on-glass; tint only primary actions;
  color lives in the content layer; clear-over-media needs a dimming layer
  for legibility; concentric radii; reduced transparency/motion honored.

## Moviezilla rules

Identity: cinematic and alive. Photography carries the brand at full
bleed; official title logos over plain text wherever TMDB has one;
rails sit on plain slate, nothing derived behind them.
Hero: picturesque first. Artwork fully visible, melting into the page
via mask crossfade (never an overlay band, so no seam line). Logo,
icon meta, overview, white Play, watchlist + details duo, dots +
steppers, 8s rotation. Entrance rises with a stagger per slide.
Glassmorphism discipline: one glass recipe (translucent fill + hairline
border + blur + inner top light) for everything that floats over
content: nav, dock, sheets, dropdowns, tooltips, toasts, buttons over
media. Content layer stays solid: cards, rails, chips, panels. No
glass-on-glass, no blur over flat backgrounds (nothing to refract).
Accent: white, single primary action per view. Red stays for LIVE only.
A saved accent choice always wins (applied inline pre-paint); Mono white
is the default. Lime rule (locked): the accent hue marks interactive
STATE only — selected, playing, current, unread, enabled, host identity.
Static metadata never takes the accent (ratings white, counts white,
studios white). Semantic finance colors are fixed (#4ade80 profit,
#ff7070 loss), independent of the accent. X/back/leave stay bare and
unlabeled; every other icon-only control carries a hover tip. Secondary controls use the 14px system radius.
Corners: pills for nav thumb, segmented controls, primary CTAs.
Filters, chips, selects, inputs use the 14px system radius. Cards keep
their poster radii.
Type: Inter/system, tight tracking, sentence case. One eyebrow style max.
Motion: tiny and purposeful, 150-300ms budget. Press states on
everything tappable (squash, never flash), lists fade in, rotation
carries a visible dot sweep. Reduced-motion respected throughout.
Rails: captioned posters (title + year, touch has no hover), measured
stepper arrows that disable at the edges, back-to-top past the fold.
Responsive: Arco breakpoint scale (xs 576, md 768, lg 992, xl 1200).
Hero 88vh desktop, 76vh on phones; dots dock under the nav on xs;
rail gaps and section rhythm tighten per breakpoint. Tokens only, no
hard-coded colors in overrides.

## House rules (owner-set, always on)

- Gradients out, one color for the main action. The melt is the single
  exception: a legibility gradient, same category as Netflix scrims,
  never decoration.
- Hierarchy by contrast: one big voice per screen, everything else
  quiet. If every line is bold, nothing matters.
- Skeleton for loading; nothing rendered for empty rails; compact
  error + retry on failure. No full-page loading or error screens.
- Motion budget 150-300ms. Press states everywhere. Never flashy.

## Hardworkclub assessment (reference, not gospel)

- Adopt: one accent only, zero elevation, hairline borders, left-align,
  black-box canvas discipline, pill buttons.
- Hold: pure #000000 canvas (our slate is the established identity the
  actor page proves; switching rebuilds every surface for no gain),
  serif display (worth trialling on rail titles, not committed),
  8px card radii (posters stay cinematic; UI panels already 14px).

Dial: ENERGY 3 / RHYTHM 1 / MOTION 2 (/clean experiment)
