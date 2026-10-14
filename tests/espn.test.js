import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normLiveEvent } from '../src/services/espn.js';

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
