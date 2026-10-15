// ESPN unofficial live layer (isolated: proxy + this file + one row
// overlay — delete all three and nothing else notices). Our comp codes
// to ESPN league slugs, verified live. Poll gently: 60s client cache,
// 90s UI refresh, only while the tab is open.
import { sideHit } from './football.js';

export const ESPN_SLUGS = {
  CL: 'uefa.champions',
  PL: 'eng.1',
  PD: 'esp.1',
  SA: 'ita.1',
  BL1: 'ger.1',
  FL1: 'fra.1',
  DED: 'ned.1',
  PPL: 'por.1',
  ELC: 'eng.2',
  EL: 'uefa.europa',
  CLI: 'conmebol.libertadores',
  BSA: 'bra.1',
  WC: 'fifa.world',
  EC: 'uefa.euro',
};

const CACHE_KEY = 'mz_espn_live';
const CACHE_TTL = 60 * 1000;
const CACHE_MAX = 12;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// One live event → minute label + score. state 'in' only; pre/post are
// our data's job (kickoff times, FT). Short detail carries the minute
// ("72'"), the period ("HT") or the clock through stoppage.
export function normLiveEvent(ev) {
  const state = ev?.status?.type?.state || '';
  if (state !== 'in') return null;
  const comps = ev?.competitions || [];
  const comp = comps[0] || {};
  const sides = comp.competitors || [];
  const side = (want) => sides.find((s) => s?.homeAway === want) || {};
  const home = side('home');
  const away = side('away');
  const team = (s) => ({
    name: s?.team?.displayName || s?.team?.name || '',
    short: s?.team?.abbreviation || '',
    score: s?.score ?? null,
  });
  return {
    id: String(ev?.id || ''),
    utc: ev?.date ? Date.parse(ev.date) || 0 : 0,
    clock: ev?.status?.type?.shortDetail || ev?.status?.type?.detail || 'Live',
    home: team(home),
    away: team(away),
  };
}

async function fetchSlug(slug) {
  const res = await fetch(`/api/espn?${new URLSearchParams({ path: `soccer/${slug}/scoreboard` })}`, {
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`espn failed: ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data?.events) ? data.events : [])
    .map(normLiveEvent)
    .filter(Boolean);
}

export async function liveAcross(slugs) {
  const now = Date.now();
  const cache = readCache();
  const out = [];
  const missing = [];
  for (const slug of slugs) {
    const hit = cache[slug];
    if (hit && now - (hit.at || 0) < CACHE_TTL) {
      for (const e of hit.events || []) out.push(e);
    } else {
      missing.push(slug);
    }
  }
  // Gentle on an unofficial pipe: at most 3 slugs per pass, the rest
  // ride cache or wait for the next poll.
  for (const slug of missing.slice(0, 3)) {
    try {
      const events = await fetchSlug(slug);
      cache[slug] = { at: Date.now(), events };
      for (const e of events) out.push(e);
    } catch {
      // one dead league never kills the board
    }
  }
  try {
    const keys = Object.keys(cache).slice(-CACHE_MAX);
    const next = {};
    for (const k of keys) next[k] = cache[k];
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    // cache is a nicety
  }
  return out;
}

// Match summary pipe (goals, cards, subs, squads, broadcasts, venue,
// odds when the bookmakers offer them). Verified live shapes only,
// every field defensive, anything unrecognized drops out.
const SUM_KEY = 'mz_espn_summary';
const SUM_TTL = 60 * 1000;
const SUM_MAX = 40;

function readSumCache() {
  try {
    const raw = localStorage.getItem(SUM_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// Key events → minute-tagged timeline rows (goals, cards, subs).
export function normKeyEvents(json) {
  const list = Array.isArray(json?.keyEvents) ? json.keyEvents : [];
  const out = [];
  for (const e of list) {
    const kind = String(e?.type?.type || '').toLowerCase();
    // Exact-ish kinds only: 'penalty---scored' contains the letters
    // "red" (proven live), so never substring-match red or goal.
    const isGoal = kind === 'goal' || kind.startsWith('penalty');
    const isYellow = kind.includes('yellow');
    const isRed = kind === 'red' || kind === 'redcard' || kind.includes('red-card') || kind.includes('red_card');
    const isSub = kind === 'substitution';
    if (!isGoal && !isYellow && !isRed && !isSub) continue;
    out.push({
      minute: e?.clock?.displayValue || '',
      kind: isGoal ? 'goal' : isRed ? 'red' : isYellow ? 'yellow' : 'sub',
      text: e?.shortText || e?.text || '',
    });
  }
  return out;
}

// Order two home/away groups against our fixture names (upstream
// usually ships home first, but verify instead of trusting it).
function orderGroups(groups, nameOf, home, away) {
  const [g0, g1] = groups || [];
  if (!g0 || !g1) return groups || [];
  const n0 = nameOf(g0);
  const n1 = nameOf(g1);
  if ((away && sideHit(n0, away)) || (home && sideHit(n1, home))) return [g1, g0];
  return [g0, g1];
}

// Squads: two groups in home/away order, verified against our names.
// Athletes nest under `athlete` (no headshots on this pipe, the UI
// falls back to initials). Starters sort first, subs flagged.
export function normRosters(json, home, away) {
  const groups = Array.isArray(json?.rosters) ? json.rosters : [];
  const ordered = orderGroups(groups.slice(0, 2), (g) => g?.team?.displayName || g?.team?.name || '', home, away);
  return ordered.map((g) => ({
    players: (Array.isArray(g?.roster) ? g.roster : []).map((p) => {
      const a = p?.athlete || {};
      return {
        name: a?.displayName || p?.displayName || '',
        short: a?.shortName || a?.shortDisplayName || p?.shortDisplayName || '',
        position: p?.position?.abbreviation || p?.position?.name || '',
        jersey: p?.jersey ?? null,
        sub: p?.starter === false,
      };
    }).filter((p) => p.name)
      .sort((a, b) => Number(a.sub) - Number(b.sub)),
  }));
}

// Team stats (boxscore): curated comparison rows, home/away verified
// against our names like rosters. Raw display strings, never derived.
const STAT_ROWS = [
  ['possessionPct', 'Possession'],
  ['totalShots', 'Shots'],
  ['shotsOnTarget', 'Shots on target'],
  ['wonCorners', 'Corners'],
  ['foulsCommitted', 'Fouls'],
  ['offsides', 'Offsides'],
  ['saves', 'Saves'],
  ['interceptions', 'Interceptions'],
];

export function normStats(json, home, away) {
  const groups = ((json?.boxscore || {}).teams || []).slice(0, 2);
  if (groups.length < 2) return null;
  const ordered = orderGroups(groups, (g) => g?.team?.displayName || g?.team?.name || '', home, away);
  const val = (g, key) => {
    const s = (g?.statistics || []).find((x) => x?.name === key);
    return s?.displayValue ?? null;
  };
  const rows = STAT_ROWS.map(([key, label]) => ({
    label,
    home: val(ordered[0], key),
    away: val(ordered[1], key),
  })).filter((r) => r.home != null || r.away != null);
  const pair = (aKey, bKey, label) => {
    const a0 = val(ordered[0], aKey);
    const b0 = val(ordered[0], bKey);
    const a1 = val(ordered[1], aKey);
    const b1 = val(ordered[1], bKey);
    if (a0 == null && a1 == null) return null;
    return {
      label,
      home: a0 != null && b0 != null ? `${a0}/${b0}` : (a0 ?? '—'),
      away: a1 != null && b1 != null ? `${a1}/${b1}` : (a1 ?? '—'),
    };
  };
  const passes = pair('accuratePasses', 'totalPasses', 'Passes');
  const tackles = pair('effectiveTackles', 'totalTackles', 'Tackles');
  if (passes) rows.push(passes);
  if (tackles) rows.push(tackles);
  if (rows.length === 0) return null;
  return { rows };
}

export function normBroadcasts(json) {
  const list = Array.isArray(json?.broadcasts) ? json.broadcasts : [];
  return list
    .map((b) => (typeof b === 'string' ? b : b?.name || b?.shortName || ''))
    .filter(Boolean)
    .slice(0, 6);
}

export function normVenue(json) {
  const v = json?.gameInfo?.venue;
  return typeof v === 'string' ? v : v?.fullName || v?.name || '';
}

// Bookmaker odds ride the summary when offered (hasOdds). Shown with
// the provider name or not at all, never invented, never blended.
export function normOdds(json) {
  if (!json?.hasOdds) return null;
  const d = (Array.isArray(json?.odds) ? json.odds : [])[0] || {};
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 1 ? Math.round(n * 100) / 100 : null;
  };
  const home = num(d.homeTeamOdds ?? d.moneyline);
  const draw = num(d.drawOdds);
  const away = num(d.awayTeamOdds);
  if (home == null && draw == null && away == null) return null;
  return { provider: d.provider?.name || '', home, draw, away };
}

export async function matchSummary(slug, eventId, home, away) {
  if (!slug || !eventId) return null;
  const key = `${slug}:${eventId}`;
  const now = Date.now();
  const cache = readSumCache();
  const hit = cache[key];
  if (hit && now - (hit.at || 0) < SUM_TTL) return hit.data;
  const res = await fetch(`/api/espn?${new URLSearchParams({ path: `soccer/${slug}/summary`, event: String(eventId) })}`, {
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`summary failed: ${res.status}`);
  const json = await res.json();
  const data = {
    events: normKeyEvents(json),
    rosters: normRosters(json, home, away),
    stats: normStats(json, home, away),
    header: normHeader(json),
    broadcasts: normBroadcasts(json),
    venue: normVenue(json),
    odds: normOdds(json),
  };
  try {
    cache[key] = { at: now, data };
    const keys = Object.keys(cache).slice(-SUM_MAX);
    const next = {};
    for (const k of keys) next[k] = cache[k];
    localStorage.setItem(SUM_KEY, JSON.stringify(next));
  } catch {
    // cache is a nicety
  }
  return data;
}

// Sweep order: every verified slug, likeliest homes of stream-only
// matches first so pages resolve in one batch. Extra leagues beyond
// our 12 codes (scoreboards confirmed live 2026-10-15): usa.1,
// mex.1, arg.1, conmebol.sudamericana, tur.1, sco.1. These cover
// stream-only matches that carry no data-competition code: MLS feeds
// most of our live cards.
const SWEEP_ORDER = [
  'usa.1', 'mex.1', 'uefa.europa', 'eng.1', 'esp.1', 'ita.1', 'ger.1',
  'fra.1', 'uefa.champions', 'conmebol.libertadores',
  'conmebol.sudamericana', 'bra.1', 'arg.1', 'por.1', 'ned.1', 'eng.2',
  'tur.1', 'sco.1', 'fifa.world', 'uefa.euro',
];

const BOARD_KEY = 'mz_espn_boards';
const BOARD_TTL = 60 * 1000;

function readBoardCache() {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeBoardCache(cache) {
  try {
    const keys = Object.keys(cache).slice(-20);
    const next = {};
    for (const k of keys) next[k] = cache[k];
    localStorage.setItem(BOARD_KEY, JSON.stringify(next));
  } catch {
    // cache is a nicety
  }
}

async function boardOf(slug, cache) {
  const now = Date.now();
  const hit = cache[slug];
  if (hit && now - (hit.at || 0) < BOARD_TTL) return hit.events || [];
  const res = await fetch(`/api/espn?${new URLSearchParams({ path: `soccer/${slug}/scoreboard` })}`, {
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  const events = Array.isArray(data?.events) ? data.events : [];
  cache[slug] = { at: now, events };
  return events;
}

function boardHit(events, home, away) {
  for (const ev of events) {
    const comp = (ev?.competitions || [])[0] || {};
    const sides = comp.competitors || [];
    const side = (want) => sides.find((s) => s?.homeAway === want) || {};
    const hn = side('home')?.team?.displayName || side('home')?.team?.name || '';
    const an = side('away')?.team?.displayName || side('away')?.team?.name || '';
    if (hn && an && sideHit(hn, home) && sideHit(an, away)) return String(ev?.id || '');
  }
  return '';
}

// Resolve a stream-only match (no comp code) to its league + event by
// sweeping every verified slug, 3 boards per batch. Null when nothing
// matches — the page then shows its honest no-info state.
export async function matchEventAny(home, away) {
  if (!home || !away) return null;
  const cache = readBoardCache();
  for (let i = 0; i < SWEEP_ORDER.length; i += 3) {
    const batch = SWEEP_ORDER.slice(i, i + 3);
    const boards = await Promise.all(batch.map((s) => boardOf(s, cache).catch(() => [])));
    for (let j = 0; j < batch.length; j += 1) {
      const id = boardHit(boards[j] || [], home, away);
      if (id) {
        writeBoardCache(cache);
        return { slug: batch[j], id };
      }
    }
  }
  writeBoardCache(cache);
  return null;
}

// Header truth (status + scores ride every summary): lets stream pages
// show live minutes without the day-row overlay.
export function normHeader(json) {
  const comp = (json?.header?.competitions || [])[0] || {};
  const st = comp?.status?.type || {};
  const sides = comp.competitors || [];
  const side = (want) => sides.find((s) => s?.homeAway === want) || {};
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    state: st?.state || '',
    clock: st?.shortDetail || st?.detail || '',
    home: {
      name: side('home')?.team?.displayName || side('home')?.team?.name || '',
      score: num(side('home')?.score),
    },
    away: {
      name: side('away')?.team?.displayName || side('away')?.team?.name || '',
      score: num(side('away')?.score),
    },
  };
}

// Resolve our fixture to their event id (current-round scoreboard,
// two-side name match). The scoreboard carries the current round, so
// older fixtures may not resolve — the match page then shows its
// honest no-info state. (The dates-scoped variant returns nothing:
// verified live, ESPN ignores that shape here.)
export async function matchEventId(slug, home, away) {
  if (!slug || !home || !away) return null;
  const res = await fetch(`/api/espn?${new URLSearchParams({ path: `soccer/${slug}/scoreboard` })}`, {
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const events = Array.isArray(data?.events) ? data.events : [];
  for (const ev of events) {
    const comp = (ev?.competitions || [])[0] || {};
    const sides = comp.competitors || [];
    const side = (want) => sides.find((s) => s?.homeAway === want) || {};
    const hn = side('home')?.team?.displayName || side('home')?.team?.name || '';
    const an = side('away')?.team?.displayName || side('away')?.team?.name || '';
    if (sideHit(hn, home) && sideHit(an, away)) return String(ev?.id || '');
  }
  return null;
}
