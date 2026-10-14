import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normLiveEvent, normKeyEvents, normRosters, normBroadcasts, normVenue, normOdds } from '../src/services/espn.js';
const liveEv = {
  id: '401915416',
  date: '2026-10-14T19:00Z',
  status: { type: { state: 'in', shortDetail: "72'", detail: "Second Half - 72'" } },
  competitions: [{
    competitors: [
      { homeAway: 'home', score: '2', team: { displayName: 'Manchester City', abbreviation: 'MCI' } },
      { homeAway: 'away', score: '1', team: { displayName: 'Paris Saint-Germain', abbreviation: 'PSG' } },
    ],
  }],
};

describe('espn summary shapes', () => {
  const json = {
    keyEvents: [
      { clock: { displayValue: "18'" }, type: { type: 'goal' }, shortText: 'Assane Diao Goal' },
      { clock: { displayValue: "23'" }, type: { type: 'substitution' }, shortText: 'X Substitution' },
      { clock: { displayValue: '' }, type: { type: 'kickoff' }, shortText: 'Kickoff' },
      { clock: { displayValue: "55'" }, type: { type: 'yellowcard' }, shortText: 'Y Card' },
    ],
    rosters: [
      { roster: [{ displayName: 'Gianluigi Donnarumma', shortDisplayName: 'Donnarumma', position: { abbreviation: 'G' }, jersey: '99', headshot: { href: 'https://h.png' } }, { displayName: '' }] },
      { roster: [] },
    ],
    broadcasts: ['Paramount+', { name: 'CBS Sports' }, {}],
    gameInfo: { venue: { fullName: 'De Kuip' } },
    hasOdds: true,
    odds: [{ provider: { name: 'Bet365' }, homeTeamOdds: '2.10', drawOdds: '3.40', awayTeamOdds: '3.10' }],
  };
  it('keeps goals, cards and subs with minutes', () => {
    const ev = normKeyEvents(json);
    assert.equal(ev.length, 3);
    assert.deepEqual(ev[0], { minute: "18'", kind: 'goal', text: 'Assane Diao Goal' });
    assert.equal(ev[2].kind, 'yellow');
  });
  it('reads squads, broadcasts, venue and odds', () => {
    const ro = normRosters(json);
    assert.equal(ro.length, 2);
    assert.deepEqual(ro[0].players[0], { name: 'Gianluigi Donnarumma', short: 'Donnarumma', position: 'G', jersey: '99', photo: 'https://h.png' });
    assert.deepEqual(normBroadcasts(json), ['Paramount+', 'CBS Sports']);
    assert.equal(normVenue(json), 'De Kuip');
    assert.deepEqual(normOdds(json), { provider: 'Bet365', home: 2.1, draw: 3.4, away: 3.1 });
  });
  it('drops odds and extras when absent', () => {
    assert.equal(normOdds({ hasOdds: false }), null);
    assert.equal(normOdds({}), null);
    assert.equal(normVenue({}), '');
    assert.deepEqual(normBroadcasts({}), []);
    assert.deepEqual(normKeyEvents({}), []);
  });
});
describe('espn live truth', () => {
  it('reads live minutes and scores, ignores the rest', () => {
    const e = normLiveEvent(liveEv);
    assert.equal(e.clock, "72'");
    assert.equal(e.home.score, '2');
    assert.equal(e.away.short, 'PSG');
    assert.equal(normLiveEvent({ status: { type: { state: 'pre' } } }), null);
    assert.equal(normLiveEvent({ status: { type: { state: 'post' } } }), null);
    assert.equal(normLiveEvent({}), null);
  });
});
