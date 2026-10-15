import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normTable, normMatches, normScorers, isoDay, shiftDayIso, filterUtcDay } from '../src/services/fdata.js';
import { clubKey, findStreamFor } from '../src/services/football.js';

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
  it('keeps only the requested UTC day', () => {
    const rows = [
      { utc: Date.parse('2026-10-14T18:45:00Z') },
      { utc: Date.parse('2026-10-15T00:30:00Z') },
      { utc: 0 },
    ];
    assert.equal(filterUtcDay(rows, '2026-10-14').length, 1);
  });
});

describe('day view competition + stream matching', () => {
  it('carries the competition on every row', () => {
    const [m] = normMatches({
      matches: [{
        id: 9, utcDate: '2026-10-14T18:45:00Z', status: 'FINISHED',
        competition: { code: 'CL', name: 'UEFA Champions League', emblem: 'https://x/CL.png' },
        homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, score: { fullTime: { home: 1, away: 0 } },
      }],
    });
    assert.deepEqual(m.competition, { code: 'CL', name: 'UEFA Champions League', emblem: 'https://x/CL.png' });
  });
  it('normalizes club noise and aliases', () => {
    assert.equal(clubKey('FC Porto'), 'porto');
    assert.equal(clubKey('Fenerbahçe SK'), 'fenerbahce');
    assert.equal(clubKey('D.C. United'), 'dc united');
    assert.equal(clubKey('Red Bull New York'), 'new york red bulls');
    assert.equal(clubKey('FK Bodø/Glimt'), 'bodo glimt');
    assert.equal(clubKey('Man City'), 'manchester city');
    assert.equal(clubKey('PSG'), 'paris saint germain');
  });
  it('matches both sides confidently or not at all', () => {
    const streams = [
      { title: 'Man City vs PSG' },
      { title: 'Real Betis vs Porto' },
      { title: 'Goals Show Xtra (TNT)' },
    ];
    assert.equal(findStreamFor(streams, 'Manchester City FC', 'Paris Saint-Germain FC').title, 'Man City vs PSG');
    assert.equal(findStreamFor(streams, 'Real Betis Balompié', 'FC Porto').title, 'Real Betis vs Porto');
    assert.equal(findStreamFor(streams, 'AS Roma', 'Real Madrid CF'), null);
    assert.equal(findStreamFor(streams, 'Manchester City FC', 'Real Madrid CF'), null);
    assert.equal(findStreamFor([], 'A', 'B'), null);
  });
});

describe('kickoff countdown', () => {
  it('counts down in days, hours and minutes, then goes quiet', async () => {
    const { countdownTo } = await import('../src/services/football.js');
    const now = Date.parse('2026-10-14T12:00:00Z');
    assert.equal(countdownTo(Date.parse('2026-10-17T15:00:00Z'), now), 'Starts in 3d 3h');
    assert.equal(countdownTo(Date.parse('2026-10-14T15:12:00Z'), now), 'Starts in 3h 12m');
    assert.equal(countdownTo(Date.parse('2026-10-14T12:40:00Z'), now), 'Starts in 40m');
    assert.equal(countdownTo(Date.parse('2026-10-14T12:00:30Z'), now), 'Starting now');
    assert.equal(countdownTo(Date.parse('2026-10-14T11:00:00Z'), now), null);
    assert.equal(countdownTo(0, now), null);
  });
});
