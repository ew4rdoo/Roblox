"use client";

import { useState } from "react";
import { getTier, TIER_CONFIG, formatNumber } from "../lib/scoring";
import { generatePitch } from "../components/Dashboard";
import RadarChart from "./RadarChart";

function ScoreBar({ value, color }) {
  return (
    <div style={{ width: "100%", height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3 }}>
      <div style={{ width: `${Math.min(value, 100)}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.5s" }} />
    </div>
  );
}

function barColor(v) { return v >= 80 ? "#10b981" : v >= 60 ? "#3b82f6" : v >= 40 ? "#f59e0b" : "#ef4444"; }

const STATUS_OPTIONS = [
  { value: "new", label: "New", color: "#6b7280" },
  { value: "contacted", label: "Contacted", color: "#f59e0b" },
  { value: "responded", label: "Responded", color: "#3b82f6" },
  { value: "meeting", label: "Meeting", color: "#8b5cf6" },
  { value: "deal", label: "Deal", color: "#10b981" },
  { value: "passed", label: "Passed", color: "#ef4444" },
];

const TREND_ICONS = { rising: "↑", stable: "→", declining: "↓", unknown: "·" };
const TREND_COLORS = { rising: "#10b981", stable: "#6b7280", declining: "#ef4444", unknown: "#333" };

const LINK_ICONS = {
  discord: { label: "Discord", color: "#5865F2", icon: "💬" },
  twitter: { label: "Twitter/X", color: "#1DA1F2", icon: "🐦" },
  youtube: { label: "YouTube", color: "#FF0000", icon: "▶" },
  twitch: { label: "Twitch", color: "#9146FF", icon: "📺" },
  guilded: { label: "Guilded", color: "#F5C400", icon: "⚔" },
  other: { label: "Link", color: "#888", icon: "🔗" },
};

export default function GameCard({ game, rank, expanded, onToggle, outreachStatus, onStatusChange, isWatchlisted, onToggleWatchlist, onDismiss }) {
  const [showPitch, setShowPitch] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pitchText, setPitchText] = useState("");

  const score = game.potential_score || game.total_score || 0;
  const tier = getTier(score);
  const c = TIER_CONFIG[tier];
  const sl = game.social_links || {};
  const hasSocial = Object.keys(sl).length > 0 || game.social_link_count > 0;
  const hasGP = game.gamepass_count > 0;
  const statusConf = STATUS_OPTIONS.find(s => s.value === outreachStatus) || STATUS_OPTIONS[0];
  const playing = game.playing || game.ccu || 0;
  const trend = game.ccu_trend || "unknown";
  const trendIcon = TREND_ICONS[trend];
  const trendColor = TREND_COLORS[trend];

  const handleCopyPitch = () => {
    const text = pitchText || generatePitch(game);
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const handleShowPitch = (e) => {
    e.stopPropagation();
    if (!pitchText) setPitchText(generatePitch(game));
    setShowPitch(!showPitch);
  };

  return (
    <div
      onClick={onToggle}
      style={{
        background: expanded ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.015)",
        border: `1px solid ${expanded ? c.color + "35" : "rgba(255,255,255,0.05)"}`,
        borderLeft: `3px solid ${statusConf.color}`,
        borderRadius: 10, padding: "12px 16px", cursor: "pointer",
        transition: "all 0.2s", marginBottom: 6,
      }}
      onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
      onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = "rgba(255,255,255,0.015)"; }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {game.iconUrl ? (
          <img src={game.iconUrl} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <div className="mono" style={{ width: 36, height: 36, borderRadius: 8, background: c.bg, border: `1px solid ${c.color}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: c.color, flexShrink: 0 }}>#{rank}</div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#eee", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{game.name}</span>
            <span className="mono" style={{ fontSize: 9, fontWeight: 700, color: c.color, background: c.bg, padding: "2px 7px", borderRadius: 4 }}>{tier}</span>
            {/* Trend arrow */}
            {trend !== "unknown" && (
              <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: trendColor, background: `${trendColor}15`, padding: "1px 5px", borderRadius: 3 }}>{trendIcon}</span>
            )}
            {/* Plateau badge */}
            {game.is_plateau && (
              <span className="mono" style={{ fontSize: 8, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", padding: "1px 5px", borderRadius: 3 }}>PLATEAU</span>
            )}
            {hasGP && <span className="mono" style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", color: "#a78bfa" }}>GP {game.gamepass_count}</span>}
            {hasSocial && <span className="mono" style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "rgba(88,101,242,0.1)", border: "1px solid rgba(88,101,242,0.2)", color: "#5865F2" }}>
              {(sl.discord || game.has_discord) ? "💬" : ""}{(sl.twitter || game.has_twitter) ? "🐦" : ""}{(sl.youtube || game.has_youtube) ? "▶" : ""}
            </span>}
          </div>
          <div className="mono" style={{ display: "flex", gap: 8, fontSize: 10, color: "rgba(255,255,255,0.3)", flexWrap: "wrap" }}>
            <span>{formatNumber(playing)} playing</span>
            <span>{(game.rating_pct||0).toFixed(0)}%</span>
            <span>{(game.fav_visit_pct||0).toFixed(1)}% fav</span>
            <span>upd {game.days_since_update}d</span>
            {game.ccu_change_pct && game.ccu_change_pct !== 0 && (
              <span style={{ color: trendColor }}>{game.ccu_change_pct > 0 ? "+" : ""}{game.ccu_change_pct.toFixed(0)}% CCU</span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {onDismiss && <button
            onClick={e => { e.stopPropagation(); onDismiss(game.universe_id); }}
            title="Dismiss — hide this game"
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 4, lineHeight: 1, color: "rgba(255,255,255,0.08)", transition: "all 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.color = "rgba(239,68,68,0.6)"}
            onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.08)"}
          >✕</button>}
          <button
            onClick={e => { e.stopPropagation(); onToggleWatchlist(game.universe_id); }}
            title={isWatchlisted ? "Remove from watchlist" : "Add to watchlist"}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, padding: 4, lineHeight: 1, color: isWatchlisted ? "#f59e0b" : "rgba(255,255,255,0.12)", transition: "all 0.15s" }}
            onMouseEnter={e => { if (!isWatchlisted) e.currentTarget.style.color = "rgba(245,158,11,0.5)"; }}
            onMouseLeave={e => { if (!isWatchlisted) e.currentTarget.style.color = "rgba(255,255,255,0.12)"; }}
          >{isWatchlisted ? "★" : "☆"}</button>
          <div style={{ textAlign: "right" }}>
            <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: c.color, lineHeight: 1 }}>{score.toFixed(0)}</div>
            <div className="mono" style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>/100</div>
          </div>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.05)" }} onClick={e => e.stopPropagation()}>
          {game.thumbnailUrl && <img src={game.thumbnailUrl} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 8, marginBottom: 14 }} />}

          {/* Outreach Panel */}
          <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: 14, marginBottom: 14, border: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1 }}>Outreach</span>
              <div style={{ display: "flex", gap: 3 }}>
                {STATUS_OPTIONS.map(s => (
                  <button key={s.value} onClick={() => onStatusChange(s.value)} className="mono" title={s.label}
                    style={{ padding: "3px 8px", fontSize: 9, borderRadius: 4, cursor: "pointer",
                      border: `1px solid ${outreachStatus===s.value ? s.color+"50" : "rgba(255,255,255,0.05)"}`,
                      background: outreachStatus===s.value ? s.color+"20" : "transparent",
                      color: outreachStatus===s.value ? s.color : "rgba(255,255,255,0.2)",
                      fontFamily: "'JetBrains Mono',monospace" }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {Object.entries(sl).filter(([,url]) => url && url !== "linked").map(([type, url]) => {
                const info = LINK_ICONS[type] || LINK_ICONS.other;
                return (
                  <a key={type} href={url} target="_blank" rel="noopener noreferrer" className="mono"
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", fontSize: 11, borderRadius: 5,
                      background: `${info.color}15`, border: `1px solid ${info.color}30`, color: info.color, textDecoration: "none" }}>
                    <span>{info.icon}</span> {info.label}
                  </a>
                );
              })}
              <a href={game.creator_type === "Group" ? `https://www.roblox.com/groups/${game.creator_id}` : `https://www.roblox.com/users/${game.creator_id}/profile`}
                target="_blank" rel="noopener noreferrer" className="mono"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", fontSize: 11, borderRadius: 5,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>
                👤 {game.creator_type === "Group" ? "Group" : "Profile"}
              </a>
              {!hasSocial && <span className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", lineHeight: "28px" }}>No social links — try Roblox DM</span>}
            </div>

            <button onClick={handleShowPitch} className="mono"
              style={{ width: "100%", padding: "8px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: "pointer",
                background: showPitch ? "rgba(245,158,11,0.1)" : "rgba(245,158,11,0.06)",
                border: `1px solid ${showPitch ? "#f59e0b40" : "rgba(245,158,11,0.15)"}`,
                color: "#f59e0b", fontFamily: "'JetBrains Mono',monospace" }}>
              {showPitch ? "▾ Hide Pitch" : "✨ Generate Personalized Pitch"}
            </button>

            {showPitch && <div style={{ marginTop: 10 }}>
              <textarea value={pitchText} onChange={e => setPitchText(e.target.value)}
                style={{ width: "100%", minHeight: 180, padding: 12, fontSize: 12, lineHeight: 1.7, borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.3)", color: "rgba(255,255,255,0.7)",
                  fontFamily: "'JetBrains Mono',monospace", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={handleCopyPitch} className="mono"
                  style={{ flex: 1, padding: "7px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: "pointer",
                    background: copied ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.06)",
                    border: `1px solid ${copied ? "#10b98150" : "#10b98120"}`, color: "#10b981", fontFamily: "'JetBrains Mono',monospace" }}>
                  {copied ? "✓ Copied!" : "📋 Copy Pitch"}
                </button>
                <button onClick={() => setPitchText(generatePitch(game))} className="mono"
                  style={{ padding: "7px 14px", fontSize: 11, borderRadius: 6, cursor: "pointer",
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono',monospace" }}>
                  ↻ Reset
                </button>
              </div>
            </div>}
          </div>

          {/* Details */}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 260px" }}>
              {game.description && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 12, lineHeight: 1.6 }}>{(game.description||"").slice(0, 240)}</p>}

              {/* Trend info */}
              {trend !== "unknown" && (
                <div style={{ display: "flex", gap: 12, marginBottom: 14, padding: "8px 12px", borderRadius: 6, background: "rgba(0,0,0,0.2)" }}>
                  <div className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                    <div style={{ marginBottom: 2 }}>7d avg CCU</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>{Math.round(game.ccu_7d_avg || 0)}</div>
                  </div>
                  <div className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                    <div style={{ marginBottom: 2 }}>14d avg CCU</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>{Math.round(game.ccu_14d_avg || 0)}</div>
                  </div>
                  <div className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                    <div style={{ marginBottom: 2 }}>Change</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: trendColor }}>
                      {(game.ccu_change_pct || 0) > 0 ? "+" : ""}{(game.ccu_change_pct || 0).toFixed(1)}%
                    </div>
                  </div>
                  {game.is_plateau && (
                    <div className="mono" style={{ fontSize: 10, color: "#f59e0b", display: "flex", alignItems: "center" }}>
                      📊 Plateau — quality game, stalled discovery
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 18px", fontSize: 11, marginBottom: 14 }}>
                {[
                  { l: "Creator", v: `${game.creator_name||"?"} (${game.creator_type||"?"})` },
                  { l: "Genre", v: game.genre||"—" },
                  { l: "Updated", v: `${game.days_since_update||game.days_since_update===0?game.days_since_update:"?"}d ago` },
                  { l: "Age", v: `${game.days_alive||game.game_age_days||"?"}d` },
                  { l: "Visits/Day", v: formatNumber(Math.round(game.visits_per_day||0)) },
                  { l: "Visits", v: formatNumber(game.visits||0) },
                  { l: "Favorites", v: formatNumber(game.favorites||0) },
                  { l: "Fav/Visit %", v: (game.fav_visit_pct||0).toFixed(2)+"%" },
                  { l: "Rating", v: (game.rating_pct||0).toFixed(1)+"%" },
                ].map(x => (
                  <div key={x.l} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="mono" style={{ color: "rgba(255,255,255,0.25)" }}>{x.l}</span>
                    <span className="mono" style={{ color: "rgba(255,255,255,0.6)" }}>{x.v}</span>
                  </div>
                ))}
              </div>

              {/* Gamepasses */}
              <div style={{ marginBottom: 14 }}>
                <div className="mono" style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
                  Gamepasses {game.gamepass_count >= 0 ? `(${game.gamepass_count})` : ""}
                </div>
                {hasGP ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(game.gamepass_names||[]).slice(0,8).map((n,i) => (
                      <span key={i} className="mono" style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.15)", color: "rgba(167,139,250,0.7)" }}>{n}</span>
                    ))}
                    {game.gamepass_max_price > 0 && <span className="mono" style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.15)", color: "#10b981" }}>Max: R${formatNumber(game.gamepass_max_price)}</span>}
                  </div>
                ) : <span className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.15)" }}>{game.gamepass_count === 0 ? "None — monetization opportunity" : "Data unavailable"}</span>}
              </div>

              {/* Score Breakdown */}
              {game.score_breakdown && <>
                <div className="mono" style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Score Breakdown</div>
                {Object.entries(game.score_breakdown).map(([key, val]) => (
                  <div key={key} style={{ marginBottom: 5 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
                      <span className="mono" style={{ color: "rgba(255,255,255,0.3)" }}>{key.replace(/_/g, " ")}</span>
                      <span className="mono" style={{ color: "rgba(255,255,255,0.5)" }}>{val.toFixed(0)}</span>
                    </div>
                    <ScoreBar value={val} color={barColor(val)} />
                  </div>
                ))}
              </>}
            </div>

            <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              {game.score_breakdown && <RadarChart breakdown={game.score_breakdown} color={c.color} />}
              <a href={`https://www.roblox.com/games/${game.place_id}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} className="mono"
                style={{ fontSize: 11, color: c.color, textDecoration: "none", padding: "6px 16px", border: `1px solid ${c.color}35`, borderRadius: 6 }}>
                View on Roblox →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
