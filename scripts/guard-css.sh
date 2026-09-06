#!/bin/sh
# CSS cascade guard.
#
# Our design-system stylesheet (src/index.css) is UNLAYERED author CSS, which
# beats Tailwind v4's LAYERED utilities at equal specificity. So a Tailwind
# layout utility placed on the same element as one of the classes below is
# silently dead — this exact bug already corrupted two screens (container
# top-padding, modal top-anchoring). This script fails the build if any known
# dead pattern reappears. Run: npm run guard
#
# If you need the layout effect, add a modifier class in index.css instead.

violations=0

fail() {
  echo "CSS-GUARD VIOLATION: $1"
  echo "$2"
  violations=1
}

# 1. Padding utilities on .cine-container (top padding lives in
#    .cine-container / .cine-container--page).
hit=$(grep -rEn 'cine-container[^"]*\b[mp][tblrxy]?-[0-9]' src --include='*.jsx' || true)
if [ -n "$hit" ]; then
  fail "spacing utility on .cine-container will lose to index.css — use .cine-container--page or edit the class." "$hit"
fi

# 2. Flex-alignment / padding utilities on .cine-modal-backdrop (alignment
#    lives in .cine-modal-backdrop / .cine-modal-backdrop--top).
hit=$(grep -rEn 'cine-modal-backdrop[^"]*\b(items-|justify-|self-|p[tblrxy]?-[0-9]|m[tblrxy]?-[0-9])' src --include='*.jsx' || true)
if [ -n "$hit" ]; then
  fail "layout utility on .cine-modal-backdrop will lose to index.css — use .cine-modal-backdrop--top or edit the class." "$hit"
fi

# 3. Raw accent hex outside the token definition and third-party API params.
hit=$(grep -rEn '#95ff50|#95FF50' src index.html 2>/dev/null | grep -vi 'cine-accent\|primaryColor\|vidlink\|theme-color\|manifest' || true)
if [ -n "$hit" ]; then
  fail "raw accent hex found — use var(--cine-accent) so theming stays centralized." "$hit"
fi

# 4. Display utilities on cine-* classes that set display in index.css
#    (unlayered display beats Tailwind `hidden` — this exact bug leaked the
#    desktop nav pill onto mobile viewports).
hit=$(grep -rEn 'cine-(nav-pill-box|rail|cine-grid|cine-card|mat-row|cine-chip|control-btn|cine-icon-btn|provider-pill|duo-btn|select|input)[^"]*\b(hidden|(sm|md|lg|xl):(hidden|flex|block|inline|grid))\b' src --include='*.jsx' || true)
if [ -n "$hit" ]; then
  fail "display utility on a cine-* class that sets display will lose to index.css — control visibility in the stylesheet instead." "$hit"
fi

if [ "$violations" -ne 0 ]; then
  echo "CSS guard failed."
  exit 1
fi
echo "CSS guard passed."
