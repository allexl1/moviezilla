import React, { useState, useEffect } from 'react';
import { Cake, MapPin, Sparkles, Trophy, ExternalLink } from 'lucide-react';
import { tmdb, FALLBACK_PROFILE } from '../services/tmdb';
import { getAwardsByImdb, zodiacSign, ageOf } from '../services/wikidata';
import RowRail from './RowRail';
import { SkelRail } from './ui';

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PersonView({ personId, onSelectMedia }) {
  const [person, setPerson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [awards, setAwards] = useState([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    setExpanded(false);
    tmdb
      .getPersonDetails(personId)
      .then((data) => {
        if (alive) {
          setPerson(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [personId, retry]);

  const imdbId = person?.imdb_id || person?.external_ids?.imdb_id || null;

  // Awards resolve through the IMDb id (Wikidata, cached, silent on miss).
  useEffect(() => {
    let alive = true;
    setAwards([]);
    if (!imdbId) return;
    getAwardsByImdb(imdbId).then((list) => {
      if (alive) setAwards(list);
    });
    return () => {
      alive = false;
    };
  }, [imdbId]);

  if (loading) {
    return (
      <div className="relative z-10 max-w-[1560px] mx-auto px-6 md:px-14 pt-28 md:pt-32 space-y-10" aria-hidden="true">
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="skel w-40 md:w-52 aspect-[2/3] rounded-3xl flex-shrink-0" />
          <div className="flex-1 space-y-3 pt-1">
            <div className="skel h-12 md:h-16 w-2/3 rounded-2xl" />
            <div className="skel h-4 w-1/3 rounded-full" />
            <div className="skel h-4 w-1/2 rounded-full" />
          </div>
        </div>
        <SkelRail title />
      </div>
    );
  }

  if (failed || !person) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-xs text-white/60">
        <span>Couldn't load this profile.</span>
        <button onClick={() => setRetry((r) => r + 1)} className="cine-control-btn">
          Retry
        </button>
      </div>
    );
  }

  const age = ageOf(person.birthday, person.deathday);
  const sign = zodiacSign(person.birthday);
  const rank = (list) =>
    (list || [])
      .filter((x) => x.poster_path)
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 14);
  const movies = rank(person.movie_credits?.cast);
  const shows = rank(person.tv_credits?.cast);
  const directed = rank([
    ...(person.movie_credits?.crew || []).filter((x) => x.job === 'Director'),
    ...(person.tv_credits?.crew || []).filter((x) => x.job === 'Director'),
  ]);
  const bio = person.biography || '';

  return (
    <div className="relative min-h-screen text-white pb-24 animate-in fade-in duration-300">
      <div className="relative z-10 max-w-[1560px] mx-auto px-6 md:px-14 pt-28 md:pt-32 space-y-10">
        {/* Header: portrait + identity */}
        <header className="flex flex-col sm:flex-row gap-6 sm:items-start">
          <div className="w-40 md:w-52 flex-shrink-0 aspect-[2/3] rounded-3xl overflow-hidden bg-[var(--cine-surface-strong)] border border-[var(--cine-glass-border)] shadow-2xl">
            <img
              src={tmdb.getImageUrl(person.profile_path, 'w500', FALLBACK_PROFILE)}
              alt={person.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.src = FALLBACK_PROFILE;
              }}
            />
          </div>

          <div className="min-w-0 space-y-3 pt-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">
              {person.known_for_department || 'Acting'}
            </p>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight">
              {person.name}
            </h1>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {person.birthday && (
                <span className="cine-chip cine-chip--neutral">
                  <Cake className="w-3 h-3" />
                  {formatDate(person.birthday)}
                  {age != null && <span className="text-white/60">({age})</span>}
                </span>
              )}
              {sign && (
                <span className="cine-chip cine-chip--neutral">
                  <Sparkles className="w-3 h-3" />
                  {sign}
                </span>
              )}
              {person.place_of_birth && (
                <span className="cine-chip cine-chip--neutral">
                  <MapPin className="w-3 h-3" />
                  {person.place_of_birth}
                </span>
              )}
            </div>

            {bio && (
              <div className="max-w-2xl">
                <p className={`text-sm leading-relaxed text-white/70 ${expanded ? '' : 'line-clamp-3'}`}>
                  {bio}
                </p>
                {bio.length > 180 && (
                  <button
                    onClick={() => setExpanded((e) => !e)}
                    className="text-xs font-semibold text-white/50 hover:text-white mt-1 transition cursor-pointer"
                  >
                    {expanded ? 'Show Less' : 'Read More'}
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {imdbId && (
                <a
                  href={`https://www.imdb.com/name/${imdbId}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="cine-imdb-tag"
                  title="Open on IMDb"
                >
                  <span className="cine-imdb-logo">IMDb</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <a
                href={`https://www.themoviedb.org/person/${person.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-semibold text-white/50 hover:text-white transition inline-flex items-center gap-1"
                title="Open on TMDB"
              >
                TMDB <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </header>

        {/* Awards — gold honours strip (Wikidata, silent when empty). */}
        {awards.length > 0 && (
          <section className="space-y-3">
            <div className="cine-section-head">
              <h2 className="cine-section-title inline-flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[#f5c518]" />
                Honours
              </h2>
              <span className="text-xs text-white/60">{awards.length}</span>
            </div>
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-2">
              {awards.map((a, i) => (
                <div key={`${a.label}_${a.year}_${i}`} className="cine-award flex-shrink-0" title={a.work || a.label}>
                  <Trophy className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-white truncate max-w-44">{a.label}</span>
                    <span className="block text-[10px] text-white/60 truncate max-w-44">
                      {[a.year, a.work].filter(Boolean).join(' • ')}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {movies.length > 0 && (
          <RowRail
            title="Movies"
            items={movies}
            onSelect={onSelectMedia}
            mediaType="movie"
            showRating
          />
        )}

        {shows.length > 0 && (
          <RowRail
            title="Shows"
            items={shows}
            onSelect={onSelectMedia}
            mediaType="tv"
            showRating
          />
        )}

        {directed.length > 0 && (
          <RowRail
            title="Directed"
            items={directed}
            onSelect={(item) =>
              onSelectMedia({ ...item, media_type: item.first_air_date ? 'tv' : 'movie' })
            }
          />
        )}
      </div>
    </div>
  );
}
