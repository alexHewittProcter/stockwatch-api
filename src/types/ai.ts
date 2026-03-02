export interface TradePattern {
  id: string;
  name: string;                      // Auto-generated: "Breakout + Insider Cluster Buy"
  description: string;               // AI-written explanation
  tradeId: string;                   // Original trade that taught this
  conditions: PatternCondition[];    // Extracted conditions
  statistics: PatternStatistics;
  riskFactors: string[];             // What could go wrong
  bestTimeframes: string[];          // "Works best as swing trade (3-7 days)"
  marketConditions: string[];        // "Works in low-VIX environment"
  createdAt: string;
  usedCount: number;                 // How many opportunities triggered by this pattern
  liveWinRate?: number;              // Actual performance since pattern was learned
  liveTradeCount?: number;           // Number of live trades using this pattern
}

export interface PatternCondition {
  metric: string;                    // 'rsi', 'volume_spike', 'insider_buying', etc.
  description: string;               // Human-readable: "RSI below 35 at entry"
  value: number;
  tolerance: number;                 // How close does a new setup need to match? (%)
  weight: number;                    // Importance of this condition (0-1)
}

export interface PatternStatistics {
  historicalFrequency: number;       // How often do similar setups occur? (per year)
  historicalWinRate: number;         // When they occur, how often profitable?
  averageReturn: number;             // Average return when profitable
  averageLoss: number;               // Average loss when not profitable
  expectedValue: number;             // (winRate × avgReturn) - ((1-winRate) × avgLoss)
  sampleSize: number;                // How many historical examples found
  averageHoldTime: number;           // Average days held
  bestPerformingTimeframe: string;   // 'day' | 'swing' | 'position'
}

export interface PatternMatch {
  id: string;
  patternId: string;
  symbol: string;
  matchDate: string;
  matchScore: number;                // How well did it match (0-1)
  outcome?: 'win' | 'loss';
  returnPct?: number;
  holdDays?: number;
  entryPrice: number;
  exitPrice?: number;
  conditions: Array<{
    metric: string;
    expectedValue: number;
    actualValue: number;
    matchPercent: number;
  }>;
}

export interface ResearchReport {
  id: string;
  symbol: string;
  title: string;                     // "AAPL: Bullish Convergence — Insider Cluster + Call Flow"
  createdAt: string;
  opportunityId?: string;
  
  executiveSummary: string;          // 3-4 sentences max
  
  thesis: {
    direction: 'long' | 'short';
    timeframe: string;
    rationale: string;               // Detailed explanation
  };
  
  priceAnalysis: {
    currentPrice: number;
    support: number[];               // Key support levels
    resistance: number[];            // Key resistance levels
    trend: 'uptrend' | 'downtrend' | 'sideways';
    technicals: {
      rsi: number;
      macd: string;                  // "Bullish crossover"
      movingAverages: string;        // "Price above 50 & 200 MA"
    };
    chartImageUrl?: string;          // If we generate chart images
  };
  
  holderAnalysis?: {
    recentInsiderActivity: string;
    institutionalChanges: string;
    smartMoneySignals: string;
  };
  
  optionsAnalysis?: {
    ivRank: number;
    unusualActivity: string;
    putCallRatio: string;
    suggestedStrategy: string;       // "Bull call spread 180/190 Apr expiry"
  };
  
  newsAnalysis: {
    sentiment: number;
    sentimentTrend: string;
    keyArticles: Array<{ title: string; source: string; sentiment: string }>;
    socialBuzz: string;
  };
  
  riskAnalysis: {
    risks: string[];                 // "Earnings in 2 weeks — IV crush risk"
    catalysts: string[];             // "Fed meeting next week — rates decision"
    maxLoss: string;                 // "If stop hit: -3.2%"
  };
  
  recommendation: {
    action: string;                  // "Buy" / "Sell short" / "Buy calls"
    entry: number;
    stopLoss: number;
    target: number;
    riskReward: number;
    positionSize: string;            // "2% of portfolio ($X)"
    confidence: number;
  };
  
  historicalComparison?: {
    similarSetups: number;
    winRate: number;
    averageReturn: number;
    patternId?: string;              // If matched a learned pattern
  };
  
  tags: string[];
  status: 'draft' | 'published' | 'archived';
  outcome?: 'won' | 'lost' | 'pending';
  outcomeNotes?: string;
  updatedAt?: string;
}

export interface TradeJournalEntry {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  entryDate: string;
  entryPrice: number;
  exitDate?: string;
  exitPrice?: number;
  quantity: number;
  pnl?: number;
  pnlPct?: number;
  status: 'open' | 'closed_win' | 'closed_loss';
  
  // Auto-captured context at entry
  entryContext: {
    thesis: string;                  // Why did I take this trade?
    opportunityId?: string;          // If from an opportunity
    reportId?: string;               // If a report was generated
    signals: string[];               // What signals triggered this
    ivRank?: number;
    rsi?: number;
    socialSentiment?: number;
    newsHeadline?: string;           // Most relevant headline at entry
    marketCondition?: string;        // VIX level, market trend at entry
  };
  
  // User notes
  notes: string;
  tags: string[];
  
  // AI analysis (populated after "Learn")
  patternId?: string;
  learnedAt?: string;
  
  createdAt: string;
  updatedAt?: string;
}

export interface TradeAnalysisData {
  symbol: string;
  tradeId: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  direction: 'long' | 'short';
  pnlPct: number;
  holdDays: number;
  
  // Market data during trade period
  priceAction: {
    highestPrice: number;
    lowestPrice: number;
    volatility: number;
    gapsEncountered: number;
    patternType: 'breakout' | 'reversal' | 'gap' | 'momentum' | 'consolidation';
  };
  
  volumeProfile: {
    avgVolume30d: number;
    entryDayVolume: number;
    volumeSpikeDays: number;
    volumeTrend: 'increasing' | 'decreasing' | 'stable';
  };
  
  technicals: {
    entryRsi: number;
    exitRsi: number;
    macdSignal: 'bullish' | 'bearish' | 'neutral';
    movingAveragePosition: string;
    bollingerBandPosition: 'upper' | 'middle' | 'lower';
  };
  
  optionsContext?: {
    entryIvRank: number;
    exitIvRank: number;
    unusualActivity: boolean;
    putCallRatio: number;
  };
  
  holderContext?: {
    insiderTransactions: number;
    institutionalChanges: number;
    smartMoneySignals: boolean;
  };
  
  newsContext: {
    sentimentAtEntry: number;
    sentimentAtExit: number;
    keyEvents: string[];
    socialMentions: number;
  };
  
  macroContext: {
    vixLevel: number;
    marketTrend: 'bull' | 'bear' | 'sideways';
    sectorPerformance: number;
    rateEnvironment: 'rising' | 'falling' | 'stable';
  };
}

export interface AIEdgeReport {
  patternCount: number;
  totalTrades: number;
  overallWinRate: number;
  averageReturn: number;
  totalExpectedValue: number;
  bestPatterns: Array<{
    id: string;
    name: string;
    winRate: number;
    expectedValue: number;
    tradeCount: number;
  }>;
  worstPatterns: Array<{
    id: string;
    name: string;
    winRate: number;
    expectedValue: number;
    tradeCount: number;
  }>;
  improvementSuggestions: string[];
  generatedAt: string;
}