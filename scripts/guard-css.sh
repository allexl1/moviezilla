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
# Exception: SettingsModal.jsx owns the accent picker — its literals ARE the
# centralized theming path (ACCENTS + applyAccent write the var, main.jsx
# boots it). Everything else must use var(--cine-accent).
hit=$(grep -rEn '#95ff50|#95FF50' src index.html 2>/dev/null | grep -v 'src/components/SettingsModal.jsx' | grep -vi 'cine-accent\|primaryColor\|vidlink\|theme-color\|manifest' || true)
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

# NOTE: checks 5-7 below are code guards (plural honesty, rail ownership,
# thumb discipline) that live in this script so one `npm run guard` covers
# every silent-regression family. Rename pending; behavior is what matters.

# 5. Raw plurals: "{n} episodes"-style literals without a singular branch
#    (the "1 Oscars" / "1 titles" family). Singularized lines spell the
#    noun without trailing s (`title${...}`) or carry `=== 1` — both pass.
hit=$(grep -rEn '(length|count)\} +(episodes|seasons|titles|matches|honours|awards)\b' src --include='*.jsx' | grep -v '=== 1' || true)
if [ -n "$hit" ]; then
  fail "raw plural found — singularize honestly (1 Oscar, not 1 Oscars)." "$hit"
fi

# 6. Rail scroll ownership: only RowRail.jsx may write scrollLeft (its
#    identity-keyed reset). Stray writers reintroduce drift-into-space.
hit=$(grep -rn 'scrollLeft *=' src --include='*.jsx' --include='*.js' | grep -v 'src/components/RowRail.jsx' || true)
if [ -n "$hit" ]; then
  fail "scrollLeft write outside RowRail — route it through the rail reset." "$hit"
fi

# 7. Sliding-thumb discipline: offsetLeft/offsetWidth measurers must live
#    next to a fonts.ready re-measure (Navbar.jsx, PersonView.jsx SegFilter,
#    StudioView.jsx SegFilter). New thumb code without one drifts on font
#    load/swap.
hit=$(grep -rln 'offsetLeft\|offsetWidth' src --include='*.jsx' | grep -v 'src/components/Navbar.jsx' | grep -v 'src/components/PersonView.jsx' | grep -v 'src/components/StudioView.jsx' || true)
if [ -n "$hit" ]; then
  fail "thumb measurer outside Navbar/PersonView/StudioView — add a fonts.ready re-measure." "$hit"
fi

if [ "$violations" -ne 0 ]; then
  echo "CSS guard failed."
  exit 1
fi
echo "All guards passed."
