# Roblox Growth Scout

A game discovery engine that finds undermarketed Roblox games with high growth potential. Built for growth studios looking to partner with indie developers.

## How It Works

The scout scans Roblox's game catalog through a server-side API proxy (no CORS issues) and scores each game on 6 dimensions:

| Metric | Weight | What It Measures |
|--------|--------|-----------------|
| Engagement Ratio | 25% | Favorites per 1K visits — how sticky is the game? |
| Growth Headroom | 20% | Quality vs. player count gap — the opportunity size |
| Rating Score | 20% | Community approval (thumbs up %) |
| Update Recency | 15% | How recently the dev updated — active = good partner |
| Monetization Gap | 10% | Low monetization signals = needs help |
| Visit Efficiency | 10% | Traction relative to game age |

Games are tiered S/A/B/C based on their composite score.

## Deploy to Vercel (2 minutes)

### Option A: GitHub (recommended)
1. Push this folder to a GitHub repo
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import your repo
4. Click **Deploy** — that's it

### Option B: Vercel CLI
```bash
npm i -g vercel
cd roblox-scout
vercel
```

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
roblox-scout/
├── app/
│   ├── api/roblox/route.js   ← Server-side proxy (bypasses CORS)
│   ├── globals.css
│   ├── layout.js
│   └── page.js
├── components/
│   ├── Dashboard.js           ← Main scanner + UI
│   ├── GameCard.js            ← Expandable game cards
│   └── RadarChart.js          ← SVG radar visualization
├── lib/
│   ├── roblox-api.js          ← API client (calls through proxy)
│   └── scoring.js             ← Scoring engine
├── package.json
└── next.config.js
```

## How the API Proxy Works

Browser → `/api/roblox?endpoint=...` → Vercel serverless function → Roblox API → response

This eliminates CORS entirely since the Roblox API calls happen server-side on Vercel's infrastructure.
