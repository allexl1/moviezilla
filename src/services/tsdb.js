// Player/team artwork via TheSportsDB (public free key, no signup).
// Faces are permanent data: the client cache never expires (capped),
// so the shared 30/min quota is spent once per face, ever. In-flight
// dedupe stops list renders from stampeding the same name.
const PHOTO_KEY = 'mz_tsdb_photos';
const PHOTO_MAX = 200;

function readPhotos() {
  try {
    const raw = localStorage.getItem(PHOTO_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePhoto(name, url) {
  try {
    const all = readPhotos();
    all[name] = url;
    const keys = Object.keys(all);
    while (keys.length > PHOTO_MAX) delete all[keys.shift()];
    localStorage.setItem(PHOTO_KEY, JSON.stringify(all));
  } catch {
    // cache is a nicety
  }
}

const flying = new Map();

// First player hit wins; cutout (transparent) beats thumb (card).
export function pickPhoto(payload) {
  const list = Array.isArray(payload?.player) ? payload.player : Array.isArray(payload) ? payload : [];
  for (const p of list) {
    if (p?.strCutout) return p.strCutout;
  }
  for (const p of list) {
    if (p?.strThumb) return p.strThumb;
  }
  return '';
}

async function fetchPhoto(name) {
  const res = await fetch(`/api/tsdb?${new URLSearchParams({ path: 'searchplayers.php', p: name })}`, {
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`art failed: ${res.status}`);
  return pickPhoto(await res.json());
}

export function playerPhoto(name) {  const clean = String(name || '').trim();
  if (!clean) return Promise.resolve('');
  const hit = readPhotos()[clean];
  if (hit !== undefined) return Promise.resolve(hit);
  if (flying.has(clean)) return flying.get(clean);
  const job = fetchPhoto(clean)
    .then((url) => {
      writePhoto(clean, url);
      return url;
    })
    .catch(() => '')
    .finally(() => {
      flying.delete(clean);
    });
  flying.set(clean, job);
  return job;
}

// Nationality → ISO for flag art (free flagcdn). Curated standard
// ISO-3166 codes only — unmapped nations render no flag, never a
// guessed one.
const NATION_ISO = {
  albania: 'al', algeria: 'dz', argentina: 'ar', australia: 'au', austria: 'at',
  belgium: 'be', brazil: 'br', bulgaria: 'bg', cameroon: 'cm', canada: 'ca',
  chile: 'cl', colombia: 'co', croatia: 'hr', czechia: 'cz', 'czech republic': 'cz',
  denmark: 'dk', ecuador: 'ec', egypt: 'eg', england: 'gb-eng', finland: 'fi',
  france: 'fr', germany: 'de', ghana: 'gh', greece: 'gr', hungary: 'hu',
  iceland: 'is', iran: 'ir', ireland: 'ie', italy: 'it', 'ivory coast': 'ci',
  japan: 'jp', mexico: 'mx', morocco: 'ma', netherlands: 'nl', nigeria: 'ng',
  'northern ireland': 'gb-nir', norway: 'no', paraguay: 'py', peru: 'pe',
  poland: 'pl', portugal: 'pt', qatar: 'qa', romania: 'ro', 'saudi arabia': 'sa',
  scotland: 'gb-sct', senegal: 'sn', serbia: 'rs', slovakia: 'sk',
  slovenia: 'si', 'south africa': 'za', 'south korea': 'kr', spain: 'es',
  sweden: 'se', switzerland: 'ch', tunisia: 'tn', turkey: 'tr', ukraine: 'ua',
  uruguay: 'uy', usa: 'us', 'united states': 'us', venezuela: 've',
  wales: 'gb-wls',
};

export function flagUrlFor(nationality) {
  const iso = NATION_ISO[String(nationality || '').trim().toLowerCase()];
  return iso ? `https://flagcdn.com/w40/${iso}.png` : '';
}

// Player card from a name search (verified payload shapes only: photo,
// club, position, birth date, nationality). Squads and lookups are
// stale soup on free — search hits are fresh enough to show. Permanent
// cache like photos, separate map.
const CARD_KEY = 'mz_tsdb_cards';

function readCards() {
  try {
    const raw = localStorage.getItem(CARD_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function pickPlayerCard(payload) {
  const list = Array.isArray(payload?.player) ? payload.player : [];
  const p = list[0];
  if (!p?.strPlayer) return null;
  return {
    name: p.strPlayer,
    team: p.strTeam || '',
    position: p.strPosition || '',
    born: p.dateBorn || '',
    nationality: p.strNationality || '',
    photo: p.strCutout || p.strThumb || '',
  };
}

const cardFlying = new Map();

export function playerCard(name) {
  const clean = String(name || '').trim();
  if (!clean) return Promise.resolve(null);
  const hit = readCards()[clean];
  if (hit !== undefined) return Promise.resolve(hit);
  if (cardFlying.has(clean)) return cardFlying.get(clean);
  const job = (async () => {
    try {
      const res = await fetch(`/api/tsdb?${new URLSearchParams({ path: 'searchplayers.php', p: clean })}`, {
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) return null;
      return pickPlayerCard(await res.json());
    } catch {
      return null;
    }
  })()
    .then((card) => {
      try {
        const all = readCards();
        all[clean] = card;
        const keys = Object.keys(all);
        while (keys.length > PHOTO_MAX) delete all[keys.shift()];
        localStorage.setItem(CARD_KEY, JSON.stringify(all));
      } catch {
        // cache is a nicety
      }
      return card;
    })
    .finally(() => {
      cardFlying.delete(clean);
    });
  cardFlying.set(clean, job);
  return job;
}
