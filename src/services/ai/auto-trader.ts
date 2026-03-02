import { getDb } from '../../db/schema';
import { opportunityEngine } from '../opportunities/engine';

/**
 * AI Auto-Trader Service
 * 
 * Monitors markets and executes trades autonomously based on learned patterns,
 * conditions, and opportunities.
 */

export interface TradingStrategy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  mode: 'paper' | 'live';
  
  // Entry rules
  entryRules: {
    minConfidence: number;
    allowedDirections: ('long' | 'short')[];
    allowedTimeframes: ('day' | 'swing' | 'position')[];
    requiredSignalTypes: string[];
    excludedSymbols: string[];
    allowedSymbols?: string[];
    allowedSectors?: string[];
    minSignalCount: number;
    patternIds?: string[];
    customConditions?: string[];
  };
  
  // Risk management
  riskRules: {
    maxPositionSize: number;
    maxTotalExposure: number;
    maxDailyLoss: number;
    maxDrawdown: number;
    maxConcurrentPositions: number;
    stopLossType: 'fixed' | 'trailing' | 'atr';
    stopLossPct: number;
    trailingStopPct?: number;
    takeProfitPct: number;
    maxHoldDays: number;
  };
  
  // Execution
  executionRules: {
    orderType: 'market' | 'limit';
    limitOffsetPct?: number;
    entryTiming: 'immediate' | 'open' | 'vwap';
    exitTiming: 'immediate' | 'close' | 'vwap';
    allowPreMarket: boolean;
    allowAfterHours: boolean;
  };
  
  // Performance tracking
  performance: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnl: number;
    totalPnlPct: number;
    maxDrawdown: number;
    sharpeRatio: number;
    profitFactor: number;
    avgWin: number;
    avgLoss: number;
    bestTrade: { symbol: string; pnl: number };
    worstTrade: { symbol: string; pnl: number };
    activeSince: string;
  };
}

export interface AutoTradePosition {
  id: string;
  strategyId: string;
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  entryTime: string;
  currentPrice: number;
  quantity: number;
  unrealizedPnl: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  trailingStopPrice?: number;
  originalStopPrice?: number;
  opportunityId?: string;
  entryReason: string;
  status: 'open' | 'closed' | 'cancelled';
}

export interface TradeDecision {
  id: string;
  timestamp: string;
  strategyId: string;
  symbol: string;
  action: 'enter' | 'exit' | 'skip';
  reason: string;
  opportunityId?: string;
  confidence?: number;
  positionSize?: number;
  price?: number;
  executed: boolean;
  errorMessage?: string;
}

class AutoTraderService {
  private isRunning = false;
  private dailyPnL = 0;
  private dailyLossLimit = Infinity;
  private killSwitchActive = false;
  private lastRunTime = 0;
  private runIntervalMs = 60000; // 60 seconds

  constructor() {
    this.initializeTables();
    this.resetDailyStats();
  }

  private initializeTables() {
    const db = getDb();
    
    // Trading strategies table
    db.exec(`
      CREATE TABLE IF NOT EXISTS trading_strategies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        enabled BOOLEAN DEFAULT FALSE,
        mode TEXT DEFAULT 'paper',
        entry_rules TEXT NOT NULL,
        risk_rules TEXT NOT NULL,
        execution_rules TEXT NOT NULL,
        performance TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Auto-trade positions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS auto_positions (
        id TEXT PRIMARY KEY,
        strategy_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        direction TEXT NOT NULL,
        entry_price REAL NOT NULL,
        entry_time TEXT NOT NULL,
        current_price REAL NOT NULL,
        quantity REAL NOT NULL,
        unrealized_pnl REAL DEFAULT 0,
        stop_loss_price REAL,
        take_profit_price REAL,
        trailing_stop_price REAL,
        original_stop_price REAL,
        opportunity_id TEXT,
        entry_reason TEXT NOT NULL,
        status TEXT DEFAULT 'open',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Trade decisions audit log
    db.exec(`
      CREATE TABLE IF NOT EXISTS trade_decisions (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        strategy_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT NOT NULL,
        opportunity_id TEXT,
        confidence REAL,
        position_size REAL,
        price REAL,
        executed BOOLEAN DEFAULT FALSE,
        error_message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Auto-trader state
    db.exec(`
      CREATE TABLE IF NOT EXISTS auto_trader_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create default strategy templates if not exist
    this.createDefaultStrategies();
  }

  private createDefaultStrategies() {
    const db = getDb();
    const existingStrategies = db.prepare('SELECT COUNT(*) as count FROM trading_strategies').get() as any;
    
    if (existingStrategies.count === 0) {
      const templates = this.getStrategyTemplates();
      for (const template of templates) {
        this.createStrategy(template);
      }
    }
  }

  private getStrategyTemplates(): Omit<TradingStrategy, 'id'>[] {
    return [
      {
        name: "Smart Money Follower",
        description: "Follows institutional holder movements with delayed entry",
        enabled: false,
        mode: 'paper',
        entryRules: {
          minConfidence: 60,
          allowedDirections: ['long'],
          allowedTimeframes: ['swing', 'position'],
          requiredSignalTypes: ['holder'],
          excludedSymbols: [],
          minSignalCount: 1,
        },
        riskRules: {
          maxPositionSize: 2,
          maxTotalExposure: 15,
          maxDailyLoss: 1000,
          maxDrawdown: 10,
          maxConcurrentPositions: 5,
          stopLossType: 'fixed',
          stopLossPct: 8,
          takeProfitPct: 15,
          maxHoldDays: 30,
        },
        executionRules: {
          orderType: 'market',
          entryTiming: 'immediate',
          exitTiming: 'immediate',
          allowPreMarket: false,
          allowAfterHours: false,
        },
        performance: this.getEmptyPerformance(),
      },
      {
        name: "Momentum Breakout",
        description: "Trades breakouts with volume confirmation",
        enabled: false,
        mode: 'paper',
        entryRules: {
          minConfidence: 70,
          allowedDirections: ['long'],
          allowedTimeframes: ['day', 'swing'],
          requiredSignalTypes: ['price'],
          excludedSymbols: [],
          minSignalCount: 1,
        },
        riskRules: {
          maxPositionSize: 3,
          maxTotalExposure: 20,
          maxDailyLoss: 800,
          maxDrawdown: 12,
          maxConcurrentPositions: 8,
          stopLossType: 'trailing',
          stopLossPct: 5,
          trailingStopPct: 5,
          takeProfitPct: 20,
          maxHoldDays: 14,
        },
        executionRules: {
          orderType: 'limit',
          limitOffsetPct: 0.1,
          entryTiming: 'immediate',
          exitTiming: 'immediate',
          allowPreMarket: false,
          allowAfterHours: false,
        },
        performance: this.getEmptyPerformance(),
      },
      {
        name: "Options Flow Rider",
        description: "Follows unusual options activity",
        enabled: false,
        mode: 'paper',
        entryRules: {
          minConfidence: 75,
          allowedDirections: ['long', 'short'],
          allowedTimeframes: ['day'],
          requiredSignalTypes: ['options'],
          excludedSymbols: [],
          minSignalCount: 1,
        },
        riskRules: {
          maxPositionSize: 1.5,
          maxTotalExposure: 10,
          maxDailyLoss: 600,
          maxDrawdown: 8,
          maxConcurrentPositions: 6,
          stopLossType: 'fixed',
          stopLossPct: 4,
          takeProfitPct: 10,
          maxHoldDays: 7,
        },
        executionRules: {
          orderType: 'market',
          entryTiming: 'immediate',
          exitTiming: 'immediate',
          allowPreMarket: false,
          allowAfterHours: false,
        },
        performance: this.getEmptyPerformance(),
      },
      {
        name: "Social Sentiment Surge",
        description: "Trades social media hype with tight risk controls",
        enabled: false,
        mode: 'paper',
        entryRules: {
          minConfidence: 65,
          allowedDirections: ['long'],
          allowedTimeframes: ['day'],
          requiredSignalTypes: ['social', 'price'],
          excludedSymbols: [],
          minSignalCount: 2,
        },
        riskRules: {
          maxPositionSize: 1,
          maxTotalExposure: 8,
          maxDailyLoss: 500,
          maxDrawdown: 15,
          maxConcurrentPositions: 4,
          stopLossType: 'fixed',
          stopLossPct: 10,
          takeProfitPct: 25,
          maxHoldDays: 5,
        },
        executionRules: {
          orderType: 'market',
          entryTiming: 'immediate',
          exitTiming: 'immediate',
          allowPreMarket: false,
          allowAfterHours: false,
        },
        performance: this.getEmptyPerformance(),
      },
      {
        name: "IV Crush Setup",
        description: "Sells premium before earnings (advanced strategy)",
        enabled: false,
        mode: 'paper',
        entryRules: {
          minConfidence: 70,
          allowedDirections: ['short'], // Short premium
          allowedTimeframes: ['day'],
          requiredSignalTypes: ['options'],
          excludedSymbols: [],
          minSignalCount: 1,
        },
        riskRules: {
          maxPositionSize: 2,
          maxTotalExposure: 12,
          maxDailyLoss: 800,
          maxDrawdown: 10,
          maxConcurrentPositions: 5,
          stopLossType: 'fixed',
          stopLossPct: 50, // Options can move fast
          takeProfitPct: 30,
          maxHoldDays: 5,
        },
        executionRules: {
          orderType: 'limit',
          limitOffsetPct: 0.05,
          entryTiming: 'immediate',
          exitTiming: 'immediate',
          allowPreMarket: false,
          allowAfterHours: false,
        },
        performance: this.getEmptyPerformance(),
      },
      {
        name: "Pattern Replay",
        description: "Trades learned AI patterns from trade history",
        enabled: false,
        mode: 'paper',
        entryRules: {
          minConfidence: 60,
          allowedDirections: ['long', 'short'],
          allowedTimeframes: ['day', 'swing'],
          requiredSignalTypes: [],
          excludedSymbols: [],
          minSignalCount: 1,
          patternIds: [], // Will be set when patterns are available
        },
        riskRules: {
          maxPositionSize: 2.5,
          maxTotalExposure: 18,
          maxDailyLoss: 750,
          maxDrawdown: 12,
          maxConcurrentPositions: 7,
          stopLossType: 'trailing',
          stopLossPct: 6,
          trailingStopPct: 6,
          takeProfitPct: 18,
          maxHoldDays: 21,
        },
        executionRules: {
          orderType: 'market',
          entryTiming: 'immediate',
          exitTiming: 'immediate',
          allowPreMarket: false,
          allowAfterHours: false,
        },
        performance: this.getEmptyPerformance(),
      }
    ];
  }

  private getEmptyPerformance() {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnl: 0,
      totalPnlPct: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      profitFactor: 0,
      avgWin: 0,
      avgLoss: 0,
      bestTrade: { symbol: '', pnl: 0 },
      worstTrade: { symbol: '', pnl: 0 },
      activeSince: new Date().toISOString(),
    };
  }

  async startAutoTrader() {
    if (this.isRunning) return;
    
    console.log('[AutoTrader] Starting auto-trader service...');
    this.isRunning = true;
    this.killSwitchActive = false;
    this.runDecisionLoop();
  }

  async stopAutoTrader() {
    console.log('[AutoTrader] Stopping auto-trader service...');
    this.isRunning = false;
  }

  activateKillSwitch() {
    console.log('[AutoTrader] 🚨 KILL SWITCH ACTIVATED - Disabling all strategies');
    this.killSwitchActive = true;
    this.isRunning = false;
    
    // Disable all strategies
    const db = getDb();
    db.prepare('UPDATE trading_strategies SET enabled = FALSE').run();
    
    // Log decision
    this.logDecision('SYSTEM', 'KILL_SWITCH', 'kill', 'Kill switch activated by user', '', false);
  }

  private async runDecisionLoop() {
    while (this.isRunning && !this.killSwitchActive) {
      try {
        const now = Date.now();
        if (now - this.lastRunTime >= this.runIntervalMs) {
          await this.executeDecisionCycle();
          this.lastRunTime = now;
        }
        
        // Check every 5 seconds
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.error('[AutoTrader] Error in decision loop:', error);
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait longer on error
      }
    }
  }

  private async executeDecisionCycle() {
    console.log('[AutoTrader] Running decision cycle...');
    
    // Check trading hours
    if (!this.isTradingTime()) {
      return;
    }

    // Check daily loss limit
    if (this.dailyPnL <= -this.dailyLossLimit) {
      console.log('[AutoTrader] Daily loss limit reached, stopping trading for today');
      return;
    }

    // Get enabled strategies
    const strategies = this.getEnabledStrategies();
    if (strategies.length === 0) {
      return;
    }

    // Get new opportunities
    const opportunities = await opportunityEngine.getOpportunities({ limit: 20 });
    
    console.log(`[AutoTrader] Found ${opportunities.length} opportunities for ${strategies.length} strategies`);

    // Process each strategy
    for (const strategy of strategies) {
      try {
        await this.processStrategy(strategy, opportunities);
      } catch (error) {
        console.error(`[AutoTrader] Error processing strategy ${strategy.name}:`, error);
      }
    }

    // Manage existing positions
    await this.manageOpenPositions();
  }

  private async processStrategy(strategy: TradingStrategy, opportunities: any[]) {
    // Filter opportunities based on strategy rules
    const filteredOpportunities = opportunities.filter(opp => {
      return this.opportunityMatchesStrategy(opp, strategy);
    });

    if (filteredOpportunities.length === 0) {
      return;
    }

    // Check position limits
    const openPositions = this.getOpenPositions(strategy.id);
    if (openPositions.length >= strategy.riskRules.maxConcurrentPositions) {
      this.logDecision(strategy.id, 'LIMIT_CHECK', 'skip', 
        `Max positions reached (${openPositions.length}/${strategy.riskRules.maxConcurrentPositions})`, '');
      return;
    }

    // Check total exposure
    const currentExposure = this.calculateTotalExposure(strategy.id);
    if (currentExposure >= strategy.riskRules.maxTotalExposure) {
      this.logDecision(strategy.id, 'LIMIT_CHECK', 'skip', 
        `Max exposure reached (${currentExposure.toFixed(1)}%/${strategy.riskRules.maxTotalExposure}%)`, '');
      return;
    }

    // Process top opportunities
    for (const opportunity of filteredOpportunities.slice(0, 3)) {
      try {
        await this.evaluateEntryOpportunity(strategy, opportunity);
      } catch (error) {
        console.error(`[AutoTrader] Error evaluating opportunity ${opportunity.id}:`, error);
      }
    }
  }

  private opportunityMatchesStrategy(opportunity: any, strategy: TradingStrategy): boolean {
    const rules = strategy.entryRules;
    
    // Check confidence
    if (opportunity.confidence < rules.minConfidence) {
      return false;
    }

    // Check signal types
    if (rules.requiredSignalTypes.length > 0) {
      const opportunitySignalTypes = opportunity.signals?.map((s: any) => s.type) || [];
      const hasRequiredSignals = rules.requiredSignalTypes.every(type => 
        opportunitySignalTypes.includes(type)
      );
      if (!hasRequiredSignals) {
        return false;
      }
    }

    // Check signal count
    if (opportunity.signals?.length < rules.minSignalCount) {
      return false;
    }

    // Check excluded symbols
    if (rules.excludedSymbols.includes(opportunity.symbol)) {
      return false;
    }

    // Check allowed symbols
    if (rules.allowedSymbols && rules.allowedSymbols.length > 0) {
      if (!rules.allowedSymbols.includes(opportunity.symbol)) {
        return false;
      }
    }

    // Check if already in position for this symbol
    const existingPositions = this.getOpenPositions(strategy.id);
    if (existingPositions.some(pos => pos.symbol === opportunity.symbol)) {
      return false;
    }

    return true;
  }

  private async evaluateEntryOpportunity(strategy: TradingStrategy, opportunity: any) {
    const positionSize = this.calculatePositionSize(strategy, opportunity);
    const entryPrice = opportunity.currentPrice || 100; // Mock price
    const direction = this.determineDirection(opportunity, strategy);
    
    if (!direction) {
      this.logDecision(strategy.id, opportunity.symbol, 'skip', 
        'Direction not supported by strategy', opportunity.id);
      return;
    }

    const reason = `${opportunity.type} opportunity (${opportunity.confidence}% confidence) - ${opportunity.description}`;
    
    // For now, just log the decision (mock trading)
    // In a real implementation, this would place orders via Alpaca
    const position: AutoTradePosition = {
      id: `pos_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
      strategyId: strategy.id,
      symbol: opportunity.symbol,
      direction,
      entryPrice,
      entryTime: new Date().toISOString(),
      currentPrice: entryPrice,
      quantity: positionSize,
      unrealizedPnl: 0,
      opportunityId: opportunity.id,
      entryReason: reason,
      status: 'open',
    };

    // Set stop loss and take profit
    this.setExitPrices(position, strategy);
    
    // Save position
    this.savePosition(position);
    
    this.logDecision(strategy.id, opportunity.symbol, 'enter', reason, opportunity.id, true, {
      confidence: opportunity.confidence,
      positionSize,
      price: entryPrice,
    });

    console.log(`[AutoTrader] 📈 ENTERED ${direction.toUpperCase()} position: ${opportunity.symbol} at $${entryPrice} (${strategy.name})`);
  }

  private calculatePositionSize(strategy: TradingStrategy, opportunity: any): number {
    // Mock portfolio value
    const portfolioValue = 100000;
    const maxPositionValue = portfolioValue * (strategy.riskRules.maxPositionSize / 100);
    const entryPrice = opportunity.currentPrice || 100;
    
    return Math.floor(maxPositionValue / entryPrice);
  }

  private determineDirection(opportunity: any, strategy: TradingStrategy): 'long' | 'short' | null {
    // Determine direction based on opportunity type and allowed directions
    const signals = opportunity.signals || [];
    const bullishSignals = signals.filter((s: any) => s.sentiment === 'bullish').length;
    const bearishSignals = signals.filter((s: any) => s.sentiment === 'bearish').length;
    
    if (bullishSignals > bearishSignals && strategy.entryRules.allowedDirections.includes('long')) {
      return 'long';
    }
    
    if (bearishSignals > bullishSignals && strategy.entryRules.allowedDirections.includes('short')) {
      return 'short';
    }
    
    // Default to long if allowed and neutral
    if (strategy.entryRules.allowedDirections.includes('long')) {
      return 'long';
    }
    
    return null;
  }

  private setExitPrices(position: AutoTradePosition, strategy: TradingStrategy) {
    const entryPrice = position.entryPrice;
    const rules = strategy.riskRules;
    
    if (position.direction === 'long') {
      position.stopLossPrice = entryPrice * (1 - rules.stopLossPct / 100);
      position.takeProfitPrice = entryPrice * (1 + rules.takeProfitPct / 100);
      
      if (rules.stopLossType === 'trailing') {
        position.trailingStopPrice = entryPrice * (1 - (rules.trailingStopPct || rules.stopLossPct) / 100);
        position.originalStopPrice = position.stopLossPrice;
      }
    } else {
      position.stopLossPrice = entryPrice * (1 + rules.stopLossPct / 100);
      position.takeProfitPrice = entryPrice * (1 - rules.takeProfitPct / 100);
      
      if (rules.stopLossType === 'trailing') {
        position.trailingStopPrice = entryPrice * (1 + (rules.trailingStopPct || rules.stopLossPct) / 100);
        position.originalStopPrice = position.stopLossPrice;
      }
    }
  }

  private async manageOpenPositions() {
    const openPositions = this.getAllOpenPositions();
    
    for (const position of openPositions) {
      try {
        await this.managePosition(position);
      } catch (error) {
        console.error(`[AutoTrader] Error managing position ${position.id}:`, error);
      }
    }
  }

  private async managePosition(position: AutoTradePosition) {
    // Update current price (mock - in real implementation, fetch from market data)
    position.currentPrice = position.entryPrice * (1 + (Math.random() - 0.5) * 0.1);
    
    // Calculate unrealized P&L
    if (position.direction === 'long') {
      position.unrealizedPnl = (position.currentPrice - position.entryPrice) * position.quantity;
    } else {
      position.unrealizedPnl = (position.entryPrice - position.currentPrice) * position.quantity;
    }
    
    // Check exit conditions
    let shouldExit = false;
    let exitReason = '';
    
    // Check stop loss
    if (position.direction === 'long' && position.currentPrice <= (position.stopLossPrice || 0)) {
      shouldExit = true;
      exitReason = 'Stop loss hit';
    } else if (position.direction === 'short' && position.currentPrice >= (position.stopLossPrice || Infinity)) {
      shouldExit = true;
      exitReason = 'Stop loss hit';
    }
    
    // Check take profit
    if (position.direction === 'long' && position.currentPrice >= (position.takeProfitPrice || Infinity)) {
      shouldExit = true;
      exitReason = 'Take profit hit';
    } else if (position.direction === 'short' && position.currentPrice <= (position.takeProfitPrice || 0)) {
      shouldExit = true;
      exitReason = 'Take profit hit';
    }
    
    // Check max hold time
    const holdDays = (Date.now() - new Date(position.entryTime).getTime()) / (1000 * 60 * 60 * 24);
    const strategy = this.getStrategy(position.strategyId);
    if (strategy && holdDays >= strategy.riskRules.maxHoldDays) {
      shouldExit = true;
      exitReason = 'Max hold time reached';
    }
    
    // Update trailing stop
    if (strategy?.riskRules.stopLossType === 'trailing' && position.direction === 'long') {
      const trailingStopPct = strategy.riskRules.trailingStopPct || strategy.riskRules.stopLossPct;
      const newTrailingStop = position.currentPrice * (1 - trailingStopPct / 100);
      
      if (newTrailingStop > (position.trailingStopPrice || 0)) {
        position.trailingStopPrice = newTrailingStop;
        position.stopLossPrice = newTrailingStop;
      }
    } else if (strategy?.riskRules.stopLossType === 'trailing' && position.direction === 'short') {
      const trailingStopPct = strategy.riskRules.trailingStopPct || strategy.riskRules.stopLossPct;
      const newTrailingStop = position.currentPrice * (1 + trailingStopPct / 100);
      
      if (newTrailingStop < (position.trailingStopPrice || Infinity)) {
        position.trailingStopPrice = newTrailingStop;
        position.stopLossPrice = newTrailingStop;
      }
    }
    
    if (shouldExit) {
      await this.exitPosition(position, exitReason);
    } else {
      this.updatePosition(position);
    }
  }

  private async exitPosition(position: AutoTradePosition, reason: string) {
    position.status = 'closed';
    const realizedPnl = position.unrealizedPnl;
    
    // Update strategy performance
    this.updateStrategyPerformance(position.strategyId, realizedPnl);
    
    // Update position in database
    this.updatePosition(position);
    
    this.logDecision(position.strategyId, position.symbol, 'exit', reason, position.opportunityId, true, {
      price: position.currentPrice,
      pnl: realizedPnl,
    });

    console.log(`[AutoTrader] 📉 EXITED ${position.direction.toUpperCase()} position: ${position.symbol} at $${position.currentPrice.toFixed(2)} (P&L: $${realizedPnl.toFixed(2)}) - ${reason}`);
  }

  private updateStrategyPerformance(strategyId: string, pnl: number) {
    const db = getDb();
    const strategy = db.prepare('SELECT * FROM trading_strategies WHERE id = ?').get(strategyId) as any;
    
    if (strategy) {
      const performance = JSON.parse(strategy.performance);
      
      performance.totalTrades++;
      performance.totalPnl += pnl;
      
      if (pnl > 0) {
        performance.wins++;
        performance.avgWin = (performance.avgWin * (performance.wins - 1) + pnl) / performance.wins;
        if (pnl > performance.bestTrade.pnl) {
          performance.bestTrade = { symbol: '', pnl }; // Would need symbol
        }
      } else {
        performance.losses++;
        performance.avgLoss = (performance.avgLoss * (performance.losses - 1) + Math.abs(pnl)) / performance.losses;
        if (pnl < performance.worstTrade.pnl) {
          performance.worstTrade = { symbol: '', pnl }; // Would need symbol
        }
      }
      
      performance.winRate = performance.wins / performance.totalTrades;
      performance.profitFactor = performance.avgWin / Math.max(performance.avgLoss, 0.01);
      
      db.prepare('UPDATE trading_strategies SET performance = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(performance), new Date().toISOString(), strategyId);
    }
  }

  private isTradingTime(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    
    // Skip weekends
    if (day === 0 || day === 6) return false;
    
    // Market hours: 9:30 AM - 4:00 PM EST (simplified)
    return hour >= 9 && hour < 16;
  }

  private resetDailyStats() {
    // Reset daily P&L at market open
    const now = new Date();
    if (now.getHours() === 9 && now.getMinutes() < 30) {
      this.dailyPnL = 0;
    }
  }

  // Database operations
  createStrategy(strategyData: Omit<TradingStrategy, 'id'>): TradingStrategy {
    const db = getDb();
    const id = `strategy_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    const strategy: TradingStrategy = {
      id,
      ...strategyData,
    };
    
    db.prepare(`
      INSERT INTO trading_strategies 
      (id, name, description, enabled, mode, entry_rules, risk_rules, execution_rules, performance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      strategy.name,
      strategy.description,
      strategy.enabled,
      strategy.mode,
      JSON.stringify(strategy.entryRules),
      JSON.stringify(strategy.riskRules),
      JSON.stringify(strategy.executionRules),
      JSON.stringify(strategy.performance)
    );
    
    return strategy;
  }

  getStrategies(): TradingStrategy[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM trading_strategies ORDER BY created_at DESC').all() as any[];
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      mode: row.mode,
      entryRules: JSON.parse(row.entry_rules),
      riskRules: JSON.parse(row.risk_rules),
      executionRules: JSON.parse(row.execution_rules),
      performance: JSON.parse(row.performance),
    }));
  }

  getStrategy(id: string): TradingStrategy | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM trading_strategies WHERE id = ?').get(id) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      mode: row.mode,
      entryRules: JSON.parse(row.entry_rules),
      riskRules: JSON.parse(row.risk_rules),
      executionRules: JSON.parse(row.execution_rules),
      performance: JSON.parse(row.performance),
    };
  }

  getEnabledStrategies(): TradingStrategy[] {
    return this.getStrategies().filter(s => s.enabled);
  }

  updateStrategy(id: string, updates: Partial<TradingStrategy>): boolean {
    const db = getDb();
    const existing = this.getStrategy(id);
    if (!existing) return false;
    
    const updated = { ...existing, ...updates };
    
    db.prepare(`
      UPDATE trading_strategies 
      SET name = ?, description = ?, enabled = ?, mode = ?, 
          entry_rules = ?, risk_rules = ?, execution_rules = ?, performance = ?, 
          updated_at = ?
      WHERE id = ?
    `).run(
      updated.name,
      updated.description,
      updated.enabled,
      updated.mode,
      JSON.stringify(updated.entryRules),
      JSON.stringify(updated.riskRules),
      JSON.stringify(updated.executionRules),
      JSON.stringify(updated.performance),
      new Date().toISOString(),
      id
    );
    
    return true;
  }

  deleteStrategy(id: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM trading_strategies WHERE id = ?').run(id);
    return result.changes > 0;
  }

  enableStrategy(id: string): boolean {
    return this.updateStrategy(id, { enabled: true });
  }

  disableStrategy(id: string): boolean {
    return this.updateStrategy(id, { enabled: false });
  }

  private savePosition(position: AutoTradePosition) {
    const db = getDb();
    db.prepare(`
      INSERT INTO auto_positions 
      (id, strategy_id, symbol, direction, entry_price, entry_time, current_price, 
       quantity, unrealized_pnl, stop_loss_price, take_profit_price, trailing_stop_price,
       original_stop_price, opportunity_id, entry_reason, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      position.id,
      position.strategyId,
      position.symbol,
      position.direction,
      position.entryPrice,
      position.entryTime,
      position.currentPrice,
      position.quantity,
      position.unrealizedPnl,
      position.stopLossPrice,
      position.takeProfitPrice,
      position.trailingStopPrice,
      position.originalStopPrice,
      position.opportunityId,
      position.entryReason,
      position.status
    );
  }

  private updatePosition(position: AutoTradePosition) {
    const db = getDb();
    db.prepare(`
      UPDATE auto_positions 
      SET current_price = ?, unrealized_pnl = ?, stop_loss_price = ?, 
          take_profit_price = ?, trailing_stop_price = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(
      position.currentPrice,
      position.unrealizedPnl,
      position.stopLossPrice,
      position.takeProfitPrice,
      position.trailingStopPrice,
      position.status,
      new Date().toISOString(),
      position.id
    );
  }

  getOpenPositions(strategyId?: string): AutoTradePosition[] {
    const db = getDb();
    const query = strategyId 
      ? 'SELECT * FROM auto_positions WHERE status = "open" AND strategy_id = ? ORDER BY entry_time DESC'
      : 'SELECT * FROM auto_positions WHERE status = "open" ORDER BY entry_time DESC';
    
    const params = strategyId ? [strategyId] : [];
    const rows = db.prepare(query).all(...params) as any[];
    
    return rows.map(row => ({
      id: row.id,
      strategyId: row.strategy_id,
      symbol: row.symbol,
      direction: row.direction,
      entryPrice: row.entry_price,
      entryTime: row.entry_time,
      currentPrice: row.current_price,
      quantity: row.quantity,
      unrealizedPnl: row.unrealized_pnl,
      stopLossPrice: row.stop_loss_price,
      takeProfitPrice: row.take_profit_price,
      trailingStopPrice: row.trailing_stop_price,
      originalStopPrice: row.original_stop_price,
      opportunityId: row.opportunity_id,
      entryReason: row.entry_reason,
      status: row.status,
    }));
  }

  getAllOpenPositions(): AutoTradePosition[] {
    return this.getOpenPositions();
  }

  private calculateTotalExposure(strategyId: string): number {
    const positions = this.getOpenPositions(strategyId);
    const portfolioValue = 100000; // Mock
    
    const totalValue = positions.reduce((sum, pos) => 
      sum + (pos.currentPrice * pos.quantity), 0);
    
    return (totalValue / portfolioValue) * 100;
  }

  private logDecision(strategyId: string, symbol: string, action: string, reason: string, 
                     opportunityId?: string, executed: boolean = false, metadata?: any) {
    const db = getDb();
    const id = `decision_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    db.prepare(`
      INSERT INTO trade_decisions 
      (id, timestamp, strategy_id, symbol, action, reason, opportunity_id, 
       confidence, position_size, price, executed, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      new Date().toISOString(),
      strategyId,
      symbol,
      action,
      reason,
      opportunityId,
      metadata?.confidence,
      metadata?.positionSize,
      metadata?.price,
      executed,
      metadata?.errorMessage
    );
  }

  getAuditLog(filters?: {
    strategyId?: string;
    symbol?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): TradeDecision[] {
    const db = getDb();
    let query = 'SELECT * FROM trade_decisions WHERE 1=1';
    const params: any[] = [];
    
    if (filters?.strategyId) {
      query += ' AND strategy_id = ?';
      params.push(filters.strategyId);
    }
    
    if (filters?.symbol) {
      query += ' AND symbol = ?';
      params.push(filters.symbol);
    }
    
    if (filters?.fromDate) {
      query += ' AND timestamp >= ?';
      params.push(filters.fromDate);
    }
    
    if (filters?.toDate) {
      query += ' AND timestamp <= ?';
      params.push(filters.toDate);
    }
    
    query += ' ORDER BY timestamp DESC';
    
    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    
    const rows = db.prepare(query).all(...params) as any[];
    
    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      strategyId: row.strategy_id,
      symbol: row.symbol,
      action: row.action,
      reason: row.reason,
      opportunityId: row.opportunity_id,
      confidence: row.confidence,
      positionSize: row.position_size,
      price: row.price,
      executed: row.executed,
      errorMessage: row.error_message,
    }));
  }

  getStatus() {
    const strategies = this.getStrategies();
    const openPositions = this.getAllOpenPositions();
    const enabledStrategies = strategies.filter(s => s.enabled);
    
    const totalPnl = openPositions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0);
    
    return {
      isRunning: this.isRunning,
      killSwitchActive: this.killSwitchActive,
      enabledStrategies: enabledStrategies.length,
      totalStrategies: strategies.length,
      openPositions: openPositions.length,
      dailyPnl: this.dailyPnL,
      unrealizedPnl: totalPnl,
      lastRunTime: this.lastRunTime,
    };
  }

  // Backtesting
  async backtestStrategy(strategyConfig: TradingStrategy, fromDate: string, toDate: string) {
    // This would implement a full backtest against historical data
    // For now, return mock results
    return {
      trades: [
        {
          symbol: 'AAPL',
          entry: '2024-01-15',
          exit: '2024-01-20',
          direction: 'long',
          entryPrice: 150.25,
          exitPrice: 155.80,
          pnl: 555.00,
          reason: 'Take profit hit',
        }
      ],
      stats: {
        totalTrades: 1,
        winRate: 100,
        totalPnl: 555.00,
        maxDrawdown: 0,
        sharpeRatio: 1.5,
      },
      equityCurve: [
        { date: '2024-01-15', value: 100000 },
        { date: '2024-01-20', value: 100555 },
      ],
    };
  }
}

export const autoTrader = new AutoTraderService();