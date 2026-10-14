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

export function playerPhoto(name) {
  const clean = String(name || '').trim();
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
