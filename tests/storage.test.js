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

describe('series watched truth (history rewrite)', () => {
  beforeEach(() => {
    localStorage.removeItem('moviezilla_season_counts');
  });
  const tvEntry = (over = {}) => ({
    mediaId: 9,
    type: 'tv',
    season: 1,
    episode: 1,
    currentTime: 0,
    duration: 0,
    percent: 0,
    title: 'S',
    episodes: {},
    ...over,
  });
  const fullSeason = (eps) => {
    const out = {};
    for (let e = 1; e <= eps; e++) out[`1x${e}`] = { percent: 100 };
    return out;
  };
  it('movies still use percent, series need every episode or a manual mark', () => {
    assert.equal(storage.isSeriesWatched(movie({ percent: 100 }), null), true);
    assert.equal(storage.isSeriesWatched(movie({ percent: 30 }), null), false);
    assert.equal(storage.isSeriesWatched(tvEntry(), null), false);
    assert.equal(
      storage.isSeriesWatched(tvEntry({ episodes: fullSeason(10) }), null),
      false,
      'no catalog means manual-only, even fully stamped'
    );
  });
  it('manual series mark wins, unmark releases', () => {
    storage.setSeriesWatched({ mediaId: 11, type: 'tv', watched: true, title: 'S' });
    const entry = storage.getProgress('tv', 11);
    assert.equal(storage.isSeriesWatched(entry, null), true);
    storage.setSeriesWatched({ mediaId: 11, type: 'tv', watched: false });
    assert.equal(
      storage.isSeriesWatched(storage.getProgress('tv', 11), null),
      false
    );
  });
  it('all episodes watched with known counts completes, one gap does not', () => {
    const counts = { seasons: { 1: 3 }, totalSeasons: 1 };
    const full = tvEntry({
      episodes: { '1x1': { percent: 100 }, '1x2': { percent: 100 }, '1x3': { percent: 100 } },
    });
    assert.equal(storage.isSeriesWatched(full, counts), true);
    const gap = tvEntry({
      episodes: { '1x1': { percent: 100 }, '1x3': { percent: 100 } },
    });
    assert.equal(storage.isSeriesWatched(gap, counts), false);
  });
  it('specials never gate completion', () => {
    const counts = { seasons: { 0: 5, 1: 2 }, totalSeasons: 1 };
    const eps = { '1x1': { percent: 100 }, '1x2': { percent: 100 } };
    assert.equal(storage.isSeriesWatched(tvEntry({ episodes: eps }), counts), true);
  });
  it('recordSeasonCounts round-trips and ignores junk', () => {
    storage.recordSeasonCounts(12, { 1: 10, 0: 4, bad: -2 }, 2);
    assert.deepEqual(storage.getSeasonCounts(12), {
      seasons: { 1: 10 },
      totalSeasons: 2,
      at: storage.getSeasonCounts(12).at,
    });
    storage.recordSeasonCounts(13, {}, 0);
    assert.equal(storage.getSeasonCounts(13), null);
  });
});

describe('resolveResume ranking (history rewrite)', () => {
  beforeEach(() => {
    localStorage.removeItem('moviezilla_season_counts');
  });
  it('zero for unknown titles, carries S/E otherwise', () => {
    assert.deepEqual(storage.resolveResume({ type: 'tv', mediaId: 999 }), {
      second: 0,
      season: 1,
      episode: 1,
      seriesWatched: false,
      source: 'zero',
    });
    storage.saveProgress({ mediaId: 21, type: 'tv', season: 6, episode: 11, currentTime: 300, duration: 1320, title: 'S', poster: '/s' });
    const r = storage.resolveResume({ type: 'tv', mediaId: 21, server: '' });
    assert.equal(r.season, 6);
    assert.equal(r.episode, 11);
  });
  it('legacy untracked entries resume top-level, strict slots win per server', () => {
    storage.saveProgress({ mediaId: 22, type: 'movie', currentTime: 1800, duration: 7200, title: 'M', poster: '/m' });
    assert.equal(storage.resolveResume({ type: 'movie', mediaId: 22, server: '' }).second, 1800);
    storage.saveProgress({ mediaId: 23, type: 'movie', currentTime: 1800, duration: 7200, title: 'M', poster: '/m', server: 'vidy' });
    storage.saveProgress({ mediaId: 23, type: 'movie', currentTime: 300, duration: 7000, title: 'M', poster: '/m', server: 'vaplayer' });
    assert.equal(storage.resolveResume({ type: 'movie', mediaId: 23, server: 'vaplayer' }).second, 300);
    assert.equal(storage.resolveResume({ type: 'movie', mediaId: 23, server: 'vidy' }).second, 1800);
  });
  it('auto-jumps the best other slot, drops poison past duration', () => {
    storage.saveProgress({ mediaId: 24, type: 'movie', currentTime: 1800, duration: 7200, title: 'M', poster: '/m', server: 'vidy' });
    const jump = storage.resolveResume({ type: 'movie', mediaId: 24, server: 'vaplayer' });
    assert.equal(jump.second, 1800);
    assert.equal(jump.source, 'jump');
    storage.saveProgress({ mediaId: 25, type: 'movie', currentTime: 9999, duration: 1200, title: 'M', poster: '/m', server: 'vidy' });
    assert.equal(storage.resolveResume({ type: 'movie', mediaId: 25, server: 'vidy' }).second, 0);
  });
  it('finished series restart at 0 with the flag', () => {
    storage.setSeriesWatched({ mediaId: 26, type: 'tv', watched: true, title: 'S' });
    const r = storage.resolveResume({ type: 'tv', mediaId: 26, server: '' });
    assert.equal(r.second, 0);
    assert.equal(r.seriesWatched, true);
    assert.equal(r.source, 'finished');
  });
  it('switching episodes never borrows another episode point', () => {
    storage.saveProgress({ mediaId: 27, type: 'tv', season: 1, episode: 1, currentTime: 1200, duration: 2700, title: 'S', poster: '/s', server: 'vidy' });
    storage.switchEpisode({ mediaId: 27, type: 'tv', season: 1, episode: 2, title: 'S', poster: '/s', genres: [] });
    const r = storage.resolveResume({ type: 'tv', mediaId: 27, server: 'vidy' });
    assert.equal(r.episode, 2);
    assert.equal(r.second, 0);
    assert.equal(r.source, 'zero');
    const top = storage.getProgress('tv', 27);
    assert.equal(top.episodes['1x1'].servers.vidy.currentTime, 1200);
  });
  it('tv finished episode restarts at 0, voiced slots resume per server', () => {
    storage.saveProgress({ mediaId: 28, type: 'tv', season: 2, episode: 3, currentTime: 2700, duration: 2700, title: 'S', poster: '/s', server: 'vidy' });
    const done = storage.resolveResume({ type: 'tv', mediaId: 28, server: 'vidy' });
    assert.equal(done.second, 0);
    assert.equal(done.source, 'episode-done');
    storage.saveProgress({ mediaId: 29, type: 'tv', season: 1, episode: 4, currentTime: 600, duration: 2700, title: 'S', poster: '/s', server: 'vidy' });
    assert.equal(storage.resolveResume({ type: 'tv', mediaId: 29, server: 'vidy' }).second, 600);
    const jump = storage.resolveResume({ type: 'tv', mediaId: 29, server: 'vaplayer' });
    assert.equal(jump.second, 600);
    assert.equal(jump.source, 'jump');
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
