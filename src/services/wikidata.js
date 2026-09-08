// Awards via Wikidata SPARQL — keyless, CORS-open, fair use.
// Every TMDB title/person with an IMDb id resolves through P345, then
// P166 (award received) with P585 (point in time) and P1686 (for work).
// Cached a week in localStorage: awards history never changes.
const MEM = new Map();
const LS_KEY = 'mz_awards';
const WEEK = 7 * 24 * 60 * 60 * 1000;

function lsGet(imdbId) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    const hit = all[imdbId];
    if (hit && Date.now() - hit.at < WEEK) return hit.awards;
  } catch {
    // ignore
  }
  return undefined;
}

function lsSet(imdbId, awards) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    all[imdbId] = { at: Date.now(), awards };
    const keys = Object.keys(all);
    while (keys.length > 200) delete all[keys.shift()];
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    // storage full/blocked — memory cache still works
  }
}

export async function getAwardsByImdb(imdbId) {
  // Titles are tt…, people are nm… — both resolve through P345.
  if (!imdbId || !/^(tt|nm)\d+$/.test(imdbId)) return [];
  if (MEM.has(imdbId)) return MEM.get(imdbId);
  const cached = lsGet(imdbId);
  if (cached) {
    MEM.set(imdbId, cached);
    return cached;
  }

  const sparql = `SELECT ?award ?awardLabel ?date ?work ?workLabel WHERE {
    ?item wdt:P345 "${imdbId}".
    ?item p:P166 ?stmt.
    ?stmt ps:P166 ?award.
    OPTIONAL { ?stmt pq:P585 ?date. }
    OPTIONAL { ?stmt pq:P1686 ?work. }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  } LIMIT 60`;

  try {
    const res = await fetch(
      `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`,
      { headers: { Accept: 'application/sparql-results+json' } }
    );
    if (!res.ok) throw new Error(`WDQS ${res.status}`);
    const data = await res.json();
    const seen = new Set();
    const awards = [];
    for (const b of data?.results?.bindings || []) {
      const label = b.awardLabel?.value || '';
      if (!label || label.startsWith('Q')) continue;
      const year = (b.date?.value || '').slice(0, 4);
      const work = b.workLabel?.value && !b.workLabel.value.startsWith('Q') ? b.workLabel.value : '';
      const k = `${label}|${year}|${work}`;
      if (seen.has(k)) continue;
      seen.add(k);
      awards.push({ label, year: /^\d{4}$/.test(year) ? year : '', work });
    }
    awards.sort((a, b) => (b.year || '').localeCompare(a.year || ''));
    MEM.set(imdbId, awards);
    lsSet(imdbId, awards);
    return awards;
  } catch {
    MEM.set(imdbId, []);
    return [];
  }
}

// Tropical zodiac from an ISO birthday — local math, no API.
export function zodiacSign(iso) {
  if (!iso) return '';
  const m = Number(String(iso).slice(5, 7));
  const d = Number(String(iso).slice(8, 10));
  if (!m || !d) return '';
  const signs = [
    ['Capricorn', 19], ['Aquarius', 18], ['Pisces', 20], ['Aries', 19],
    ['Taurus', 20], ['Gemini', 20], ['Cancer', 22], ['Leo', 22],
    ['Virgo', 22], ['Libra', 22], ['Scorpio', 21], ['Sagittarius', 21],
    ['Capricorn', 31],
  ];
  const [cur, cutoff] = signs[m];
  return d <= cutoff ? signs[m - 1][0] : cur;
}

export function ageOf(birthday, deathday) {
  if (!birthday) return null;
  const end = deathday ? new Date(`${deathday}T00:00:00`) : new Date();
  const start = new Date(`${birthday}T00:00:00`);
  if (Number.isNaN(end.getTime()) || Number.isNaN(start.getTime())) return null;
  let age = end.getFullYear() - start.getFullYear();
  const m = end.getMonth() - start.getMonth();
  if (m < 0 || (m === 0 && end.getDate() < start.getDate())) age -= 1;
  return age;
}
