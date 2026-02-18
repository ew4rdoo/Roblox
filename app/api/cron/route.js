import { supabase, isDbReady } from "../../../lib/supabase";

// Vercel Cron config - runs daily at 3 AM UTC
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min (needs Vercel Pro)

const ALLOWED_HOSTS = [
  "games.roblox.com",
  "apis.roblox.com",
  "thumbnails.roblox.com",
];

export async function GET(request) {
  // Verify cron secret (optional but recommended)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDbReady()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  const startTime = Date.now();
  let scanId = null;

  try {
    // Record scan start
    const { data: scan } = await supabase
      .from("scan_history")
      .insert({ status: "running" })
      .select()
      .single();
    scanId = scan?.id;

    // 1. Get all chart sorts
    const sessionId = genId();
    const sortsData = await rbx(`https://apis.roblox.com/explore-api/v1/get-sorts?device=computer&country=all&sessionId=${sessionId}`);
    let sorts = sortsData.sorts || sortsData.Sorts || [];
    if (!Array.isArray(sorts)) {
      for (const [k, v] of Object.entries(sortsData)) {
        if (!k.startsWith("_") && Array.isArray(v) && v[0]?.sortId) { sorts = v; break; }
      }
    }

    const allIds = new Set();
    let totalFound = 0;

    // 2. Sweep all categories
    for (const sort of sorts) {
      const sid = sort.sortId || sort.SortId || "";
      if (!sid) continue;
      try {
        const data = await rbx(
          `https://apis.roblox.com/explore-api/v1/get-sort-content?sessionId=${sessionId}&sortId=${encodeURIComponent(sid)}&device=computer&country=all`
        );
        const ids = deepIds(data);
        ids.forEach(id => allIds.add(id));
        totalFound += ids.length;
      } catch {}
      await sleep(300);
    }

    // 3. Enrich and save in batches
    const uidList = [...allIds];
    const today = new Date().toISOString().split("T")[0];
    let inRange = 0;

    for (let i = 0; i < uidList.length; i += 50) {
      const batch = uidList.slice(i, i + 50);

      let details = [], votes = {};
      try {
        [details, votes] = await Promise.all([
          rbx(`https://games.roblox.com/v1/games?universeIds=${batch.join(",")}`).then(d => d.data || []),
          rbx(`https://games.roblox.com/v1/games/votes?universeIds=${batch.join(",")}`).then(d => {
            const m = {};
            (d.data || []).forEach(v => { m[v.id] = { up: v.upVotes || 0, down: v.downVotes || 0 }; });
            return m;
          }),
        ]);
      } catch { continue; }

      for (const det of details) {
        const uid = det.id;
        const vt = votes[uid] || { up: 0, down: 0 };
        const playing = det.playing || 0;
        const totalV = vt.up + vt.down;
        const ratingPct = totalV > 0 ? (vt.up / totalV) * 100 : 0;
        const favVisitPct = det.visits > 0 ? (det.favoritedCount / det.visits) * 100 : 0;

        // Save snapshot
        await supabase
          .from("game_snapshots")
          .upsert({
            universe_id: uid,
            snapshot_date: today,
            ccu: playing,
            visits: det.visits || 0,
            favorites: det.favoritedCount || 0,
            upvotes: vt.up,
            downvotes: vt.down,
            rating_pct: Math.round(ratingPct * 100) / 100,
          }, { onConflict: "universe_id,snapshot_date" });

        // Only fully score games in target range (20-5000 CCU)
        if (playing >= 20 && playing <= 5000) {
          inRange++;

          const now = new Date();
          let updDt, crDt;
          try { updDt = new Date(det.updated); crDt = new Date(det.created); } catch { updDt = now; crDt = now; }
          const daysUpdate = Math.max(0, Math.floor((now - updDt) / 86400000));
          const daysAlive = Math.max(1, Math.floor((now - crDt) / 86400000));

          // Simple scoring (matches client scoring)
          const engRatio = det.visits > 0 ? (det.favoritedCount / det.visits) * 1000 : 0;
          const engScore = Math.min((engRatio / 10) * 100, 100);
          let ratScore = totalV >= 50 ? (ratingPct >= 90 ? 100 : ratingPct >= 85 ? 90 : ratingPct >= 80 ? 75 : 55) : 40;
          let updScore = daysUpdate <= 7 ? 100 : daysUpdate <= 14 ? 90 : daysUpdate <= 30 ? 70 : 30;
          const quality = (engScore + ratScore) / 2;
          let headMul = playing < 100 ? 1 : playing < 500 ? 0.8 : playing < 1000 ? 0.6 : 0.4;
          const totalScore = (engScore * 0.2) + (ratScore * 0.15) + (updScore * 0.15) + (quality * headMul * 0.2) + 30 * 0.15 + 30 * 0.15;
          const tier = totalScore >= 80 ? "S" : totalScore >= 70 ? "A" : totalScore >= 60 ? "B" : "C";

          await supabase
            .from("game_scores")
            .upsert({
              universe_id: uid,
              place_id: det.rootPlaceId || 0,
              name: det.name || "",
              description: (det.description || "").slice(0, 500),
              creator_name: det.creator?.name || "",
              creator_type: det.creator?.type || "",
              creator_id: det.creator?.id || 0,
              genre: det.genre || "",
              ccu: playing,
              visits: det.visits || 0,
              favorites: det.favoritedCount || 0,
              rating_pct: Math.round(ratingPct * 100) / 100,
              fav_visit_pct: Math.round(favVisitPct * 100) / 100,
              days_since_update: daysUpdate,
              game_age_days: daysAlive,
              visits_per_day: Math.round((det.visits || 0) / daysAlive * 100) / 100,
              total_score: Math.round(totalScore * 100) / 100,
              tier,
              last_scanned: new Date().toISOString(),
            }, { onConflict: "universe_id" });
        }
      }
      await sleep(300);
    }

    // 4. Compute trends
    await computeTrends();

    // Record scan end
    if (scanId) {
      await supabase
        .from("scan_history")
        .update({
          finished_at: new Date().toISOString(),
          games_found: totalFound,
          games_in_range: inRange,
          status: "done",
        })
        .eq("id", scanId);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return Response.json({
      ok: true,
      elapsed_seconds: elapsed,
      total_universe_ids: uidList.length,
      games_in_range: inRange,
    });

  } catch (err) {
    if (scanId) {
      await supabase.from("scan_history").update({ status: `error: ${err.message}`, finished_at: new Date().toISOString() }).eq("id", scanId);
    }
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// ─── Trend computation ──────────────────────────────────────────
async function computeTrends() {
  const { data: games } = await supabase.from("game_scores").select("universe_id");
  if (!games?.length) return;

  for (const game of games) {
    const { data: snaps } = await supabase
      .from("game_snapshots")
      .select("ccu, rating_pct")
      .eq("universe_id", game.universe_id)
      .order("snapshot_date", { ascending: false })
      .limit(14);

    if (!snaps || snaps.length < 2) continue;

    const recent = snaps.slice(0, Math.min(7, snaps.length));
    const older = snaps.slice(Math.min(7, snaps.length));
    const avg7 = recent.reduce((s, r) => s + r.ccu, 0) / recent.length;
    const avgOlder = older.length ? older.reduce((s, r) => s + r.ccu, 0) / older.length : avg7;
    const avg14 = snaps.reduce((s, r) => s + r.ccu, 0) / snaps.length;
    const changePct = avgOlder > 0 ? ((avg7 - avgOlder) / avgOlder) * 100 : 0;

    let trend = "stable";
    if (changePct > 15) trend = "rising";
    else if (changePct < -15) trend = "declining";

    const mean = avg14;
    const variance = snaps.reduce((s, r) => s + Math.pow(r.ccu - mean, 2), 0) / snaps.length;
    const cv = mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 100;
    const latestRating = snaps[0]?.rating_pct || 0;
    const isPlateau = cv < 20 && latestRating >= 80 && snaps.length >= 3;

    await supabase.from("game_scores").update({
      ccu_trend: trend,
      ccu_7d_avg: Math.round(avg7 * 100) / 100,
      ccu_14d_avg: Math.round(avg14 * 100) / 100,
      ccu_change_pct: Math.round(changePct * 100) / 100,
      is_plateau: isPlateau,
    }).eq("universe_id", game.universe_id);
  }
}

// ─── Helpers ────────────────────────────────────────────────────
function genId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function rbx(url) {
  const h = new URL(url).hostname;
  if (!ALLOWED_HOSTS.includes(h)) throw new Error(`Blocked: ${h}`);
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!r.ok) throw new Error(`${h} ${r.status}`);
  return r.json();
}

function deepIds(obj, ids = new Set(), d = 0) {
  if (d > 10 || !obj) return [...ids];
  if (Array.isArray(obj)) { for (const i of obj) deepIds(i, ids, d + 1); }
  else if (typeof obj === "object") {
    for (const f of ["universeId", "UniverseId", "UniverseID", "ContentId", "contentId"]) {
      if (obj[f] !== undefined) { const v = parseInt(obj[f]); if (!isNaN(v) && v > 0) ids.add(v); }
    }
    for (const v of Object.values(obj)) { if (typeof v === "object" && v !== null) deepIds(v, ids, d + 1); }
  }
  return [...ids];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
