"use client";

const CATEGORIES = [
  { key: "engagement_ratio", label: "ENG" },
  { key: "rating_score", label: "RAT" },
  { key: "update_recency", label: "UPD" },
  { key: "growth_headroom", label: "HEAD" },
  { key: "monetization", label: "MON" },
  { key: "visit_efficiency", label: "EFF" },
];

export default function RadarChart({ breakdown, size = 160, color = "#10b981" }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 26;
  const n = CATEGORIES.length;
  const step = (2 * Math.PI) / n;

  const pt = (i, val) => {
    const a = step * i - Math.PI / 2;
    const d = (val / 100) * r;
    return { x: cx + d * Math.cos(a), y: cy + d * Math.sin(a) };
  };

  const points = CATEGORIES.map((c, i) => pt(i, breakdown[c.key] || 0));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0.25, 0.5, 0.75, 1].map(lvl => {
        const gp = CATEGORIES.map((_, i) => pt(i, lvl * 100));
        const d = gp.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
        return <path key={lvl} d={d} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={1} />;
      })}
      {CATEGORIES.map((_, i) => {
        const end = pt(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />;
      })}
      <path d={pathD} fill={`${color}20`} stroke={color} strokeWidth={1.5} />
      {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={color} />)}
      {CATEGORIES.map((c, i) => {
        const lp = pt(i, 128);
        return (
          <text key={c.key} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle"
            fill="rgba(255,255,255,0.35)" fontSize={8} fontFamily="'JetBrains Mono',monospace">
            {c.label}
          </text>
        );
      })}
    </svg>
  );
}
