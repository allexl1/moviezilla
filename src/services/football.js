// Football schedule + streams via our /api/football proxy (Streamed, no
// key). Every listed match carries its own sources, so "no sources" can't
// happen by construction — the listing IS the watch list. Note: the feed
// carries no league names, so top-league-only filtering isn't possible
// from this source (popular flag + kickoff order instead).
async function proxyGet(path) {
  const res = await fetch(`/api/football?path=${encodeURIComponent(path)}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Football request failed: ${res.status}`);
  return res.json();
}

function teamName(t) {
  if (!t) return '';
  return typeof t === 'string' ? t : t.name || '';
}

function normMatch(m, i) {
  const teams = m?.teams || {};
  const home = teamName(teams.home) || teamName(m?.home);
  const away = teamName(teams.away) || teamName(m?.away);
  const title = m?.title || [home, away].filter(Boolean).join(' vs ') || `Match ${i + 1}`;
  const dateMs = Number(m?.date ?? m?.kickoff ?? m?.startTime ?? 0);
  // The feed carries no league names — only category + a popular flag.
  const league = m?.league || m?.competition || '';
  const sources = (m?.sources || []).map((s, j) => ({
    key: `${s?.source || 'src'}:${s?.id ?? s?.sourceId ?? j}`,
    source: s?.source || 'stream',
    refId: s?.id ?? s?.sourceId ?? '',
  })).filter((s) => s.refId !== '');
  return {
    id: String(m?.id ?? `${title}-${dateMs || i}`),
    title,
    home,
    away,
    league,
    popular: Boolean(m?.popular),
    kickoffMs: dateMs,
    sources,
  };
}

const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

export const football = {
  // One feed (football only — the all-sports /live endpoint leaks darts
  // and has no league info). Live = kicked off within the last 3h.
  // Upcoming = popular first, then kickoff order.
  async getMatches() {
    const res = await proxyGet('api/matches/football');
    const list = (Array.isArray(res) ? res : res?.matches || [])
      .map(normMatch)
      .filter((m) => m.sources.length > 0);
    const now = Date.now();
    const live = list
      .filter((m) => m.kickoffMs && m.kickoffMs <= now && now - m.kickoffMs <= LIVE_WINDOW_MS)
      .sort((a, b) => a.kickoffMs - b.kickoffMs)
      .map((m) => ({ ...m, live: true }));
    const seen = new Set(live.map((m) => m.id));
    const upcoming = list
      .filter((m) => !seen.has(m.id) && (!m.kickoffMs || m.kickoffMs > now - 30 * 60 * 1000))
      .sort((a, b) => Number(b.popular) - Number(a.popular) || (a.kickoffMs || Infinity) - (b.kickoffMs || Infinity))
      .slice(0, 30);
    return { live, upcoming };
  },

  // Sources for one match → playable embed URLs.
  async getStreams(source, refId) {
    const res = await proxyGet(`api/stream/${source}/${refId}`);
    const list = Array.isArray(res) ? res : res?.streams || res?.data || [];
    return list
      .map((s, i) => ({
        n: s?.streamNo ?? s?.stream_no ?? i + 1,
        lang: s?.language || s?.lang || '',
        hd: Boolean(s?.hd),
        url: s?.embedUrl || s?.embed_url || s?.url || '',
        source,
      }))
      .filter((s) => s.url);
  },
};

// Curated fallback mirrors (user's own sources) — outbound links.
export const FOOTBALL_MIRRORS = [
  { name: 'EpicSports', url: 'https://www.epic-sports.blog/' },
  { name: 'ColaTV', url: 'https://colatv77.live/' },
  { name: 'Liveball', url: 'https://liveball.sx/' },
  { name: 'Gooool365', url: 'https://gooool365.com/' },
];

// Last-working source per match (delay spec step 2): the user tapping a
// stream pill means "this one works" — that preference survives across
// opens. Keyed by match id, matched on via + stream number (URLs rotate,
// names don't). Capped so the map can't grow forever. No playback
// detection is possible (cross-origin iframe never reports), so an
// explicit tap is the only signal — opening never writes, only reads.
const STREAM_PREF_KEY = 'mz_football_stream_pref';
const STREAM_PREF_MAX = 50;

function readStreamPrefs() {
  try {
    const raw = localStorage.getItem(STREAM_PREF_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getPreferredStream(matchId) {
  if (!matchId) return null;
  const pref = readStreamPrefs()[String(matchId)];
  return pref && pref.via ? pref : null;
}

export function setPreferredStream(matchId, stream) {
  if (!matchId || !stream?.via) return;
  try {
    const all = readStreamPrefs();
    all[String(matchId)] = { via: stream.via, n: stream.n ?? 0, at: Date.now() };
    const keys = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0)).slice(0, STREAM_PREF_MAX);
    const next = {};
    for (const k of keys) next[k] = all[k];
    localStorage.setItem(STREAM_PREF_KEY, JSON.stringify(next));
  } catch {
    // preference is a nicety, never blocks watching
  }
}

// Stream-to-fixture matching (F1 day view): a data row earns its Watch
// button only on a confident two-side match. Normalization folds case,
// diacritics and club suffix noise (FC/AFC/SC/CF/FK/SK/AC/AS/SS/US);
// then either side contains the other ("inter" lives inside
// "internazionale", "roma" inside "as roma"). Known abbreviations ride
// a short verified alias list — extend it, never loosen the rule.
// No match means no button (the streams group below still lists it).
const CLUB_STOP = new Set(['fc', 'afc', 'sc', 'cf', 'fk', 'sk', 'ac', 'as', 'ss', 'us']);
const CLUB_ALIAS = {
  'man city': 'manchester city',
  'psg': 'paris saint germain',
  'man united': 'manchester united',
  'spurs': 'tottenham hotspur',
  'inter': 'internazionale',
  'west ham': 'west ham united',
};

export function clubKey(name) {
  const folded = String(name || '')
    .toLowerCase()
    .replace(/[øœ]/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/[åä]/g, 'a')
    .replace(/[ö]/g, 'o')
    .replace(/[ü]/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 /]/g, ' ')
    .split(/[/\s]+/)
    .filter((w) => w && !CLUB_STOP.has(w))
    .join(' ');
  return CLUB_ALIAS[folded] || folded;
}

function sideHit(streamSide, dataName) {
  const a = clubKey(streamSide);
  const b = clubKey(dataName);
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
}

export function findStreamFor(streamMatches, homeName, awayName) {
  for (const m of streamMatches || []) {
    const sides = String(m?.title || '').split(' vs ');
    if (sides.length !== 2) continue;
    if (sideHit(sides[0], homeName) && sideHit(sides[1], awayName)) return m;
  }
  return null;
}

export function formatKickoff(ms) {  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Today ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} ${time}`;
}

// Compact kickoff time for dense rows ("10:00 PM", never the day part).
export function formatTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
