// Football schedule + streams via our /api/football proxy (Streamed, no
// key). Every listed match carries its own sources, so "no sources" can't
// happen by construction — the listing IS the watch list. Note: the feed
// carries no league names, so top-league-only filtering isn't possible
// from this source (popular flag + kickoff order instead).
async function proxyGet(path) {
  const res = await fetch(`/api/football?path=${encodeURIComponent(path)}`);
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
      .sort((a, b) => a.kickoffMs - b.kickoffMs);
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

export function formatKickoff(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Today ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} ${time}`;
}
