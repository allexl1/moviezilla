import React, { useState, useEffect, useRef } from 'react';
import { Play, Plus, Info, Star, CalendarDays, Flame, Swords, Laugh, Skull, Rocket, Heart, Clapperboard, Radio } from 'lucide-react';
import { tmdb, MOVIE_GENRES, TV_GENRES, SORTS, TV_SORTS } from './services/tmdb';
import { storage, progressLabel, formatClock } from './services/storage';
import Navbar from './components/Navbar';
import FilterBar from './components/FilterBar';
import RowRail from './components/RowRail';
import UpcomingRail from './components/UpcomingRail';
import WatchlistView from './components/WatchlistView';
import RoomsView from './components/RoomsView';
import RoomView from './components/RoomView';
import FootballView from './components/FootballView';
import PersonView from './components/PersonView';
import Card from './components/ui/Card';
import { SkelGrid, SkelRail } from './components/ui';
import Select from './components/ui/Select';
import MediaDetailPage from './components/MediaDetailPage';
import SearchModal from './components/SearchModal';
import SettingsModal from './components/SettingsModal';
import Player from './components/Player';

const GENRE_NAME = {};
[...MOVIE_GENRES, ...TV_GENRES].forEach((g) => {
  if (g.id !== '' && !GENRE_NAME[g.id]) GENRE_NAME[g.id] = g.name;
});

// Genre → icon (cinejoy hero meta parity).
const GENRE_ICON = {
  Action: Swords,
  Adventure: Rocket,
  Comedy: Laugh,
  Horror: Skull,
  'Sci-Fi': Rocket,
  'Sci-Fi & Fantasy': Rocket,
  Romance: Heart,
  Thriller: Flame,
};

const PROVIDERS = [
  { id: '8', name: 'Netflix', color: '#E50914' },
  { id: '9', name: 'Prime Video', color: '#00A8E1' },
  { id: '337', name: 'Disney+', color: '#113CCF' },
  { id: '350', name: 'Apple TV+', color: '#FFFFFF' },
  { id: '1899', name: 'HBO Max', color: '#9933FF' },
  { id: '15', name: 'Hulu', color: '#1CE783' },
  { id: '531', name: 'Paramount+', color: '#0064FF' },
];

// Resolve the item's own type — never the nav tab. discover/* items lack
// media_type, so fall back to first_air_date (TV) before defaulting to movie.
function resolveMediaType(media) {
  if (media?.media_type === 'tv' || media?.media_type === 'movie') return media.media_type;
  if (media?.type === 'tv' || media?.type === 'movie') return media.type;
  if (media?.first_air_date) return 'tv';
  return 'movie';
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Strict first, relaxed fallback so the shelf never renders empty while
// the endpoint returns data. Movies: future-dated only, soonest first.
// TV: airing order kept as TMDB returns it.
function pickUpcoming(results) {
  const today = todayISO();
  const strict = (results || []).filter(
    (x) =>
      x.backdrop_path &&
      x.poster_path &&
      (x.overview || '').trim().length > 20 &&
      x.release_date &&
      x.release_date >= today
  );
  if (strict.length >= 4) {
    return strict.sort((a, b) => a.release_date.localeCompare(b.release_date)).slice(0, 10);
  }
  return (results || [])
    .filter((x) => x.backdrop_path && x.poster_path && x.release_date)
    .sort((a, b) => {
      const fa = a.release_date >= today ? 0 : 1;
      const fb = b.release_date >= today ? 0 : 1;
      return fa - fb || a.release_date.localeCompare(b.release_date);
    })
    .slice(0, 10);
}

function pickAiring(results) {
  const strict = (results || []).filter(
    (x) => x.backdrop_path && x.poster_path && (x.overview || '').trim().length > 20
  );
  if (strict.length >= 4) return strict.slice(0, 10);
  return (results || [])
    .filter((x) => x.backdrop_path && x.poster_path)
    .slice(0, 10);
}

// Unrated titles (vote_average 0) are hidden from Released grids and
// home rails — nobody watches them. NOT applied to Coming Soon / On The
// Air, which are unreleased by definition and have no votes yet.
function hasRating(item) {
  return (item?.vote_average || 0) > 0;
}

// Released grids must never contain future-dated titles — those belong
// in Coming Soon / On The Air. Missing dates are kept (can't judge).
function isReleased(item, tab) {
  const today = todayISO();
  if (tab === 'movie') {
    return !(item.release_date && item.release_date > today);
  }
  return !(item.first_air_date && item.first_air_date > today);
}

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [items, setItems] = useState([]);
  const [featuredItem, setFeaturedItem] = useState(null);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const prevFilterKey = useRef('');
  const [continueWatching, setContinueWatching] = useState([]);

  const [letterboxdUser, setLetterboxdUser] = useState(
    () => localStorage.getItem('mz_letterboxd_user') || ''
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Filters
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedYear, setSelectedYear] = useState('All Years');
  const [selectedSort, setSelectedSort] = useState('new.popular');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [toast, setToast] = useState('');

  // Default shelf: recent (last year) + popular + voted — "newest most
  // popular". Pure newest-first is 20/20 zero-vote day-0 releases.
  const defaultSortFor = () => 'new.popular';

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [activePlayer, setActivePlayer] = useState(null);
  const [activeRoomCode, setActiveRoomCode] = useState(null);
  const [roomDraft, setRoomDraft] = useState(null);

  // Invite-link entry: ?room=ABC123 lands straight in the room (the
  // nickname gate inside saves the name to that device on entry).
  useEffect(() => {
    try {
      const code = new URLSearchParams(window.location.search).get('room');
      if (code && /^[A-Z0-9]{6}$/i.test(code.trim())) {
        setActiveTab('rooms');
        setActiveRoomCode(code.trim().toUpperCase());
      }
    } catch {
      // No usable link — normal start.
    }
  }, []);

  const leaveRoom = () => {
    setActiveRoomCode(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      window.history.replaceState({}, '', url.toString());
    } catch {
      // ignore
    }
  };

  // Home rails
  const [popularMovies, setPopularMovies] = useState([]);
  const [popularTV, setPopularTV] = useState([]);
  const [topRated, setTopRated] = useState([]);
  const [animeSpotlight, setAnimeSpotlight] = useState([]);
  const [nowPlaying, setNowPlaying] = useState([]);
  const [upcomingMovies, setUpcomingMovies] = useState([]);
  const [onAirToday, setOnAirToday] = useState([]);
  const [homeProvider, setHomeProvider] = useState('8');
  const [providerMovies, setProviderMovies] = useState([]);

  useEffect(() => {
    setContinueWatching(storage.getAllContinueWatching());
  }, [activePlayer, activeTab]);

  // Freeze ambient animation while the tab is hidden, any overlay
  // covers the page (search/settings/player/details), or we're on a
  // utility tab (movies/shows/watchlist): the aurora keeps compositing
  // behind fixed overlays and dense lists otherwise (thermal).
  useEffect(() => {
    const apply = () => {
      const covered = isSearchOpen || isSettingsOpen || Boolean(activePlayer) || Boolean(selectedMedia) || activeTab !== 'home';
      document.body.classList.toggle('mz-paused', covered || document.hidden);
    };
    apply();
    document.addEventListener('visibilitychange', apply);
    return () => {
      document.removeEventListener('visibilitychange', apply);
      document.body.classList.remove('mz-paused');
    };
  }, [isSearchOpen, isSettingsOpen, activePlayer, selectedMedia, activeTab]);

  // Minimal toast (watchlist add/remove), auto-dismissed.
  const toastTimer = useRef(null);
  const showToast = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const filterKey = [
      activeTab,
      selectedGenre,
      selectedYear,
      selectedSort,
      selectedProvider,
      selectedCountry,
      selectedLanguage,
      letterboxdUser,
    ].join('|');

    // New tab/filters always restart from page 1 instead of appending.
    if (prevFilterKey.current !== filterKey) {
      prevFilterKey.current = filterKey;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }

    async function load() {
      if (page > 1) setLoadingMore(true);
      else setCatalogLoading(true);
      try {
        let res;

        if (activeTab === 'watchlist' || activeTab === 'rooms' || activeTab === 'football') {
          // WatchlistView / RoomsView / FootballView own their data.
          setCatalogLoading(false);
          return;
        } else if (activeTab === 'movie') {
          res = await tmdb.getMovies({
            page,
            genre: selectedGenre,
            year: selectedYear,
            sort: selectedSort,
            provider: selectedProvider,
            country: selectedCountry,
            language: selectedLanguage,
          });
        } else if (activeTab === 'tv') {
          res = await tmdb.getSeries({
            page,
            genre: selectedGenre,
            year: selectedYear,
            sort: selectedSort,
            provider: selectedProvider,
            country: selectedCountry,
            language: selectedLanguage,
          });
        } else {
          res = await tmdb.getTrending();
        }

        if (isMounted) {
          const list = (res?.results || []).filter((x) => x.poster_path);

          if (page === 1) {
            setItems(list);
            setFeaturedItem(list.length > 0 ? list[0] : null);
          } else {
            setItems((prev) => {
              const seen = new Set(prev.map((x) => x.id));
              return [...prev, ...list.filter((x) => !seen.has(x.id))];
            });
          }
          setTotalPages(res?.total_pages || 1);
          setCatalogError('');
        }
      } catch (err) {
        console.error('Failed to load catalog:', err);
        if (isMounted) setCatalogError("Couldn't load titles. Check your connection.");
      } finally {
        if (isMounted) {
          setLoadingMore(false);
          setCatalogLoading(false);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [
    activeTab,
    selectedGenre,
    selectedYear,
    selectedSort,
    selectedProvider,
    selectedCountry,
    selectedLanguage,
    letterboxdUser,
    catalogRetry,
    page,
  ]);

  const handleSaveLetterboxd = (user) => {
    try {
      localStorage.setItem('mz_letterboxd_user', user);
    } catch {
      // Storage unavailable — session-only.
    }
    setLetterboxdUser(user);
  };

  // Picks a random visible title into the detail view (does not autoplay).
  const pickRandom = () => {
    if (items.length === 0) return;
    const pick = items[Math.floor(Math.random() * items.length)];
    setSelectedMedia(pick);
  };

  // Home rails load on every visit to Home (independent of filters) and
  // refresh every 10 minutes while Home stays open and visible — new
  // theatrical/streaming titles appear without a reload.
  useEffect(() => {
    if (activeTab !== 'home') return;
    let isMounted = true;

    async function loadRails() {
      try {
        const [movies, series, rated, anime, now, soon, airing] = await Promise.all([
          tmdb.getPopularMovies(),
          tmdb.getPopularTV(),
          tmdb.getTopRatedMovies(),
          tmdb.getAnime(),
          tmdb.getNowPlaying(),
          tmdb.getUpcoming(),
          tmdb.getAiringToday(),
        ]);

        if (!isMounted) return;

        const clean = (res) =>
          (res?.results || []).filter((x) => x.poster_path && hasRating(x)).slice(0, 14);

        setPopularMovies(clean(movies));
        setPopularTV(clean(series));
        setTopRated(clean(rated));
        setAnimeSpotlight(clean(anime));
        setNowPlaying(clean(now));
        // Coming Soon: single line, reputable + future-dated, soonest
        // first, with a relaxed fallback so the shelf never goes empty.
        setUpcomingMovies(pickUpcoming(soon?.results));
        setOnAirToday(pickAiring(airing?.results));
      } catch (err) {
        console.error('Failed to load home rails:', err);
      }
    }

    loadRails();
    const refresh = setInterval(() => {
      if (!document.hidden) loadRails();
    }, 10 * 60 * 1000);

    return () => {
      isMounted = false;
      clearInterval(refresh);
    };
  }, [activeTab]);

  // Movies/Shows pages keep their own Upcoming/On-The-Air shelf fresh.
  useEffect(() => {
    if (activeTab !== 'movie' && activeTab !== 'tv') return;
    let isMounted = true;
    (activeTab === 'movie' ? tmdb.getUpcoming() : tmdb.getOnTheAir())
      .then((res) => {
        if (!isMounted) return;
        if (activeTab === 'movie') setUpcomingMovies(pickUpcoming(res?.results));
        else setOnAirToday(pickAiring(res?.results));
      })
      .catch((err) => console.error('Failed to load upcoming rail:', err));
    return () => {
      isMounted = false;
    };
  }, [activeTab]);

  // Full provider catalog for the icon wall (sorted by TMDB priority).
  const [providers, setProviders] = useState([]);
  // Shows-page shelf toggle: Released grid vs On-The-Air grid.
  const [showAiring, setShowAiring] = useState(false);

  useEffect(() => {
    if (activeTab !== 'home') return;
    let isMounted = true;
    tmdb
      .getProviders()
      .then((list) => {
        if (isMounted) setProviders(list.slice(0, 24));
      })
      .catch((err) => console.error('Failed to load providers:', err));
    return () => {
      isMounted = false;
    };
  }, [activeTab]);
  // "Movies on {provider}" rail follows the home provider picker.
  useEffect(() => {
    if (activeTab !== 'home') return;
    let isMounted = true;

    tmdb
      .getMovies({ provider: homeProvider })
      .then((res) => {
        if (!isMounted) return;
        setProviderMovies(
          (res?.results || []).filter((x) => x.poster_path && hasRating(x)).slice(0, 14)
        );
      })
      .catch((err) => console.error('Failed to load provider rail:', err));

    return () => {
      isMounted = false;
    };
  }, [activeTab, homeProvider]);

  // Home hero carousel (cinejoy spotlight parity). Fresh theatrical
  // releases lead so a 3-days-old title like Mayday surfaces even when
  // the weekly trending list hasn't picked it up yet; trending fills out
  // the rotation. Deduplicated, 6 max.
  const heroItems =
    activeTab === 'home'
      ? [...nowPlaying, ...items]
          .filter((x, i, a) => x && a.findIndex((y) => y.id === x.id) === i)
          .slice(0, 6)
      : [];
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroLogo, setHeroLogo] = useState(null);
  const heroContentRef = useRef(null);
  const heroMediaRef = useRef(null);

  // Scroll choreography: hero copy drifts up + fades while the backdrop
  // settles, so the top nav's blur takes over exactly as the hero leaves —
  // the "blurred piece" handoff from the reference design. rAF-throttled,
  // two style writes, zero re-renders.
  useEffect(() => {
    if (activeTab !== 'home' || selectedMedia) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY || 0;
        const fade = Math.max(0, 1 - y / 420);
        if (heroContentRef.current) {
          heroContentRef.current.style.opacity = String(fade);
          heroContentRef.current.style.transform = `translateY(${Math.min(y * 0.25, 110)}px)`;
        }
        if (heroMediaRef.current) {
          heroMediaRef.current.style.transform = `translateY(${Math.min(y * 0.12, 60)}px)`;
        }
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [activeTab, selectedMedia, heroIndex]);

  useEffect(() => {
    setHeroIndex(0);
    setHeroLogo(null);
  }, [activeTab, items.length > 0 ? items[0].id : null]);

  const heroItem = heroItems[heroIndex] || featuredItem || items[0] || null;
  const heroMediaType = heroItem ? resolveMediaType(heroItem) : 'movie';

  // Rotate spotlight; pause while reading details or watching.
  useEffect(() => {
    if (activeTab !== 'home' || selectedMedia || activePlayer || heroItems.length < 2) return;
    const timer = setTimeout(() => {
      setHeroIndex((i) => (i + 1) % heroItems.length);
    }, 8000);
    return () => clearTimeout(timer);
  }, [activeTab, selectedMedia, activePlayer, heroIndex, heroItems.length]);

  // Title logo for the spotlight treatment.
  useEffect(() => {
    if (activeTab !== 'home' || !heroItem?.id) return;
    let isMounted = true;
    setHeroLogo(null);
    tmdb.getLogos(heroMediaType, heroItem.id).then((logo) => {
      if (isMounted && logo?.file_path) setHeroLogo(logo.file_path);
    });
    return () => {
      isMounted = false;
    };
  }, [activeTab, heroItem?.id]);

  // Discovery pages (Movies / Shows) are poster-only rails like cinejoy.
  const posterOnly = activeTab === 'movie' || activeTab === 'tv';

  // Released grids exclude future-dated and unrated titles (those live
  // in Coming Soon / On The Air, or are unwatched junk). Raw `items` stay
  // untouched for hero + random + paging.
  const releasedItems =
    activeTab === 'movie' || activeTab === 'tv'
      ? items.filter((x) => isReleased(x, activeTab) && hasRating(x))
      : items;

  // The detail page must follow the selected item's own type, not the nav tab
  // (a TV pick from Search/Watchlist/Home must stay 'tv').
  const selectedMediaType = selectedMedia ? resolveMediaType(selectedMedia) : 'movie';

  // Always fetch full TMDB details before starting playback.
  // Catalog/trending objects do not contain all TV metadata such as
  // number_of_seasons.
  const playMedia = async (media, fallbackDetails = null) => {
    if (!media?.id) return;

    const mediaType =
      (media.media_type === 'tv' || media.media_type === 'movie') ? media.media_type :
      (media.type === 'tv' || media.type === 'movie') ? media.type :
      (fallbackDetails?.media_type === 'tv' || fallbackDetails?.media_type === 'movie') ? fallbackDetails.media_type :
      (fallbackDetails?.type === 'tv' || fallbackDetails?.type === 'movie') ? fallbackDetails.type :
      (media?.first_air_date || fallbackDetails?.first_air_date || fallbackDetails?.number_of_seasons) ? 'tv' : 'movie';

    // "Resuming from 17:41" — makes the history system feel true. Only
    // when there's a real position worth announcing (30s+).
    const announceResume = () => {
      try {
        const saved = storage.getProgress(mediaType, media.id);
        if (saved && saved.currentTime >= 30) {
          showToast(`Resuming from ${formatClock(saved.currentTime)}`);
        }
      } catch {
        // never block playback for a toast
      }
    };

    try {
      const details = await tmdb.getMediaDetails(mediaType, media.id);

      setActivePlayer({
        media: {
          ...media,
          media_type: mediaType,
        },
        details: details || fallbackDetails || media,
      });
      announceResume();
    } catch (err) {
      console.error('Failed to load media details for playback:', err);

      // Policy: play with partial metadata rather than blocking. The embed
      // URL needs only id/type/season/episode (all resolved above), and the
      // episode drawer loads real season data on demand — so a details
      // failure degrades (season count may fall back to 1) instead of
      // refusing playback. The failure is logged, never disguised as success.
      setActivePlayer({
        media: {
          ...media,
          media_type: mediaType,
        },
        details: fallbackDetails || media,
      });
      announceResume();
    }
  };

  return (
    <div className="relative min-h-screen bg-[var(--cine-bg-deep)] text-white select-none">
      {/* Contextual Ambient Aurora Mesh Canvas */}
      <div
        className={`cine-aurora-canvas ${
          activeTab === 'movie' ? 'opacity-90' : ''
        }`}
      />
      {/* Per-tab tint wash (green Movies / indigo Shows parity) */}
      {(activeTab === 'movie' || activeTab === 'tv') && !selectedMedia && (
        <div
          className={`cine-tab-tint ${activeTab === 'movie' ? 'cine-tab-tint--movie' : 'cine-tab-tint--tv'}`}
          aria-hidden="true"
        />
      )}

      <Navbar
        activeTab={activeTab}
          onTabChange={(tab) => {
            if (tab === 'search') {
              setIsSearchOpen(true);
            } else {
              setSelectedMedia(null);
              setActiveTab(tab);
              setSelectedGenre('');
              setSelectedYear('All Years');
              setSelectedSort(defaultSortFor(tab));
              setSelectedProvider('');
              setSelectedCountry('');
              setSelectedLanguage('');
              setShowAiring(false);
            }
          }}
        isDetailView={Boolean(selectedMedia) || Boolean(selectedPerson)}
        onBack={() => {
          setSelectedMedia(null);
          setSelectedPerson(null);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {activeRoomCode ? (
        <RoomView
          code={activeRoomCode}
          onLeave={leaveRoom}
          onToast={showToast}
        />
      ) : selectedPerson ? (
        <PersonView
          personId={selectedPerson}
          onSelectMedia={(item) => {
            setSelectedPerson(null);
            setSelectedMedia(item);
          }}
        />
      ) : selectedMedia ? (
        <MediaDetailPage
          media={selectedMedia}
          mediaType={selectedMediaType}
          onToast={showToast}
          onPlay={(media, details) =>
            setActivePlayer({
              media: { ...media, media_type: resolveMediaType(media) },
              details,
            })
          }
          onSelectMedia={(item) => setSelectedMedia(item)}
          onSelectPerson={(id) => {
            setSelectedMedia(null);
            setSelectedPerson(id);
          }}
          onWatchTogether={(media) => {
            setSelectedMedia(null);
            setRoomDraft(media);
            setActiveTab('rooms');
          }}
        />
      ) : (
        <>
          {activeTab === 'home' && heroItem && (
            <div className="cine-home-bg" aria-hidden="true">
              <img
                key={heroItem.id}
                src={tmdb.getImageUrl(
                  heroItem.backdrop_path,
                  'w1280',
                  heroItem.backdrop_fallback
                )}
                alt=""
                className="cine-home-bg-img cine-ghost-fade"
              />
              <div className="cine-home-bg-shade" />
            </div>
          )}

          {activeTab === 'home' && heroItem && (
            <section className="cine-hero">
              <div ref={heroMediaRef} className="cine-hero-media" aria-hidden="true">
                <img
                  key={heroItem.id}
                  src={tmdb.getImageUrl(
                    heroItem.backdrop_path,
                    'w1280',
                    heroItem.backdrop_fallback
                  )}
                  alt=""
                  fetchPriority="high"
                  className="cine-hero-fade"
                />
                <div className="cine-hero-scrim" />
              </div>

              <div ref={heroContentRef} className="cine-hero-content">
                {heroLogo ? (
                  <img
                    src={tmdb.getImageUrl(heroLogo, 'w500')}
                    alt={heroItem.title || heroItem.name}
                    className="cine-hero-logo"
                  />
                ) : (
                  <h1 className="cine-hero-title">
                    {heroItem.title || heroItem.name}
                  </h1>
                )}

                <div className="cine-hero-meta">
                  <span className="cine-star-tag">
                    <Star className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
                    {(heroItem.vote_average || 8.4).toFixed(1)}/10
                  </span>

                  <span className="cine-hero-meta-item">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {(
                      heroItem.release_date ||
                      heroItem.first_air_date ||
                      '2026'
                    ).split('-')[0]}
                  </span>

                  {(heroItem.genre_ids || []).slice(0, 1).map((gid) => {
                    const gname = GENRE_NAME[String(gid)] || GENRE_NAME[gid] || 'Featured';
                    const GIcon = GENRE_ICON[gname] || Clapperboard;
                    return (
                      <span key={gid} className="cine-hero-meta-item">
                        <GIcon className="w-3.5 h-3.5" />
                        {gname}
                      </span>
                    );
                  })}
                </div>

                <p className="cine-hero-desc">
                  {heroItem.overview}
                </p>

                <div className="cine-actions">
                  <button
                    onClick={() => playMedia(heroItem, heroItem)}
                    className="cine-btn cine-btn-primary cine-btn-shimmer cine-cta"
                  >
                    <Play className="w-[18px] h-[18px]" fill="currentColor" />
                    <span>Play</span>
                  </button>

                  <div className="cine-duo-btn">
                    <button
                      onClick={() => {
                        const added = storage.toggleWatchlist(heroItem);
                        showToast(added ? 'Added to Watchlist' : 'Removed from Watchlist');
                      }}
                      title="Add to Watchlist"
                      aria-label="Add to Watchlist"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                    <span className="cine-duo-divider" />
                    <button
                      onClick={() => setSelectedMedia(heroItem)}
                      title="Details"
                      aria-label="Details"
                    >
                      <Info className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {heroItems.length > 1 && (
                <div className="cine-hero-dots">
                  {heroItems.map((item, i) => (
                    <button
                      key={item.id}
                      onClick={() => setHeroIndex(i)}
                      title={item.title || item.name}
                      aria-label={`Show ${item.title || item.name}`}
                      aria-current={i === heroIndex}
                      className={`cine-hero-dot ${i === heroIndex ? 'is-active' : ''}`}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
          {activeTab === 'home' && !heroItem && !catalogError && (
            <p className="text-center py-16 text-xs text-white/60">
              Loading catalog…
            </p>
          )}

          {/* Main Container */}
          <main
            className={`cine-container ${
              activeTab !== 'home' ? 'cine-container--page' : ''
            }`}
          >
            {/* Cinejoy Movies/Shows Page Header & Filter Rail */}
            {activeTab === 'movie' && (
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex-shrink-0">
                  <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
                    Movies
                  </h1>

                  <p className="text-sm text-white/60 mt-1">
                    Discover new movies to watch
                  </p>
                </div>

                <FilterBar
                  genres={MOVIE_GENRES}
                  sorts={SORTS}
                  selectedGenre={selectedGenre}
                  onSelectGenre={setSelectedGenre}
                  selectedYear={selectedYear}
                  onSelectYear={setSelectedYear}
                  selectedSort={selectedSort}
                  onSelectSort={setSelectedSort}
                  selectedProvider={selectedProvider}
                  onSelectProvider={setSelectedProvider}
                  selectedCountry={selectedCountry}
                  onSelectCountry={setSelectedCountry}
                  selectedLanguage={selectedLanguage}
                  onSelectLanguage={setSelectedLanguage}
                  onRandom={pickRandom}
                />
              </div>
            )}

            {activeTab === 'tv' && (
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex-shrink-0">
                  <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
                    Shows
                  </h1>

                  <p className="text-sm text-white/60 mt-1">
                    Explore hit series and episodic dramas
                  </p>
                </div>

                {/* Right column mirrors Movies: toggle on top, filters below. */}
                <div className="flex flex-col items-start lg:items-end gap-3">
                  <button
                    onClick={() => setShowAiring((v) => !v)}
                    aria-pressed={showAiring}
                    className={`cine-control-btn ${showAiring ? 'border-[var(--cine-accent)]/60' : ''}`}
                    title="Show series currently on the air"
                  >
                    <Radio className={`w-3.5 h-3.5 ${showAiring ? 'text-[var(--cine-accent)]' : ''}`} />
                    <span>On The Air</span>
                  </button>

                  <FilterBar
                    genres={TV_GENRES}
                    sorts={TV_SORTS}
                    selectedGenre={selectedGenre}
                    onSelectGenre={setSelectedGenre}
                    selectedYear={selectedYear}
                    onSelectYear={setSelectedYear}
                    selectedSort={selectedSort}
                    onSelectSort={setSelectedSort}
                    selectedProvider={selectedProvider}
                    onSelectProvider={setSelectedProvider}
                    selectedCountry={selectedCountry}
                    onSelectCountry={setSelectedCountry}
                    selectedLanguage={selectedLanguage}
                    onSelectLanguage={setSelectedLanguage}
                    onRandom={pickRandom}
                  />
                </div>
              </div>
            )}

            {activeTab === 'home' && continueWatching.length > 0 && (
              <section className="space-y-3">
                <div className="cine-section-head">
                  <h2 className="cine-section-title">Continue Watching</h2>
                </div>

                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                  {continueWatching.map((item) => (
                    <div
                      key={`${item.type}_${item.mediaId}`}
                      onClick={() =>
                        playMedia(
                          {
                            id: item.mediaId,
                            media_type: item.type,
                            name: item.title,
                            title: item.title,
                            poster_path: item.poster,
                          },
                          {
                            title: item.title,
                            name: item.title,
                            poster_path: item.poster,
                            media_type: item.type,
                          }
                        )
                      }
                      className="cine-cw-card group"
                    >
                      <div className="cine-cw-thumb">
                        <img
                          src={tmdb.getImageUrl(item.poster, 'w300')}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />

                        <div className="cine-cw-play">
                          <div className="cine-cw-play-btn">
                            <Play className="w-3 h-3" fill="currentColor" />
                          </div>
                        </div>
                      </div>

                      <h4 className="cine-cw-title">
                        {item.title}
                      </h4>

                      <p className="cine-cw-meta">
                        {item.type === 'tv'
                          ? `Season ${item.season} • Episode ${item.episode}`
                          : 'Movie'}{' '}
                        • {progressLabel(item)}
                      </p>

                      <div className="cine-cw-progress">
                        <div
                          className="cine-cw-progress-fill"
                          style={{ width: `${item.percent > 0 ? item.percent : item.currentTime > 0 ? 4 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'home' && providers.length > 0 && (
              <section className="space-y-3">
                <div className="cine-section-head">
                  <h2 className="cine-section-title">Browse by Provider</h2>
                </div>

                <div className="flex gap-4 overflow-x-auto no-scrollbar py-1">
                  {providers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setActiveTab('movie');
                        setSelectedProvider(p.id);
                      }}
                      className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer group"
                      title={p.name}
                      aria-label={`Browse ${p.name} movies`}
                    >
                      <span className="cine-provider-icon">
                        <img
                          src={tmdb.getImageUrl(p.logo, 'w185')}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      </span>
                      <span className="text-[11px] font-medium text-white/60 group-hover:text-white/80 transition max-w-20 truncate">
                        {p.name}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section>
              {catalogError && activeTab !== 'watchlist' && activeTab !== 'rooms' && (
                <div className="flex items-center justify-center gap-3 py-6 text-xs text-white/60">
                  <span>{catalogError}</span>
                  <button
                    onClick={() => setCatalogRetry((c) => c + 1)}
                    className="cine-control-btn"
                  >
                    Retry
                  </button>
                </div>
              )}
              {activeTab === 'home' ? (
                <div className="flex flex-col gap-10">
                  {items.length === 0 && popularMovies.length === 0 && !catalogError ? (
                    <>
                      <SkelRail title />
                      <SkelRail title />
                    </>
                  ) : (
                    <RowRail title="Trending Now" items={items.filter(hasRating)} onSelect={setSelectedMedia} />
                  )}
                  <RowRail
                    title="Now Playing in Theaters"
                    items={nowPlaying}
                    onSelect={setSelectedMedia}
                    mediaType="movie"
                    action={{ label: 'View All', onClick: () => setActiveTab('movie') }}
                  />
                  <RowRail
                    title="Popular Movies"
                    items={popularMovies}
                    onSelect={setSelectedMedia}
                    mediaType="movie"
                    action={{ label: 'View All', onClick: () => setActiveTab('movie') }}
                  />
                  <RowRail
                    title="Popular Shows"
                    items={popularTV}
                    onSelect={setSelectedMedia}
                    mediaType="tv"
                    action={{ label: 'View All', onClick: () => setActiveTab('tv') }}
                  />
                  <RowRail
                    title="Top Rated Movies"
                    items={topRated}
                    onSelect={setSelectedMedia}
                    mediaType="movie"
                    action={{
                      label: 'View All',
                      onClick: () => {
                        setSelectedSort('vote_average.desc');
                        setActiveTab('movie');
                      },
                    }}
                  />
                  <RowRail
                    titleNode={
                      <div className="flex items-center gap-2">
                        <h2 className="cine-section-title">Movies on</h2>
                        <div className="w-44">
                          <Select
                            value={homeProvider}
                            onChange={setHomeProvider}
                            label="Provider"
                            options={PROVIDERS.filter((p) => p.id !== '').map((p) => ({
                              value: p.id,
                              label: p.name,
                            }))}
                          />
                        </div>
                      </div>
                    }
                    title="Movies on provider"
                    items={providerMovies}
                    onSelect={setSelectedMedia}
                    mediaType="movie"
                  />
                  <RowRail title="Anime Spotlight" items={animeSpotlight} onSelect={setSelectedMedia} mediaType="tv" />
                </div>
              ) : activeTab === 'rooms' ? (
                <RoomsView
                  draftMedia={roomDraft}
                  onEnter={(code) => {
                    setRoomDraft(null);
                    setActiveRoomCode(code);
                  }}
                  onToast={showToast}
                />
              ) : activeTab === 'football' ? (
                <FootballView onToast={showToast} />
              ) : activeTab === 'watchlist' ? (
                <WatchlistView
                  onSelectMedia={(item) => setSelectedMedia(item)}
                  onResume={(media, fallback) => playMedia(media, fallback)}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  letterboxdUser={letterboxdUser}
                  onToast={showToast}
                  onSaveLetterboxd={handleSaveLetterboxd}
                />
              ) : (
                <>
                  {activeTab === 'movie' && (
                    <UpcomingRail
                      title="Coming Soon"
                      items={upcomingMovies}
                      onSelect={setSelectedMedia}
                      mediaType="movie"
                      badge="Coming Soon"
                      dateKey="release_date"
                    />
                  )}
                  {activeTab === 'tv' && showAiring ? (
                    <>
                      <div className="cine-section-head">
                        <h2 className="cine-section-title">On The Air</h2>
                        <span className="text-xs text-white/60">
                          {onAirToday.length} titles • airing now
                        </span>
                      </div>
                      <div className="cine-grid">
                        {onAirToday.map((media) => (
                          <Card
                            key={`${media.id}_${media.title || media.name}`}
                            media={{ ...media, media_type: media.media_type || 'tv' }}
                            onClick={setSelectedMedia}
                            size="fluid"
                            posterOnly={posterOnly}
                          />
                        ))}
                      </div>
                      {onAirToday.length === 0 && (
                        <p className="text-center py-16 text-xs text-white/60">
                          Nothing on the air right now. Check back later.
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="cine-section-head">
                        <h2 className="cine-section-title">
                          {activeTab === 'movie' ? 'Released Movies' : 'Released Series'}
                        </h2>
                        <span className="text-xs text-white/60">
                          {releasedItems.length} titles • available now
                        </span>
                      </div>
                      {catalogLoading && releasedItems.length === 0 ? (
                    <SkelGrid count={12} />
                  ) : (
                    <>
                      <div className="cine-grid">
                        {releasedItems.map((media) => (
                          <Card
                            key={`${media.id}_${media.title || media.name}`}
                            media={media}
                            onClick={setSelectedMedia}
                            size="fluid"
                            posterOnly={posterOnly}
                          />
                        ))}
                      </div>
                      {releasedItems.length === 0 && (
                        <p className="text-center py-16 text-xs text-white/60">
                          No titles found. Try clearing filters.
                        </p>
                      )}
                    </>
                  )}
                    </>
                  )}
                  {(activeTab === 'movie' || activeTab === 'tv') &&
                    page < totalPages &&
                    items.length > 0 && (
                      <div className="flex justify-center py-10">
                        <button
                          onClick={() => setPage((p) => p + 1)}
                          disabled={loadingMore}
                          className="cine-control-btn disabled:opacity-50"
                        >
                          {loadingMore ? 'Loading…' : 'Load more'}
                        </button>
                      </div>
                    )}
                </>
              )}
            </section>
          </main>
        </>
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentUsername={letterboxdUser}
        onSaveLetterboxd={handleSaveLetterboxd}
      />

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectMedia={(item) => setSelectedMedia(item)}
        onSelectPerson={(id) => setSelectedPerson(id)}
      />

      {activePlayer && (
        <Player
          key={`${activePlayer.media?.media_type || 'media'}_${activePlayer.media?.id}`}
          media={activePlayer.media}
          details={activePlayer.details}
          onClose={() => setActivePlayer(null)}
        />
      )}

      {/* Watchlist toast */}
      <div className={`cine-toast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}