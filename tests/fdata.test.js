import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normTable, normMatches, normScorers, isoDay, shiftDayIso } from '../src/services/fdata.js';

describe('fdata standings truth', () => {
  const json = {
    standings: [
      {
        type: 'TOTAL',
        table: [
          { position: 1, team: { id: 1, name: 'A', crest: 'https://c/a.png' }, playedGames: 5, won: 4, draw: 1, lost: 0, goalDifference: 9, points: 13, form: 'W,W,W,D,W' },
          { position: 2, team: { id: 2, name: 'B', crest: '' }, playedGames: 5, won: 3, draw: 0, lost: 2, goalDifference: 2, points: 9, form: null },
        ],
      },
    ],
  };
  it('reads rows, splits form, falls back home/away to total', () => {
    const t = normTable(json);
    assert.equal(t.total.length, 2);
    assert.deepEqual(t.total[0].form, ['W', 'W', 'W', 'D', 'W']);
    assert.equal(t.total[1].team.crest, '');
    assert.deepEqual(t.home, t.total);
    assert.deepEqual(t.away, t.total);
  });
  it('survives junk shapes', () => {
    assert.deepEqual(normTable({}), { total: [], home: [], away: [] });
    assert.deepEqual(normTable(null), { total: [], home: [], away: [] });
  });
});

describe('fdata fixtures honesty', () => {
  const json = {
    matches: [
      { id: 1, utcDate: '2026-10-14T18:45:00Z', status: 'FINISHED', homeTeam: { name: 'A', crest: 'u' }, awayTeam: { name: 'B', crest: 'v' }, score: { fullTime: { home: 2, away: 1 } } },
      { id: 2, utcDate: '2026-10-15T19:00:00Z', status: 'IN_PLAY', homeTeam: { name: 'C' }, awayTeam: { name: 'D' }, score: { fullTime: { home: 1, away: 0 } } },
      { id: 3, utcDate: '2026-10-20T19:00:00Z', status: 'SCHEDULED', homeTeam: { name: 'E' }, awayTeam: { name: 'F' }, score: { fullTime: { home: null, away: null } } },
    ],
  };
  it('marks finished, flags live-as-delayed, leaves scheduled scoreless', () => {
    const [a, b, c] = normMatches(json);
    assert.equal(a.finished, true);
    assert.equal(a.delayed, false);
    assert.equal(a.home.score, 2);
    assert.equal(b.delayed, true);
    assert.equal(b.finished, false);
    assert.equal(c.home.score, null);
    assert.equal(c.utc, Date.parse('2026-10-20T19:00:00Z'));
  });
});

describe('fdata scorers + dates', () => {
  it('takes the top 10, blanks on junk', () => {
    const rows = normScorers({ scorers: [{ player: { name: 'X' }, team: { name: 'T' }, goals: 9 }] });
    assert.deepEqual(rows, [{ name: 'X', team: 'T', goals: 9 }]);
    assert.deepEqual(normScorers({}), []);
  });
  it('walks calendar days', () => {
    assert.equal(shiftDayIso('2026-10-14', 1), '2026-10-15');
    assert.equal(shiftDayIso('2026-10-14', -1), '2026-10-13');
    assert.match(isoDay(), /^\d{4}-\d{2}-\d{2}$/);
  });
});
