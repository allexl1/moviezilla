import { useState, useEffect } from 'react';
import { Trophy, ArrowLeft, RefreshCw, Radio, ExternalLink, MonitorPlay, ChevronLeft, ChevronRight, Calendar, Calculator } from 'lucide-react';
import { football, FOOTBALL_MIRRORS, formatKickoff, formatTime, getPreferredStream, setPreferredStream, findStreamFor } from '../services/football';
import { fdata, FCOMPS, isoDay, shiftDayIso } from '../services/fdata';
import { leagueAverages, formOf, predictMatch } from '../services/predict';
import { playerPhoto, playerCard, flagUrlFor } from '../services/tsdb';
import Modal from './ui/Modal';
import EmptyState from './ui/EmptyState';
import SegmentedControl from './ui/SegmentedControl';

function MatchCard({ match, onWatch }) {
  return (
    <div
      onClick={() => onWatch(match)}
      className="mat-row p-4 cursor-pointer space-y-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 truncate">
          {match.league || (match.live ? 'Live' : 'Upcoming')}
        </span>
        {match.live ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-red-400 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            LIVE
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-white/60 flex-shrink-0">
            {formatKickoff(match.kickoffMs)}
          </span>
        )}
      </div>
      <h3 className="text-base font-bold text-white tracking-tight leading-snug">
        {match.title}
        {match.popular && !match.live && (
          <span className="ml-2 align-middle text-[10px] font-black uppercase tracking-wider text-[var(--cine-accent)]">
            Popular
          </span>
        )}
      </h3>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-white/50">
          {match.sources.length} source{match.sources.length === 1 ? '' : 's'}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--cine-accent)]">
          <MonitorPlay className="w-3.5 h-3.5" /> Watch
        </span>
      </div>
    </div>
  );
}

// Team crest with an initial-chip fallback (remote art dies silently;
// a letter always renders — never a broken-image icon).
function Crest({ name, crest, size = 'w-6 h-6' }) {
  const [dead, setDead] = useState(false);
  if (!crest || dead) {
    return (
      <span
        className={`${size} rounded-full bg-white/10 text-white/70 text-[10px] font-black flex items-center justify-center flex-shrink-0`}
        aria-hidden="true"
      >
        {(name || '?').slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={crest}
      alt=""
      loading="lazy"
      onError={() => setDead(true)}
      className={`${size} object-contain flex-shrink-0`}
    />
  );
}

// Scorer face: lazy photo with an initial chip until (and unless)
// the art lands. One fetch per face ever — the service cache holds.
function ScorerPhoto({ name }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    playerPhoto(name).then((u) => {
      if (alive) setUrl(u || '');
    });
    return () => {
      alive = false;
    };
  }, [name]);
  if (!url) {
    return (
      <span
        className="w-10 h-10 rounded-full bg-white/10 text-white/70 text-sm font-black flex items-center justify-center flex-shrink-0"
        aria-hidden="true"
      >
        {(name || '?').slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return <img src={url} alt="" loading="lazy" className="w-10 h-10 rounded-full object-cover bg-white/5 flex-shrink-0" />;
}

function FormDots({ form }) {
  if (!form || form.length === 0) return <span className="text-white/25">—</span>;
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Form ${form.join(', ')}`}>
      {form.slice(-5).map((r, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`w-1.5 h-1.5 rounded-full ${
            r === 'W' ? 'bg-[var(--cine-accent)]' : r === 'D' ? 'bg-white/40' : 'bg-red-400'
          }`}
        />
      ))}
    </span>
  );
}

const VENUES = [
  { id: 'total', name: 'Total' },
  { id: 'home', name: 'Home' },
  { id: 'away', name: 'Away' },
];

function fixtureLabel(m) {
  if (m.finished) return 'FT';
  if (m.delayed) return 'Delayed';
  if (m.status === 'POSTPONED') return 'Postponed';
  if (m.status === 'SUSPENDED') return 'Suspended';
  if (m.status === 'CANCELLED') return 'Cancelled';
  return formatTime(m.utc);
}

// Round column (soccer365 anatomy): matchday number wins, else the
// stage humanized. One label per row, never invented.
function roundLabel(m) {
  if (m.matchday) return `Matchday ${m.matchday}`;
  const s = String(m.stage || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return s || '';
}

const DAY_FILTERS = [
  { id: 'all', name: 'All' },
  { id: 'watchable', name: 'Watchable' },
  { id: 'finished', name: 'Finished' },
];

// Team page (verified shapes only): table line + form from our
// standings, club scorers from our scorers (with photos), season
// results and fixtures from one cached team call. No squad lists —
// free squad data is stale soup (players at wrong clubs), showing it
// as fact would lie.
function TeamView({ team, code, onOpenPlayer }) {
  const [data, setData] = useState(undefined);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [t, ms] = await Promise.all([
          fdata.table(code),
          team.id ? fdata.teamMatches(team.id) : Promise.resolve([]),
        ]);
        let sc = [];
        try {
          sc = (await fdata.scorers(code)) || [];
        } catch {
          sc = [];
        }
        if (!alive) return;
        const row = (t.total || []).find((r) => r.team.name === team.name);
        setData({
          row: row || null,
          results: ms.filter((m) => m.finished).sort((a, b) => b.utc - a.utc).slice(0, 5),
          fixtures: ms.filter((m) => !m.finished).sort((a, b) => a.utc - b.utc).slice(0, 5),
          scorers: sc.filter((s) => s.team === team.name).slice(0, 5),
        });
      } catch {
        if (alive) setData(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [team.id, team.name, code]);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {team.crest ? (
          <img src={team.crest} alt="" className="w-16 h-16 object-contain flex-shrink-0" />
        ) : (
          <span className="w-16 h-16 rounded-full bg-white/10 text-white/70 text-2xl font-black flex items-center justify-center flex-shrink-0" aria-hidden="true">
            {(team.name || '?').slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-2xl font-extrabold text-white tracking-tight truncate">{team.name}</h3>
          {data?.row && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="cine-chip cine-chip--neutral">Pos {data.row.pos}</span>
              <span className="cine-chip cine-chip--neutral">{data.row.points} pts</span>
              <span className="cine-chip cine-chip--neutral">{data.row.won}W {data.row.draw}D {data.row.lost}L</span>
            </div>
          )}
        </div>
      </div>
      {data === undefined ? (
        <p className="text-xs text-white/60 py-6 text-center">Loading club…</p>
      ) : data === null ? (
        <p className="text-xs text-white/60 py-6 text-center">Could not load this club right now.</p>
      ) : (
        <>
          {data.scorers.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-white/45">Top scorers</h4>
              {data.scorers.map((s) => (
                <button
                  key={s.name}
                  onClick={() => onOpenPlayer({ name: s.name, team: s.team, goals: s.goals, crest: team.crest })}
                  className="mat-row w-full px-3 py-2 flex items-center gap-3 text-left cursor-pointer"
                  aria-label={`Open ${s.name}`}
                >
                  <ScorerPhoto key={s.name} name={s.name} />
                  <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">{s.name}</span>
                  <span className="text-sm font-black text-white tabular-nums">{s.goals}</span>
                </button>
              ))}
            </div>
          )}
          {data.results.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-white/45">Results</h4>
              {data.results.map((m) => (
                <div key={m.id} className="mat-row px-3 py-2 flex items-center gap-2 text-sm">
                  <span className="flex-1 min-w-0 truncate text-white/85">
                    {m.home.name} {m.home.score ?? 0} - {m.away.score ?? 0} {m.away.name}
                  </span>
                  <span className="text-[10px] font-bold text-white/40 flex-shrink-0">FT</span>
                </div>
              ))}
            </div>
          )}
          {data.fixtures.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-white/45">Upcoming</h4>
              {data.fixtures.map((m) => (
                <div key={m.id} className="mat-row px-3 py-2 flex items-center gap-2 text-sm">
                  <span className="flex-1 min-w-0 truncate text-white/85">
                    {m.home.name} vs {m.away.name}
                  </span>
                  <span className="text-[10px] font-bold text-white/40 flex-shrink-0">{formatTime(m.utc)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Player page: the verified search card (photo, club, position, birth,
// nationality) plus season goals from our scorers when the caller knows
// them. No squad lookups — free squad data is stale.
function PlayerView({ name, team, goals, crest }) {
  const [card, setCard] = useState(undefined);
  const [age, setAge] = useState(null);
  useEffect(() => {
    let alive = true;
    playerCard(name).then((c) => {
      if (!alive) return;
      setCard(c || null);
      setAge(c?.born && Number.isFinite(Date.parse(c.born)) ? Math.floor((Date.now() - Date.parse(c.born)) / 31557600000) : null);
    });
    return () => {
      alive = false;
    };
  }, [name]);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {card?.photo ? (
          <img src={card.photo} alt="" className="w-24 h-24 rounded-full object-cover bg-white/5 flex-shrink-0" />
        ) : (
          <span className="w-24 h-24 rounded-full bg-white/10 text-white/70 text-3xl font-black flex items-center justify-center flex-shrink-0" aria-hidden="true">
            {(card?.name || name || '?').slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-2xl font-extrabold text-white tracking-tight truncate">{card?.name || name}</h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {(card?.position || team) && (
              <span className="cine-chip cine-chip--neutral">{card?.position || team}</span>
            )}
            {card && goals != null && (
              <span className="cine-chip cine-chip--accent">{goals} goals</span>
            )}
          </div>
        </div>
      </div>
      {card === undefined ? (
        <p className="text-xs text-white/60 py-4 text-center">Loading player…</p>
      ) : card === null ? (
        <p className="text-xs text-white/60 py-4 text-center">No profile found for this player.</p>
      ) : (
        <div className="mat-row p-3 space-y-1.5 text-xs">
          {(team || card?.team) && (
            <p className="text-white/75 flex items-center gap-2">
              <span className="text-white/40 font-bold uppercase text-[10px] tracking-wider">Club</span>
              {crest && <img src={crest} alt="" className="w-5 h-5 object-contain" />}
              {team || card?.team}
            </p>
          )}
          {card?.nationality && (
            <p className="text-white/75 flex items-center gap-2">
              <span className="text-white/40 font-bold uppercase text-[10px] tracking-wider">Country</span>
              {flagUrlFor(card.nationality) && (
                <img src={flagUrlFor(card.nationality)} alt="" loading="lazy" className="w-5 h-auto rounded-[3px]" />
              )}
              {card.nationality}
            </p>
          )}
          {age != null && Number.isFinite(age) && (
            <p className="text-white/75"><span className="text-white/40 font-bold uppercase text-[10px] tracking-wider">Age </span>{age}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function FootballView({ onToast }) {  const [live, setLive] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [watching, setWatching] = useState(null);
  const [streams, setStreams] = useState([]);
  const [streamIdx, setStreamIdx] = useState(0);
  const [streamsLoading, setStreamsLoading] = useState(false);
  // Data tabs (free football-data.org key): watch = Streamed watchables,
  // the rest are competition tables + fixtures + scorers.
  const [comp, setComp] = useState('watch');
  const [venue, setVenue] = useState('total');
  const [day, setDay] = useState(() => isoDay());
  // Loaded snapshot keyed by query (render-derived loading, never
  // setState-in-effect): switching tabs keeps the old table visible
  // under a small updating note instead of flashing skeletons.
  const [loaded, setLoaded] = useState({ key: null, table: null, fixtures: [], scorers: null, error: '' });
  const [dataRetry, setDataRetry] = useState(0);
  const queryKey = `${comp}|${day}|${dataRetry}`;
  const updating = comp !== 'watch' && loaded.key !== queryKey;

  // Day view (F1 match center): one call covers all competitions, rows
  // group client-side by league. Same render-derived loading as above.
  const [dayFilter, setDayFilter] = useState('all');
  const [railComp, setRailComp] = useState('all');
  const [dayLoaded, setDayLoaded] = useState({ key: null, rows: [], error: '' });
  const dayUpdating = dayLoaded.key !== day;
  useEffect(() => {
    if (dayLoaded.key === day) return;
    let alive = true;
    (async () => {
      try {
        const rows = await fdata.dayAll(day);
        if (alive) setDayLoaded({ key: day, rows, error: '' });
      } catch (err) {
        if (alive) {
          setDayLoaded({
            key: day,
            rows: [],
            error: err?.rateLimited ? 'Scores are busy. Retry shortly.' : 'Could not load matches.',
          });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [day, dayLoaded.key]);

  // Auto-refresh the board every minute while open.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    football
      .getMatches()
      .then((res) => {
        if (!alive) return;
        setLive(res.live);
        setUpcoming(res.upcoming);
        setLoading(false);
      })
      .catch(() => {
        if (alive) {
          setFailed(true);
          setLoading(false);
        }
      });
    const timer = setInterval(() => setRefreshKey((k) => k + 1), 60 * 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [refreshKey]);

  // Competition data: table + day fixtures load together, scorers rides
  // along (null when the free plan gates it, so the section hides).
  // One comp switch costs at most 3 cached calls against the 10/min quota.
  // State writes happen only in async callbacks below, never in the body.
  useEffect(() => {
    if (comp === 'watch' || loaded.key === queryKey) return;
    let alive = true;
    (async () => {
      try {
        const [t, f] = await Promise.all([
          fdata.table(comp),
          fdata.fixtures(comp, day, day),
        ]);
        let s = null;
        try {
          s = await fdata.scorers(comp);
        } catch {
          s = null;
        }
        if (alive) setLoaded({ key: queryKey, table: t, fixtures: f, scorers: s, error: '' });
      } catch (err) {
        if (alive) {
          setLoaded({
            key: queryKey,
            table: null,
            fixtures: [],
            scorers: null,
            error: err?.rateLimited ? 'Football data is busy. Retry shortly.' : 'Could not load this competition.',
          });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [comp, day, dataRetry, loaded.key, queryKey]);

  const openMatch = async (match) => {
    setWatching(match);
    setStreams([]);
    setStreamIdx(0);
    const first = match.sources[0];
    if (!first) return;
    setStreamsLoading(true);
    try {
      // Gather streams from every source so one dying mid-match is a tap away.
      const all = [];
      for (const s of match.sources.slice(0, 4)) {
        try {
          const list = await football.getStreams(s.source, s.refId);
          for (const st of list) all.push({ ...st, via: s.source });
        } catch {
          // one dead source must not kill the others
        }
      }
      setStreams(all);
      // Reopen on the last-working source when it's still listed —
      // otherwise index 0, same as before.
      const pref = getPreferredStream(match.id);
      const prefIdx = pref ? all.findIndex((st) => st.via === pref.via && (st.n ?? 0) === (pref.n ?? 0)) : -1;
      setStreamIdx(prefIdx >= 0 ? prefIdx : 0);
      if (all.length === 0) onToast?.('No playable streams for this match right now');
    } finally {
      setStreamsLoading(false);
    }
  };

  // Model panel (F2): Poisson over season form, computed on tap from
  // the cached table (zero quota when cached). One open at a time;
  // late resolves carry their match id so a stale answer never lands
  // under a newer row. Scheduled rows only, finished needs no model.
  const [modelId, setModelId] = useState(null);
  const [model, setModel] = useState(null);

  // Team/player pages (modal): one open at a time, keyed remounts reset
  // each view. Team carries its comp code for tables and matches.
  const [profile, setProfile] = useState(null);
  const openModel = async (m) => {
    if (modelId === m.id) {
      setModelId(null);
      setModel(null);
      return;
    }
    setModelId(m.id);
    setModel(null);
    try {
      const t = await fdata.table(m.competition.code);
      const data = predictMatch(
        formOf(t.total, m.home.name),
        formOf(t.total, m.away.name),
        leagueAverages(t.home),
        leagueAverages(t.away)
      );
      setModel(data ? { id: m.id, data } : { id: m.id, thin: true });
    } catch {
      setModel({ id: m.id, error: true });
    }
  };

  if (watching) {
    const active = streams[streamIdx];
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setWatching(null)}
            className="cine-icon-btn cine-icon-btn--sm"
            title="Back to matches"
            aria-label="Back to matches"
          >            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white truncate">{watching.title}</h2>
            <p className="text-[11px] text-white/60">
              {watching.live ? 'Live now' : formatKickoff(watching.kickoffMs)}
            </p>
          </div>
        </div>

        <div className="rounded-3xl overflow-hidden border border-[var(--cine-glass-border)] bg-black aspect-video">
          {streamsLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-[var(--cine-accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : active ? (
            <iframe
              key={active.url}
              src={active.url}
              title={watching.title}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-presentation"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-6 text-center">
              <p className="text-xs text-white/60">No playable streams — try a mirror below.</p>
            </div>
          )}
        </div>

        {streams.length > 1 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
            {streams.map((s, i) => (
              <button
                key={`${s.via}_${s.n}_${i}`}
                onClick={() => {
                  setStreamIdx(i);
                  setPreferredStream(watching.id, s);
                }}
                aria-pressed={i === streamIdx}
                className={`cine-pill${i === streamIdx ? ' cine-pill--active' : ''}`}
              >
                {s.via} {s.n}
                {s.hd ? ' • HD' : ''}
                {s.lang ? ` • ${s.lang}` : ''}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">Mirrors:</span>
          {FOOTBALL_MIRRORS.map((m) => (
            <a
              key={m.name}
              href={m.url}
              target="_blank"
              rel="noreferrer"
              className="cine-pill cine-pill--sm"
            >
              {m.name}
              <ExternalLink className="w-3 h-3" />
            </a>
          ))}
        </div>
      </div>
    );
  }

  const compName = comp === 'watch' ? '' : (FCOMPS.find((c) => c.code === comp)?.name || comp);
  const table = loaded.table;
  const fixtures = loaded.fixtures;
  const scorers = loaded.scorers;
  const showError = !updating && loaded.error;
  const rows = table ? table[venue] || table.total : [];

  // Day view assembly (F1): Streamed watchables meet data rows on the
  // confident matcher only — no match, no button. Unmatched streams
  // keep their cards below, so no coverage is ever lost.
  const streamPool = [...live, ...upcoming];
  const dayRows = dayLoaded.rows.map((m) => ({ m, hit: findStreamFor(streamPool, m.home.name, m.away.name) }));
  const hitTitles = new Set(dayRows.filter((r) => r.hit).map((r) => r.hit.title));
  const extraStreams = upcoming.filter((u) => !hitTitles.has(u.title));
  const dayComps = FCOMPS.filter((c) => dayRows.some((r) => r.m.competition.code === c.code));
  const railComps = railComp === 'all' ? dayComps : dayComps.filter((c) => c.code === railComp);
  const visibleRows = (code) => dayRows.filter((r) => {
    if (r.m.competition.code !== code) return false;
    if (dayFilter === 'finished' && !r.m.finished) return false;
    if (dayFilter === 'watchable' && !r.hit) return false;
    return true;
  });
  const visibleCount = railComps.reduce((n, c) => n + visibleRows(c.code).length, 0);

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex-shrink-0">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">Football</h1>
          <p className="text-sm text-white/60 mt-1">
            {comp === 'watch'
              ? (live.length > 0 ? `${live.length} live now` : 'Upcoming matches, top leagues + UCL')
              : compName}
          </p>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="cine-control-btn self-start lg:self-auto"
          title="Refresh matches"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Competition tabs: Watch (streams) + the 12 free-data leagues. */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="Competitions">
        <button
          key="watch"
          role="tab"
          aria-selected={comp === 'watch'}
          onClick={() => setComp('watch')}
          className={`cine-pill cine-pill--sm flex-shrink-0${comp === 'watch' ? ' cine-pill--active' : ''}`}
        >
          Watch
        </button>
        {FCOMPS.map((c) => (
          <button
            key={c.code}
            role="tab"
            aria-selected={comp === c.code}
            onClick={() => setComp(c.code)}
            className={`cine-pill cine-pill--sm flex-shrink-0${comp === c.code ? ' cine-pill--active' : ''}`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {comp === 'watch' ? (
        loading ? (
          <p className="text-center py-16 text-xs text-white/60">Loading matches…</p>
        ) : failed ? (
          <EmptyState
            icon={<Trophy className="w-5 h-5" />}
            title="Couldn't load matches"
            description="The schedule feed is unreachable right now."
            action={
              <button onClick={() => setRefreshKey((k) => k + 1)} className="cine-control-btn">
                Retry
              </button>
            }
          />
        ) : (
          <>
            {live.length > 0 && (
              <section className="space-y-3">
                <div className="cine-section-head">
                  <h2 className="cine-section-title inline-flex items-center gap-2">
                    <Radio className="w-4 h-4 text-red-400" /> Live now
                  </h2>
                  <span className="text-xs text-white/60">{live.length} match{live.length === 1 ? '' : 'es'}</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {live.map((m) => (
                    <MatchCard key={m.id} match={m} onWatch={openMatch} />
                  ))}
                </div>
              </section>
            )}

            {/* Day view (F1 match center): date pager, client filters,
                league rail, rows grouped by league. One fetch per day,
                filters never refetch. */}
            <section className="space-y-3">
              <div className="cine-section-head">
                <h2 className="cine-section-title">Matches</h2>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setDay((d) => shiftDayIso(d, -1))}
                    className="cine-icon-btn cine-icon-btn--xs"
                    aria-label="Previous day"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDay(isoDay())}
                    className="cine-pill cine-pill--sm"
                    aria-label="Back to today"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => setDay((d) => shiftDayIso(d, 1))}
                    className="cine-icon-btn cine-icon-btn--xs"
                    aria-label="Next day"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <SegmentedControl options={DAY_FILTERS} value={dayFilter} onChange={setDayFilter} size="sm" />
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="Leagues">
                <button
                  role="tab"
                  aria-selected={railComp === 'all'}
                  onClick={() => setRailComp('all')}
                  className={`cine-pill cine-pill--sm flex-shrink-0${railComp === 'all' ? ' cine-pill--active' : ''}`}
                >
                  All
                </button>
                {dayComps.map((c) => {
                  const emb = dayRows.find((r) => r.m.competition.code === c.code)?.m.competition.emblem || '';
                  return (
                    <button
                      key={c.code}
                      role="tab"
                      aria-selected={railComp === c.code}
                      onClick={() => setRailComp(railComp === c.code ? 'all' : c.code)}
                      className={`cine-pill cine-pill--sm flex-shrink-0${railComp === c.code ? ' cine-pill--active' : ''}`}
                    >
                      <Crest name={c.name} crest={emb} />
                      {c.name}
                    </button>
                  );
                })}
              </div>
              {dayUpdating && dayRows.length === 0 ? (
                <p className="text-center py-10 text-xs text-white/60">Loading matches…</p>
              ) : dayLoaded.error ? (
                <EmptyState
                  icon={<Trophy className="w-5 h-5" />}
                  title="Couldn't load matches"
                  description={dayLoaded.error}
                  action={
                    <button onClick={() => setDayLoaded((d) => ({ ...d, key: null }))} className="cine-control-btn">
                      Retry
                    </button>
                  }
                />
              ) : visibleCount === 0 ? (
                <p className="text-xs text-white/60 py-6 text-center">
                  {dayRows.length === 0 ? 'No matches this day.' : 'Nothing under this filter.'}
                </p>
              ) : (
                railComps.map((c) => {
                  const group = visibleRows(c.code);
                  if (group.length === 0) return null;
                  return (
                    <div key={c.code} className="space-y-2">
                      <div className="flex items-center gap-2.5 pt-3">
                        <Crest name={c.name} crest={group[0].m.competition.emblem} size="w-8 h-8" />
                        <h3 className="text-base font-extrabold text-white tracking-tight">{group[0].m.competition.name || c.name}</h3>
                        <span className="flex-1" />
                        <button
                          onClick={() => {
                            setComp(c.code);
                            window.scrollTo(0, 0);
                          }}
                          className="text-[11px] font-bold text-white/50 hover:text-white transition cursor-pointer flex-shrink-0"
                          aria-label={`Open ${c.name} table`}
                        >
                          Table
                        </button>
                      </div>
                      {group.map(({ m, hit }) => {
                        const modelOpen = modelId === m.id;
                        const modelDone = model?.id === m.id ? model : null;
                        const sched = !m.finished && !m.delayed;
                        const leader = modelDone?.data
                          ? Math.max(modelDone.data.home, modelDone.data.draw, modelDone.data.away)
                          : -1;
                        return (
                          <div key={m.id}>
                            <div className="mat-row px-3 py-2.5 flex items-center gap-2">
                          <span className="w-14 flex-shrink-0 text-[11px] font-bold">
                            {m.finished ? (
                              <span className="text-white/55">FT</span>
                            ) : m.delayed ? (
                              <span className="text-[var(--cine-accent)]">Delayed</span>
                            ) : (
                              <span className="text-white/60">{formatTime(m.utc)}</span>
                            )}
                          </span>
                          <button
                            onClick={() => setProfile({ kind: 'team', code: m.competition.code, id: m.home.id, name: m.home.name, crest: m.home.crest })}
                            className="flex-1 min-w-0 flex items-center justify-end gap-2 cursor-pointer"
                            aria-label={`Open ${m.home.name}`}
                          >
                            <span className="font-bold text-white text-[15px] truncate text-right hover:underline">{m.home.name}</span>
                            <Crest name={m.home.name} crest={m.home.crest} size="w-7 h-7" />
                          </button>
                          <span
                            className="flex-shrink-0 w-16 text-center text-lg font-black text-white tabular-nums"
                            aria-label={m.finished || m.delayed ? `Score ${m.home.score ?? 0} to ${m.away.score ?? 0}` : 'Versus'}
                          >
                            {m.finished || m.delayed ? `${m.home.score ?? 0} - ${m.away.score ?? 0}` : <span className="text-white/35 font-semibold text-sm">vs</span>}
                          </span>
                          <button
                            onClick={() => setProfile({ kind: 'team', code: m.competition.code, id: m.away.id, name: m.away.name, crest: m.away.crest })}
                            className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer text-left"
                            aria-label={`Open ${m.away.name}`}
                          >
                            <Crest name={m.away.name} crest={m.away.crest} size="w-7 h-7" />
                            <span className="font-bold text-white text-[15px] truncate hover:underline">{m.away.name}</span>
                          </button>
                          <span className="hidden xl:block w-28 flex-shrink-0 text-right text-[11px] text-white/40 truncate">
                            {roundLabel(m)}
                          </span>
                          {hit && (
                            <button
                              onClick={() => openMatch(hit)}
                              className="cine-pill cine-pill--sm flex-shrink-0"
                              aria-label={`Watch ${m.home.name} versus ${m.away.name}`}
                            >
                              <MonitorPlay className="w-3 h-3" /> Watch
                            </button>
                          )}
                          {sched && (
                            <button
                              onClick={() => openModel(m)}
                              className="cine-pill cine-pill--sm flex-shrink-0"
                              aria-expanded={modelOpen}
                              aria-label={`Model prediction for ${m.home.name} versus ${m.away.name}`}
                            >
                              <Calculator className="w-3 h-3" /> Model
                            </button>
                          )}
                            </div>
                            {modelOpen && (
                              <div className="mat-row px-4 py-3 space-y-2" aria-live="polite">
                                {!modelDone ? (
                                  <p className="text-[11px] text-white/50">Loading model…</p>
                                ) : modelDone.error ? (
                                  <p className="text-[11px] text-white/50">Model unavailable right now.</p>
                                ) : modelDone.thin ? (
                                  <p className="text-[11px] text-white/50">Not enough form yet.</p>
                                ) : (
                                  <>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                                      Model <span className="normal-case font-medium">estimate from {modelDone.data.sample} games each</span>
                                    </p>
                                    <div className="space-y-1.5">
                                      {[
                                        ['Home', modelDone.data.home],
                                        ['Draw', modelDone.data.draw],
                                        ['Away', modelDone.data.away],
                                      ].map(([label, pct]) => (
                                        <div key={label} className="flex items-center gap-2">
                                          <span className="w-10 text-[11px] font-bold text-white/60">{label}</span>
                                          <span className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
                                            <span
                                              className={`block h-full rounded-full ${pct === leader ? 'bg-[var(--cine-accent)]' : 'bg-white/30'}`}
                                              style={{ width: `${pct}%` }}
                                            />
                                          </span>
                                          <span className="w-10 text-right text-[11px] font-black text-white tabular-nums">{pct}%</span>
                                        </div>
                                      ))}
                                    </div>
                                    <p className="text-[11px] text-white/60">
                                      Likely: {modelDone.data.scores.map((s) => `${s.h}-${s.a} (${s.pct}%)`).join(', ')}
                                    </p>
                                    <p className="text-[10px] text-white/35">Fun estimate, not betting advice.</p>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </section>

            {extraStreams.length > 0 && (
              <section className="space-y-3">
                <div className="cine-section-head">
                  <h2 className="cine-section-title">More streams</h2>
                  <span className="text-xs text-white/60">{extraStreams.length} match{extraStreams.length === 1 ? '' : 'es'}</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {extraStreams.map((m) => (
                    <MatchCard key={m.id} match={m} onWatch={openMatch} />
                  ))}
                </div>
              </section>
            )}
          </>
        )
      ) : updating && !table ? (
        <p className="text-center py-16 text-xs text-white/60">Loading {compName}…</p>
      ) : showError ? (
        <EmptyState
          icon={<Trophy className="w-5 h-5" />}
          title="Couldn't load this competition"
          description={loaded.error}
          action={
            <button onClick={() => setDataRetry((r) => r + 1)} className="cine-control-btn">
              Retry
            </button>
          }
        />
      ) : (
        <>
          {/* Standings: real table, home/away splits, form dots. */}
          <section className="space-y-3">
            <div className="cine-section-head">
              <h2 className="cine-section-title">Standings</h2>
              {updating && <span className="text-[11px] text-white/40">Updating…</span>}
              <SegmentedControl options={VENUES} value={venue} onChange={setVenue} size="sm" />
            </div>
            {rows.length === 0 ? (
              <p className="text-xs text-white/60 py-6 text-center">No table published for this competition yet.</p>
            ) : (
              <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-wider text-white/40 text-left">
                      <th scope="col" className="py-2 pr-2 font-bold">#</th>
                      <th scope="col" className="py-2 pr-2 font-bold">Team</th>
                      <th scope="col" className="py-2 px-1.5 text-right font-bold">P</th>
                      <th scope="col" className="py-2 px-1.5 text-right font-bold hidden sm:table-cell">W</th>
                      <th scope="col" className="py-2 px-1.5 text-right font-bold hidden sm:table-cell">D</th>
                      <th scope="col" className="py-2 px-1.5 text-right font-bold hidden sm:table-cell">L</th>
                      <th scope="col" className="py-2 px-1.5 text-right font-bold hidden md:table-cell">GD</th>
                      <th scope="col" className="py-2 pl-1.5 text-right font-bold">Pts</th>
                      <th scope="col" className="py-2 pl-2 text-right font-bold hidden sm:table-cell">Form</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.team.id || r.team.name} className="border-t border-white/[0.07] text-white/90">
                        <td className="py-2 pr-2 font-black text-white/50">{r.pos}</td>
                        <td className="py-2 pr-2">
                          <button
                            onClick={() => setProfile({ kind: 'team', code: comp, id: r.team.id, name: r.team.name, crest: r.team.crest })}
                            className="flex items-center gap-2 min-w-0 cursor-pointer text-left"
                            aria-label={`Open ${r.team.name}`}
                          >
                            <Crest name={r.team.name} crest={r.team.crest} />
                            <span className="font-semibold truncate hover:underline">{r.team.name}</span>
                          </button>
                        </td>
                        <td className="py-2 px-1.5 text-right tabular-nums">{r.played}</td>
                        <td className="py-2 px-1.5 text-right tabular-nums hidden sm:table-cell">{r.won}</td>
                        <td className="py-2 px-1.5 text-right tabular-nums hidden sm:table-cell">{r.draw}</td>
                        <td className="py-2 px-1.5 text-right tabular-nums hidden sm:table-cell">{r.lost}</td>
                        <td className="py-2 px-1.5 text-right tabular-nums hidden md:table-cell">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                        <td className="py-2 pl-1.5 text-right font-black text-white tabular-nums">{r.points}</td>
                        <td className="py-2 pl-2 text-right hidden sm:table-cell"><FormDots form={r.form} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Fixtures: day pager, scores delayed on free data — badged, never live. */}
          <section className="space-y-3">
            <div className="cine-section-head">
              <h2 className="cine-section-title inline-flex items-center gap-2">
                <Calendar className="w-4 h-4 text-white/60" /> Fixtures
              </h2>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setDay((d) => shiftDayIso(d, -1))}
                  className="cine-icon-btn cine-icon-btn--xs"
                  aria-label="Previous day"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDay(isoDay())}
                  className="cine-pill cine-pill--sm"
                  aria-label="Back to today"
                >
                  Today
                </button>
                <button
                  onClick={() => setDay((d) => shiftDayIso(d, 1))}
                  className="cine-icon-btn cine-icon-btn--xs"
                  aria-label="Next day"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <p className="text-[11px] text-white/40">Scores delayed on free data — never presented as live.</p>
            {fixtures.length === 0 ? (
              <p className="text-xs text-white/60 py-6 text-center">No matches this day.</p>
            ) : (
              <div className="space-y-2">
                {fixtures.map((m) => (
                  <div key={m.id} className="mat-row px-4 py-3 flex items-center gap-3">
                    <span className="w-14 flex-shrink-0 text-[11px] font-bold text-white/60">
                      {fixtureLabel(m)}
                    </span>
                    <button
                      onClick={() => setProfile({ kind: 'team', code: comp, id: m.home.id, name: m.home.name, crest: m.home.crest })}
                      className="flex-1 min-w-0 flex items-center justify-end gap-2 cursor-pointer"
                      aria-label={`Open ${m.home.name}`}
                    >
                      <span className="font-semibold text-white text-sm truncate text-right hover:underline">{m.home.name}</span>
                      <Crest name={m.home.name} crest={m.home.crest} />
                    </button>
                    <span className="flex-shrink-0 min-w-12 text-center text-sm font-black text-white tabular-nums" aria-label={m.finished || m.delayed ? `Score ${m.home.score ?? 0} to ${m.away.score ?? 0}` : 'Versus'}>
                      {m.finished || m.delayed ? `${m.home.score ?? 0} - ${m.away.score ?? 0}` : 'vs'}
                    </span>
                    <button
                      onClick={() => setProfile({ kind: 'team', code: comp, id: m.away.id, name: m.away.name, crest: m.away.crest })}
                      className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer text-left"
                      aria-label={`Open ${m.away.name}`}
                    >
                      <Crest name={m.away.name} crest={m.away.crest} />
                      <span className="font-semibold text-white text-sm truncate hover:underline">{m.away.name}</span>
                    </button>
                    {m.delayed && (
                      <span className="cine-chip cine-chip--accent flex-shrink-0">Delayed</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Scorers: bonus section, omitted when the free plan gates it. */}
          {scorers && scorers.length > 0 && (
            <section className="space-y-3">
              <div className="cine-section-head">
                <h2 className="cine-section-title">Top scorers</h2>
              </div>
              <div className="space-y-2">
                {scorers.map((s, i) => {
                  const sRow = (loaded.table?.total || []).find((r) => r.team.name === s.team);
                  return (
                  <button
                    key={`${s.name}_${s.team}`}
                    onClick={() => setProfile({ kind: 'player', name: s.name, team: s.team, goals: s.goals, crest: sRow?.team?.crest || '' })}
                    className="mat-row w-full px-4 py-2.5 flex items-center gap-3 text-left cursor-pointer"
                    aria-label={`Open ${s.name}`}
                  >
                    <span className="w-6 flex-shrink-0 text-xs font-black text-white/40 tabular-nums">{i + 1}</span>
                    <ScorerPhoto key={s.name} name={s.name} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold text-white truncate">{s.name}</span>
                      <span className="block text-[11px] text-white/50 truncate">{s.team}</span>
                    </span>
                    <span className="text-sm font-black text-white tabular-nums">{s.goals}</span>
                  </button>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
      {profile && (
        <Modal
          isOpen
          onClose={() => setProfile(null)}
          maxWidth="max-w-md"
          label={profile.name}
        >
          {profile.kind === 'team' ? (
            <TeamView
              key={`t${profile.id || profile.name}`}
              team={profile}
              code={profile.code}
              onOpenPlayer={(p) => setProfile({ kind: 'player', ...p })}
            />
          ) : (
            <PlayerView
              key={`p${profile.name}`}
              name={profile.name}
              team={profile.team}
              goals={profile.goals}
              crest={profile.crest}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
