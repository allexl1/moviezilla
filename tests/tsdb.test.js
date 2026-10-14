import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickPhoto } from '../src/services/tsdb.js';

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
