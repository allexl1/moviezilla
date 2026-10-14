import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickPhoto, pickPlayerCard } from '../src/services/tsdb.js';
describe('sports art picks', () => {
  it('prefers transparent cutouts over thumbs', () => {
    assert.equal(pickPhoto({ player: [{ strThumb: 't.jpg' }, { strCutout: 'c.png', strThumb: 't2.jpg' }] }), 'c.png');
    assert.equal(pickPhoto({ player: [{ strThumb: 't.jpg' }] }), 't.jpg');
  });
  it('blanks on junk so the UI falls back to initials', () => {
    assert.equal(pickPhoto({}), '');
    assert.equal(pickPhoto(null), '');
    assert.equal(pickPhoto({ player: [{ strPlayer: 'X' }] }), '');
  });
});

describe('player card picks', () => {
  it('reads the verified search payload, null without a name', () => {
    const card = pickPlayerCard({
      player: [{
        strPlayer: 'Erling Haaland', strTeam: 'Manchester City', strPosition: 'Centre-Forward',
        dateBorn: '2000-07-21', strNationality: 'Norway', strCutout: 'c.png', strThumb: 't.jpg',
      }],
    });
    assert.deepEqual(card, {
      name: 'Erling Haaland', team: 'Manchester City', position: 'Centre-Forward',
      born: '2000-07-21', nationality: 'Norway', photo: 'c.png',
    });
    assert.equal(pickPlayerCard({}), null);
    assert.equal(pickPlayerCard({ player: [{}] }), null);
  });
});
