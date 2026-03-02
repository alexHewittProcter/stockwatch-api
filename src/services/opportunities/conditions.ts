import { getDb } from '../../db/schema';
import { Condition, ConditionRule, BacktestResult } from '../../types/opportunity';
import { signalManager } from './signals';
import { v4 } from './uuid';

/**
 * Advanced Condition Builder and Evaluator
 * 
 * Supports complex multi-rule conditions with backtesting capabilities.
 */

export class ConditionService {
  
  async createCondition(params: {
    name: string;
    description?: string;
    rules: ConditionRule[];
    logic: 'AND' | 'OR';
    symbols?: string[];
    notifyOnTrigger?: boolean;
  }): Promise<Condition> {
    const db = getDb();
    const id = v4();
    const now = new Date().toISOString();

    const condition: Condition = {
      id,
      name: params.name,
      description: params.description || '',
      rules: params.rules,
      logic: params.logic,
      symbols: params.symbols,
      enabled: true,
      notifyOnTrigger: params.notifyOnTrigger !== false,
      createdAt: now,
      triggerCount: 0,
    };

    db.prepare(`
      INSERT INTO opportunity_conditions 
      (id, name, description, rules, logic, symbols, enabled, notify_on_trigger, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      condition.name,
      condition.description,
      JSON.stringify(condition.rules),
      condition.logic,
      condition.symbols ? JSON.stringify(condition.symbols) : null,
      condition.enabled ? 1 : 0,
      condition.notifyOnTrigger ? 1 : 0,
      condition.createdAt,
    );

    console.log(`[Conditions] Created condition: ${condition.name}`);
    return condition;
  }

  async getConditions(): Promise<Condition[]> {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM opportunity_conditions ORDER BY created_at DESC').all() as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      rules: JSON.parse(row.rules || '[]'),
      logic: row.logic,
      symbols: row.symbols ? JSON.parse(row.symbols) : undefined,
      enabled: !!row.enabled,
      notifyOnTrigger: !!row.notify_on_trigger,
      createdAt: row.created_at,
      lastTriggered: row.last_triggered,
      triggerCount: row.trigger_count || 0,
      lastEvaluated: row.last_evaluated,
    }));
  }

  async getCondition(id: string): Promise<Condition | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM opportunity_conditions WHERE id = ?').get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      rules: JSON.parse(row.rules || '[]'),
      logic: row.logic,
      symbols: row.symbols ? JSON.parse(row.symbols) : undefined,
      enabled: !!row.enabled,
      notifyOnTrigger: !!row.notify_on_trigger,
      createdAt: row.created_at,
      lastTriggered: row.last_triggered,
      triggerCount: row.trigger_count || 0,
      lastEvaluated: row.last_evaluated,
    };
  }

  async updateCondition(id: string, updates: Partial<Condition>): Promise<boolean> {
    const db = getDb();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }

    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }

    if (updates.rules !== undefined) {
      fields.push('rules = ?');
      values.push(JSON.stringify(updates.rules));
    }

    if (updates.logic !== undefined) {
      fields.push('logic = ?');
      values.push(updates.logic);
    }

    if (updates.symbols !== undefined) {
      fields.push('symbols = ?');
      values.push(updates.symbols ? JSON.stringify(updates.symbols) : null);
    }

    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
    }

    if (updates.notifyOnTrigger !== undefined) {
      fields.push('notify_on_trigger = ?');
      values.push(updates.notifyOnTrigger ? 1 : 0);
    }

    if (fields.length === 0) return false;

    values.push(id);
    const query = `UPDATE opportunity_conditions SET ${fields.join(', ')} WHERE id = ?`;
    const result = db.prepare(query).run(...values);

    return result.changes > 0;
  }

  async deleteCondition(id: string): Promise<boolean> {
    const db = getDb();
    const result = db.prepare('DELETE FROM opportunity_conditions WHERE id = ?').run(id);
    return result.changes > 0;
  }

  async evaluateConditions(): Promise<Array<{ condition: Condition; triggered: boolean; symbols: string[] }>> {
    const conditions = await this.getConditions();
    const enabledConditions = conditions.filter(c => c.enabled);
    
    const results: Array<{ condition: Condition; triggered: boolean; symbols: string[] }> = [];
    
    for (const condition of enabledConditions) {
      try {
        const evaluation = await this.evaluateCondition(condition);
        results.push(evaluation);
        
        if (evaluation.triggered && evaluation.symbols.length > 0) {
          await this.recordTrigger(condition, evaluation.symbols);
        }
        
        // Update last evaluated
        await this.updateLastEvaluated(condition.id);
        
      } catch (error) {
        console.error(`[Conditions] Error evaluating condition ${condition.name}:`, error);
      }
    }
    
    return results;
  }

  private async evaluateCondition(condition: Condition): Promise<{ condition: Condition; triggered: boolean; symbols: string[] }> {
    const triggeredSymbols: string[] = [];
    
    // Get symbols to evaluate
    const symbolsToCheck = condition.symbols || await this.getActiveSymbols();
    
    for (const symbol of symbolsToCheck) {
      const symbolTriggered = await this.evaluateConditionForSymbol(condition, symbol);
      if (symbolTriggered) {
        triggeredSymbols.push(symbol);
      }
    }
    
    return {
      condition,
      triggered: triggeredSymbols.length > 0,
      symbols: triggeredSymbols,
    };
  }

  private async evaluateConditionForSymbol(condition: Condition, symbol: string): Promise<boolean> {
    const ruleResults: boolean[] = [];
    
    for (const rule of condition.rules) {
      const ruleResult = await this.evaluateRule(rule, symbol);
      ruleResults.push(ruleResult);
    }
    
    // Apply logic (AND/OR)
    if (condition.logic === 'AND') {
      return ruleResults.every(result => result);
    } else {
      return ruleResults.some(result => result);
    }
  }

  private async evaluateRule(rule: ConditionRule, symbol: string): Promise<boolean> {
    const currentValue = await this.getMetricValue(rule.metric, symbol, rule.timeframe);
    if (currentValue === null) return false;
    
    switch (rule.comparator) {
      case 'gt':
        return currentValue > rule.value;
      case 'lt':
        return currentValue < rule.value;
      case 'gte':
        return currentValue >= rule.value;
      case 'lte':
        return currentValue <= rule.value;
      case 'eq':
        return Math.abs(currentValue - rule.value) < 0.01; // Float equality
      case 'pct_change_gt':
        return await this.checkPercentageChange(rule.metric, symbol, rule.timeframe!, rule.value, '>');
      case 'pct_change_lt':
        return await this.checkPercentageChange(rule.metric, symbol, rule.timeframe!, rule.value, '<');
      case 'crosses_above':
        return await this.checkCrossing(rule.metric, symbol, rule.value, 'above');
      case 'crosses_below':
        return await this.checkCrossing(rule.metric, symbol, rule.value, 'below');
      default:
        console.warn(`[Conditions] Unknown comparator: ${rule.comparator}`);
        return false;
    }
  }

  private async getMetricValue(metric: string, symbol: string, timeframe?: string): Promise<number | null> {
    const db = getDb();
    
    switch (metric) {
      case 'price':
        // Get current price from cached quotes
        const priceRow = db.prepare('SELECT data FROM cached_quotes WHERE symbol = ?').get(symbol) as any;
        if (!priceRow) return null;
        const priceData = JSON.parse(priceRow.data);
        return priceData.c || null; // Close price
        
      case 'volume':
        const volumeRow = db.prepare('SELECT data FROM cached_quotes WHERE symbol = ?').get(symbol) as any;
        if (!volumeRow) return null;
        const volumeData = JSON.parse(volumeRow.data);
        return volumeData.v || null; // Volume
        
      case 'iv':
        // Get implied volatility from options data (mock for now)
        return 25 + Math.random() * 50; // 25-75% IV range
        
      case 'pcr':
        // Get put/call ratio from PCR history
        const pcrRow = db.prepare(`
          SELECT ratio FROM pcr_history 
          WHERE symbol = ? AND date = date('now') 
          ORDER BY created_at DESC LIMIT 1
        `).get(symbol) as any;
        return pcrRow?.ratio || null;
        
      case 'insider_buying':
        // Sum of insider purchases in last 30 days
        const insiderRow = db.prepare(`
          SELECT SUM(value) as total FROM insider_transactions
          WHERE symbol = ? AND transaction_type = 'Purchase'
            AND transaction_date >= date('now', '-30 days')
        `).get(symbol) as any;
        return insiderRow?.total || 0;
        
      case 'social_mentions':
        // Social mentions in timeframe (hours)
        const hours = this.parseTimeframe(timeframe || '1d');
        const mentionsRow = db.prepare(`
          SELECT SUM(mentions) as total FROM social_mentions
          WHERE ticker = ? AND hour_bucket >= datetime('now', '-${hours} hours')
        `).get(symbol) as any;
        return mentionsRow?.total || 0;
        
      case 'rsi':
        // Mock RSI calculation - in real implementation, calculate from price data
        return 30 + Math.random() * 40; // 30-70 RSI range
        
      default:
        console.warn(`[Conditions] Unknown metric: ${metric}`);
        return null;
    }
  }

  private async checkPercentageChange(metric: string, symbol: string, timeframe: string, threshold: number, operator: '>' | '<'): Promise<boolean> {
    const currentValue = await this.getMetricValue(metric, symbol);
    if (currentValue === null) return false;
    
    const historicalValue = await this.getHistoricalMetricValue(metric, symbol, timeframe);
    if (historicalValue === null) return false;
    
    const changePercent = ((currentValue - historicalValue) / historicalValue) * 100;
    
    return operator === '>' ? changePercent > threshold : changePercent < threshold;
  }

  private async checkCrossing(metric: string, symbol: string, threshold: number, direction: 'above' | 'below'): Promise<boolean> {
    const currentValue = await this.getMetricValue(metric, symbol);
    if (currentValue === null) return false;
    
    const previousValue = await this.getHistoricalMetricValue(metric, symbol, '1d');
    if (previousValue === null) return false;
    
    if (direction === 'above') {
      return previousValue <= threshold && currentValue > threshold;
    } else {
      return previousValue >= threshold && currentValue < threshold;
    }
  }

  private async getHistoricalMetricValue(metric: string, symbol: string, timeframe: string): Promise<number | null> {
    // Mock implementation - in real system, would fetch historical data
    const current = await this.getMetricValue(metric, symbol);
    if (current === null) return null;
    
    // Return slightly different value to simulate historical data
    const changeRange = current * 0.1; // +/- 10%
    return current + (Math.random() - 0.5) * changeRange;
  }

  private parseTimeframe(timeframe: string): number {
    const match = timeframe.match(/^(\d+)([hdwm])$/);
    if (!match) return 24; // Default to 24 hours
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 'h': return value;
      case 'd': return value * 24;
      case 'w': return value * 24 * 7;
      case 'm': return value * 24 * 30; // Approximate
      default: return 24;
    }
  }

  private async recordTrigger(condition: Condition, symbols: string[]): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();
    
    db.prepare(`
      UPDATE opportunity_conditions 
      SET last_triggered = ?, trigger_count = trigger_count + 1
      WHERE id = ?
    `).run(now, condition.id);
    
    console.log(`[Conditions] Condition "${condition.name}" triggered for symbols: ${symbols.join(', ')}`);
  }

  private async updateLastEvaluated(conditionId: string): Promise<void> {
    const db = getDb();
    db.prepare(`
      UPDATE opportunity_conditions 
      SET last_evaluated = ?
      WHERE id = ?
    `).run(new Date().toISOString(), conditionId);
  }

  private async getActiveSymbols(): Promise<string[]> {
    const db = getDb();
    const rows = db.prepare('SELECT DISTINCT symbol FROM cached_quotes LIMIT 100').all() as { symbol: string }[];
    return rows.map(r => r.symbol);
  }

  async backtestCondition(condition: Condition, fromDate: string, toDate: string): Promise<BacktestResult> {
    console.log(`[Conditions] Backtesting condition: ${condition.name} from ${fromDate} to ${toDate}`);
    
    // Mock backtest implementation
    // In real system, this would evaluate the condition against historical data
    const mockTriggers = [];
    const symbols = condition.symbols || ['AAPL', 'GOOGL', 'MSFT'];
    
    // Generate mock triggers
    const startDate = new Date(fromDate);
    const endDate = new Date(toDate);
    const daysDiff = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Generate 1-3 triggers per symbol over the period
    for (const symbol of symbols) {
      const triggerCount = Math.floor(Math.random() * 3) + 1;
      
      for (let i = 0; i < triggerCount; i++) {
        const triggerDay = Math.floor(Math.random() * daysDiff);
        const triggerDate = new Date(startDate.getTime() + triggerDay * 24 * 60 * 60 * 1000);
        const price = 100 + Math.random() * 200;
        
        // Mock outcome (50% win rate)
        const isWinner = Math.random() > 0.5;
        const holdDays = Math.floor(Math.random() * 30) + 1;
        const exitPrice = isWinner ? price * (1 + Math.random() * 0.2) : price * (1 - Math.random() * 0.15);
        const pnl = exitPrice - price;
        const pnlPct = (pnl / price) * 100;
        
        mockTriggers.push({
          symbol,
          triggeredAt: triggerDate.toISOString(),
          price,
          signals: condition.rules.map(r => r.metric),
          outcome: {
            exitPrice,
            pnl,
            pnlPct,
            duration: holdDays,
          },
        });
      }
    }
    
    // Calculate summary statistics
    const winners = mockTriggers.filter(t => t.outcome && t.outcome.pnl > 0);
    const losers = mockTriggers.filter(t => t.outcome && t.outcome.pnl < 0);
    const totalPnl = mockTriggers.reduce((sum, t) => sum + (t.outcome?.pnl || 0), 0);
    const totalPnlPct = mockTriggers.reduce((sum, t) => sum + (t.outcome?.pnlPct || 0), 0);
    const avgHoldTime = mockTriggers.reduce((sum, t) => sum + (t.outcome?.duration || 0), 0) / mockTriggers.length;
    
    const bestTrade = Math.max(...mockTriggers.map(t => t.outcome?.pnl || 0));
    const worstTrade = Math.min(...mockTriggers.map(t => t.outcome?.pnl || 0));
    
    const result: BacktestResult = {
      condition,
      period: { from: fromDate, to: toDate },
      triggers: mockTriggers,
      summary: {
        totalTriggers: mockTriggers.length,
        winners: winners.length,
        losers: losers.length,
        winRate: mockTriggers.length > 0 ? (winners.length / mockTriggers.length) * 100 : 0,
        avgPnl: mockTriggers.length > 0 ? totalPnl / mockTriggers.length : 0,
        avgPnlPct: mockTriggers.length > 0 ? totalPnlPct / mockTriggers.length : 0,
        bestTrade,
        worstTrade,
        avgHoldTime,
      },
    };
    
    // Save backtest to database
    await this.saveBacktest(result);
    
    return result;
  }

  private async saveBacktest(result: BacktestResult): Promise<void> {
    const db = getDb();
    
    db.prepare(`
      INSERT INTO opportunity_backtests 
      (id, condition_id, period_from, period_to, triggers, summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      v4(),
      result.condition.id,
      result.period.from,
      result.period.to,
      JSON.stringify(result.triggers),
      JSON.stringify(result.summary),
      new Date().toISOString(),
    );
  }

  async getBacktests(conditionId?: string): Promise<BacktestResult[]> {
    const db = getDb();
    
    let query = `
      SELECT b.*, c.* FROM opportunity_backtests b
      JOIN opportunity_conditions c ON b.condition_id = c.id
    `;
    const params: any[] = [];
    
    if (conditionId) {
      query += ' WHERE b.condition_id = ?';
      params.push(conditionId);
    }
    
    query += ' ORDER BY b.created_at DESC';
    
    const rows = db.prepare(query).all(...params) as any[];
    
    return rows.map(row => ({
      condition: {
        id: row.condition_id,
        name: row.name,
        description: row.description,
        rules: JSON.parse(row.rules || '[]'),
        logic: row.logic,
        symbols: row.symbols ? JSON.parse(row.symbols) : undefined,
        enabled: !!row.enabled,
        notifyOnTrigger: !!row.notify_on_trigger,
        createdAt: row.created_at,
        lastTriggered: row.last_triggered,
        triggerCount: row.trigger_count || 0,
        lastEvaluated: row.last_evaluated,
      },
      period: {
        from: row.period_from,
        to: row.period_to,
      },
      triggers: JSON.parse(row.triggers || '[]'),
      summary: JSON.parse(row.summary || '{}'),
    }));
  }
}

export const conditionService = new ConditionService();

// Legacy exports for compatibility
export const createCondition = (params: any) => conditionService.createCondition(params);
export const getConditions = () => conditionService.getConditions();
export const getCondition = (id: string) => conditionService.getCondition(id);
export const deleteCondition = (id: string) => conditionService.deleteCondition(id);
export const updateConditionEnabled = (id: string, enabled: boolean) => 
  conditionService.updateCondition(id, { enabled });