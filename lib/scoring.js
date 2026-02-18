export const WEIGHTS = {
  engagement_ratio: 20,
  rating_score: 15,
  update_recency: 15,
  growth_headroom: 20,
  monetization: 15,
  visit_efficiency: 15,
};

export const TIER_CONFIG = {
  S: { min: 80, color: "#10b981", bg: "rgba(16,185,129,0.08)", label: "Prime Target" },
  A: { min: 70, color: "#3b82f6", bg: "rgba(59,130,246,0.08)", label: "Strong Potential" },
  B: { min: 60, color: "#f59e0b", bg: "rgba(245,158,11,0.08)", label: "Worth Watching" },
  C: { min: 0, color: "#6b7280", bg: "rgba(107,114,128,0.08)", label: "Low Priority" },
};

export function getTier(score) {
  if (score >= 80) return "S";
  if (score >= 70) return "A";
  if (score >= 60) return "B";
  return "C";
}

export function formatNumber(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

export function calculateScore(game) {
  const now = new Date();
  let updDt, crDt;
  try { updDt = new Date(game.updated); crDt = new Date(game.created); }
  catch { updDt = now; crDt = now; }

  const daysSinceUpdate = Math.max(0, Math.floor((now - updDt) / 86400000));
  const daysAlive = Math.max(1, Math.floor((now - crDt) / 86400000));
  const visitsPerDay = game.visits / daysAlive;
  const favVisitPct = game.visits > 0 ? (game.favorites / game.visits) * 100 : 0;
  const engagementRatio = game.visits > 0 ? (game.favorites / game.visits) * 1000 : 0;

  const totalVotes = game.upvotes + game.downvotes;
  const ratingPct = totalVotes > 0 ? (game.upvotes / totalVotes) * 100 : 0;

  // Gamepass data
  const gpCount = game.gamepass_count || 0;
  const gpMaxPrice = game.gamepass_max_price || 0;
  const gpPriceTiers = game.gamepass_price_tiers || 0;

  // 1. Engagement ratio (0-100)
  const engScore = Math.min((engagementRatio / 10) * 100, 100);

  // 2. Rating score
  let ratScore = 40;
  if (totalVotes >= 50) {
    if (ratingPct >= 90) ratScore = 100;
    else if (ratingPct >= 85) ratScore = 90;
    else if (ratingPct >= 80) ratScore = 75;
    else if (ratingPct >= 70) ratScore = 55;
    else if (ratingPct >= 60) ratScore = 35;
    else ratScore = 15;
  }

  // 3. Update recency
  let updScore = 10;
  if (daysSinceUpdate <= 7) updScore = 100;
  else if (daysSinceUpdate <= 14) updScore = 90;
  else if (daysSinceUpdate <= 30) updScore = 70;
  else if (daysSinceUpdate <= 60) updScore = 45;
  else if (daysSinceUpdate <= 90) updScore = 25;

  // 4. Growth headroom
  const qualitySignal = (engScore + ratScore) / 2;
  let headroomMul = 0.15;
  if (game.playing < 100) headroomMul = 1.0;
  else if (game.playing < 200) headroomMul = 0.95;
  else if (game.playing < 500) headroomMul = 0.8;
  else if (game.playing < 1000) headroomMul = 0.6;
  else if (game.playing < 2000) headroomMul = 0.45;
  else if (game.playing < 5000) headroomMul = 0.3;
  const headroomScore = qualitySignal * headroomMul;

  // 5. Monetization score (now includes gamepasses)
  let monScore = 20;
  if (gpCount > 0) {
    monScore = 40; // Has gamepasses = baseline
    if (gpCount >= 3) monScore += 15; // Multiple passes
    if (gpCount >= 6) monScore += 10; // Well thought out
    if (gpPriceTiers >= 3) monScore += 15; // Price tier spread
    if (gpMaxPrice >= 500) monScore += 10; // Premium tier exists
    monScore = Math.min(monScore, 100);
  } else {
    // No gamepasses detected — could mean opportunity or dead game
    if (favVisitPct > 5 && ratingPct > 80) monScore = 50; // Good game, needs monetization help
    else monScore = 15;
  }

  // 6. Visit efficiency
  let effScore = 25;
  if (visitsPerDay > 1000) effScore = 90;
  else if (visitsPerDay > 500) effScore = 75;
  else if (visitsPerDay > 100) effScore = 60;
  else if (visitsPerDay > 50) effScore = 45;
  else if (visitsPerDay > 20) effScore = 35;

  const breakdown = {
    engagement_ratio: Math.round(engScore * 10) / 10,
    rating_score: Math.round(ratScore * 10) / 10,
    update_recency: Math.round(updScore * 10) / 10,
    growth_headroom: Math.round(headroomScore * 10) / 10,
    monetization: Math.round(monScore * 10) / 10,
    visit_efficiency: Math.round(effScore * 10) / 10,
  };

  let total = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    total += breakdown[key] * (weight / 100);
  }

  return {
    ...game,
    days_since_update: daysSinceUpdate,
    days_alive: daysAlive,
    visits_per_day: Math.round(visitsPerDay * 100) / 100,
    engagement_ratio: Math.round(engagementRatio * 100) / 100,
    fav_visit_pct: Math.round(favVisitPct * 100) / 100,
    rating_pct: Math.round(ratingPct * 10) / 10,
    potential_score: Math.round(total * 100) / 100,
    score_breakdown: breakdown,
  };
}
