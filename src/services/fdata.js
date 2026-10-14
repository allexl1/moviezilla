// football-data.org client (free tier): competitions, standings,
// fixtures, scorers. All traffic goes through our /fdata proxy (the key
// never touches the browser). Client cache mirrors the proxy TTLs so
// tab-switching never spends quota: standings/scorers 12h, fixtures
// 30min. 429 from the proxy surfaces as RateLimited so the UI says
// retry and never fakes numbers.
export const FCOMPS = [
  { code: 'CL', name: 'Champions League' },
  { code: 'PL', name: 'Premier League' },
  { code: 'PD', name: 'La Liga' },
  { code: 'SA', name: 'Serie A' },
  { code: 'BL1', name: 'Bundesliga' },
  { code: 'FL1', name: 'Ligue 1' },
  { code: 'DED', name: 'Eredivisie' },
  { code: 'PPL', name: 'Primeira Liga' },
  { code: 'ELC', name: 'Championship' },
  { code: 'BSA', name: 'Brasileirao' },
  { code: 'WC', name: 'World Cup' },
  { code: 'EC', name: 'Euros' },
];

const CACHE_KEY = 'mz_fdata_cache';
const CACHE_MAX = 40;
const TTL = { table: 12 * 3600 * 1000, fixtures: 30 * 60 * 1000, scorers: 12 * 3600 * 1000 };

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(key, data) {
  try {
    const all = readCache();
    all[key] = { at: Date.now(), data };
    const keys = Object.keys(all)
      .sort((a, b) => (all[b].at || 0) - (all[a].at || 0))
      .slice(0, CACHE_MAX);
    const next = {};
    for (const k of keys) next[k] = all[k];
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    // cache is a nicety, never blocks data
  }
}

async function proxyGet(path, params = {}, kind = 'fixtures') {
  const ck = `${path}?${new URLSearchParams(params).toString()}`;
  const hit = readCache()[ck];
  if (hit && Date.now() - (hit.at || 0) < (TTL[kind] || TTL.fixtures)) return hit.data;
  const qs = new URLSearchParams({ path, ...params }).toString();
  const res = await fetch(`/api/fdata?${qs}`, { signal: AbortSignal.timeout(12000) });
  if (res.status === 429) {
    const err = new Error('Football data is busy. Retry shortly.');
    err.rateLimited = true;
    throw err;
  }
  if (res.status === 403) {
    const err = new Error('Not on the free tier.');
    err.forbidden = true;
    throw err;
  }
  if (!res.ok) throw new Error(`Football data failed: ${res.status}`);
  const data = await res.json();
  writeCache(ck, data);
  return data;
}

// Standings → TOTAL/HOME/AWAY row sets. One standing entry per type;
// missing types fall back to TOTAL so the toggle never empties.
export function normTable(json) {
  const out = { total: [], home: [], away: [] };
  const list = Array.isArray(json?.standings) ? json.standings : [];
  const row = (t) => ({
    pos: t?.position ?? 0,
    team: { id: t?.team?.id ?? 0, name: t?.team?.name || '', crest: t?.team?.crest || '' },
    played: t?.playedGames ?? 0,
    won: t?.won ?? 0,
    draw: t?.draw ?? 0,
    lost: t?.lost ?? 0,
    gf: t?.goalsFor ?? 0,
    ga: t?.goalsAgainst ?? 0,
    gd: t?.goalDifference ?? 0,
    points: t?.points ?? 0,
    form: typeof t?.form === 'string' ? t.form.split(',').filter(Boolean) : [],
  });
  for (const s of list) {
    const key = s?.type === 'HOME' ? 'home' : s?.type === 'AWAY' ? 'away' : 'total';
    out[key] = (s?.table || []).map(row);
  }
  if (out.home.length === 0) out.home = out.total;
  if (out.away.length === 0) out.away = out.total;
  return out;
}

// Matches → honest rows. Free tier carries no live wire: IN_PLAY means
// "was live at fetch", always badged delayed, never presented as now.
export function normMatches(json) {
  const list = Array.isArray(json?.matches) ? json.matches : [];
  return list.map((m) => {
    const status = m?.status || 'SCHEDULED';
    const liveish = status === 'IN_PLAY' || status === 'LIVE' || status === 'PAUSED';
    return {
      id: String(m?.id ?? `${m?.homeTeam?.name}-${m?.awayTeam?.name}-${m?.utcDate || ''}`),
      utc: m?.utcDate ? Date.parse(m.utcDate) || 0 : 0,
      status,
      stage: m?.stage || '',
      matchday: m?.matchday ?? null,
      delayed: liveish,
      finished: status === 'FINISHED',
      competition: {
        code: m?.competition?.code || '',
        name: m?.competition?.name || '',
        emblem: m?.competition?.emblem || '',
      },
      home: {
        name: m?.homeTeam?.name || '',
        crest: m?.homeTeam?.crest || '',
        score: m?.score?.fullTime?.home,
      },
      away: {
        name: m?.awayTeam?.name || '',
        crest: m?.awayTeam?.crest || '',
        score: m?.score?.fullTime?.away,
      },
    };
  });
}

// Scorers → name/team/goals. Null when the plan gates it (403): the UI
// omits the section instead of showing an error for a bonus feature.
export function normScorers(json) {
  const list = Array.isArray(json?.scorers) ? json.scorers : [];
  return list.slice(0, 10).map((s) => ({
    name: s?.player?.name || '',
    team: s?.team?.name || '',
    goals: s?.goals ?? 0,
  }));
}

export const fdata = {
  // Tables for one competition (total/home/away in one call).
  async table(code) {
    return normTable(await proxyGet(`competitions/${code}/standings`, {}, 'table'));
  },
  // Whole-day view (one call for all competitions): the upstream date
  // window end is exclusive (same-day ranges come back empty), so fetch
  // day..day+1 and keep the requested UTC day client-side.
  async dayAll(day) {
    const rows = normMatches(
      await proxyGet('matches', { dateFrom: day, dateTo: shiftDayIso(day, 1) }, 'fixtures')
    );
    return filterUtcDay(rows, day);
  },
  // Fixtures for a date window (YYYY-MM-DD). Past dates = results.
  async fixtures(code, from, to) {
    return normMatches(await proxyGet(`competitions/${code}/matches`, { dateFrom: from, dateTo: to }, 'fixtures'));
  },
  // Top scorers; null when the free plan gates the endpoint.
  async scorers(code) {
    try {
      return normScorers(await proxyGet(`competitions/${code}/scorers`, {}, 'scorers'));
    } catch (err) {
      if (err?.forbidden) return null;
      throw err;
    }
  },
};

// Keep rows whose UTC calendar day matches (dayAll fetches day..day+1
// because the upstream window end is exclusive).
export function filterUtcDay(rows, day) {
  return (rows || []).filter((m) => {
    if (!m?.utc) return false;
    return new Date(m.utc).toISOString().slice(0, 10) === day;
  });
}

export function isoDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function shiftDayIso(iso, delta) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return isoDay(d);
}
