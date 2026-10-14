import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { leagueAverages, formOf, predictMatch } from '../src/services/predict.js';

const rows = [
  { team: { name: 'Strong' }, played: 6, gf: 15, ga: 4 },
  { team: { name: 'Weak' }, played: 6, gf: 3, ga: 14 },
  { team: { name: 'Mid' }, played: 6, gf: 8, ga: 8 },
];

describe('poisson model truth', () => {
  it('averages goals per game, null on nothing', () => {
    assert.equal(leagueAverages(rows), (15 + 3 + 8) / 18);
    assert.equal(leagueAverages([]), null);
  });
  it('reads form or admits it has none', () => {
    assert.deepEqual(formOf(rows, 'Strong'), { scored: 15, conceded: 4, played: 6 });
    assert.equal(formOf(rows, 'Ghost'), null);
  });
  it('favors the stronger home side with sane totals', () => {
    const r = predictMatch(
      { scored: 15, conceded: 4, played: 6 },
      { scored: 3, conceded: 14, played: 6 },
      1.5,
      1.2
    );
    assert.ok(r.home > r.draw && r.home > r.away);
    const total = r.home + r.draw + r.away;
    assert.ok(total >= 97 && total <= 103);
    assert.ok(r.scores.length === 3 && r.scores[0].pct >= r.scores[2].pct);
    assert.ok(r.sample === 6);
  });
  it('returns null on thin data instead of inventing', () => {
    assert.equal(predictMatch(null, { scored: 1, conceded: 1, played: 1 }, 1.4, 1.1), null);
    assert.equal(predictMatch({ scored: 1, conceded: 1, played: 0 }, { scored: 1, conceded: 1, played: 1 }, 1.4, 1.1), null);
    assert.equal(predictMatch({ scored: 1, conceded: 1, played: 1 }, { scored: 1, conceded: 1, played: 1 }, 0, 1.1), null);
  });
});
