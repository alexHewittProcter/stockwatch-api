export interface DashboardWidget {
  id: string;
  type: 'chart' | 'quote' | 'watchlist' | 'news' | 'heatmap' | 'options' | 'holders' | 'social' | 'portfolio' | 'economic' | 'screener' | 'opportunities';
  symbol?: string;
  symbols?: string[];
  title: string;
  config?: Record<string, unknown>;
}

export interface DefaultDashboard {
  id: string;
  name: string;
  description: string;
  widgets: DashboardWidget[];
  layout: { columns: number; rows: number };
}

export const DEFAULT_DASHBOARDS: DefaultDashboard[] = [
  // 1. Market Overview
  {
    id: 'default-market-overview',
    name: 'Market Overview',
    description: 'Major indices, sectors, and market breadth at a glance',
    widgets: [
      { id: 'w1', type: 'chart', symbol: 'SPY', title: 'S&P 500' },
      { id: 'w2', type: 'chart', symbol: 'QQQ', title: 'NASDAQ 100' },
      { id: 'w3', type: 'chart', symbol: 'DIA', title: 'Dow Jones' },
      { id: 'w4', type: 'chart', symbol: 'IWM', title: 'Russell 2000' },
      { id: 'w5', type: 'watchlist', symbols: ['VIX', 'TNX', 'DXY', 'GC=F', 'CL=F', 'BTC-USD'], title: 'Key Indicators' },
      { id: 'w6', type: 'heatmap', symbols: ['XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLC', 'XLY', 'XLP', 'XLU', 'XLRE', 'XLB'], title: 'Sector Performance' },
      { id: 'w7', type: 'news', title: 'Market News' },
    ],
    layout: { columns: 4, rows: 3 },
  },

  // 2. Tech Giants
  {
    id: 'default-tech-giants',
    name: 'Tech Giants',
    description: 'Magnificent 7 and top tech stocks',
    widgets: [
      { id: 'w1', type: 'chart', symbol: 'AAPL', title: 'Apple' },
      { id: 'w2', type: 'chart', symbol: 'MSFT', title: 'Microsoft' },
      { id: 'w3', type: 'chart', symbol: 'GOOGL', title: 'Alphabet' },
      { id: 'w4', type: 'chart', symbol: 'AMZN', title: 'Amazon' },
      { id: 'w5', type: 'chart', symbol: 'NVDA', title: 'NVIDIA' },
      { id: 'w6', type: 'chart', symbol: 'META', title: 'Meta' },
      { id: 'w7', type: 'chart', symbol: 'TSLA', title: 'Tesla' },
      { id: 'w8', type: 'watchlist', symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'], title: 'Mag 7 Quotes' },
    ],
    layout: { columns: 4, rows: 3 },
  },

  // 3. AI & Semiconductors
  {
    id: 'default-ai-semiconductors',
    name: 'AI & Semiconductors',
    description: 'AI infrastructure, chips, and compute plays',
    widgets: [
      { id: 'w1', type: 'chart', symbol: 'NVDA', title: 'NVIDIA' },
      { id: 'w2', type: 'chart', symbol: 'AMD', title: 'AMD' },
      { id: 'w3', type: 'chart', symbol: 'AVGO', title: 'Broadcom' },
      { id: 'w4', type: 'chart', symbol: 'TSM', title: 'TSMC' },
      { id: 'w5', type: 'watchlist', symbols: ['NVDA', 'AMD', 'AVGO', 'TSM', 'INTC', 'QCOM', 'ARM', 'MRVL', 'MU', 'SMCI'], title: 'Chip Stocks' },
      { id: 'w6', type: 'watchlist', symbols: ['MSFT', 'GOOGL', 'META', 'PLTR', 'AI', 'PATH', 'SNOW'], title: 'AI Software' },
      { id: 'w7', type: 'news', title: 'AI News', config: { filter: 'AI semiconductor chip' } },
    ],
    layout: { columns: 4, rows: 3 },
  },

  // 4. Energy & Commodities
  {
    id: 'default-energy-commodities',
    name: 'Energy & Commodities',
    description: 'Oil, gas, metals, and energy stocks',
    widgets: [
      { id: 'w1', type: 'chart', symbol: 'CL=F', title: 'Crude Oil' },
      { id: 'w2', type: 'chart', symbol: 'NG=F', title: 'Natural Gas' },
      { id: 'w3', type: 'chart', symbol: 'GC=F', title: 'Gold' },
      { id: 'w4', type: 'chart', symbol: 'SI=F', title: 'Silver' },
      { id: 'w5', type: 'watchlist', symbols: ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'PXD', 'OXY', 'DVN'], title: 'Energy Stocks' },
      { id: 'w6', type: 'watchlist', symbols: ['CL=F', 'NG=F', 'GC=F', 'SI=F', 'HG=F', 'PL=F'], title: 'Commodities' },
      { id: 'w7', type: 'news', title: 'Energy News', config: { filter: 'oil gas energy commodity' } },
    ],
    layout: { columns: 4, rows: 3 },
  },

  // 5. Crypto
  {
    id: 'default-crypto',
    name: 'Crypto',
    description: 'Major cryptocurrencies and crypto-adjacent stocks',
    widgets: [
      { id: 'w1', type: 'chart', symbol: 'BTC-USD', title: 'Bitcoin' },
      { id: 'w2', type: 'chart', symbol: 'ETH-USD', title: 'Ethereum' },
      { id: 'w3', type: 'chart', symbol: 'SOL-USD', title: 'Solana' },
      { id: 'w4', type: 'watchlist', symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'ADA-USD', 'DOGE-USD', 'AVAX-USD', 'DOT-USD'], title: 'Crypto Prices' },
      { id: 'w5', type: 'watchlist', symbols: ['COIN', 'MSTR', 'MARA', 'RIOT', 'CLSK', 'BITF'], title: 'Crypto Stocks' },
      { id: 'w6', type: 'social', title: 'Crypto Social', config: { filter: 'crypto bitcoin ethereum' } },
    ],
    layout: { columns: 3, rows: 3 },
  },

  // 6. Defence & Aerospace
  {
    id: 'default-defence-aerospace',
    name: 'Defence & Aerospace',
    description: 'Defence contractors and aerospace companies',
    widgets: [
      { id: 'w1', type: 'chart', symbol: 'LMT', title: 'Lockheed Martin' },
      { id: 'w2', type: 'chart', symbol: 'RTX', title: 'RTX Corp' },
      { id: 'w3', type: 'chart', symbol: 'NOC', title: 'Northrop Grumman' },
      { id: 'w4', type: 'chart', symbol: 'GD', title: 'General Dynamics' },
      { id: 'w5', type: 'watchlist', symbols: ['LMT', 'RTX', 'NOC', 'GD', 'BA', 'LHX', 'HII', 'TDG', 'LDOS', 'KTOS'], title: 'Defence Stocks' },
      { id: 'w6', type: 'news', title: 'Defence News', config: { filter: 'defence military aerospace' } },
    ],
    layout: { columns: 3, rows: 3 },
  },

  // 7. Financials
  {
    id: 'default-financials',
    name: 'Financials',
    description: 'Banks, insurance, fintech, and financial services',
    widgets: [
      { id: 'w1', type: 'chart', symbol: 'JPM', title: 'JPMorgan' },
      { id: 'w2', type: 'chart', symbol: 'GS', title: 'Goldman Sachs' },
      { id: 'w3', type: 'chart', symbol: 'BRK-B', title: 'Berkshire Hathaway' },
      { id: 'w4', type: 'watchlist', symbols: ['JPM', 'GS', 'MS', 'BAC', 'WFC', 'C', 'BRK-B', 'BLK', 'SCHW', 'AXP'], title: 'Major Banks' },
      { id: 'w5', type: 'watchlist', symbols: ['V', 'MA', 'PYPL', 'SQ', 'COIN', 'SOFI', 'HOOD'], title: 'Fintech' },
      { id: 'w6', type: 'chart', symbol: 'TNX', title: '10Y Treasury Yield' },
    ],
    layout: { columns: 3, rows: 3 },
  },

  // 8. Healthcare & Biotech
  {
    id: 'default-healthcare-biotech',
    name: 'Healthcare & Biotech',
    description: 'Pharma, biotech, and healthcare companies',
    widgets: [
      { id: 'w1', type: 'chart', symbol: 'JNJ', title: 'Johnson & Johnson' },
      { id: 'w2', type: 'chart', symbol: 'UNH', title: 'UnitedHealth' },
      { id: 'w3', type: 'chart', symbol: 'LLY', title: 'Eli Lilly' },
      { id: 'w4', type: 'chart', symbol: 'ABBV', title: 'AbbVie' },
      { id: 'w5', type: 'watchlist', symbols: ['JNJ', 'UNH', 'LLY', 'ABBV', 'PFE', 'MRK', 'TMO', 'ABT', 'AMGN', 'GILD'], title: 'Healthcare Stocks' },
      { id: 'w6', type: 'watchlist', symbols: ['XBI', 'IBB', 'ARKG'], title: 'Biotech ETFs' },
    ],
    layout: { columns: 3, rows: 3 },
  },

  // 9. Options Flow
  {
    id: 'default-options-flow',
    name: 'Options Flow',
    description: 'Options chains, IV tracking, and unusual activity',
    widgets: [
      { id: 'w1', type: 'options', symbol: 'SPY', title: 'SPY Options Chain' },
      { id: 'w2', type: 'options', symbol: 'QQQ', title: 'QQQ Options Chain' },
      { id: 'w3', type: 'chart', symbol: 'VIX', title: 'VIX Index' },
      { id: 'w4', type: 'watchlist', symbols: ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'AMD', 'META', 'AMZN'], title: 'Most Active Options' },
      { id: 'w5', type: 'opportunities', title: 'Unusual Options Activity' },
    ],
    layout: { columns: 3, rows: 3 },
  },

  // 10. Holder Intelligence
  {
    id: 'default-holder-intelligence',
    name: 'Holder Intelligence',
    description: 'Track institutional holders, 13F filings, and insider activity',
    widgets: [
      { id: 'w1', type: 'holders', symbol: 'AAPL', title: 'AAPL Holders' },
      { id: 'w2', type: 'holders', symbol: 'MSFT', title: 'MSFT Holders' },
      { id: 'w3', type: 'holders', symbol: 'NVDA', title: 'NVDA Holders' },
      { id: 'w4', type: 'watchlist', symbols: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA'], title: 'Tracked Stocks' },
      { id: 'w5', type: 'news', title: 'Insider Activity', config: { filter: 'insider trading SEC filing 13F' } },
    ],
    layout: { columns: 3, rows: 3 },
  },

  // 11. Forex & Macro
  {
    id: 'default-forex-macro',
    name: 'Forex & Macro',
    description: 'Currency pairs, bonds, and macroeconomic indicators',
    widgets: [
      { id: 'w1', type: 'chart', symbol: 'DXY', title: 'US Dollar Index' },
      { id: 'w2', type: 'chart', symbol: 'EURUSD=X', title: 'EUR/USD' },
      { id: 'w3', type: 'chart', symbol: 'GBPUSD=X', title: 'GBP/USD' },
      { id: 'w4', type: 'chart', symbol: 'USDJPY=X', title: 'USD/JPY' },
      { id: 'w5', type: 'watchlist', symbols: ['DXY', 'EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'AUDUSD=X', 'USDCAD=X', 'USDCHF=X'], title: 'Major Pairs' },
      { id: 'w6', type: 'economic', title: 'Economic Calendar', config: { indicators: ['GDP', 'CPI', 'FEDFUNDS', 'UNEMPLOYMENT'] } },
    ],
    layout: { columns: 3, rows: 3 },
  },

  // 12. Social Sentiment
  {
    id: 'default-social-sentiment',
    name: 'Social Sentiment',
    description: 'Reddit, 4chan, and social media sentiment tracking',
    widgets: [
      { id: 'w1', type: 'social', title: 'r/wallstreetbets', config: { source: 'reddit', subreddit: 'wallstreetbets' } },
      { id: 'w2', type: 'social', title: 'r/stocks', config: { source: 'reddit', subreddit: 'stocks' } },
      { id: 'w3', type: 'social', title: '/biz/ Trending', config: { source: '4chan' } },
      { id: 'w4', type: 'watchlist', title: 'Trending Tickers' },
      { id: 'w5', type: 'chart', symbol: 'GME', title: 'GameStop' },
      { id: 'w6', type: 'chart', symbol: 'AMC', title: 'AMC' },
    ],
    layout: { columns: 3, rows: 3 },
  },

  // 13. Portfolio & Trading
  {
    id: 'default-portfolio-trading',
    name: 'Portfolio & Trading',
    description: 'Active positions, trade journal, and order entry',
    widgets: [
      { id: 'w1', type: 'portfolio', title: 'Positions', config: { view: 'positions' } },
      { id: 'w2', type: 'portfolio', title: 'Trade History', config: { view: 'history' } },
      { id: 'w3', type: 'portfolio', title: 'Trade Journal', config: { view: 'journal' } },
      { id: 'w4', type: 'chart', symbol: 'SPY', title: 'S&P 500' },
      { id: 'w5', type: 'watchlist', symbols: ['SPY', 'QQQ', 'IWM', 'DIA'], title: 'Indices' },
    ],
    layout: { columns: 3, rows: 3 },
  },

  // 14. Opportunities
  {
    id: 'default-opportunities',
    name: 'Opportunities',
    description: 'Custom conditions, alerts, and opportunity feed',
    widgets: [
      { id: 'w1', type: 'opportunities', title: 'Opportunity Feed' },
      { id: 'w2', type: 'screener', title: 'Condition Builder' },
      { id: 'w3', type: 'news', title: 'Opportunity News', config: { tab: 'opportunities' } },
      { id: 'w4', type: 'watchlist', symbols: ['SPY', 'QQQ', 'VIX', 'GC=F', 'CL=F', 'BTC-USD', 'TNX'], title: 'Key Levels' },
      { id: 'w5', type: 'social', title: 'Social Signals' },
    ],
    layout: { columns: 3, rows: 3 },
  },
];
