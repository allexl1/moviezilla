// Poisson match model (F2): win/draw/away probabilities plus likely
// scorelines from season-to-date attack and defense. Pure math, no
// network, no external AI — label it Model, never AI. Inputs come from
// the already-loaded standings tables (goals for/against), so a tap
// costs zero quota when the table is cached (12h).
const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));
const pmf = (lambda, k) => (Math.exp(-lambda) * Math.pow(lambda, k)) / fact(k);
const MAX_GOALS = 8;

// Mean goals per game inside one table (call it on the HOME table for
// avgH and the AWAY table for avgA — home edge lives in that split,
// halving a total table would erase it).
export function leagueAverages(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let goals = 0;
  let played = 0;
  for (const r of list) {
    goals += Math.max(0, Number(r?.gf) || 0);
    played += Math.max(0, Number(r?.played) || 0);
  }
  if (played <= 0) return null;
  return goals / played;
}

// Season form for one team from TOTAL rows.
export function formOf(rows, teamName) {
  const list = Array.isArray(rows) ? rows : [];
  const row = list.find((r) => r?.team?.name === teamName);
  if (!row || !(row.played > 0)) return null;
  return { scored: row.gf, conceded: row.ga, played: row.played };
}

export function predictMatch(home, away, avgH, avgA) {
  const hp = Math.max(0, Number(home?.played) || 0);
  const ap = Math.max(0, Number(away?.played) || 0);
  const ah = Math.max(0, Number(avgH) || 0);
  const aa = Math.max(0, Number(avgA) || 0);
  if (hp <= 0 || ap <= 0 || ah <= 0 || aa <= 0) return null;
  const lambdaH = Math.min(6, ((home.scored / hp) / ah) * ((away.conceded / ap) / ah) * ah);
  const lambdaA = Math.min(6, ((away.scored / ap) / aa) * ((home.conceded / hp) / aa) * aa);
  let winH = 0;
  let draw = 0;
  let winA = 0;
  const lines = [];
  for (let h = 0; h <= MAX_GOALS; h += 1) {
    for (let a = 0; a <= MAX_GOALS; a += 1) {
      const p = pmf(lambdaH, h) * pmf(lambdaA, a);
      if (h > a) winH += p;
      else if (h === a) draw += p;
      else winA += p;
      lines.push({ h, a, p });
    }
  }
  const pct = (x) => Math.round(x * 100);
  lines.sort((x, y) => y.p - x.p);
  return {
    home: pct(winH),
    draw: pct(draw),
    away: pct(winA),
    lambdaH: Math.round(lambdaH * 100) / 100,
    lambdaA: Math.round(lambdaA * 100) / 100,
    sample: Math.min(hp, ap),
    scores: lines.slice(0, 3).map((s) => ({ h: s.h, a: s.a, pct: Math.round(s.p * 100) })),
  };
}
