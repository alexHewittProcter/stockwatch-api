import { getDb } from '../../db/schema';
import { TradePattern, PatternCondition, TradeJournalEntry, TradeAnalysisData, PatternMatch, PatternStatistics } from '../../types/ai';
import { v4 } from '../opportunities/uuid';

/**
 * AI Learning Engine
 * 
 * Analyzes successful trades to extract repeatable patterns and builds a library
 * of trading strategies that improve over time.
 */

export class AILearnService {
  
  /**
   * Analyze a successful trade to extract patterns
   */
  async analyzeTradeForPattern(tradeId: string): Promise<TradePattern> {
    const db = getDb();
    
    // Get the trade details
    const trade = await this.getTradeDetails(tradeId);
    if (!trade) {
      throw new Error('Trade not found');
    }
    
    if (trade.status !== 'closed_win') {
      throw new Error('Can only learn from profitable trades');
    }
    
    console.log(`[AILearn] Analyzing trade ${tradeId} for ${trade.symbol}`);
    
    // Collect comprehensive data for the trade period
    const analysisData = await this.collectTradeAnalysisData(trade);
    
    // Extract conditions that led to success
    const conditions = this.extractPatternConditions(analysisData);
    
    // Generate pattern name and description
    const patternName = this.generatePatternName(conditions);
    const patternDescription = this.generatePatternDescription(analysisData, conditions);
    
    // Run historical backtest to validate pattern
    const statistics = await this.backtestPattern(conditions, trade.symbol);
    
    // Determine risk factors and best conditions
    const riskFactors = this.identifyRiskFactors(analysisData, statistics);
    const bestTimeframes = this.identifyBestTimeframes(statistics);
    const marketConditions = this.identifyMarketConditions(analysisData);
    
    // Create and save pattern
    const pattern: TradePattern = {
      id: v4(),
      name: patternName,
      description: patternDescription,
      tradeId,
      conditions,
      statistics,
      riskFactors,
      bestTimeframes,
      marketConditions,
      createdAt: new Date().toISOString(),
      usedCount: 0,
      liveWinRate: undefined,
      liveTradeCount: 0,
    };
    
    await this.savePattern(pattern);
    await this.saveTradeAnalysisData(analysisData);
    
    // Mark trade as learned from
    await this.markTradeAsLearned(tradeId, pattern.id);
    
    console.log(`[AILearn] Created pattern: ${pattern.name}`);
    return pattern;
  }
  
  private async getTradeDetails(tradeId: string): Promise<TradeJournalEntry | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM trade_journal WHERE id = ?').get(tradeId) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      symbol: row.symbol,
      direction: row.direction,
      entryDate: row.entry_date,
      entryPrice: row.entry_price,
      exitDate: row.exit_date,
      exitPrice: row.exit_price,
      quantity: row.quantity,
      pnl: row.pnl,
      pnlPct: row.pnl_pct,
      status: row.status,
      entryContext: JSON.parse(row.entry_context || '{}'),
      notes: row.notes || '',
      tags: JSON.parse(row.tags || '[]'),
      patternId: row.pattern_id,
      learnedAt: row.learned_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  
  private async collectTradeAnalysisData(trade: TradeJournalEntry): Promise<TradeAnalysisData> {
    // In a real implementation, this would collect data from various sources
    // For now, we'll create realistic mock data based on the trade
    
    const entryDate = new Date(trade.entryDate);
    const exitDate = new Date(trade.exitDate!);
    const holdDays = Math.floor((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Mock realistic data based on trade outcome
    const mockData: TradeAnalysisData = {
      symbol: trade.symbol,
      tradeId: trade.id,
      entryDate: trade.entryDate,
      exitDate: trade.exitDate!,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice!,
      direction: trade.direction,
      pnlPct: trade.pnlPct!,
      holdDays,
      
      priceAction: {
        highestPrice: trade.direction === 'long' ? trade.exitPrice! * 1.02 : trade.entryPrice * 1.01,
        lowestPrice: trade.direction === 'long' ? trade.entryPrice * 0.98 : trade.exitPrice! * 0.99,
        volatility: 15 + Math.random() * 20, // 15-35% annualized
        gapsEncountered: Math.floor(Math.random() * 3),
        patternType: this.determinePatternType(trade),
      },
      
      volumeProfile: {
        avgVolume30d: 1000000 + Math.random() * 5000000,
        entryDayVolume: 1500000 + Math.random() * 8000000,
        volumeSpikeDays: Math.floor(Math.random() * 5) + 1,
        volumeTrend: Math.random() > 0.5 ? 'increasing' : 'stable',
      },
      
      technicals: {
        entryRsi: trade.direction === 'long' ? 25 + Math.random() * 30 : 45 + Math.random() * 30,
        exitRsi: trade.direction === 'long' ? 55 + Math.random() * 25 : 25 + Math.random() * 30,
        macdSignal: trade.direction === 'long' ? 'bullish' : 'bearish',
        movingAveragePosition: trade.direction === 'long' ? 'Above 20 & 50 MA' : 'Below 20 & 50 MA',
        bollingerBandPosition: Math.random() > 0.5 ? 'lower' : 'middle',
      },
      
      optionsContext: Math.random() > 0.3 ? {
        entryIvRank: Math.random() * 100,
        exitIvRank: Math.random() * 100,
        unusualActivity: Math.random() > 0.7,
        putCallRatio: 0.5 + Math.random() * 1.5,
      } : undefined,
      
      holderContext: Math.random() > 0.4 ? {
        insiderTransactions: Math.floor(Math.random() * 5),
        institutionalChanges: Math.floor(Math.random() * 10),
        smartMoneySignals: Math.random() > 0.6,
      } : undefined,
      
      newsContext: {
        sentimentAtEntry: -0.5 + Math.random(),
        sentimentAtExit: trade.pnlPct! > 0 ? 0.2 + Math.random() * 0.6 : -0.6 + Math.random() * 0.4,
        keyEvents: this.generateMockEvents(trade),
        socialMentions: Math.floor(Math.random() * 500) + 50,
      },
      
      macroContext: {
        vixLevel: 15 + Math.random() * 25,
        marketTrend: Math.random() > 0.6 ? 'bull' : 'sideways',
        sectorPerformance: -10 + Math.random() * 20,
        rateEnvironment: Math.random() > 0.5 ? 'stable' : 'rising',
      },
    };
    
    return mockData;
  }
  
  private determinePatternType(trade: TradeJournalEntry): 'breakout' | 'reversal' | 'gap' | 'momentum' | 'consolidation' {
    // Simple logic based on trade characteristics
    if (trade.entryContext.signals?.includes('breakout_high') || trade.entryContext.signals?.includes('breakout_low')) {
      return 'breakout';
    }
    if (trade.entryContext.signals?.includes('gap_up') || trade.entryContext.signals?.includes('gap_down')) {
      return 'gap';
    }
    if (trade.entryContext.signals?.includes('momentum')) {
      return 'momentum';
    }
    if (trade.pnlPct! > 0 && Math.random() > 0.5) {
      return 'reversal';
    }
    return 'consolidation';
  }
  
  private generateMockEvents(trade: TradeJournalEntry): string[] {
    const events = [];
    if (Math.random() > 0.7) events.push('Earnings announcement');
    if (Math.random() > 0.8) events.push('FDA approval');
    if (Math.random() > 0.6) events.push('Analyst upgrade');
    if (Math.random() > 0.5) events.push('Product launch');
    return events;
  }
  
  private extractPatternConditions(data: TradeAnalysisData): PatternCondition[] {
    const conditions: PatternCondition[] = [];
    
    // RSI condition
    if (data.technicals.entryRsi < 40) {
      conditions.push({
        metric: 'rsi',
        description: `RSI below ${data.technicals.entryRsi.toFixed(0)} at entry`,
        value: data.technicals.entryRsi,
        tolerance: 10, // ±10%
        weight: 0.8,
      });
    } else if (data.technicals.entryRsi > 60) {
      conditions.push({
        metric: 'rsi',
        description: `RSI above ${data.technicals.entryRsi.toFixed(0)} at entry`,
        value: data.technicals.entryRsi,
        tolerance: 10,
        weight: 0.8,
      });
    }
    
    // Volume condition
    const volumeRatio = data.volumeProfile.entryDayVolume / data.volumeProfile.avgVolume30d;
    if (volumeRatio > 2) {
      conditions.push({
        metric: 'volume_spike',
        description: `Volume ${volumeRatio.toFixed(1)}x average`,
        value: volumeRatio,
        tolerance: 25, // ±25%
        weight: 0.7,
      });
    }
    
    // Options conditions
    if (data.optionsContext) {
      if (data.optionsContext.entryIvRank < 30) {
        conditions.push({
          metric: 'iv_rank_low',
          description: `Low IV rank (${data.optionsContext.entryIvRank.toFixed(0)}) at entry`,
          value: data.optionsContext.entryIvRank,
          tolerance: 20,
          weight: 0.6,
        });
      } else if (data.optionsContext.entryIvRank > 70) {
        conditions.push({
          metric: 'iv_rank_high',
          description: `High IV rank (${data.optionsContext.entryIvRank.toFixed(0)}) at entry`,
          value: data.optionsContext.entryIvRank,
          tolerance: 20,
          weight: 0.6,
        });
      }
      
      if (data.optionsContext.unusualActivity) {
        conditions.push({
          metric: 'unusual_options_activity',
          description: 'Unusual options activity detected',
          value: 1,
          tolerance: 0,
          weight: 0.9,
        });
      }
    }
    
    // Holder conditions
    if (data.holderContext) {
      if (data.holderContext.insiderTransactions > 0) {
        conditions.push({
          metric: 'insider_activity',
          description: `${data.holderContext.insiderTransactions} insider transactions`,
          value: data.holderContext.insiderTransactions,
          tolerance: 50,
          weight: 0.8,
        });
      }
      
      if (data.holderContext.smartMoneySignals) {
        conditions.push({
          metric: 'smart_money',
          description: 'Smart money signals detected',
          value: 1,
          tolerance: 0,
          weight: 0.9,
        });
      }
    }
    
    // Sentiment condition
    if (Math.abs(data.newsContext.sentimentAtEntry) > 0.3) {
      conditions.push({
        metric: 'sentiment',
        description: `${data.newsContext.sentimentAtEntry > 0 ? 'Positive' : 'Negative'} sentiment (${data.newsContext.sentimentAtEntry.toFixed(2)})`,
        value: data.newsContext.sentimentAtEntry,
        tolerance: 30,
        weight: 0.5,
      });
    }
    
    // Pattern type condition
    conditions.push({
      metric: 'pattern_type',
      description: `${data.priceAction.patternType} pattern`,
      value: this.patternTypeToNumber(data.priceAction.patternType),
      tolerance: 0,
      weight: 0.7,
    });
    
    return conditions;
  }
  
  private patternTypeToNumber(type: string): number {
    const map: Record<string, number> = {
      'breakout': 1,
      'reversal': 2,
      'gap': 3,
      'momentum': 4,
      'consolidation': 5,
    };
    return map[type] || 0;
  }
  
  private generatePatternName(conditions: PatternCondition[]): string {
    const keyConditions = conditions
      .filter(c => c.weight > 0.7)
      .slice(0, 3)
      .map(c => this.conditionToShortName(c));
    
    if (keyConditions.length === 0) {
      return 'Multi-Signal Setup';
    }
    
    return keyConditions.join(' + ');
  }
  
  private conditionToShortName(condition: PatternCondition): string {
    switch (condition.metric) {
      case 'rsi': return condition.value < 50 ? 'Oversold RSI' : 'Overbought RSI';
      case 'volume_spike': return 'Volume Spike';
      case 'unusual_options_activity': return 'Options Flow';
      case 'insider_activity': return 'Insider Buying';
      case 'smart_money': return 'Smart Money';
      case 'sentiment': return condition.value > 0 ? 'Positive News' : 'Negative News';
      case 'pattern_type': return condition.description.split(' ')[0];
      case 'iv_rank_low': return 'Low IV';
      case 'iv_rank_high': return 'High IV';
      default: return condition.metric;
    }
  }
  
  private generatePatternDescription(data: TradeAnalysisData, conditions: PatternCondition[]): string {
    const direction = data.direction === 'long' ? 'bullish' : 'bearish';
    const returnDesc = Math.abs(data.pnlPct) > 10 ? 'strong' : 'moderate';
    const timeframe = data.holdDays <= 2 ? 'short-term' : data.holdDays <= 7 ? 'swing' : 'position';
    
    const keyCondition = conditions
      .sort((a, b) => b.weight - a.weight)[0];
    
    return `${returnDesc} ${direction} ${timeframe} setup triggered by ${keyCondition?.description.toLowerCase() || 'multiple signals'}. Pattern delivered ${data.pnlPct.toFixed(1)}% return over ${data.holdDays} days.`;
  }
  
  private async backtestPattern(conditions: PatternCondition[], symbol: string): Promise<PatternStatistics> {
    // Mock backtest results for now
    // In real implementation, this would scan historical data for matching conditions
    
    const mockStats: PatternStatistics = {
      historicalFrequency: 8 + Math.random() * 16, // 8-24 times per year
      historicalWinRate: 0.55 + Math.random() * 0.25, // 55-80% win rate
      averageReturn: 3 + Math.random() * 12, // 3-15% average return
      averageLoss: -2 - Math.random() * 6, // -2 to -8% average loss
      expectedValue: 0, // Will be calculated
      sampleSize: Math.floor(20 + Math.random() * 80), // 20-100 samples
      averageHoldTime: 2 + Math.random() * 8, // 2-10 days
      bestPerformingTimeframe: Math.random() > 0.5 ? 'swing' : 'day',
    };
    
    // Calculate expected value
    mockStats.expectedValue = (mockStats.historicalWinRate * mockStats.averageReturn) + 
                             ((1 - mockStats.historicalWinRate) * mockStats.averageLoss);
    
    return mockStats;
  }
  
  private identifyRiskFactors(data: TradeAnalysisData, stats: PatternStatistics): string[] {
    const risks = [];
    
    if (data.macroContext.vixLevel > 25) {
      risks.push('High volatility environment increases risk');
    }
    
    if (data.optionsContext && data.optionsContext.entryIvRank > 80) {
      risks.push('High IV rank - volatility crush risk');
    }
    
    if (stats.averageLoss < -8) {
      risks.push('Pattern has high downside when wrong');
    }
    
    if (data.newsContext.keyEvents.includes('Earnings announcement')) {
      risks.push('Earnings volatility risk');
    }
    
    if (stats.sampleSize < 30) {
      risks.push('Limited historical data - pattern may not be robust');
    }
    
    return risks;
  }
  
  private identifyBestTimeframes(stats: PatternStatistics): string[] {
    const timeframes = [];
    
    if (stats.averageHoldTime <= 2) {
      timeframes.push('Day trade (1-2 days)');
    } else if (stats.averageHoldTime <= 7) {
      timeframes.push('Swing trade (3-7 days)');
    } else {
      timeframes.push('Position trade (1-4 weeks)');
    }
    
    if (stats.bestPerformingTimeframe !== 'day') {
      timeframes.push(`Best performance as ${stats.bestPerformingTimeframe} trade`);
    }
    
    return timeframes;
  }
  
  private identifyMarketConditions(data: TradeAnalysisData): string[] {
    const conditions = [];
    
    if (data.macroContext.vixLevel < 20) {
      conditions.push('Low volatility environment');
    }
    
    if (data.macroContext.marketTrend === 'bull') {
      conditions.push('Bull market conditions');
    } else if (data.macroContext.marketTrend === 'bear') {
      conditions.push('Bear market conditions');
    }
    
    if (data.macroContext.rateEnvironment === 'falling') {
      conditions.push('Falling interest rate environment');
    } else if (data.macroContext.rateEnvironment === 'rising') {
      conditions.push('Rising interest rate environment');
    }
    
    if (data.macroContext.sectorPerformance > 5) {
      conditions.push('Strong sector performance');
    } else if (data.macroContext.sectorPerformance < -5) {
      conditions.push('Weak sector performance');
    }
    
    return conditions;
  }
  
  private async savePattern(pattern: TradePattern): Promise<void> {
    const db = getDb();
    
    db.prepare(`
      INSERT INTO trade_patterns 
      (id, name, description, trade_id, conditions, statistics, risk_factors, 
       best_timeframes, market_conditions, used_count, live_win_rate, live_trade_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      pattern.id,
      pattern.name,
      pattern.description,
      pattern.tradeId,
      JSON.stringify(pattern.conditions),
      JSON.stringify(pattern.statistics),
      JSON.stringify(pattern.riskFactors),
      JSON.stringify(pattern.bestTimeframes),
      JSON.stringify(pattern.marketConditions),
      pattern.usedCount,
      pattern.liveWinRate,
      pattern.liveTradeCount,
      pattern.createdAt
    );
  }
  
  private async saveTradeAnalysisData(data: TradeAnalysisData): Promise<void> {
    const db = getDb();
    
    db.prepare(`
      INSERT OR REPLACE INTO trade_analysis_data
      (id, trade_id, symbol, entry_date, exit_date, price_action, volume_profile, 
       technicals, options_context, holder_context, news_context, macro_context, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      v4(),
      data.tradeId,
      data.symbol,
      data.entryDate,
      data.exitDate,
      JSON.stringify(data.priceAction),
      JSON.stringify(data.volumeProfile),
      JSON.stringify(data.technicals),
      data.optionsContext ? JSON.stringify(data.optionsContext) : null,
      data.holderContext ? JSON.stringify(data.holderContext) : null,
      JSON.stringify(data.newsContext),
      JSON.stringify(data.macroContext),
      new Date().toISOString()
    );
  }
  
  private async markTradeAsLearned(tradeId: string, patternId: string): Promise<void> {
    const db = getDb();
    
    db.prepare(`
      UPDATE trade_journal 
      SET pattern_id = ?, learned_at = ?, updated_at = ?
      WHERE id = ?
    `).run(patternId, new Date().toISOString(), new Date().toISOString(), tradeId);
  }
  
  async getPatterns(): Promise<TradePattern[]> {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM trade_patterns ORDER BY created_at DESC').all() as any[];
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      tradeId: row.trade_id,
      conditions: JSON.parse(row.conditions || '[]'),
      statistics: JSON.parse(row.statistics || '{}'),
      riskFactors: JSON.parse(row.risk_factors || '[]'),
      bestTimeframes: JSON.parse(row.best_timeframes || '[]'),
      marketConditions: JSON.parse(row.market_conditions || '[]'),
      createdAt: row.created_at,
      usedCount: row.used_count || 0,
      liveWinRate: row.live_win_rate,
      liveTradeCount: row.live_trade_count || 0,
    }));
  }
  
  async getPattern(id: string): Promise<TradePattern | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM trade_patterns WHERE id = ?').get(id) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      tradeId: row.trade_id,
      conditions: JSON.parse(row.conditions || '[]'),
      statistics: JSON.parse(row.statistics || '{}'),
      riskFactors: JSON.parse(row.risk_factors || '[]'),
      bestTimeframes: JSON.parse(row.best_timeframes || '[]'),
      marketConditions: JSON.parse(row.market_conditions || '[]'),
      createdAt: row.created_at,
      usedCount: row.used_count || 0,
      liveWinRate: row.live_win_rate,
      liveTradeCount: row.live_trade_count || 0,
    };
  }
}

export const aiLearnService = new AILearnService();