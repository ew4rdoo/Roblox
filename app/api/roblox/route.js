const ALLOWED_HOSTS = [
  "games.roblox.com",
  "apis.roblox.com",
  "thumbnails.roblox.com",
  "badges.roblox.com",
  "groups.roblox.com",
];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  if (!action) return Response.json({ error: "Missing action" }, { status: 400 });

  try {
    switch (action) {
      case "get-sorts": {
        const sessionId = genId();
        const data = await rbx(`https://apis.roblox.com/explore-api/v1/get-sorts?device=computer&country=all&sessionId=${sessionId}`);
        return Response.json({ ...data, _sessionId: sessionId });
      }
      case "get-sort-content": {
        const sortId = searchParams.get("sortId") || "top-playing-now";
        const sessionId = searchParams.get("sessionId") || genId();
        const pt = searchParams.get("pageToken") || "";
        let url = `https://apis.roblox.com/explore-api/v1/get-sort-content?sessionId=${sessionId}&sortId=${encodeURIComponent(sortId)}&device=computer&country=all`;
        if (pt) url += `&pageToken=${encodeURIComponent(pt)}`;
        const data = await rbx(url);
        return Response.json({ ...data, _extractedUniverseIds: deepIds(data) });
      }
      case "search": {
        const q = searchParams.get("q") || "";
        const sid = searchParams.get("sessionId") || genId();
        const data = await rbx(`https://apis.roblox.com/search-api/omni-search?SearchQuery=${encodeURIComponent(q)}&SessionId=${sid}`);
        return Response.json({ ...data, _extractedUniverseIds: deepIds(data) });
      }
      case "game-details": {
        const ids = searchParams.get("ids") || "";
        if (!ids) return Response.json({ data: [] });
        return Response.json(await rbx(`https://games.roblox.com/v1/games?universeIds=${ids}`));
      }
      case "votes": {
        const ids = searchParams.get("ids") || "";
        if (!ids) return Response.json({ data: [] });
        return Response.json(await rbx(`https://games.roblox.com/v1/games/votes?universeIds=${ids}`));
      }
      case "thumbnails": {
        const ids = searchParams.get("ids") || "";
        if (!ids) return Response.json({ data: [] });
        return Response.json(await rbx(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${ids}&countPerUniverse=1&defaults=true&size=768x432&format=Png&isCircular=false`));
      }
      case "icons": {
        const ids = searchParams.get("ids") || "";
        if (!ids) return Response.json({ data: [] });
        return Response.json(await rbx(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${ids}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`));
      }

      // ─── Gamepasses batch ─────────────────────────────────
      case "gamepasses-batch": {
        const ids = (searchParams.get("ids") || "").split(",").filter(Boolean);
        if (!ids.length) return Response.json({ results: {} });
        const results = {};
        for (let i = 0; i < ids.length; i += 5) {
          await Promise.all(ids.slice(i, i + 5).map(async uid => {
            try {
              const d = await rbx(`https://apis.roblox.com/game-passes/v1/universes/${uid}/game-passes?passView=Full&limit=100`);
              const p = d.data || d.gamePassList || (Array.isArray(d) ? d : []);
              results[uid] = { count: p.length, passes: p.map(x => ({ id: x.id || x.gamePassId, name: x.name || x.Name || "?", price: x.price || x.Price || x.priceInRobux || 0, isForSale: x.isForSale !== false })) };
            } catch {
              try {
                const d = await rbx(`https://games.roblox.com/v1/games/${uid}/game-passes?limit=100&sortOrder=Asc`);
                const p = d.data || [];
                results[uid] = { count: p.length, passes: p.map(x => ({ id: x.id, name: x.name || "?", price: x.price || 0, isForSale: x.isForSale !== false })) };
              } catch { results[uid] = { count: -1, passes: [] }; }
            }
          }));
        }
        return Response.json({ results });
      }

      // ─── Social links batch ───────────────────────────────
      case "social-links-batch": {
        const ids = (searchParams.get("ids") || "").split(",").filter(Boolean);
        if (!ids.length) return Response.json({ results: {} });
        const results = {};
        for (let i = 0; i < ids.length; i += 5) {
          await Promise.all(ids.slice(i, i + 5).map(async uid => {
            // Try multiple endpoint variations
            const urls = [
              `https://games.roblox.com/v1/games/${uid}/social-links/v1`,
              `https://games.roblox.com/v1/games/${uid}/social-links`,
            ];
            for (const url of urls) {
              try {
                const d = await rbxAuth(url);
                const links = d.data || (Array.isArray(d) ? d : []);
                if (links.length > 0) { results[uid] = links; return; }
              } catch {}
            }
            results[uid] = [];
          }));
        }
        return Response.json({ results });
      }

      // ─── Debug: test social links for a single game ────────
      case "debug-social": {
        const uid = searchParams.get("uid") || "";
        if (!uid) return Response.json({ error: "Missing uid" }, { status: 400 });
        const hasCookie = !!process.env.ROBLOX_COOKIE;
        const debug = { universe_id: uid, has_cookie: hasCookie, attempts: [] };

        const urls = [
          `https://games.roblox.com/v1/games/${uid}/social-links/v1`,
          `https://games.roblox.com/v1/games/${uid}/social-links`,
        ];

        for (const url of urls) {
          const attempt = { url, auth: false, noauth: false };
          // Try with auth
          try {
            const d = await rbxAuth(url);
            attempt.auth = { data: d.data || d, count: (d.data || []).length };
          } catch (e) { attempt.auth = { error: e.message }; }
          // Try without auth
          try {
            const d = await rbx(url);
            attempt.noauth = { data: d.data || d, count: (d.data || []).length };
          } catch (e) { attempt.noauth = { error: e.message }; }
          debug.attempts.push(attempt);
        }
        return Response.json(debug);
      }

      // ─── Group info ───────────────────────────────────────
      case "group-info": {
        const gid = searchParams.get("gid") || "";
        if (!gid) return Response.json({ error: "Missing gid" }, { status: 400 });
        try {
          const data = await rbx(`https://groups.roblox.com/v1/groups/${gid}`);
          return Response.json(data);
        } catch { return Response.json({ id: gid, name: "Unknown", memberCount: 0 }); }
      }

      // ─── Creator's other games ────────────────────────────
      case "creator-games": {
        const cid = searchParams.get("cid") || "";
        const ctype = searchParams.get("ctype") || "User";
        if (!cid) return Response.json({ data: [] });
        try {
          const url = ctype === "Group"
            ? `https://games.roblox.com/v2/groups/${cid}/games?limit=50&sortOrder=Desc&accessFilter=All`
            : `https://games.roblox.com/v2/users/${cid}/games?limit=50&sortOrder=Desc&accessFilter=All`;
          const data = await rbx(url);
          return Response.json(data);
        } catch { return Response.json({ data: [] }); }
      }

      default:
        return Response.json({ error: `Unknown: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

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
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`${h} ${r.status}: ${t.slice(0, 200)}`); }
  return r.json();
}

// Authenticated fetch — handles CSRF token negotiation for Roblox
async function rbxAuth(url) {
  const h = new URL(url).hostname;
  if (!ALLOWED_HOSTS.includes(h)) throw new Error(`Blocked: ${h}`);
  const cookie = process.env.ROBLOX_COOKIE || "";
  if (!cookie) return rbx(url); // Fall back to unauthenticated

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Accept: "application/json",
    Cookie: `.ROBLOSECURITY=${cookie}`,
  };

  // First attempt
  let r = await fetch(url, { headers, next: { revalidate: 0 } });

  // If 403, grab CSRF token from response and retry
  if (r.status === 403) {
    const csrf = r.headers.get("x-csrf-token");
    if (csrf) {
      headers["x-csrf-token"] = csrf;
      r = await fetch(url, { headers, next: { revalidate: 0 } });
    }
  }

  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`${h} ${r.status}: ${t.slice(0, 200)}`); }
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
