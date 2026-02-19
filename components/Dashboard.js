"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { calculateScore, getTier, TIER_CONFIG, WEIGHTS, formatNumber } from "../lib/scoring";
import {
  getSorts, getSortContent, searchGames,
  fetchGameDetails, fetchVotes, fetchThumbnails, fetchIcons,
} from "../lib/roblox-api";
import GameCard from "../components/GameCard";

const SEARCH_PRESETS = [
  // Core genres
  "tycoon","obby","simulator","RPG","horror","survival","fighting","racing",
  "shooter","anime","building","adventure","mystery","strategy","tower defense",
  "roleplay","sports","FPS","parkour","cooking",
  // Popular mechanics
  "clicker","idle","merge","pet","collect","craft","farm","fish","mine",
  "grind","upgrade","rebirth","prestige","AFK","auto",
  // Trending themes
  "anime battlegrounds","fruit","demon","one piece","dragon ball","naruto","jujutsu",
  "blox fruits","sword","magic","elemental","dungeon","boss fight","raid",
  // Social / RP
  "hangout","house","cafe","restaurant","school","hospital","city","life sim",
  "dress up","fashion","salon","makeover","daycare","family","adopt",
  // Action
  "battle royale","PVP","arena","war","gun","military","zombie","infection",
  "flee","escape","hide and seek","tag","capture the flag","dodgeball",
  // Simulation
  "driving","car","vehicle","boat","plane","train","truck","delivery",
  "pet simulator","bee","bug","garden","zoo","aquarium",
  // Building / Creative
  "sandbox","baseplate","studio","design","house build","castle","bridge",
  // Horror / Story
  "scary","creepy","backrooms","SCP","ghost","haunted","story","chapter",
  "doors","piggy","granny","monster","escape room",
  // Casual / Mini
  "minigame","mini game","party","trivia","quiz","board game","card",
  "ball","marble","slide","waterpark","theme park","amusement",
  // Economy
  "trade","trading","market","shop","store","business","money","rich",
  "robux","donate","pls donate",
  // TD / Wave
  "tower defense","wave","base defense","defend","fortress","castle defense",
  // Incremental
  "grow","get big","get strong","get tall","get fat","push","pull","lift",
  "workout","gym","muscle","speed run","size",
  // Niche popular
  "superhero","villain","power","ability","stand","aura","trait",
  "morph","transformation","evolution","fusion",
  "ship","pirate","ocean","island","treasure",
  "space","galaxy","alien","rocket","planet",
  "medieval","knight","king","kingdom","empire",
  "ninja","samurai","assassin","stealth",
  "detective","crime","heist","robbery","prison","jail",
  "football","basketball","soccer","baseball","boxing","wrestling","MMA",
  // Roblox meta / trending
  "brainrot","steal","rng","luck","hatch","roll","crate","loot","evolve",
  "rarity","chance","spin","gacha","survive","killer","coop","facility",
  "fighters","hunters","battlegrounds","powers","bosses","tower","climb",
  "challenge","rp","life","world","coop horror","extraction","roguelike",
];

// Broad single-char / common-word searches
const BROWSE_ALL_TERMS = [
  "a","b","c","d","e","f","g","h","i","j","k","l","m",
  "n","o","p","r","s","t","u","w","x","y","z",
  "the","game","new","play","world","super","mega","ultra",
  "pro","epic","battle","run","fight","quest","land",
  "update","code","free","fun","easy","hard",
];

// Deep scan: every 2-letter combo (676) + numbers — catches nearly every game
function generateDeepScanTerms() {
  const terms = [];
  const letters = "abcdefghijklmnopqrstuvwxyz";
  for (let i = 0; i < letters.length; i++) {
    for (let j = 0; j < letters.length; j++) {
      terms.push(letters[i] + letters[j]);
    }
  }
  // Add number searches
  for (let i = 0; i <= 9; i++) terms.push(String(i));
  for (const n of ["10","20","50","100","1000","2024","2025","2026"]) terms.push(n);
  return terms;
}
const DEEP_SCAN_TERMS = generateDeepScanTerms();

const PAGES_PER_MODE = { keywords: 10, broad: 5, deep: 2 };

// DB helpers
async function dbGet(params) {
  try { const r = await fetch(`/api/db?${new URLSearchParams(params)}`); return r.ok ? r.json() : null; } catch { return null; }
}
async function dbPost(body) {
  try { const r = await fetch("/api/db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return r.ok ? r.json() : null; } catch { return null; }
}

export default function Dashboard() {
  const [games, setGames] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scanLog, setScanLog] = useState([]);
  const [progress, setProgress] = useState({ step: 0, total: 0, found: 0 });
  const [expandedId, setExpandedId] = useState(null);
  const [sortBy, setSortBy] = useState("potential_score");
  const [filterTier, setFilterTier] = useState("ALL");
  const [error, setError] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [availableSorts, setAvailableSorts] = useState([]);
  const [sortsSessionId, setSortsSessionId] = useState("");
  const [sortsLoaded, setSortsLoaded] = useState(false);

  // Database
  const [dbStatus, setDbStatus] = useState("checking");
  const [dbGameCount, setDbGameCount] = useState(0);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastScanInfo, setLastScanInfo] = useState(null);

  // Outreach
  const [outreachStatuses, setOutreachStatuses] = useState({});
  const [filterOutreach, setFilterOutreach] = useState("all");
  const [filterPlateau, setFilterPlateau] = useState(false);
  const [filterTrend, setFilterTrend] = useState("all");

  // Watchlist — per-device, synced to Supabase
  const [watchlist, setWatchlist] = useState(new Set());
  const [activeTab, setActiveTab] = useState("scanner");
  const [watchlistGames, setWatchlistGames] = useState([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const deviceIdRef = useRef("");

  // Get or create device ID + load watchlist from DB
  useEffect(() => {
    let id = "";
    try { id = localStorage.getItem("gs_device_id") || ""; } catch {}
    if (!id) {
      id = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { localStorage.setItem("gs_device_id", id); } catch {}
    }
    deviceIdRef.current = id;

    // Load watchlist from Supabase
    (async () => {
      try {
        const r = await fetch(`/api/db?action=watchlist-load&device_id=${id}`);
        const d = await r.json();
        if (d.ids?.length) setWatchlist(new Set(d.ids));
      } catch {
        // Fall back to localStorage
        try { setWatchlist(new Set(JSON.parse(localStorage.getItem("gs_watchlist") || "[]"))); } catch {}
      }
    })();
  }, []);

  // Filters
  const [minPlayers, setMinPlayers] = useState(20);
  const [maxPlayers, setMaxPlayers] = useState(2000);
  const [minRating, setMinRating] = useState(0);
  const [minFavVisitPct, setMinFavVisitPct] = useState(0);
  const [maxDaysSinceUpdate, setMaxDaysSinceUpdate] = useState(9999);
  const [maxGameAge, setMaxGameAge] = useState(9999);
  const [requireGamepasses, setRequireGamepasses] = useState(false);

  // Keywords — ALL presets enabled by default
  const [extraKeywords, setExtraKeywords] = useState([...SEARCH_PRESETS]);
  const [kwInput, setKwInput] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [scanMode, setScanMode] = useState("keywords"); // "keywords" | "broad" | "deep"

  const abortRef = useRef(false);
  const abortControllerRef = useRef(null);
  const fileRef = useRef(null);
  const logRef = useRef(null);

  const log = useCallback((msg) => {
    setScanLog(p => [...p.slice(-120), { time: new Date().toLocaleTimeString(), msg }]);
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 50);
  }, []);

  // ─── Check DB + Load saved games on mount ─────────────────────
  useEffect(() => {
    (async () => {
      const health = await dbGet({ action: "health" });
      if (health?.ok) {
        setDbStatus("connected");
        setDbGameCount(health.game_count || 0);
        const result = await dbGet({ action: "load-games" });
        if (result?.games?.length) {
          const loaded = result.games.map(g => ({
            ...g, playing: g.ccu, potential_score: g.total_score,
            social_links: {
              ...(g.has_discord ? { discord: "linked" } : {}),
              ...(g.has_twitter ? { twitter: "linked" } : {}),
              ...(g.has_youtube ? { youtube: "linked" } : {}),
            },
            social_link_count: g.social_link_count || 0, score_breakdown: null,
          }));
          setGames(loaded);
          const statuses = {};
          loaded.forEach(g => { if (g.outreach_status) statuses[g.universe_id] = g.outreach_status; });
          setOutreachStatuses(statuses);
        }
        setDbLoaded(true);
        const history = await dbGet({ action: "scan-history" });
        if (history?.data?.[0]) setLastScanInfo(history.data[0]);
      } else {
        setDbStatus("unavailable"); setDbLoaded(true);
      }
    })();
  }, []);

  // ─── Load sorts ───────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const data = await getSorts();
        setSortsSessionId(data._sessionId || "");
        let sorts = data.sorts || data.Sorts || [];
        if (!Array.isArray(sorts)) {
          for (const [k, v] of Object.entries(data)) {
            if (!k.startsWith("_") && Array.isArray(v) && v[0]?.sortId) { sorts = v; break; }
          }
        }
        setAvailableSorts(sorts.map(s => ({
          sortId: s.sortId || s.SortId || "",
          name: s.sortDisplayName || s.SortDisplayName || s.sortId || "?",
        })).filter(s => s.sortId));
      } catch {}
      setSortsLoaded(true);
    })();
  }, []);

  // ─── Save outreach ────────────────────────────────────────────
  const updateOutreachStatus = useCallback(async (uid, status, notes = "") => {
    setOutreachStatuses(prev => ({ ...prev, [uid]: status }));
    if (dbStatus === "connected") {
      await dbPost({ action: "update-outreach", universe_id: uid, status, notes });
    }
  }, [dbStatus]);

  const toggleWatchlist = useCallback((uid) => {
    setWatchlist(prev => {
      const next = new Set(prev);
      const adding = !next.has(uid);
      if (adding) next.add(uid); else next.delete(uid);
      // Persist to localStorage as fallback
      try { localStorage.setItem("gs_watchlist", JSON.stringify([...next])); } catch {}
      // Sync to Supabase
      const did = deviceIdRef.current;
      if (did) {
        fetch("/api/db", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: adding ? "watchlist-add" : "watchlist-remove",
            device_id: did,
            universe_id: uid,
          }),
        }).catch(() => {});
      }
      return next;
    });
  }, []);

  // ─── Enrich ───────────────────────────────────────────────────
  const enrichGames = useCallback(async (universeIds, { skipFilter = false } = {}) => {
    if (!universeIds.length) return [];
    const batches = [];
    for (let i = 0; i < universeIds.length; i += 50) batches.push(universeIds.slice(i, i + 50));
    const all = [];

    for (const batch of batches) {
      if (abortRef.current) return all;
      let details=[], votes={}, thumbs={}, icons={};
      try {
        [details, votes, thumbs, icons] = await Promise.all([
          fetchGameDetails(batch), fetchVotes(batch),
          fetchThumbnails(batch).catch(()=>({})), fetchIcons(batch).catch(()=>({})),
        ]);
        if (abortRef.current) return all;
      } catch {
        try { details = await fetchGameDetails(batch); } catch {}
        try { votes = await fetchVotes(batch); } catch {}
      }

      for (const det of details) {
        const uid = det.id;
        const vt = votes[uid] || { up: 0, down: 0 };
        const playing = det.playing || 0;
        if (!skipFilter && (playing < minPlayers || playing > maxPlayers)) continue;

        all.push(calculateScore({
          universe_id: uid, place_id: det.rootPlaceId || 0,
          name: det.name || "Unknown", description: (det.description || "").slice(0, 400),
          creator_name: det.creator?.name || "Unknown", creator_type: det.creator?.type || "Unknown",
          creator_id: det.creator?.id || 0,
          playing, visits: det.visits || 0, favorites: det.favoritedCount || 0,
          created: det.created || "", updated: det.updated || "",
          genre: det.genre || "Unknown", max_players: det.maxPlayers || 0,
          upvotes: vt.up, downvotes: vt.down,
          thumbnailUrl: thumbs[uid] || "", iconUrl: icons[uid] || "",
          gamepass_count: -1, gamepass_names: [],
          gamepass_max_price: 0, gamepass_price_tiers: 0,
          social_links: {}, social_link_count: 0,
          thumbnail_score: null,
        }));
      }
      await new Promise(r => setTimeout(r, 200));
    }
    return all;
  }, [minPlayers, maxPlayers]);

  // Load full game data for watchlisted IDs
  const loadWatchlistGames = useCallback(async () => {
    if (watchlist.size === 0) { setWatchlistGames([]); return; }
    setWatchlistLoading(true);
    const ids = [...watchlist];

    // First check if any are already in scanned games
    const existing = new Map();
    games.forEach(g => { if (watchlist.has(g.universe_id)) existing.set(g.universe_id, g); });

    // Fetch missing ones from Roblox API
    const missing = ids.filter(id => !existing.has(id));
    if (missing.length > 0) {
      try {
        const enriched = await enrichGames(missing, { skipFilter: true });
        enriched.forEach(g => existing.set(g.universe_id, g));
      } catch {}
    }

    const result = ids.map(id => existing.get(id)).filter(Boolean);
    setWatchlistGames(result.sort((a, b) => (b.potential_score || 0) - (a.potential_score || 0)));
    setWatchlistLoading(false);
  }, [watchlist, games, enrichGames]);

  // Refresh watchlist games when switching to tab
  useEffect(() => {
    if (activeTab === "watchlist") loadWatchlistGames();
  }, [activeTab, watchlist, loadWatchlistGames]);

  // ─── Search for specific games ──────────────────────────────
  const searchForGames = useCallback(async (query) => {
    if (!query.trim()) return;
    setSearchLoading(true);
    setSearchResults([]);

    try {
      // Check if it's a Roblox URL — extract place ID
      const urlMatch = query.match(/roblox\.com\/games\/(\d+)/i);
      if (urlMatch) {
        const placeId = parseInt(urlMatch[1]);
        // Convert place ID to universe ID via API
        const r = await fetch(`/api/roblox?action=place-to-universe&pid=${placeId}`);
        const d = await r.json();
        const uid = d.universeId || d.UniverseId;
        if (uid) {
          const enriched = await enrichGames([uid], { skipFilter: true });
          setSearchResults(enriched);
        } else {
          setSearchResults([]);
        }
      } else {
        // Regular text search
        const sid = Math.random().toString(36).slice(2);
        const data = await searchGames(query, sid);
        const ids = data._extractedUniverseIds || [];
        if (ids.length > 0) {
          const enriched = await enrichGames(ids.slice(0, 50), { skipFilter: true });
          setSearchResults(enriched.sort((a, b) => (b.playing || 0) - (a.playing || 0)));
        }
      }
    } catch {}
    setSearchLoading(false);
  }, [enrichGames]);

  // ─── Fetch multiple pages from a source ───────────────────────
  const fetchPagesFromSort = useCallback(async (sortId, sessionId, seenIds, label, maxPages = 10) => {
    const allIds = [];
    let pageToken = "";

    for (let page = 0; page < maxPages; page++) {
      if (abortRef.current) break;
      try {
        const data = await getSortContent(sortId, sessionId, pageToken);
        const ids = (data._extractedUniverseIds || []).filter(id => !seenIds.has(id));
        ids.forEach(id => seenIds.add(id));
        allIds.push(...ids);

        // Get next page token
        const nextToken = data.nextPageToken || data.NextPageToken || data.pageToken || "";
        if (!nextToken || ids.length === 0) break; // No more pages
        pageToken = nextToken;

        if (page > 0) log(`  page ${page + 1}: +${ids.length} new IDs`);
        await new Promise(r => setTimeout(r, 200));
      } catch { break; }
    }
    return allIds;
  }, [log]);

  const fetchPagesFromSearch = useCallback(async (query, seenIds, maxPages = 2) => {
    const allIds = [];
    const sid = Math.random().toString(36).slice(2);

    for (let page = 0; page < maxPages; page++) {
      if (abortRef.current) break;
      try {
        const data = await searchGames(query, sid);
        const ids = (data._extractedUniverseIds || []).filter(id => !seenIds.has(id));
        ids.forEach(id => seenIds.add(id));
        allIds.push(...ids);

        if (ids.length === 0 || page === 0) break;
        await new Promise(r => setTimeout(r, 200));
      } catch { break; }
    }
    return allIds;
  }, []);

  // ─── Save to DB ───────────────────────────────────────────────
  const saveToDb = useCallback(async (gameList) => {
    if (dbStatus !== "connected" || !gameList.length) return;
    setSaving(true);
    const BATCH = 200;
    let totalSaved = 0;
    log(`Saving ${gameList.length} games to database (${Math.ceil(gameList.length / BATCH)} batches)...`);
    
    for (let i = 0; i < gameList.length; i += BATCH) {
      const chunk = gameList.slice(i, i + BATCH);
      try {
        const result = await dbPost({ action: "save-games", games: chunk });
        if (result?.saved) totalSaved += result.saved;
      } catch {}
      if (i + BATCH < gameList.length) {
        log(`  💾 ${Math.min(i + BATCH, gameList.length)}/${gameList.length} saved...`);
      }
    }

    if (totalSaved > 0) {
      log(`✓ Saved ${totalSaved} games to database. Trends will update with more data.`);
      setDbGameCount(prev => Math.max(prev, totalSaved));
    } else {
      log("⚠ Database save failed — results still available locally.");
    }
    setSaving(false);
  }, [dbStatus, log]);

  // ─── Scan ─────────────────────────────────────────────────────
  const runScan = useCallback(async () => {
    setScanning(true); setError(null); setScanLog([]); abortRef.current = false;
    abortControllerRef.current = new AbortController();
    const seenIds = new Set();
    const sorts = availableSorts;
    const keywords = extraKeywords.filter(k => k.trim());
    const extraTerms = scanMode === "deep" ? DEEP_SCAN_TERMS : scanMode === "broad" ? BROWSE_ALL_TERMS : [];
    const allSearchTerms = [...keywords, ...extraTerms.filter(t => !keywords.includes(t))];
    const totalSources = sorts.length + allSearchTerms.length;
    if (!totalSources) { setError("No charts loaded."); setScanning(false); return; }

    let scanId = null;
    if (dbStatus === "connected") {
      const r = await dbPost({ action: "scan-start" });
      scanId = r?.scan_id;
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 1: Collect all universe IDs (fast, no enrichment)
    // ═══════════════════════════════════════════════════════
    const pagesPerSource = PAGES_PER_MODE[scanMode] || 10;
    setProgress({ step: 0, total: totalSources, found: 0, phase: "Collecting IDs" });
    log(`⚡ PHASE 1: Collecting IDs from ${sorts.length} charts + ${allSearchTerms.length} searches (${pagesPerSource} pages each) · mode: ${scanMode.toUpperCase()}...`);
    const startTime = Date.now();

    // Run chart fetches in parallel batches of 3
    for (let i = 0; i < sorts.length; i += 3) {
      if (abortRef.current) break;
      const batch = sorts.slice(i, i + 3);
      const results = await Promise.all(batch.map(async (sort, idx) => {
        try {
          return await fetchPagesFromSort(sort.sortId, sortsSessionId, seenIds, sort.name, pagesPerSource);
        } catch { return []; }
      }));
      results.forEach((ids, idx) => {
        const name = batch[idx]?.name || "?";
        if (ids.length) log(`  ${name}: ${ids.length} IDs`);
      });
      setProgress(p => ({ ...p, step: Math.min(i + 3, sorts.length), found: seenIds.size }));
      await new Promise(r => setTimeout(r, 150));
    }

    // Run search fetches in parallel batches (more parallel for deep scan)
    const SEARCH_PARALLEL = scanMode === "deep" ? 10 : 5;
    for (let i = 0; i < allSearchTerms.length; i += SEARCH_PARALLEL) {
      if (abortRef.current) break;
      const batch = allSearchTerms.slice(i, i + SEARCH_PARALLEL);
      await Promise.all(batch.map(async (term) => {
        try {
          return await fetchPagesFromSearch(term, seenIds, pagesPerSource);
        } catch { return []; }
      }));
      const step = sorts.length + Math.min(i + SEARCH_PARALLEL, allSearchTerms.length);
      setProgress(p => ({ ...p, step, found: seenIds.size }));
      if ((i % 50) === 0 || i + SEARCH_PARALLEL >= allSearchTerms.length) {
        log(`  Searches ${i+1}-${Math.min(i+SEARCH_PARALLEL, allSearchTerms.length)}/${allSearchTerms.length} · ${seenIds.size} unique IDs`);
      }
      await new Promise(r => setTimeout(r, 80));
    }

    const collectTime = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`✓ Phase 1 done in ${collectTime}s — ${seenIds.size} unique universe IDs collected.`);
    if (abortRef.current) { setScanning(false); log("⛔ Stopped."); return; }

    // ═══════════════════════════════════════════════════════
    // PHASE 2: Bulk enrich all IDs (parallel batches of 100)
    // ═══════════════════════════════════════════════════════
    const allIds = [...seenIds];
    log(`\n⚡ PHASE 2: Enriching ${allIds.length} games (details, votes, gamepasses, social)...`);
    setProgress({ step: 0, total: allIds.length, found: 0, phase: "Enriching" });

    const allGames = [];
    const ENRICH_BATCH = 100; // Bigger batches
    const PARALLEL = 3; // 3 enrichment batches at once

    for (let i = 0; i < allIds.length; i += ENRICH_BATCH * PARALLEL) {
      if (abortRef.current) break;

      const parallelBatches = [];
      for (let p = 0; p < PARALLEL; p++) {
        const start = i + p * ENRICH_BATCH;
        if (start < allIds.length) {
          parallelBatches.push(allIds.slice(start, start + ENRICH_BATCH));
        }
      }

      const results = await Promise.all(parallelBatches.map(batch => enrichGames(batch)));
      results.forEach(enriched => allGames.push(...enriched));

      const processed = Math.min(i + ENRICH_BATCH * PARALLEL, allIds.length);
      setProgress(p => ({ ...p, step: processed, found: allGames.length }));
      log(`  Enriched ${processed}/${allIds.length} — ${allGames.length} in player range`);

      // Update displayed games incrementally
      if (allGames.length > 0) {
        const unique = new Map();
        allGames.forEach(g => { if (!unique.has(g.universe_id)) unique.set(g.universe_id, g); });
        setGames([...unique.values()].sort((a,b) => b.potential_score - a.potential_score));
      }
    }

    // Dedup & finalize
    const unique = new Map();
    allGames.forEach(g => { if (!unique.has(g.universe_id)) unique.set(g.universe_id, g); });
    const final = [...unique.values()].sort((a,b) => b.potential_score - a.potential_score);
    setGames(final);

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    if (abortRef.current) {
      log(`⛔ Stopped early — kept ${final.length} games (${totalTime}s).`);
    } else {
      log(`\n✅ Scan complete! ${final.length} games in range from ${seenIds.size} checked in ${totalTime}s.`);
    }

    if (final.length > 0) await saveToDb(final);

    if (scanId && dbStatus === "connected") {
      await dbPost({ action: "scan-end", scan_id: scanId, games_found: seenIds.size, games_in_range: final.length });
    }
    setScanning(false);
  }, [availableSorts, sortsSessionId, extraKeywords, scanMode, minPlayers, maxPlayers, enrichGames, fetchPagesFromSort, fetchPagesFromSearch, saveToDb, dbStatus, log]);

  // ─── Filtering ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let g = [...games];
    if (minRating > 0) g = g.filter(x => (x.rating_pct||0) >= minRating);
    if (minFavVisitPct > 0) g = g.filter(x => (x.fav_visit_pct||0) >= minFavVisitPct);
    if (maxDaysSinceUpdate < 9999) g = g.filter(x => (x.days_since_update||0) <= maxDaysSinceUpdate);
    if (maxGameAge < 9999) g = g.filter(x => (x.days_alive || x.game_age_days || 9999) <= maxGameAge);
    if (requireGamepasses) g = g.filter(x => x.gamepass_count > 0);
    if (filterTier !== "ALL") g = g.filter(x => getTier(x.potential_score || x.total_score) === filterTier);
    if (filterOutreach !== "all") g = g.filter(x => (outreachStatuses[x.universe_id] || x.outreach_status || "new") === filterOutreach);
    if (filterPlateau) g = g.filter(x => x.is_plateau);
    if (filterTrend !== "all") g = g.filter(x => (x.ccu_trend || "unknown") === filterTrend);

    g.sort((a,b) => {
      const sa = a.potential_score || a.total_score || 0;
      const sb = b.potential_score || b.total_score || 0;
      if (sortBy === "potential_score") return sb - sa;
      if (sortBy === "playing") return (b.playing||b.ccu||0) - (a.playing||a.ccu||0);
      if (sortBy === "rating_pct") return (b.rating_pct||0) - (a.rating_pct||0);
      if (sortBy === "fav_visit_pct") return (b.fav_visit_pct||0) - (a.fav_visit_pct||0);
      if (sortBy === "gamepass_count") return (b.gamepass_count||0) - (a.gamepass_count||0);
      if (sortBy === "days_since_update") return (a.days_since_update||999) - (b.days_since_update||999);
      return 0;
    });
    return g;
  }, [games, sortBy, filterTier, filterOutreach, filterPlateau, filterTrend, outreachStatuses, minRating, minFavVisitPct, maxDaysSinceUpdate, maxGameAge, requireGamepasses]);

  // Tier counts now reflect FILTERED results
  const tierCounts = useMemo(() => {
    const c = { S:0, A:0, B:0, C:0 };
    filtered.forEach(g => c[getTier(g.potential_score || g.total_score)]++);
    return c;
  }, [filtered]);

  // ─── Exports ──────────────────────────────────────────────────
  const exportOutreach = () => {
    const h = ["Score","Name","CCU","Rating%","Fav/Visit%","Gamepasses","Updated","Trend","Plateau","Creator","Discord","Twitter","YouTube","Roblox URL","Status","Pitch"];
    const rows = filtered.map(g => {
      const sl = g.social_links || {};
      const status = outreachStatuses[g.universe_id] || g.outreach_status || "new";
      const pitch = generatePitch(g);
      return [
        (g.potential_score||g.total_score||0).toFixed(0), `"${(g.name||"").replace(/"/g,'""')}"`,
        g.playing||g.ccu||0, (g.rating_pct||0).toFixed(0), (g.fav_visit_pct||0).toFixed(1),
        g.gamepass_count||0, g.days_since_update||"?", g.ccu_trend||"unknown",
        g.is_plateau?"YES":"", `"${g.creator_name||""}"`,
        sl.discord||"", sl.twitter||"", sl.youtube||"",
        `https://www.roblox.com/games/${g.place_id}`,
        status, `"${pitch.replace(/"/g,'""')}"`,
      ].join(",");
    });
    const blob = new Blob([[h.join(","), ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "outreach_list.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportData = (type) => {
    let blob;
    if (type === "json") {
      blob = new Blob([JSON.stringify({ scraped_at: new Date().toISOString(), games: filtered }, null, 2)], { type: "application/json" });
    } else {
      const h = ["potential_score","name","playing","visits","favorites","rating_pct","fav_visit_pct","gamepass_count","ccu_trend","is_plateau","days_since_update","creator_name","genre","universe_id","place_id"];
      const rows = filtered.map(g => h.map(k => { const v=g[k]??g[k==="playing"?"ccu":k]??""; return typeof v==="string"&&v.includes(",") ? `"${v}"` : v; }).join(","));
      blob = new Blob([[h.join(","), ...rows].join("\n")], { type: "text/csv" });
    }
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `scout_results.${type}`; a.click(); URL.revokeObjectURL(url);
  };

  const handleFileImport = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => { try { const d = JSON.parse(ev.target.result); if (d.games) { setGames(d.games.sort((a,b) => (b.potential_score||b.total_score||0) - (a.potential_score||a.total_score||0))); setShowImport(false); } } catch { alert("Invalid JSON"); } };
    r.readAsText(f);
  };

  const addKeyword = () => { const kw = kwInput.trim(); if (kw && !extraKeywords.includes(kw)) { setExtraKeywords(p => [...p, kw]); setKwInput(""); } };
  const removeKeyword = kw => setExtraKeywords(p => p.filter(x => x !== kw));
  const toggleAllKeywords = () => {
    if (extraKeywords.length === SEARCH_PRESETS.length) setExtraKeywords([]);
    else setExtraKeywords([...SEARCH_PRESETS]);
  };

  // Styles
  const inp = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "#ccc", fontSize: 13, fontFamily: "'JetBrains Mono',monospace", padding: "10px 12px", borderRadius: 6, outline: "none", boxSizing: "border-box" };
  const sel = { ...inp, cursor: "pointer", fontSize: 12 };
  const chip = a => ({ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", borderRadius: 5, cursor: "pointer", transition: "all 0.15s", border: `1px solid ${a ? "#10b98140" : "rgba(255,255,255,0.06)"}`, background: a ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.02)", color: a ? "#10b981" : "rgba(255,255,255,0.4)" });
  const fl = { fontSize: 10, color: "rgba(255,255,255,0.25)", display: "block", marginBottom: 4, fontFamily: "'JetBrains Mono',monospace" };
  const fi = { ...inp, fontSize: 12, padding: "7px 10px", width: "100%" };
  const dbDot = dbStatus === "connected" ? "#10b981" : dbStatus === "checking" ? "#f59e0b" : "#ef4444";

  return (
    <>
      <header style={{ background: "rgba(255,255,255,0.015)", borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "20px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: scanning ? "#f59e0b" : games.length ? "#10b981" : "#555", boxShadow: scanning ? "0 0 10px #f59e0b" : "none", animation: scanning ? "pulse 1.5s infinite" : "none" }} />
              <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: "#10b981", letterSpacing: 2, textTransform: "uppercase" }}>Growth Scout</span>
              <span className="mono" style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: dbDot }} />
                {dbStatus === "connected" ? `DB: ${dbGameCount} games` : dbStatus === "checking" ? "DB..." : "DB offline"}
              </span>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em", background: "linear-gradient(135deg,#f0f0f0,#666)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Roblox Game Discovery Engine</h1>
          </div>
          <button onClick={() => setShowImport(!showImport)} className="mono" style={{ ...sel, color: "#777", fontSize: 11 }}>{showImport ? "✕" : "↑ Import"}</button>
        </div>
        {showImport && <div style={{ maxWidth: 960, margin: "10px auto 0", background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 14 }}>
          <button onClick={() => fileRef.current?.click()} className="mono" style={{ ...sel, color: "#3b82f6" }}>Choose JSON</button>
          <input ref={fileRef} type="file" accept=".json" onChange={handleFileImport} style={{ display: "none" }} />
        </div>}
      </header>

      {/* ─── Tab Bar ──────────────────────────────────────── */}
      <nav style={{ background: "rgba(255,255,255,0.01)", borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "0 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", gap: 0 }}>
          {[
            { id: "scanner", label: "🔍 Scanner", count: games.length },
            { id: "search", label: "🔎 Search", count: searchResults.length || null },
            { id: "watchlist", label: "★ Watchlist", count: watchlist.size },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="mono"
              style={{
                background: "none", border: "none", borderBottom: `2px solid ${activeTab === tab.id ? "#10b981" : "transparent"}`,
                color: activeTab === tab.id ? "#10b981" : "rgba(255,255,255,0.3)",
                fontSize: 12, fontWeight: 700, padding: "12px 20px", cursor: "pointer",
                transition: "all 0.15s", fontFamily: "'JetBrains Mono',monospace",
              }}
            >
              {tab.label}{tab.count > 0 ? ` (${tab.count})` : ""}
            </button>
          ))}
        </div>
      </nav>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "20px 24px" }}>

      {/* ═══ SEARCH TAB ════════════════════════════════════ */}
      {activeTab === "search" && (
        <>
          <div style={{ marginBottom: 20 }}>
            <div className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>Search by game name or paste a Roblox URL</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text" value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") searchForGames(searchQuery); }}
                placeholder="e.g. 'Adopt Me' or https://www.roblox.com/games/123456..."
                style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "#ccc", fontSize: 13, fontFamily: "'JetBrains Mono',monospace", padding: "12px 14px", borderRadius: 8, outline: "none" }}
              />
              <button
                onClick={() => searchForGames(searchQuery)}
                disabled={searchLoading || !searchQuery.trim()}
                className="mono"
                style={{ background: searchLoading ? "rgba(59,130,246,0.05)" : "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", color: "#3b82f6", fontSize: 13, fontWeight: 700, padding: "12px 24px", borderRadius: 8, cursor: searchLoading ? "wait" : "pointer", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}
              >{searchLoading ? "Searching..." : "Search"}</button>
            </div>
          </div>

          {searchLoading && (
            <div className="mono" style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Fetching game data...</div>
          )}

          {!searchLoading && searchResults.length > 0 && (
            <>
              <div className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginBottom: 12 }}>{searchResults.length} results</div>
              {searchResults.map((g, i) => (
                <GameCard key={g.universe_id} game={g} rank={i+1}
                  expanded={expandedId===g.universe_id}
                  onToggle={()=>setExpandedId(expandedId===g.universe_id?null:g.universe_id)}
                  outreachStatus={outreachStatuses[g.universe_id] || g.outreach_status || "new"}
                  onStatusChange={s => updateOutreachStatus(g.universe_id, s)}
                  isWatchlisted={watchlist.has(g.universe_id)}
                  onToggleWatchlist={toggleWatchlist}
                />
              ))}
            </>
          )}

          {!searchLoading && searchResults.length === 0 && searchQuery && (
            <div style={{ textAlign: "center", padding: 40 }}>
              <div className="mono" style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>No results yet — try searching</div>
            </div>
          )}

          {!searchQuery && (
            <div style={{ textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔎</div>
              <div className="mono" style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>Look up any Roblox game</div>
              <div className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", maxWidth: 400, margin: "0 auto", lineHeight: 1.8 }}>
                Search by name to find games, or paste a Roblox game URL to instantly see its score and stats. You can ☆ any result to add it to your watchlist.
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ WATCHLIST TAB ═══════════════════════════════════ */}
      {activeTab === "watchlist" && (
        <>
          {watchlistLoading ? (
            <div className="mono" style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Loading watchlist...</div>
          ) : watchlist.size === 0 ? (
            <div style={{ textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>☆</div>
              <div className="mono" style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>Your watchlist is empty</div>
              <div className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>Click the ☆ on any game card in the Scanner tab to add it here</div>
            </div>
          ) : (
            <>
              <div className="mono" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>★ {watchlistGames.length} watchlisted games</span>
                <button onClick={loadWatchlistGames} className="mono" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.35)", fontSize: 11, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace" }}>↻ Refresh</button>
              </div>
              {watchlistGames.map((g, i) => (
                <GameCard key={g.universe_id} game={g} rank={i+1}
                  expanded={expandedId===g.universe_id}
                  onToggle={()=>setExpandedId(expandedId===g.universe_id?null:g.universe_id)}
                  outreachStatus={outreachStatuses[g.universe_id] || g.outreach_status || "new"}
                  onStatusChange={s => updateOutreachStatus(g.universe_id, s)}
                  isWatchlisted={watchlist.has(g.universe_id)}
                  onToggleWatchlist={toggleWatchlist}
                />
              ))}
            </>
          )}
        </>
      )}

      {/* ═══ SCANNER TAB ════════════════════════════════════ */}
      {activeTab === "scanner" && (
        <>
        {/* DB loaded notice */}
        {dbLoaded && games.length > 0 && !scanning && scanLog.length === 0 && (
          <div className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.1)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>📦 Loaded {games.length} games from database{lastScanInfo?.finished_at ? ` · Last scan: ${new Date(lastScanInfo.finished_at).toLocaleString()}` : ""}</span>
            <span style={{ color: "rgba(255,255,255,0.15)" }}>Run a new scan to refresh</span>
          </div>
        )}

        {/* ─── Scan Panel ──────────────────────────────────── */}
        <section style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 18, marginBottom: 16 }}>
          <div className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 14, lineHeight: 1.7 }}>
            Sweeps <b style={{ color: "rgba(255,255,255,0.5)" }}>{availableSorts.length || "..."} charts</b> + <b style={{ color: "rgba(255,255,255,0.5)" }}>{extraKeywords.length} keywords</b>{scanMode === "broad" ? <> + <b style={{ color: "#f59e0b" }}>{BROWSE_ALL_TERMS.length} broad</b></> : scanMode === "deep" ? <> + <b style={{ color: "#ef4444" }}>{DEEP_SCAN_TERMS.length} deep scan (A-Z combos)</b></> : ""} · {PAGES_PER_MODE[scanMode]} pages each · {dbStatus === "connected" ? "auto-saves to DB" : "DB offline"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 10, alignItems: "end" }}>
            <div><label style={fl}>Min Players</label><input type="number" value={minPlayers} onChange={e => setMinPlayers(+e.target.value||0)} style={fi} /></div>
            <div><label style={fl}>Max Players</label><input type="number" value={maxPlayers} onChange={e => setMaxPlayers(+e.target.value||99999)} style={fi} /></div>
            <div><label style={fl}>Scan Mode</label>
              <select value={scanMode} onChange={e=>setScanMode(e.target.value)} style={{ ...fi, cursor: "pointer", color: scanMode === "deep" ? "#ef4444" : scanMode === "broad" ? "#f59e0b" : "#10b981" }}>
                <option value="keywords">Keywords (fast)</option>
                <option value="broad">+ Broad (A-Z)</option>
                <option value="deep">Deep Scan (all)</option>
              </select>
            </div>
            <div>{!scanning
              ? <button onClick={runScan} disabled={!sortsLoaded} className="mono" style={{ background: sortsLoaded ? "#10b981" : "#333", color: sortsLoaded ? "#000" : "#666", border: "none", fontSize: 13, fontWeight: 700, padding: "11px 28px", borderRadius: 6, cursor: sortsLoaded ? "pointer" : "wait" }}>▶ SCAN</button>
              : <button onClick={() => { abortRef.current=true; if(abortControllerRef.current) abortControllerRef.current.abort(); setScanning(false); log("⛔ Scan stopped by user."); }} className="mono" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)", fontSize: 13, fontWeight: 700, padding: "11px 28px", borderRadius: 6, cursor: "pointer" }}>■ STOP</button>
            }</div>
          </div>
          {saving && <div className="mono" style={{ marginTop: 8, fontSize: 10, color: "#f59e0b" }}>💾 Saving to database...</div>}

          {/* Keywords — shown by default since they're all active */}
          <div style={{ marginTop: 12 }}>
            <button onClick={() => setShowAdvanced(!showAdvanced)} className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", textUnderlineOffset: 3 }}>
              {showAdvanced ? "▾ Hide" : "▸ Show"} keyword searches ({extraKeywords.length} active{scanMode === "broad" ? ` + ${BROWSE_ALL_TERMS.length} broad` : scanMode === "deep" ? ` + ${DEEP_SCAN_TERMS.length} deep` : ""})
            </button>
            {showAdvanced && <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>{extraKeywords.length} of {SEARCH_PRESETS.length} genres active</span>
                <button onClick={toggleAllKeywords} className="mono" style={{ fontSize: 10, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                  {extraKeywords.length === SEARCH_PRESETS.length ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {SEARCH_PRESETS.map(kw => <span key={kw} onClick={() => extraKeywords.includes(kw) ? removeKeyword(kw) : setExtraKeywords(p=>[...p,kw])} style={chip(extraKeywords.includes(kw))}>{kw}</span>)}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input type="text" value={kwInput} onChange={e=>setKwInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addKeyword()} placeholder="Custom keyword..." style={{ ...inp, flex: 1, fontSize: 11, padding: "6px 10px" }} />
                <button onClick={addKeyword} className="mono" style={{ ...sel, color: "#10b981", fontSize: 11, padding: "6px 12px" }}>+ Add</button>
              </div>
            </div>}
          </div>

          {/* Log */}
          {(scanning || scanLog.length > 0) && <div style={{ marginTop: 14 }}>
            {scanning && <div style={{ marginBottom: 8 }}>
              <div className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>
                <span>{progress.phase || "Scanning"} — {progress.step}/{progress.total}</span><span>{progress.found} {progress.phase === "Enriching" ? "in range" : "IDs"}</span>
              </div>
              <div style={{ width: "100%", height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2 }}>
                <div style={{ width: `${progress.total?(progress.step/progress.total)*100:0}%`, height: "100%", background: progress.phase === "Enriching" ? "#f59e0b" : "#10b981", borderRadius: 2, transition: "width 0.3s" }} />
              </div>
            </div>}
            <div ref={logRef} className="mono" style={{ maxHeight: 160, overflow: "auto", background: "rgba(0,0,0,0.25)", borderRadius: 6, padding: "8px 10px", fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.8 }}>
              {scanLog.map((l,i) => <div key={i}><span style={{ color: "rgba(255,255,255,0.12)" }}>{l.time}</span> {l.msg}</div>)}
            </div>
          </div>}
          {error && <div className="mono" style={{ marginTop: 12, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#ef4444" }}>{error}</div>}
        </section>

        {/* ─── Filters ─────────────────────────────────────── */}
        {games.length > 0 && <section style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 18, marginBottom: 16 }}>
          <div className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
            Filters — {filtered.length} of {games.length} shown
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, alignItems: "end" }}>
            <div><label style={fl}>Min Rating %</label><input type="number" value={minRating||""} onChange={e=>setMinRating(+e.target.value||0)} placeholder="85" style={fi} /></div>
            <div><label style={fl}>Min Fav/Visit %</label><input type="number" value={minFavVisitPct||""} onChange={e=>setMinFavVisitPct(+e.target.value||0)} placeholder="5" style={fi} /></div>
            <div><label style={fl}>Updated Within</label><input type="number" value={maxDaysSinceUpdate<9999?maxDaysSinceUpdate:""} onChange={e=>setMaxDaysSinceUpdate(+e.target.value||9999)} placeholder="14d" style={fi} /></div>
            <div><label style={fl}>Max Age (days)</label><input type="number" value={maxGameAge<9999?maxGameAge:""} onChange={e=>setMaxGameAge(+e.target.value||9999)} placeholder="365" style={fi} /></div>
            <div><label style={fl}>Gamepasses</label>
              <button onClick={()=>setRequireGamepasses(!requireGamepasses)} className="mono" style={{ width: "100%", padding: "7px 10px", fontSize: 12, borderRadius: 6, cursor: "pointer", border: `1px solid ${requireGamepasses ? "#10b98140" : "rgba(255,255,255,0.07)"}`, background: requireGamepasses ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.04)", color: requireGamepasses ? "#10b981" : "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono',monospace" }}>{requireGamepasses ? "✓ Required" : "Any"}</button>
            </div>
            <div><label style={fl}>Outreach</label>
              <select value={filterOutreach} onChange={e=>setFilterOutreach(e.target.value)} style={fi}>
                <option value="all">All</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="responded">Responded</option>
                <option value="deal">Deal</option>
                <option value="passed">Passed</option>
              </select>
            </div>
            <div><label style={fl}>Trend</label>
              <select value={filterTrend} onChange={e=>setFilterTrend(e.target.value)} style={fi}>
                <option value="all">All</option>
                <option value="rising">↑ Rising</option>
                <option value="stable">→ Stable</option>
                <option value="declining">↓ Declining</option>
              </select>
            </div>
            <div><label style={fl}>Plateau</label>
              <button onClick={()=>setFilterPlateau(!filterPlateau)} className="mono" style={{ width: "100%", padding: "7px 10px", fontSize: 12, borderRadius: 6, cursor: "pointer", border: `1px solid ${filterPlateau ? "#f59e0b40" : "rgba(255,255,255,0.07)"}`, background: filterPlateau ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.04)", color: filterPlateau ? "#f59e0b" : "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono',monospace" }}>{filterPlateau ? "✓ Only Plateaus" : "Any"}</button>
            </div>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", lineHeight: "24px" }}>Quick:</span>
            <button onClick={()=>{ setMinRating(85); setMinFavVisitPct(5); setMaxDaysSinceUpdate(14); setMaxGameAge(365); setRequireGamepasses(true); setFilterOutreach("all"); setFilterTrend("all"); setFilterPlateau(false); setFilterTier("ALL"); }} className="mono" style={chip(false)}>🎯 Growth Target</button>
            <button onClick={()=>{ setMinRating(80); setMinFavVisitPct(0); setMaxDaysSinceUpdate(9999); setMaxGameAge(9999); setRequireGamepasses(false); setFilterOutreach("all"); setFilterTrend("all"); setFilterPlateau(true); setFilterTier("ALL"); }} className="mono" style={chip(false)}>📊 Plateaus Only</button>
            <button onClick={()=>{ setMinRating(0); setMinFavVisitPct(0); setMaxDaysSinceUpdate(9999); setMaxGameAge(9999); setRequireGamepasses(false); setFilterTier("ALL"); setFilterOutreach("new"); setFilterTrend("all"); setFilterPlateau(false); }} className="mono" style={chip(false)}>🆕 Uncontacted</button>
            <button onClick={()=>{ setMinRating(0); setMinFavVisitPct(0); setMaxDaysSinceUpdate(9999); setMaxGameAge(9999); setRequireGamepasses(false); setFilterTier("ALL"); setFilterOutreach("all"); setFilterTrend("all"); setFilterPlateau(false); }} className="mono" style={chip(false)}>✕ Clear</button>
          </div>
        </section>}

        {/* ─── Results ─────────────────────────────────────── */}
        {games.length > 0 && <>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {Object.entries(TIER_CONFIG).map(([t, conf]) => (
              <button key={t} onClick={()=>setFilterTier(filterTier===t?"ALL":t)} style={{ flex: 1, background: filterTier===t?conf.bg:"rgba(255,255,255,0.015)", border: `1px solid ${filterTier===t?conf.color+"35":"rgba(255,255,255,0.05)"}`, borderRadius: 8, padding: "10px 8px", cursor: "pointer", textAlign: "center" }}>
                <div className="mono" style={{ fontSize: 20, fontWeight: 800, color: conf.color }}>{tierCounts[t]}</div>
                <div className="mono" style={{ fontSize: 9, color: conf.color, opacity: .7 }}>{t}-TIER</div>
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ ...sel, width: "auto" }}>
              <option value="potential_score">Sort: Score</option>
              <option value="playing">Sort: Players</option>
              <option value="rating_pct">Sort: Rating</option>
              <option value="fav_visit_pct">Sort: Fav/Visit %</option>
              <option value="gamepass_count">Sort: Gamepasses</option>
              <option value="days_since_update">Sort: Updated</option>
            </select>
            <div style={{ flex: 1 }} />
            <span className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>{filtered.length} games</span>
            <button onClick={exportOutreach} className="mono" style={{ ...sel, width: "auto", color: "#f59e0b", fontSize: 11, fontWeight: 600 }}>📋 Outreach CSV</button>
            <button onClick={()=>exportData("json")} className="mono" style={{ ...sel, width: "auto", color: "#3b82f6", fontSize: 11 }}>↓ JSON</button>
            <button onClick={()=>exportData("csv")} className="mono" style={{ ...sel, width: "auto", color: "#3b82f6", fontSize: 11 }}>↓ CSV</button>
          </div>

          {filtered.map((g, i) => (
            <GameCard key={g.universe_id} game={g} rank={i+1}
              expanded={expandedId===g.universe_id}
              onToggle={()=>setExpandedId(expandedId===g.universe_id?null:g.universe_id)}
              outreachStatus={outreachStatuses[g.universe_id] || g.outreach_status || "new"}
              onStatusChange={s => updateOutreachStatus(g.universe_id, s)}
              isWatchlisted={watchlist.has(g.universe_id)}
              onToggleWatchlist={toggleWatchlist}
            />
          ))}
          {!filtered.length && <div className="mono" style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.2)" }}>No games match current filters. Try loosening them.</div>}
        </>}

        {/* Empty */}
        {!games.length && !scanning && dbLoaded && <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.2 }}>🎮</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.35)", marginBottom: 8 }}>Ready to Scout</div>
          <div className="mono" style={{ fontSize: 12, color: "rgba(255,255,255,0.18)", maxWidth: 420, margin: "0 auto", lineHeight: 1.8 }}>
            All {SEARCH_PRESETS.length} genre keywords are pre-selected. Choose <span style={{ color: "#ef4444" }}>Deep Scan</span> to search every 2-letter combo (aa-zz) for maximum coverage. Hit <span style={{ color: "#10b981" }}>SCAN</span> to begin.
          </div>
        </div>}
        </>
      )}
      </main>

      <footer style={{ maxWidth: 960, margin: "40px auto 0", padding: "20px 24px 40px", borderTop: "1px solid rgba(255,255,255,0.03)", textAlign: "center" }}>
        <p className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>Roblox Growth Scout</p>
      </footer>
    </>
  );
}

// ─── Pitch Generator ────────────────────────────────────────────
export function generatePitch(game) {
  const name = game.name || "your game";
  const ccu = game.playing || game.ccu || 0;
  const rating = (game.rating_pct || 0).toFixed(0);
  const favPct = (game.fav_visit_pct || 0).toFixed(1);
  const visits = formatNumber(game.visits || 0);

  let hook = "";
  if (parseFloat(rating) >= 90 && ccu < 500)
    hook = `${name} has a ${rating}% approval rating and ${favPct}% favorite-to-visit ratio — that's stronger than many games 10x your size.`;
  else if (parseFloat(favPct) >= 5)
    hook = `${name} has an impressive ${favPct}% favorite-to-visit ratio with ${visits} total visits — your players clearly love it.`;
  else
    hook = `${name} has solid engagement with ${rating}% positive ratings and ${visits} visits — there's clear demand.`;

  const multiplier = ccu < 200 ? "5-10x" : ccu < 500 ? "3-5x" : "2-3x";

  return `Hey! I came across ${name} and the metrics really stood out.\n\n${hook}\n\nBut with only ${ccu} concurrent players, there's a huge gap between your game quality and your discovery. We specialize in exactly this — helping strong Roblox games break through the discovery ceiling.\n\nWe think we can help you ${multiplier} your player count through optimized thumbnails, SEO, social campaigns, and influencer partnerships.\n\nWould you be open to a quick chat about what that could look like for ${name}?`;
}
