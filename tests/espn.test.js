import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normLiveEvent, normKeyEvents, normRosters, normBroadcasts, normVenue, normOdds, normStats, normHeader } from '../src/services/espn.js';
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
      { clock: { displayValue: "5'" }, type: { type: 'penalty---scored' }, shortText: 'Tai Baribo Penalty - Scored' },
      { clock: { displayValue: "23'" }, type: { type: 'substitution' }, shortText: 'X Substitution' },
      { clock: { displayValue: '' }, type: { type: 'kickoff' }, shortText: 'Kickoff' },
      { clock: { displayValue: "55'" }, type: { type: 'yellow-card' }, shortText: 'Y Card' },
    ],
    rosters: [
      { team: { displayName: 'Home FC' }, roster: [{ athlete: { displayName: 'Gianluigi Donnarumma', shortName: 'Donnarumma' }, position: { abbreviation: 'G' }, jersey: '99', starter: true }, { athlete: { displayName: 'Sub Man' }, starter: false }, { athlete: { displayName: '' } }] },
      { team: { displayName: 'Away FC' }, roster: [] },
    ],
    broadcasts: ['Paramount+', { name: 'CBS Sports' }, {}],
    gameInfo: { venue: { fullName: 'De Kuip' } },
    hasOdds: true,
    odds: [{ provider: { name: 'Bet365' }, homeTeamOdds: '2.10', drawOdds: '3.40', awayTeamOdds: '3.10' }],
  };
  it('keeps goals, cards and subs with minutes', () => {
    const ev = normKeyEvents(json);
    assert.equal(ev.length, 4);
    assert.deepEqual(ev[0], { minute: "18'", kind: 'goal', text: 'Assane Diao Goal' });
    assert.equal(ev[1].kind, 'goal');
    assert.equal(ev[3].kind, 'yellow');
  });
  it('reads squads, broadcasts, venue and odds', () => {
    const ro = normRosters(json, 'Home FC', 'Away FC');
    assert.equal(ro.length, 2);
    assert.deepEqual(ro[0].players[0], { name: 'Gianluigi Donnarumma', short: 'Donnarumma', position: 'G', jersey: '99', sub: false });
    assert.equal(ro[0].players[1].sub, true);
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
  it('orders stats home-first and pairs passes and tackles', () => {
    const j = {
      boxscore: {
        teams: [
          { team: { displayName: 'Liverpool' }, statistics: [{ name: 'possessionPct', displayValue: '64.2' }, { name: 'totalShots', displayValue: '26' }, { name: 'accuratePasses', displayValue: '524' }, { name: 'totalPasses', displayValue: '576' }, { name: 'effectiveTackles', displayValue: '8' }, { name: 'totalTackles', displayValue: '12' }] },
          { team: { displayName: 'LASK Linz' }, statistics: [{ name: 'possessionPct', displayValue: '35.8' }, { name: 'totalShots', displayValue: '12' }, { name: 'accuratePasses', displayValue: '251' }, { name: 'totalPasses', displayValue: '310' }] },
        ],
      },
    };
    const st = normStats(j, 'LASK Linz', 'Liverpool');
    const poss = st.rows.find((r) => r.label === 'Possession');
    assert.deepEqual([poss.home, poss.away], ['35.8', '64.2']);
    const passes = st.rows.find((r) => r.label === 'Passes');
    assert.deepEqual([passes.home, passes.away], ['251/310', '524/576']);
    const tackles = st.rows.find((r) => r.label === 'Tackles');
    assert.deepEqual([tackles.home, tackles.away], ['—', '8/12']);
    assert.equal(normStats({}, 'A', 'B'), null);
  });
  it('reads header state, clock and scores', () => {    const j = {
      header: {
        competitions: [{
          status: { type: { state: 'in', shortDetail: "72'", detail: "Second Half" } },
          competitors: [
            { homeAway: 'home', score: '2', team: { displayName: 'A' } },
            { homeAway: 'away', score: '1', team: { displayName: 'B' } },
          ],
        }],
      },
    };
    assert.deepEqual(normHeader(j), { state: 'in', clock: "72'", home: { name: 'A', score: 2 }, away: { name: 'B', score: 1 } });
    assert.equal(normHeader({}).state, '');
  });
  it('orders away-first groups home-first', () => {
    const j = {
      rosters: [
        { team: { displayName: 'Away FC' }, roster: [{ athlete: { displayName: 'Away Player' }, starter: true }] },
        { team: { displayName: 'Home FC' }, roster: [{ athlete: { displayName: 'Home Player' }, starter: true }] },
      ],
    };
    const ro = normRosters(j, 'Home FC', 'Away FC');
    assert.equal(ro[0].players[0].name, 'Home Player');
    assert.equal(ro[1].players[0].name, 'Away Player');
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
