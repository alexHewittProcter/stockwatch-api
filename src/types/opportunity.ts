export interface Signal {
  id: string;
  type: string;                      // 'breakout_high', 'insider_cluster_buy', etc.
  category: 'price' | 'volume' | 'holder' | 'options' | 'news' | 'social' | 'technical';
  symbol: string;
  source: string;                    // 'yahoo_finance', 'sec_edgar', 'reddit', etc.
  description: string;               // Human-readable description
  strength: number;                  // 0-1 signal strength
  direction: 'bullish' | 'bearish' | 'neutral';
  data: Record<string, unknown>;     // Raw signal data
  timestamp: string;
  detectedAt: string;
}

export interface Evidence {
  type: 'price' | 'volume' | 'holder' | 'options' | 'news' | 'social';
  description: string;
  value: number | string;
  unit?: string;
  change?: number;
  changePercent?: number;
  context?: string;
  timestamp: string;
}

export interface Opportunity {
  id: string;
  createdAt: string;
  symbol: string;
  title: string;                     // "AAPL: Insider cluster buying + unusual call activity"
  thesis: string;                    // 2-3 sentence explanation
  confidence: number;                // 0-100
  direction: 'long' | 'short' | 'neutral';
  timeframe: 'day' | 'swing' | 'position';  // hours, days, weeks
  signals: Signal[];                 // all contributing signals
  evidence: Evidence[];              // supporting data points
  suggestedEntry: number;            // price
  suggestedStop: number;             // stop loss
  suggestedTarget: number;           // take profit
  riskReward: number;                // target/stop ratio
  status: 'active' | 'triggered' | 'expired' | 'won' | 'lost';
  tags: string[];                    // 'acquisition', 'short_squeeze', 'earnings', etc.
  outcome?: {
    entryPrice: number;
    exitPrice: number;
    pnl: number;
    pnlPct: number;
    triggeredAt: string;
    closedAt: string;
  };
  updatedAt?: string;
}

export interface ConditionRule {
  id: string;
  metric: string;                    // 'price', 'volume', 'iv', 'pcr', 'insider_buying', 'social_mentions', 'rsi', etc.
  comparator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'crosses_above' | 'crosses_below' | 'pct_change_gt' | 'pct_change_lt';
  value: number;
  timeframe?: string;                // '1d', '1w', '1m' — for pct_change calculations
  parameters?: Record<string, unknown>;
}

export interface Condition {
  id: string;
  name: string;
  description: string;
  rules: ConditionRule[];
  logic: 'AND' | 'OR';
  symbols?: string[];                // specific symbols, or null for all
  enabled: boolean;
  notifyOnTrigger: boolean;
  createdAt: string;
  lastTriggered?: string;
  triggerCount?: number;
  lastEvaluated?: string;
}

export interface OpportunityTemplate {
  id: string;
  name: string;
  description: string;
  signalTypes: string[];             // Required signal types for this template
  confidenceWeights: Record<string, number>;  // Weight each signal type
  riskRewardRatio: number;           // Expected risk/reward
  timeframe: 'day' | 'swing' | 'position';
  thesis: string;                    // Template thesis format
  tags: string[];
}

export interface BacktestResult {
  condition: Condition;
  period: {
    from: string;
    to: string;
  };
  triggers: Array<{
    symbol: string;
    triggeredAt: string;
    price: number;
    signals: string[];
    outcome?: {
      exitPrice: number;
      pnl: number;
      pnlPct: number;
      duration: number;              // days held
    };
  }>;
  summary: {
    totalTriggers: number;
    winners: number;
    losers: number;
    winRate: number;
    avgPnl: number;
    avgPnlPct: number;
    bestTrade: number;
    worstTrade: number;
    avgHoldTime: number;             // days
  };
}

// Predefined opportunity templates
export const OPPORTUNITY_TEMPLATES: OpportunityTemplate[] = [
  {
    id: 'acquisition_target',
    name: 'Acquisition Target',
    description: 'Insider buying + institutional accumulation + unusual call buying suggests possible takeover',
    signalTypes: ['insider_cluster_buy', 'institution_accumulation', 'unusual_call_volume'],
    confidenceWeights: {
      'insider_cluster_buy': 0.4,
      'institution_accumulation': 0.3,
      'unusual_call_volume': 0.2,
      'breaking_news': 0.1,
    },
    riskRewardRatio: 2.5,
    timeframe: 'position',
    thesis: 'Multiple insider purchases combined with institutional accumulation and unusual options activity suggests potential acquisition target. Risk of false signals if no deal materializes.',
    tags: ['merger', 'acquisition', 'takeover', 'insider', 'institutional'],
  },
  {
    id: 'short_squeeze',
    name: 'Short Squeeze Setup',
    description: 'High short interest + social hype + bullish options flow creates squeeze potential',
    signalTypes: ['social_hype', 'unusual_call_volume', 'volume_spike'],
    confidenceWeights: {
      'social_hype': 0.3,
      'unusual_call_volume': 0.3,
      'volume_spike': 0.2,
      'breakout_high': 0.2,
    },
    riskRewardRatio: 3.0,
    timeframe: 'swing',
    thesis: 'Social media momentum combined with options gamma exposure and volume breakout creates conditions for potential short squeeze. High risk/reward scenario.',
    tags: ['squeeze', 'social', 'momentum', 'gamma'],
  },
  {
    id: 'earnings_play',
    name: 'Earnings Play',
    description: 'IV crush setup + insider activity + analyst revisions around earnings',
    signalTypes: ['iv_crush_setup', 'insider_large_buy', 'analyst_upgrade'],
    confidenceWeights: {
      'iv_crush_setup': 0.4,
      'insider_large_buy': 0.3,
      'analyst_upgrade': 0.2,
      'earnings_beat': 0.1,
    },
    riskRewardRatio: 2.0,
    timeframe: 'day',
    thesis: 'High implied volatility before earnings combined with insider confidence and analyst optimism suggests opportunity for volatility play or directional bet.',
    tags: ['earnings', 'volatility', 'insider', 'analyst'],
  },
  {
    id: 'sector_rotation',
    name: 'Sector Rotation',
    description: 'Multiple stocks in sector showing momentum + institutional rotation',
    signalTypes: ['momentum', 'institution_new_position', 'moving_average_cross'],
    confidenceWeights: {
      'momentum': 0.3,
      'institution_new_position': 0.4,
      'moving_average_cross': 0.2,
      'volume_spike': 0.1,
    },
    riskRewardRatio: 2.2,
    timeframe: 'position',
    thesis: 'Institutional rotation into sector combined with technical momentum suggests early stage of sector rotation. Multiple names likely to benefit.',
    tags: ['sector', 'rotation', 'institutional', 'momentum'],
  },
  {
    id: 'distressed_value',
    name: 'Distressed Value',
    description: 'Stock at 52-week low + insider buying + improving sentiment',
    signalTypes: ['breakout_low', 'insider_cluster_buy', 'sentiment_flip'],
    confidenceWeights: {
      'breakout_low': 0.2,
      'insider_cluster_buy': 0.4,
      'sentiment_flip': 0.2,
      'analyst_upgrade': 0.2,
    },
    riskRewardRatio: 4.0,
    timeframe: 'position',
    thesis: 'Management confidence through insider buying at 52-week lows suggests fundamental value not reflected in price. Sentiment improvement indicates potential reversal.',
    tags: ['value', 'reversal', 'insider', 'sentiment'],
  },
  {
    id: 'hostile_takeover',
    name: 'Hostile Takeover',
    description: 'Large block option purchases + rapid institutional accumulation + breaking news',
    signalTypes: ['large_block_trade', 'institution_accumulation', 'breaking_news'],
    confidenceWeights: {
      'large_block_trade': 0.4,
      'institution_accumulation': 0.3,
      'breaking_news': 0.2,
      'volume_spike': 0.1,
    },
    riskRewardRatio: 3.5,
    timeframe: 'swing',
    thesis: 'Large options positions combined with rapid share accumulation and news flow suggests potential hostile takeover scenario. Highly speculative but potentially lucrative.',
    tags: ['takeover', 'hostile', 'options', 'institutional', 'news'],
  },
];