import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.js';
import {
  storage,
  progressLabel,
  tvEstablished,
  WATCHED_PCT,
  MIN_CONTINUE_SEC,
  ESTABLISHED_CONTINUE_SEC,
} from '../src/services/storage.js';
import { resetStore } from './helpers.js';

const NOW = Date.now();
const movie = (over = {}) => ({
  mediaId: 1,
  type: 'movie',
  season: 1,
  episode: 1,
  currentTime: 0,
  duration: 0,
  percent: 0,
  title: 'T',
  poster: '/p.jpg',
  genres: [],
  updatedAt: NOW,
  ...over,
});

beforeEach(() => {
  resetStore();
  localStorage.removeItem('moviezilla_playback_progress');
});

describe('getAllContinueWatching gates', () => {
  it('shows unfinished movies, hides watched ones', () => {
    storage.saveProgress({ mediaId: 1, type: 'movie', currentTime: 1800, duration: 7200, title: 'A', poster: '/a' });
    storage.saveProgress({ mediaId: 2, type: 'movie', currentTime: 1, duration: 1, title: 'B', poster: '/b' });
    const cw = storage.getAllContinueWatching();
    assert.equal(cw.length, 1);
    assert.equal(cw[0].mediaId, 1);
  });
  it('hides fresh sub-30s peeks for unknown titles', () => {
    // Bypass the 5s peek rule by writing directly.
    const all = { movie_9: movie({ mediaId: 9, currentTime: 7, duration: 0, percent: 0 }) };
    localStorage.setItem('moviezilla_playback_progress', JSON.stringify(all));
    assert.equal(storage.getAllContinueWatching().length, 0);
    assert.ok(MIN_CONTINUE_SEC === 30);
  });
  it('established series resurface from 5s (the Sheldon rule)', () => {
    const eps = {};
    for (let s = 1; s <= 2; s++) {
      for (let e = 1; e <= 3; e++) {
        eps[`${s}x${e}`] = { currentTime: 2500, duration: 0, updatedAt: NOW - 1000 };
      }
    }
    const entry = movie({ mediaId: 7, type: 'tv', season: 3, episode: 8, currentTime: 7, duration: 0, percent: 0, title: 'S', episodes: eps });
    assert.equal(tvEstablished(entry), true);
    localStorage.setItem('moviezilla_playback_progress', JSON.stringify({ tv_7: entry }));
    const cw = storage.getAllContinueWatching();
    assert.equal(cw.length, 1);
    assert.equal(progressLabel(cw[0]), '0:07');
    assert.ok(ESTABLISHED_CONTINUE_SEC === 5);
  });
  it('treats finished episodes as established', () => {
    assert.equal(tvEstablished(movie({ type: 'tv', episodes: { '1x1': { percent: 100 } } })), true);
    assert.equal(tvEstablished(movie({ type: 'tv', episodes: {} })), false);
    assert.equal(tvEstablished(movie({ type: 'movie' })), false);
  });
});

describe('progressLabel matrix', () => {
  it('labels every entry shape', () => {
    assert.equal(progressLabel({ percent: 100 }), 'Watched');
    assert.equal(progressLabel({ percent: WATCHED_PCT }), 'Watched');
    assert.equal(progressLabel({ percent: 25, duration: 100 }), '25%');
    assert.equal(progressLabel({ percent: 0, duration: 0, currentTime: 65 }), '1:05');
    assert.equal(progressLabel({ percent: 0, duration: 0, currentTime: 0 }), 'Opened');
  });
});

describe('switchEpisode stamp', () => {
  it('new episode takes over top-level immediately, memory preserved', () => {
    storage.saveProgress({ mediaId: 5, type: 'tv', season: 1, episode: 1, currentTime: 2700, duration: 2700, title: 'S', poster: '/s' });
    storage.switchEpisode({ mediaId: 5, type: 'tv', season: 1, episode: 2, title: 'S', poster: '/s', genres: [] });
    const top = storage.getProgress('tv', 5);
    assert.equal(top.season, 1);
    assert.equal(top.episode, 2);
    assert.equal(top.percent, 0);
    assert.ok(top.episodes['1x1']);
  });
  it('never lets a 0s write clobber a real timestamp', () => {
    storage.saveProgress({ mediaId: 6, type: 'movie', currentTime: 1800, duration: 7200, title: 'M', poster: '/m' });
    storage.saveProgress({ mediaId: 6, type: 'movie', currentTime: 0, duration: 0, title: 'M', poster: '/m' });
    assert.equal(storage.getProgress('movie', 6).currentTime, 1800);
  });
});
