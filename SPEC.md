# StockWatch v3 — Full Architecture

## Architecture Change: Client + API Service

StockWatch is now a **two-part system**:

### 1. `stockwatch-api` — Backend Service (Node.js/TypeScript)
Handles all data fetching, caching, AI processing, and WebSocket relay.

```
stockwatch-api/
├── src/
│   ├── index.ts                    (Express + WebSocket server)
│   ├── config/
│   │   └── index.ts                (env vars, API keys, defaults)
│   ├── routes/
│   │   ├── market.ts               (quotes, historical, search)
│   │   ├── holders.ts              (13F, insider, institutional)
│   │   ├── options.ts              (chains, flow, IV)
│   │   ├── news.ts                 (aggregated news feed)
│   │   ├── social.ts               (Reddit, 4chan sentiment)
│   │   ├── opportunities.ts        (opportunity feed, conditions)
│   │   ├── reports.ts              (research reports)
│   │   ├── portfolio.ts            (Alpaca trading, positions)
│   │   ├── preferences.ts          (user prefs, intervals, interests)
│   │   └── dashboards.ts           (dashboard CRUD, layouts)
│   ├── services/
│   │   ├── finnhub/
│   │   │   ├── websocket.ts        (real-time price streaming)
│   │   │   ├── rest.ts             (quotes, candles, options)
│   │   │   └── types.ts
│   │   ├── yahoo/
│   │   │   ├── quotes.ts           (bulk quotes, commodities)
│   │   │   ├── holders.ts          (institutional/insider data)
│   │   │   └── options.ts          (options chains)
│   │   ├── alpha-vantage/
│   │   │   ├── economic.ts         (GDP, CPI, rates)
│   │   │   └── news.ts             (news + sentiment)
│   │   ├── sec-edgar/
│   │   │   ├── filings.ts          (13F, Form 4, 8-K parser)
│   │   │   └── insider.ts          (insider transaction feed)
│   │   ├── alpaca/
│   │   │   ├── trading.ts          (orders, positions)
│   │   │   └── account.ts          (balance, history)
│   │   ├── news/
│   │   │   ├── rss-aggregator.ts   (RSS feed manager)
│   │   │   ├── sources.ts          (Morning Brew, Reuters, FT, etc.)
│   │   │   └── summarizer.ts       (AI article summarization)
│   │   ├── social/
│   │   │   ├── reddit.ts           (r/wallstreetbets, r/stocks, r/options)
│   │   │   ├── fourchan.ts         (/biz/ board scraper)
│   │   │   └── sentiment.ts        (NLP ticker extraction + scoring)
│   │   ├── norman/
│   │   │   ├── agent.ts            (Norman Agent client)
│   │   │   └── tasks.ts            (research tasks, analysis)
│   │   ├── opportunities/
│   │   │   ├── engine.ts           (opportunity detection)
│   │   │   ├── conditions.ts       (condition evaluation)
│   │   │   ├── signals.ts          (multi-signal combiner)
│   │   │   └── backtest.ts         (historical condition testing)
│   │   ├── ai/
│   │   │   ├── learn.ts            (trade pattern analysis)
│   │   │   ├── reports.ts          (auto-generate research)
│   │   │   └── recommendations.ts  (suggested positions)
│   │   ├── polling/
│   │   │   ├── manager.ts          (adaptive polling — reduce when inactive)
│   │   │   ├── scheduler.ts        (per-symbol intervals)
│   │   │   └── market-hours.ts     (detect market open/close)
│   │   └── cache/
│   │       ├── redis.ts            (hot cache for real-time)
│   │       └── sqlite.ts           (persistent historical)
│   ├── websocket/
│   │   ├── server.ts               (WS server for Flutter client)
│   │   ├── rooms.ts                (per-dashboard subscriptions)
│   │   └── relay.ts                (Finnhub → client relay)
│   ├── db/
│   │   ├── schema.ts               (SQLite/Postgres schema)
│   │   ├── migrations/
│   │   └── seed/
│   │       └── default-dashboards.ts (14 pre-built dashboards)
│   └── types/
│       ├── market.ts
│       ├── holder.ts
│       ├── options.ts
│       ├── opportunity.ts
│       └── preferences.ts
├── package.json
├── tsconfig.json
└── .env.example
```

### 2. `stockwatch` — Flutter Desktop App (macOS)
The client — connects to stockwatch-api for all data.

Unchanged from v2 spec but now ALL data comes from the API, not direct API calls from Flutter.

---

## Norman Agent Integration

Norman Agent powers the AI features. It connects via the norman-agent API.

**Norman handles:**
- **Dashboard creation**: "Create me a dashboard tracking oil companies and their options flow"
- **Preference learning**: Understands user's market interests over time, auto-suggests tickers and dashboards
- **Per-graph preferences**: "Show this chart as candlestick on 5min intervals" — Norman remembers and applies
- **Research tasks**: When an opportunity is detected, Norman kicks off deep research — SEC filings, news, social sentiment, holder analysis — and compiles a report
- **News monitoring**: Norman subscribes to relevant RSS feeds based on user interests, filters noise
- **Opportunity conditions**: "Watch for when Buffett buys airline stocks again" → Norman creates the condition
- **Notifications**: Norman decides what's worth notifying about based on user preferences and activity
- **Trade analysis**: "Learn" button triggers Norman to analyze the trade pattern

**Norman API integration:**
```
POST /api/norman/chat     — natural language commands
POST /api/norman/task     — kick off background research
GET  /api/norman/status   — check task status
POST /api/norman/learn    — analyze a completed trade
```

---

## Adaptive Polling

Smart resource management:

- **Active user**: Full-speed polling per user preferences (configurable per dashboard/graph)
- **Inactive 5 min**: Reduce polling to 1/4 frequency
- **Inactive 15 min**: Reduce to market-hours-only, 5min intervals
- **Inactive 1 hr**: Pause all polling, keep WebSocket alive for alerts only
- **Configurable**: Users can override inactivity thresholds in preferences
- **Per-graph intervals**: Each chart widget can have its own refresh rate (1s, 5s, 15s, 30s, 1m, 5m)

---

## Premium API Budget (~£100/mo)

Recommended allocation:
- **Finnhub Premium**: $50/mo — real-time WebSocket (unlimited symbols), options data, institutional ownership
- **Polygon.io Starter**: $30/mo — real-time + historical data, options, reference data (good Finnhub complement)
- **Alpha Vantage Premium**: $20/mo — 75 calls/min, extended economic data

This covers everything — real-time streaming, options chains, holder data, economic indicators, news.

Alternative: **Finnhub All-in-One ($100/mo)** — covers stocks, forex, crypto, options, institutional ownership, SEC filings, economic data, news all in one API. Simplest option.

---

## User Preferences Schema

```typescript
interface UserPreferences {
  // Market interests (Norman learns these)
  interests: {
    sectors: string[];           // ["tech", "energy", "defence"]
    tickers: string[];           // watchlist
    holders: string[];           // tracked institutions
    themes: string[];            // ["AI stocks", "green energy", "hostile takeovers"]
  };

  // Display
  defaultChartType: "candlestick" | "line" | "area" | "bar";
  defaultInterval: "1s" | "5s" | "15s" | "30s" | "1m" | "5m" | "15m" | "1h" | "1d";
  theme: "dark" | "bloomberg" | "light";

  // Polling
  activePollingInterval: number;    // ms, default 5000
  inactiveTimeout: number;          // ms, default 300000 (5min)
  inactivePollingInterval: number;  // ms, default 60000
  pauseWhenClosed: boolean;         // keep background service running?

  // Notifications
  notifyOnOpportunities: boolean;
  notifyOnHolderChanges: boolean;
  notifyOnPriceAlerts: boolean;
  notifyOnNews: boolean;
  quietHours: { start: string; end: string } | null;

  // Per-graph overrides
  graphOverrides: Record<string, {
    chartType?: string;
    interval?: string;
    indicators?: string[];  // ["SMA20", "RSI", "MACD"]
  }>;

  // Trading
  defaultOrderType: "market" | "limit";
  riskTolerance: "conservative" | "moderate" | "aggressive";
  maxPositionSize: number;          // % of portfolio
  paperTradingMode: boolean;
}
```

---

## API Endpoints Summary

### Market Data
```
GET  /api/market/quote/:symbol
GET  /api/market/candles/:symbol?interval=5m&from=&to=
GET  /api/market/search?q=
GET  /api/market/movers           (top gainers/losers)
WS   /ws/prices                   (real-time price stream)
```

### Holders
```
GET  /api/holders/:symbol         (institutional + insider for a stock)
GET  /api/holders/institution/:cik (all holdings for an institution)
GET  /api/holders/insider/:symbol  (insider transactions)
GET  /api/holders/tracked          (user's tracked holders)
POST /api/holders/track            (start tracking a holder)
GET  /api/holders/changes          (recent changes across tracked)
```

### Options
```
GET  /api/options/chain/:symbol
GET  /api/options/flow             (unusual activity feed)
GET  /api/options/iv/:symbol       (IV history + rank)
GET  /api/options/pcr/:symbol      (put/call ratio)
```

### News & Social
```
GET  /api/news/feed?tab=foryou|trending|opportunities|social
GET  /api/news/article/:id
GET  /api/social/sentiment/:symbol
GET  /api/social/trending          (trending tickers across platforms)
POST /api/news/subscribe           (subscribe to RSS source)
```

### Opportunities
```
GET  /api/opportunities            (ranked opportunity feed)
POST /api/opportunities/condition  (create custom condition)
GET  /api/opportunities/conditions (list conditions)
GET  /api/opportunities/backtest   (test condition historically)
```

### AI / Norman
```
POST /api/norman/chat              (natural language commands)
POST /api/norman/task              (background research)
POST /api/norman/learn             (analyze trade)
GET  /api/norman/reports           (generated reports)
GET  /api/norman/reports/:id
```

### Portfolio & Trading
```
GET  /api/portfolio/positions
GET  /api/portfolio/history
POST /api/portfolio/order
GET  /api/portfolio/journal        (trade journal)
POST /api/portfolio/journal/:id/learn (trigger AI analysis)
```

### Dashboards & Preferences
```
GET  /api/dashboards
POST /api/dashboards
PUT  /api/dashboards/:id
DELETE /api/dashboards/:id
GET  /api/dashboards/defaults      (14 pre-built)
GET  /api/preferences
PUT  /api/preferences
PUT  /api/preferences/graph/:id    (per-graph overrides)
```

---

## Build Order

### Phase 1: API Service Foundation + Complete Flutter Client
1. Scaffold stockwatch-api with Express + TypeScript
2. Implement core market routes (Finnhub + Yahoo)
3. WebSocket relay server (Finnhub → Flutter)
4. Complete Flutter client — charts, dashboard editor, all screens working
5. Connect Flutter to stockwatch-api (replace direct API calls)
6. User preferences + per-graph settings
7. Adaptive polling manager
8. Make it all compile and run

### Phase 2: Holder Intelligence
1. SEC EDGAR 13F parser
2. Insider transaction feed (Form 4)
3. Yahoo Finance holder data
4. Holder tracking + alerts
5. Holder → Portfolio view
6. Flutter screens for holders

### Phase 3: Options & Volatility
1. Options chain from Finnhub/Yahoo
2. IV tracking + historical percentile
3. Unusual options activity detection
4. Options flow feed
5. Flutter options screens

### Phase 4: News & Social Intelligence
1. RSS aggregator service
2. Reddit API integration (WSB, r/stocks, r/options)
3. 4chan /biz/ scraper
4. NLP pipeline (ticker extraction, sentiment)
5. AI summarization via Norman
6. Flutter news feed screens

### Phase 5: Opportunity Engine + Norman Integration
1. Norman Agent client integration
2. Condition builder (backend + Flutter UI)
3. Multi-signal opportunity detection
4. Natural language commands ("track Citadel's moves")
5. Research task pipeline
6. Opportunity feed

### Phase 6: AI Learn + Reports
1. Trade pattern analysis
2. Auto-generated research reports
3. Pattern library + edge tracker
4. Backtest engine
5. Confidence scoring

### Phase 7: Polish
1. Performance optimization
2. Menu bar widget
3. Keyboard shortcuts
4. Onboarding flow
5. Data export
