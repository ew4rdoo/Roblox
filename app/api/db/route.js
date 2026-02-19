import { supabase, isDbReady } from "../../../lib/supabase";

export async function GET(request) {
  if (!isDbReady()) return Response.json({ error: "Database not configured" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  try {
    switch (action) {
      // ─── Load all scored games ────────────────────────────
      case "load-games": {
        const { data, error } = await supabase
          .from("game_scores")
          .select("*")
          .order("total_score", { ascending: false })
          .limit(500);
        if (error) throw error;
        return Response.json({ games: data || [] });
      }

      // ─── Load snapshots for a game (for charts) ──────────
      case "snapshots": {
        const uid = searchParams.get("uid");
        if (!uid) return Response.json({ data: [] });
        const { data, error } = await supabase
          .from("game_snapshots")
          .select("*")
          .eq("universe_id", uid)
          .order("snapshot_date", { ascending: true })
          .limit(90);
        if (error) throw error;
        return Response.json({ data: data || [] });
      }

      // ─── Load outreach log for a game ─────────────────────
      case "outreach-log": {
        const uid = searchParams.get("uid");
        if (!uid) return Response.json({ data: [] });
        const { data, error } = await supabase
          .from("outreach_log")
          .select("*")
          .eq("universe_id", uid)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return Response.json({ data: data || [] });
      }

      // ─── Load scan history ────────────────────────────────
      case "scan-history": {
        const { data, error } = await supabase
          .from("scan_history")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(20);
        if (error) throw error;
        return Response.json({ data: data || [] });
      }

      // ─── Load watchlist for a device ──────────────────────
      case "watchlist-load": {
        const deviceId = searchParams.get("device_id");
        if (!deviceId) return Response.json({ ids: [] });
        const { data, error } = await supabase
          .from("watchlists")
          .select("universe_id")
          .eq("device_id", deviceId)
          .order("added_at", { ascending: false });
        if (error) throw error;
        return Response.json({ ids: (data || []).map(r => r.universe_id) });
      }

      // ─── Check DB health ──────────────────────────────────
      case "health": {
        const { count, error } = await supabase
          .from("game_scores")
          .select("*", { count: "exact", head: true });
        if (error) throw error;
        return Response.json({ ok: true, game_count: count });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isDbReady()) return Response.json({ error: "Database not configured" }, { status: 503 });

  const body = await request.json();
  const action = body.action;

  try {
    switch (action) {
      // ─── Save scored games + snapshots ────────────────────
      case "save-games": {
        const games = body.games || [];
        if (!games.length) return Response.json({ saved: 0 });

        const today = new Date().toISOString().split("T")[0];
        let saved = 0;

        for (const g of games) {
          const sl = g.social_links || {};

          // Upsert game_scores
          const { error: scoreErr } = await supabase
            .from("game_scores")
            .upsert({
              universe_id: g.universe_id,
              place_id: g.place_id || 0,
              name: g.name || "",
              description: (g.description || "").slice(0, 500),
              creator_name: g.creator_name || "",
              creator_type: g.creator_type || "",
              creator_id: g.creator_id || 0,
              genre: g.genre || "",
              ccu: g.playing || 0,
              visits: g.visits || 0,
              favorites: g.favorites || 0,
              rating_pct: g.rating_pct || 0,
              fav_visit_pct: g.fav_visit_pct || 0,
              days_since_update: g.days_since_update || 0,
              game_age_days: g.days_alive || 0,
              visits_per_day: g.visits_per_day || 0,
              gamepass_count: g.gamepass_count || 0,
              gamepass_max_price: g.gamepass_max_price || 0,
              gamepass_price_tiers: g.gamepass_price_tiers || 0,
              social_link_count: g.social_link_count || 0,
              has_discord: !!sl.discord,
              has_twitter: !!sl.twitter,
              has_youtube: !!sl.youtube,
              total_score: g.potential_score || 0,
              tier: g.potential_score >= 80 ? "S" : g.potential_score >= 70 ? "A" : g.potential_score >= 60 ? "B" : "C",
              last_scanned: new Date().toISOString(),
            }, { onConflict: "universe_id" });

          if (scoreErr) { console.error("Score upsert error:", scoreErr.message); continue; }

          // Insert snapshot (ignore conflict = already have today's)
          await supabase
            .from("game_snapshots")
            .upsert({
              universe_id: g.universe_id,
              snapshot_date: today,
              ccu: g.playing || 0,
              visits: g.visits || 0,
              favorites: g.favorites || 0,
              upvotes: g.upvotes || 0,
              downvotes: g.downvotes || 0,
              rating_pct: g.rating_pct || 0,
            }, { onConflict: "universe_id,snapshot_date" });

          saved++;
        }

        // After saving, compute trends for all games that have snapshots
        await computeTrends();

        return Response.json({ saved });
      }

      // ─── Update outreach status ───────────────────────────
      case "update-outreach": {
        const { universe_id, status, notes } = body;
        if (!universe_id) return Response.json({ error: "Missing universe_id" }, { status: 400 });

        // Update game_scores
        const updates = { outreach_status: status };
        if (status === "contacted") updates.contacted_at = new Date().toISOString();

        const { error: updErr } = await supabase
          .from("game_scores")
          .update(updates)
          .eq("universe_id", universe_id);
        if (updErr) throw updErr;

        // Add to outreach log
        await supabase.from("outreach_log").insert({
          universe_id,
          action: status,
          notes: notes || null,
        });

        return Response.json({ ok: true });
      }

      // ─── Record scan start/end ────────────────────────────
      // ─── Add to watchlist ─────────────────────────────────
      case "watchlist-add": {
        const { device_id, universe_id } = body;
        if (!device_id || !universe_id) return Response.json({ error: "Need device_id and universe_id" }, { status: 400 });
        const { error } = await supabase
          .from("watchlists")
          .upsert({ device_id, universe_id }, { onConflict: "device_id,universe_id" });
        if (error) throw error;
        return Response.json({ ok: true });
      }

      // ─── Remove from watchlist ──────────────────────────────
      case "watchlist-remove": {
        const { device_id: did, universe_id: uid } = body;
        if (!did || !uid) return Response.json({ error: "Need device_id and universe_id" }, { status: 400 });
        const { error } = await supabase
          .from("watchlists")
          .delete()
          .eq("device_id", did)
          .eq("universe_id", uid);
        if (error) throw error;
        return Response.json({ ok: true });
      }

      case "scan-start": {
        const { data, error } = await supabase
          .from("scan_history")
          .insert({ status: "running" })
          .select()
          .single();
        if (error) throw error;
        return Response.json({ scan_id: data.id });
      }

      case "scan-end": {
        const { scan_id, games_found, games_in_range } = body;
        const { error } = await supabase
          .from("scan_history")
          .update({ finished_at: new Date().toISOString(), games_found, games_in_range, status: "done" })
          .eq("id", scan_id);
        if (error) throw error;
        return Response.json({ ok: true });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// ─── Compute trends from snapshots ──────────────────────────────
async function computeTrends() {
  // Get all games that have at least 2 snapshots
  const { data: games } = await supabase
    .from("game_scores")
    .select("universe_id");

  if (!games?.length) return;

  for (const game of games) {
    const uid = game.universe_id;

    // Get last 14 days of snapshots
    const { data: snaps } = await supabase
      .from("game_snapshots")
      .select("ccu, snapshot_date, visits, rating_pct")
      .eq("universe_id", uid)
      .order("snapshot_date", { ascending: false })
      .limit(14);

    if (!snaps || snaps.length < 2) continue;

    // Calculate averages
    const recent7 = snaps.slice(0, Math.min(7, snaps.length));
    const older7 = snaps.slice(Math.min(7, snaps.length));

    const avg7 = recent7.reduce((s, r) => s + r.ccu, 0) / recent7.length;
    const avg14 = snaps.reduce((s, r) => s + r.ccu, 0) / snaps.length;
    const avgOlder = older7.length > 0
      ? older7.reduce((s, r) => s + r.ccu, 0) / older7.length
      : avg7;

    // Change %
    const changePct = avgOlder > 0 ? ((avg7 - avgOlder) / avgOlder) * 100 : 0;

    // Trend direction
    let trend = "stable";
    if (changePct > 15) trend = "rising";
    else if (changePct < -15) trend = "declining";

    // Plateau detection: stable CCU + high rating + recent update
    // stddev of CCU
    const mean = snaps.reduce((s, r) => s + r.ccu, 0) / snaps.length;
    const variance = snaps.reduce((s, r) => s + Math.pow(r.ccu - mean, 2), 0) / snaps.length;
    const stddev = Math.sqrt(variance);
    const cv = mean > 0 ? (stddev / mean) * 100 : 100; // coefficient of variation

    const latestRating = snaps[0]?.rating_pct || 0;
    const isPlateau = cv < 20 && latestRating >= 80 && snaps.length >= 3;

    await supabase
      .from("game_scores")
      .update({
        ccu_trend: trend,
        ccu_7d_avg: Math.round(avg7 * 100) / 100,
        ccu_14d_avg: Math.round(avg14 * 100) / 100,
        ccu_change_pct: Math.round(changePct * 100) / 100,
        is_plateau: isPlateau,
      })
      .eq("universe_id", uid);
  }
}
