export interface UserPreferences {
  interests: {
    sectors: string[];
    tickers: string[];
    holders: string[];
    themes: string[];
  };
  defaultChartType: 'candlestick' | 'line' | 'area' | 'bar';
  defaultInterval: '1s' | '5s' | '15s' | '30s' | '1m' | '5m' | '15m' | '1h' | '1d';
  theme: 'dark' | 'bloomberg' | 'light';
  activePollingInterval: number;
  inactiveTimeout: number;
  inactivePollingInterval: number;
  pauseWhenClosed: boolean;
  notifyOnOpportunities: boolean;
  notifyOnHolderChanges: boolean;
  notifyOnPriceAlerts: boolean;
  notifyOnNews: boolean;
  quietHours: { start: string; end: string } | null;
  graphOverrides: Record<string, GraphOverride>;
  defaultOrderType: 'market' | 'limit';
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  maxPositionSize: number;
  paperTradingMode: boolean;
}

export interface GraphOverride {
  chartType?: string;
  interval?: string;
  indicators?: string[];
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  interests: {
    sectors: [],
    tickers: [],
    holders: [],
    themes: [],
  },
  defaultChartType: 'candlestick',
  defaultInterval: '5m',
  theme: 'dark',
  activePollingInterval: 5000,
  inactiveTimeout: 300_000,
  inactivePollingInterval: 60_000,
  pauseWhenClosed: false,
  notifyOnOpportunities: true,
  notifyOnHolderChanges: true,
  notifyOnPriceAlerts: true,
  notifyOnNews: false,
  quietHours: null,
  graphOverrides: {},
  defaultOrderType: 'market',
  riskTolerance: 'moderate',
  maxPositionSize: 10,
  paperTradingMode: true,
};
