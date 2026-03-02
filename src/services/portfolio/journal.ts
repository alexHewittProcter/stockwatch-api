import { getDb } from '../../db/schema';
import { TradeJournalEntry } from '../../types/ai';
import { v4 } from '../opportunities/uuid';

/**
 * Enhanced Trade Journal Service
 * 
 * Manages trade journal entries with context capture and AI analysis integration.
 */

export class TradeJournalService {
  
  /**
   * Create a new trade journal entry
   */
  async createTrade(trade: {
    symbol: string;
    direction: 'long' | 'short';
    entryDate: string;
    entryPrice: number;
    quantity: number;
    thesis: string;
    opportunityId?: string;
    reportId?: string;
    signals?: string[];
    notes?: string;
    tags?: string[];
  }): Promise<TradeJournalEntry> {
    const db = getDb();
    
    // Capture entry context
    const entryContext = await this.captureEntryContext(trade.symbol, trade.opportunityId, trade.reportId);
    entryContext.thesis = trade.thesis;
    entryContext.signals = trade.signals || [];
    
    const journalEntry: TradeJournalEntry = {
      id: v4(),
      symbol: trade.symbol,
      direction: trade.direction,
      entryDate: trade.entryDate,
      entryPrice: trade.entryPrice,
      quantity: trade.quantity,
      status: 'open',
      entryContext,
      notes: trade.notes || '',
      tags: trade.tags || [],
      createdAt: new Date().toISOString(),
    };
    
    await this.saveTrade(journalEntry);
    
    console.log(`[Journal] Created trade entry: ${trade.symbol} ${trade.direction} at $${trade.entryPrice}`);
    return journalEntry;
  }
  
  /**
   * Close a trade and calculate P&L
   */
  async closeTrade(id: string, exitPrice: number, exitDate?: string): Promise<TradeJournalEntry> {
    const db = getDb();
    
    const trade = await this.getTrade(id);
    if (!trade) {
      throw new Error('Trade not found');
    }
    
    if (trade.status !== 'open') {
      throw new Error('Trade is already closed');
    }
    
    const exit = exitDate || new Date().toISOString();
    const pnl = trade.direction === 'long' 
      ? (exitPrice - trade.entryPrice) * trade.quantity
      : (trade.entryPrice - exitPrice) * trade.quantity;
    
    const pnlPct = ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
    const adjustedPnlPct = trade.direction === 'long' ? pnlPct : -pnlPct;
    
    const status = adjustedPnlPct > 0 ? 'closed_win' : 'closed_loss';
    
    const result = db.prepare(`
      UPDATE trade_journal 
      SET exit_date = ?, exit_price = ?, pnl = ?, pnl_pct = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(exit, exitPrice, pnl, adjustedPnlPct, status, new Date().toISOString(), id);
    
    if (result.changes === 0) {
      throw new Error('Failed to update trade');
    }
    
    console.log(`[Journal] Closed trade: ${trade.symbol} ${status} P&L: ${adjustedPnlPct.toFixed(2)}%`);
    
    return await this.getTrade(id) as TradeJournalEntry;
  }
  
  /**
   * Get all trades with optional filtering
   */
  async getTrades(filters: {
    status?: string;
    symbol?: string;
    direction?: string;
    fromDate?: string;
    toDate?: string;
    hasPattern?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<TradeJournalEntry[]> {
    const db = getDb();
    
    let query = 'SELECT * FROM trade_journal WHERE 1=1';
    const params: any[] = [];
    
    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    
    if (filters.symbol) {
      query += ' AND symbol = ?';
      params.push(filters.symbol);
    }
    
    if (filters.direction) {
      query += ' AND direction = ?';
      params.push(filters.direction);
    }
    
    if (filters.fromDate) {
      query += ' AND entry_date >= ?';
      params.push(filters.fromDate);
    }
    
    if (filters.toDate) {
      query += ' AND entry_date <= ?';
      params.push(filters.toDate);
    }
    
    if (filters.hasPattern !== undefined) {
      query += filters.hasPattern ? ' AND pattern_id IS NOT NULL' : ' AND pattern_id IS NULL';
    }
    
    query += ' ORDER BY entry_date DESC';
    
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
      
      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(filters.offset);
      }
    }
    
    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(this.mapRowToTrade);
  }
  
  /**
   * Get a specific trade by ID
   */
  async getTrade(id: string): Promise<TradeJournalEntry | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM trade_journal WHERE id = ?').get(id) as any;
    
    if (!row) return null;
    
    return this.mapRowToTrade(row);
  }
  
  /**
   * Update trade notes and tags
   */
  async updateTrade(id: string, updates: {
    notes?: string;
    tags?: string[];
  }): Promise<boolean> {
    const db = getDb();
    
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes);
    }
    
    if (updates.tags !== undefined) {
      fields.push('tags = ?');
      values.push(JSON.stringify(updates.tags));
    }
    
    if (fields.length === 0) return false;
    
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);
    
    const query = `UPDATE trade_journal SET ${fields.join(', ')} WHERE id = ?`;
    const result = db.prepare(query).run(...values);
    
    return result.changes > 0;
  }
  
  /**
   * Get trade statistics
   */
  async getTradeStats(filters: {
    fromDate?: string;
    toDate?: string;
    symbol?: string;
    direction?: string;
  } = {}): Promise<{
    totalTrades: number;
    openTrades: number;
    closedTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnl: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    bestTrade: number;
    worstTrade: number;
    avgHoldTime: number;
    byDirection: {
      long: { count: number; winRate: number; avgReturn: number };
      short: { count: number; winRate: number; avgReturn: number };
    };
  }> {
    const trades = await this.getTrades(filters);
    const closedTrades = trades.filter(t => t.status !== 'open');
    const winningTrades = trades.filter(t => t.status === 'closed_win');
    const losingTrades = trades.filter(t => t.status === 'closed_loss');
    
    const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;
    
    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const avgWin = winningTrades.length > 0 
      ? winningTrades.reduce((sum, t) => sum + (t.pnlPct || 0), 0) / winningTrades.length 
      : 0;
    const avgLoss = losingTrades.length > 0 
      ? losingTrades.reduce((sum, t) => sum + Math.abs(t.pnlPct || 0), 0) / losingTrades.length 
      : 0;
    
    const totalWins = winningTrades.reduce((sum, t) => sum + Math.abs(t.pnlPct || 0), 0);
    const totalLosses = losingTrades.reduce((sum, t) => sum + Math.abs(t.pnlPct || 0), 0);
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0;
    
    const pnlValues = closedTrades.map(t => t.pnlPct || 0);
    const bestTrade = pnlValues.length > 0 ? Math.max(...pnlValues) : 0;
    const worstTrade = pnlValues.length > 0 ? Math.min(...pnlValues) : 0;
    
    // Calculate average hold time
    const holdTimes = closedTrades
      .filter(t => t.exitDate)
      .map(t => {
        const entry = new Date(t.entryDate).getTime();
        const exit = new Date(t.exitDate!).getTime();
        return (exit - entry) / (1000 * 60 * 60 * 24); // days
      });
    const avgHoldTime = holdTimes.length > 0 
      ? holdTimes.reduce((sum, t) => sum + t, 0) / holdTimes.length 
      : 0;
    
    // By direction stats
    const longTrades = closedTrades.filter(t => t.direction === 'long');
    const shortTrades = closedTrades.filter(t => t.direction === 'short');
    
    const longWins = longTrades.filter(t => t.status === 'closed_win');
    const shortWins = shortTrades.filter(t => t.status === 'closed_win');
    
    const longWinRate = longTrades.length > 0 ? (longWins.length / longTrades.length) * 100 : 0;
    const shortWinRate = shortTrades.length > 0 ? (shortWins.length / shortTrades.length) * 100 : 0;
    
    const longAvgReturn = longTrades.length > 0 
      ? longTrades.reduce((sum, t) => sum + (t.pnlPct || 0), 0) / longTrades.length 
      : 0;
    const shortAvgReturn = shortTrades.length > 0 
      ? shortTrades.reduce((sum, t) => sum + (t.pnlPct || 0), 0) / shortTrades.length 
      : 0;
    
    return {
      totalTrades: trades.length,
      openTrades: trades.filter(t => t.status === 'open').length,
      closedTrades: closedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      totalPnl,
      avgWin,
      avgLoss,
      profitFactor,
      bestTrade,
      worstTrade,
      avgHoldTime,
      byDirection: {
        long: { count: longTrades.length, winRate: longWinRate, avgReturn: longAvgReturn },
        short: { count: shortTrades.length, winRate: shortWinRate, avgReturn: shortAvgReturn },
      },
    };
  }
  
  private async captureEntryContext(symbol: string, opportunityId?: string, reportId?: string): Promise<any> {
    const db = getDb();
    
    const context: any = {
      thesis: '', // Will be filled by caller
      opportunityId,
      reportId,
      signals: [], // Will be filled by caller
    };
    
    // Get current market conditions
    try {
      // Mock current market data capture
      context.marketCondition = `VIX: ${(15 + Math.random() * 20).toFixed(1)} | Market: ${Math.random() > 0.5 ? 'Bull' : 'Sideways'}`;
      
      // Get recent options data
      const ivRow = db.prepare(`
        SELECT iv FROM iv_history 
        WHERE symbol = ? 
        ORDER BY date DESC 
        LIMIT 1
      `).get(symbol) as any;
      
      if (ivRow) {
        context.ivRank = Math.floor(25 + Math.random() * 50); // Mock IV rank
      }
      
      // Get recent RSI (mock)
      context.rsi = Math.floor(30 + Math.random() * 40);
      
      // Get social sentiment (mock)
      context.socialSentiment = -0.5 + Math.random(); // -0.5 to 0.5
      
      // Get most relevant news headline
      const newsRow = db.prepare(`
        SELECT title FROM news_articles
        WHERE json_extract(tickers, '$') LIKE '%${symbol}%'
          AND published_at >= datetime('now', '-7 days')
        ORDER BY published_at DESC
        LIMIT 1
      `).get() as any;
      
      if (newsRow) {
        context.newsHeadline = newsRow.title;
      }
      
    } catch (error) {
      console.warn('[Journal] Error capturing entry context:', error);
    }
    
    return context;
  }
  
  private async saveTrade(trade: TradeJournalEntry): Promise<void> {
    const db = getDb();
    
    db.prepare(`
      INSERT INTO trade_journal
      (id, symbol, direction, entry_date, entry_price, exit_date, exit_price, 
       quantity, pnl, pnl_pct, status, entry_context, notes, tags, pattern_id, 
       learned_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      trade.id,
      trade.symbol,
      trade.direction,
      trade.entryDate,
      trade.entryPrice,
      trade.exitDate,
      trade.exitPrice,
      trade.quantity,
      trade.pnl,
      trade.pnlPct,
      trade.status,
      JSON.stringify(trade.entryContext),
      trade.notes,
      JSON.stringify(trade.tags),
      trade.patternId,
      trade.learnedAt,
      trade.createdAt,
      trade.updatedAt
    );
  }
  
  private mapRowToTrade(row: any): TradeJournalEntry {
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
}

export const tradeJournalService = new TradeJournalService();