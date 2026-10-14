// ESPN unofficial live layer (isolated: proxy + this file + one row
// overlay — delete all three and nothing else notices). Our comp codes
// to ESPN league slugs, verified live. Poll gently: 60s client cache,
// 90s UI refresh, only while the tab is open.
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
