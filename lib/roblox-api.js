async function api(params) {
  const qs = new URLSearchParams(params).toString();
  const resp = await fetch(`/api/roblox?${qs}`);
  if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || `API ${resp.status}`); }
  return resp.json();
}

export const getSorts = () => api({ action: "get-sorts" });

export const getSortContent = (sortId, sessionId, pageToken = "") => {
  const p = { action: "get-sort-content", sortId, sessionId };
  if (pageToken) p.pageToken = pageToken;
  return api(p);
};

export const searchGames = (query, sessionId) =>
  api({ action: "search", q: query, sessionId });

export async function fetchGameDetails(uids) {
  const d = await api({ action: "game-details", ids: uids.join(",") });
  return d.data || [];
}

export async function fetchVotes(uids) {
  const d = await api({ action: "votes", ids: uids.join(",") });
  const m = {};
  (d.data || []).forEach(v => { m[v.id] = { up: v.upVotes || 0, down: v.downVotes || 0 }; });
  return m;
}

export async function fetchThumbnails(uids) {
  const d = await api({ action: "thumbnails", ids: uids.join(",") });
  const m = {};
  (d.data || []).forEach(i => { const t = i.thumbnails || []; if (t[0]?.imageUrl) m[i.universeId] = t[0].imageUrl; });
  return m;
}

export async function fetchIcons(uids) {
  const d = await api({ action: "icons", ids: uids.join(",") });
  const m = {};
  (d.data || []).forEach(i => { if (i.imageUrl) m[i.targetId] = i.imageUrl; });
  return m;
}

export async function fetchGamepassesBatch(uids) {
  const all = {};
  for (let i = 0; i < uids.length; i += 10) {
    try {
      const d = await api({ action: "gamepasses-batch", ids: uids.slice(i, i + 10).join(",") });
      Object.assign(all, d.results || {});
    } catch { uids.slice(i, i + 10).forEach(id => { all[id] = { count: -1, passes: [] }; }); }
  }
  return all;
}

export async function fetchSocialLinksBatch(uids) {
  const all = {};
  for (let i = 0; i < uids.length; i += 10) {
    try {
      const d = await api({ action: "social-links-batch", ids: uids.slice(i, i + 10).join(",") });
      Object.assign(all, d.results || {});
    } catch { uids.slice(i, i + 10).forEach(id => { all[id] = []; }); }
  }
  return all;
}

export async function fetchCreatorGames(creatorId, creatorType) {
  const d = await api({ action: "creator-games", cid: creatorId, ctype: creatorType });
  return d.data || [];
}

export async function fetchGroupInfo(groupId) {
  return api({ action: "group-info", gid: groupId });
}
