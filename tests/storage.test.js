import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.js';
import {
  storage,
  progressLabel,
  formatFullDate,
  WATCHED_PCT,
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
  it('shows everything played, even a 7s peek (no time gate)', () => {
    const all = { movie_9: movie({ mediaId: 9, currentTime: 7, duration: 0, percent: 0 }) };
    localStorage.setItem('moviezilla_playback_progress', JSON.stringify(all));
    const cw = storage.getAllContinueWatching();
    assert.equal(cw.length, 1);
    assert.equal(progressLabel(cw[0]), '0:07');
  });
  it('hides pure 0s opens, shows short watches', () => {
    const all = {
      tv_8: movie({ mediaId: 8, type: 'tv', season: 1, episode: 1, currentTime: 0, duration: 0, percent: 0, title: 'Z' }),
      tv_7: movie({ mediaId: 7, type: 'tv', season: 3, episode: 8, currentTime: 7, duration: 0, percent: 0, title: 'S', episodes: {} }),
    };
    localStorage.setItem('moviezilla_playback_progress', JSON.stringify(all));
    const cw = storage.getAllContinueWatching();
    assert.equal(cw.length, 1);
    assert.equal(cw[0].mediaId, 7);
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
      duration: 0,
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
  it('a poisoned top-level 100 never hides a half-watched series', () => {
    storage.saveProgress({ mediaId: 30, type: 'tv', season: 6, episode: 11, currentTime: 600, duration: 1320, title: 'S', poster: '/s', server: 'vidy' });
    const raw = JSON.parse(localStorage.getItem('moviezilla_playback_progress'));
    raw['tv_30'].currentTime = 1320;
    raw['tv_30'].duration = 1320;
    raw['tv_30'].percent = 100;
    localStorage.setItem('moviezilla_playback_progress', JSON.stringify(raw));
    const cw = storage.getAllContinueWatching();
    assert.ok(cw.some((x) => x.mediaId === 30), 'falsely finished series resurfaces');
    assert.equal(storage.resolveResume({ type: 'tv', mediaId: 30, server: 'vidy' }).second, 600);
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

describe('season-count filling (history rewrite remains)', () => {
  beforeEach(() => {
    localStorage.removeItem('moviezilla_season_counts');
  });
  it('merges one season at a time, never wipes known seasons', () => {
    storage.recordSeasonCounts(40, { 1: 10 }, 2);
    storage.noteSeasonCount(40, 2, 8, 2);
    assert.deepEqual(storage.getSeasonCounts(40).seasons, { 1: 10, 2: 8 });
  });
  it('ignores specials and junk, totalSeasons only grows', () => {
    storage.recordSeasonCounts(41, { 1: 10 }, 2);
    storage.noteSeasonCount(41, 0, 5, 2);
    storage.noteSeasonCount(41, 1, -3, 2);
    storage.noteSeasonCount(41, 2, 8, 1);
    assert.deepEqual(storage.getSeasonCounts(41), {
      seasons: { 1: 10, 2: 8 },
      totalSeasons: 2,
      at: storage.getSeasonCounts(41).at,
    });
  });
});

describe('next-episode arithmetic (history rewrite remains)', () => {
  beforeEach(() => {
    localStorage.removeItem('moviezilla_season_counts');
  });
  it('walks in-season, crosses seasons, hides on the known finale', () => {
    storage.recordSeasonCounts(42, { 1: 3, 2: 2 }, 2);
    assert.deepEqual(storage.nextEpisode({ mediaId: 42, season: 1, episode: 1, totalSeasons: 2 }), { season: 1, episode: 2 });
    assert.deepEqual(storage.nextEpisode({ mediaId: 42, season: 1, episode: 3, totalSeasons: 2 }), { season: 2, episode: 1 });
    assert.equal(storage.nextEpisode({ mediaId: 42, season: 2, episode: 2, totalSeasons: 2 }), null);
  });
  it('never claims a finale on an unknown catalog', () => {
    assert.deepEqual(storage.nextEpisode({ mediaId: 43, season: 1, episode: 7 }), { season: 1, episode: 8 });
  });
});

describe('episode + entry watched truth (history rewrite remains)', () => {
  beforeEach(() => {
    localStorage.removeItem('moviezilla_season_counts');
  });
  it('sees per-server finishes the top-level misses', () => {
    assert.equal(storage.isEpisodeWatched('tv', 44, 1, 1), false);
    storage.saveProgress({ mediaId: 44, type: 'tv', season: 1, episode: 1, currentTime: 2600, duration: 2700, title: 'S', poster: '/s', server: 'vidy' });
    assert.equal(storage.isEpisodeWatched('tv', 44, 1, 1), true);
  });
  it('sends manual series marks to Watched, movies stay percent-ruled', () => {
    storage.setSeriesWatched({ mediaId: 45, type: 'tv', watched: true, title: 'S' });
    assert.equal(storage.isEntryWatched(storage.getProgress('tv', 45)), true);
    assert.equal(storage.isEntryWatched(movie({ percent: 100 })), true);
    assert.equal(storage.isEntryWatched(movie({ percent: 30 })), false);
  });
});

describe('full history dates (history rewrite remains)', () => {
  it('renders the exact day, US long form', () => {
    assert.equal(formatFullDate(new Date('2026-09-19T12:00:00').getTime()), 'September 19, 2026');
    assert.equal(formatFullDate(NaN), '');
  });
});

describe('writer rule (voice-only playback)', () => {
  it('writes nothing without provider voice', () => {
    assert.equal(storage.decideSave({ voiced: false, voiceTime: 600, voiceDur: 2700, prevTime: 100 }), null);
    assert.equal(storage.decideSave({}), null);
  });
  it('writes nothing verified-nothing, never clobbers with zero', () => {
    assert.equal(storage.decideSave({ voiced: true, voiceTime: 0, voiceDur: 0, prevTime: 0 }), null);
    assert.equal(storage.decideSave({ voiced: true, voiceTime: 0, voiceDur: 2700, prevTime: 600 }), null);
  });
  it('rooms never move backwards, solo keeps latest-wins', () => {
    assert.equal(storage.decideSave({ voiced: true, voiceTime: 100, voiceDur: 2700, prevTime: 600, isRoom: true }), null);
    assert.deepEqual(storage.decideSave({ voiced: true, voiceTime: 100, voiceDur: 2700, prevTime: 600 }), { currentTime: 100, duration: 2700 });
  });
  it('snaps voiced finishes to runtime, passes plain points through', () => {
    assert.deepEqual(
      storage.decideSave({ voiced: true, voiceTime: 2600, voiceDur: 2700, prevTime: 0, runtimeSec: 2700 }),
      { currentTime: 2700, duration: 2700 }
    );
    assert.deepEqual(
      storage.decideSave({ voiced: true, voiceTime: 600, voiceDur: 2700, prevTime: 100, runtimeSec: 2700 }),
      { currentTime: 600, duration: 2700 }
    );
  });
});
