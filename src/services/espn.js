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
    const isGoal = kind === 'goal';
    const isYellow = kind.includes('yellow');
    const isRed = kind.includes('red');
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

// Squads: two groups in home/away order (matches the leaders ordering
// seen live). Players carry shirt, position and headshot when present.
export function normRosters(json) {
  const groups = Array.isArray(json?.rosters) ? json.rosters : [];
  return groups.slice(0, 2).map((g) => ({
    players: (Array.isArray(g?.roster) ? g.roster : []).map((p) => ({
      name: p?.displayName || '',
      short: p?.shortDisplayName || '',
      position: p?.position?.abbreviation || p?.position?.name || '',
      jersey: p?.jersey ?? null,
      photo: p?.headshot?.href || '',
    })).filter((p) => p.name),
  }));
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

export async function matchSummary(slug, eventId) {
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
    rosters: normRosters(json),
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

// Resolve our fixture to their event id (scoreboard by day, two-side
// name match). Null when the league or the fixture isn't covered —
// the match page simply shows no events section.
export async function matchEventId(slug, home, away, dayIso) {
  if (!slug || !home || !away || !dayIso) return null;
  const compact = String(dayIso).replace(/-/g, '');
  const res = await fetch(`/api/espn?${new URLSearchParams({ path: `soccer/${slug}/scoreboard`, dates: compact })}`, {
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
