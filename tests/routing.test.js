import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveMediaType,
  parseLocation,
  buildLocation,
} from '../src/services/routing.js';

const loc = (pathname, search = '') => ({ pathname, search });

describe('resolveMediaType (single source of truth)', () => {
  it('prefers explicit media_type', () => {
    assert.equal(resolveMediaType({ media_type: 'tv' }), 'tv');
    assert.equal(resolveMediaType({ media_type: 'movie' }), 'movie');
  });
  it('falls back to type, then first_air_date, then movie', () => {
    assert.equal(resolveMediaType({ type: 'tv' }), 'tv');
    assert.equal(resolveMediaType({ id: 1, first_air_date: '2020-01-01' }), 'tv');
    assert.equal(resolveMediaType({ id: 1, release_date: '2020-01-01' }), 'movie');
    assert.equal(resolveMediaType({}), 'movie');
    assert.equal(resolveMediaType(null), 'movie');
  });
  it('never returns the nav tab for typeless discover rows', () => {
    // The /movie/<showId> bug: a show without media_type must be tv.
    assert.equal(resolveMediaType({ id: 456, first_air_date: '1989-12-17' }), 'tv');
  });
});

describe('buildLocation / parseLocation round-trips', () => {
  it('media URLs carry their own type', () => {
    assert.equal(
      buildLocation({ tab: 'tv', media: { id: 456, first_air_date: 'x' } }),
      '/tv/456'
    );
    assert.equal(
      buildLocation({ tab: 'movie', media: { id: 155, media_type: 'movie' } }),
      '/movie/155'
    );
  });
  it('tab-root playback stamps ?from=, detail playback does not', () => {
    assert.equal(
      buildLocation({ tab: 'watchlist', media: { id: 155, media_type: 'movie' }, play: true, from: 'watchlist' }),
      '/movie/155?play=1&from=watchlist'
    );
    assert.equal(
      buildLocation({ tab: 'movie', media: { id: 155, media_type: 'movie' }, play: true }),
      '/movie/155?play=1'
    );
  });
  it('person URLs keep non-home tabs', () => {
    assert.equal(buildLocation({ tab: 'tv', personId: 1813 }), '/person/1813?tab=tv');
    assert.equal(buildLocation({ tab: 'home', personId: 1813 }), '/person/1813');
  });
  it('studio URLs round-trip like person URLs', () => {
    assert.equal(buildLocation({ tab: 'movie', studioId: 1565 }), '/studio/1565?tab=movie');
    assert.equal(buildLocation({ tab: 'home', studioId: 1565 }), '/studio/1565');
    const p = parseLocation(loc('/studio/1565', '?tab=movie'));
    assert.equal(p.studioId, 1565);
    assert.equal(p.tab, 'movie');
  });
  it('parses ?play=1&from= back out', () => {
    const p = parseLocation(loc('/movie/155', '?play=1&from=watchlist'));
    assert.equal(p.play, true);
    assert.equal(p.from, 'watchlist');
    assert.equal(p.media.id, 155);
  });
  it('rejects bogus from/tab values', () => {
    assert.equal(parseLocation(loc('/movie/1', '?play=1&from=nowhere')).from, null);
    assert.equal(parseLocation(loc('/person/5', '?tab=nope')).tab, 'home');
  });
  it('drops ?play=1 without media', () => {
    const p = parseLocation(loc('/', '?play=1'));
    assert.equal(p.play, false);
    assert.equal(p.media, null);
  });
  it('legacy ?room= resolves on any path, explicit /room/ wins', () => {
    assert.equal(parseLocation(loc('/movies', '?room=abc123')).roomCode, 'ABC123');
    assert.equal(parseLocation(loc('/room/AAA111', '?room=BBB222')).roomCode, 'AAA111');
  });
  it('unknown paths fall back home', () => {
    assert.equal(parseLocation(loc('/nope')).tab, 'home');
  });
});
