import React, { useState, useEffect } from 'react';
import { Trophy, ArrowLeft, RefreshCw, Radio, ExternalLink, MonitorPlay } from 'lucide-react';
import { football, FOOTBALL_MIRRORS, formatKickoff } from '../services/football';
import EmptyState from './ui/EmptyState';

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

export default function FootballView({ onToast }) {
  const [live, setLive] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [watching, setWatching] = useState(null);
  const [streams, setStreams] = useState([]);
  const [streamIdx, setStreamIdx] = useState(0);
  const [streamsLoading, setStreamsLoading] = useState(false);

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
      if (all.length === 0) onToast?.('No playable streams for this match right now');
    } finally {
      setStreamsLoading(false);
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
          >
            <ArrowLeft className="w-4 h-4" />
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
                onClick={() => setStreamIdx(i)}
                className={`h-9 px-4 inline-flex items-center flex-shrink-0 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer border ${
                  i === streamIdx
                    ? 'bg-white text-black border-white'
                    : 'bg-[var(--cine-glass-tint)] text-white/60 hover:text-white border-[var(--cine-glass-border)]'
                }`}
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
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/60 hover:text-white border border-white/10 hover:border-white/25 rounded-full px-3 py-1.5 transition"
            >
              {m.name}
              <ExternalLink className="w-3 h-3" />
            </a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex-shrink-0">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">Football</h1>
          <p className="text-sm text-white/60 mt-1">
            {live.length > 0 ? `${live.length} live now` : 'Upcoming matches, top leagues + UCL'}
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

      {loading ? (
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
                <span className="text-xs text-white/60">{live.length} matches</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {live.map((m) => (
                  <MatchCard key={m.id} match={m} onWatch={openMatch} />
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div className="cine-section-head">
              <h2 className="cine-section-title">Upcoming</h2>
              <span className="text-xs text-white/60">{upcoming.length} matches</span>
            </div>
            {upcoming.length === 0 && live.length === 0 ? (
              <EmptyState
                icon={<Trophy className="w-5 h-5" />}
                title="No matches listed"
                description="Nothing scheduled right now — check back closer to matchday."
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {upcoming.map((m) => (
                  <MatchCard key={m.id} match={m} onWatch={openMatch} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
