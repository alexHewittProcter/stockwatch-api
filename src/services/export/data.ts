import { getDb } from '../../db/schema';
import { Response } from 'express';

/**
 * Data Export Service
 * 
 * Provides data export functionality for all major StockWatch data types.
 */

export class DataExportService {
  
  async exportDashboards(): Promise<any[]> {
    const db = getDb();
    
    try {
      const dashboards = db.prepare('SELECT * FROM dashboards ORDER BY created_at ASC').all() as any[];
      
      return dashboards.map(dashboard => ({
        id: dashboard.id,
        name: dashboard.name,
        description: dashboard.description,
        widgets: JSON.parse(dashboard.widgets || '[]'),
        layout: JSON.parse(dashboard.layout || '{}'),
        isDefault: !!dashboard.is_default,
        createdAt: dashboard.created_at,
        updatedAt: dashboard.updated_at,
      }));
    } catch (error) {
      console.error('[Export] Dashboard export error:', error);
      throw new Error('Failed to export dashboards');
    }
  }
  
  async exportTradeJournal(): Promise<any[]> {
    const db = getDb();
    
    try {
      const trades = db.prepare(`
        SELECT 
          t.*,
          p.name as pattern_name
        FROM trade_journal t
        LEFT JOIN trade_patterns p ON t.pattern_id = p.id
        ORDER BY t.entry_date DESC
      `).all() as any[];
      
      return trades.map(trade => ({
        id: trade.id,
        symbol: trade.symbol,
        direction: trade.direction,
        entryDate: trade.entry_date,
        entryPrice: trade.entry_price,
        exitDate: trade.exit_date,
        exitPrice: trade.exit_price,
        quantity: trade.quantity,
        pnl: trade.pnl,
        pnlPercent: trade.pnl_pct,
        status: trade.status,
        thesis: JSON.parse(trade.entry_context || '{}').thesis || '',
        notes: trade.notes,
        tags: JSON.parse(trade.tags || '[]').join(', '),
        patternName: trade.pattern_name,
        learnedAt: trade.learned_at,
        createdAt: trade.created_at,
      }));
    } catch (error) {
      console.error('[Export] Trade journal export error:', error);
      throw new Error('Failed to export trade journal');
    }
  }
  
  async exportReports(): Promise<any[]> {
    const db = getDb();
    
    try {
      const reports = db.prepare('SELECT * FROM research_reports ORDER BY created_at DESC').all() as any[];
      
      return reports.map(report => ({
        id: report.id,
        symbol: report.symbol,
        title: report.title,
        opportunityId: report.opportunity_id,
        executiveSummary: report.executive_summary,
        thesis: JSON.parse(report.thesis || '{}'),
        priceAnalysis: JSON.parse(report.price_analysis || '{}'),
        holderAnalysis: report.holder_analysis ? JSON.parse(report.holder_analysis) : null,
        optionsAnalysis: report.options_analysis ? JSON.parse(report.options_analysis) : null,
        newsAnalysis: JSON.parse(report.news_analysis || '{}'),
        riskAnalysis: JSON.parse(report.risk_analysis || '{}'),
        recommendation: JSON.parse(report.recommendation || '{}'),
        historicalComparison: report.historical_comparison ? JSON.parse(report.historical_comparison) : null,
        tags: JSON.parse(report.tags || '[]'),
        status: report.status,
        outcome: report.outcome,
        outcomeNotes: report.outcome_notes,
        createdAt: report.created_at,
        updatedAt: report.updated_at,
      }));
    } catch (error) {
      console.error('[Export] Reports export error:', error);
      throw new Error('Failed to export reports');
    }
  }
  
  async exportWatchlists(): Promise<any[]> {
    const db = getDb();
    
    try {
      // Get symbols from various sources
      const quotedSymbols = db.prepare('SELECT DISTINCT symbol FROM cached_quotes ORDER BY symbol').all() as any[];
      const alertSymbols = db.prepare('SELECT DISTINCT symbol FROM price_alerts ORDER BY symbol').all() as any[];
      const journalSymbols = db.prepare('SELECT DISTINCT symbol FROM trade_journal ORDER BY symbol').all() as any[];
      
      const allSymbols = new Set([
        ...quotedSymbols.map(s => s.symbol),
        ...alertSymbols.map(s => s.symbol),
        ...journalSymbols.map(s => s.symbol),
      ]);
      
      return Array.from(allSymbols).map(symbol => ({
        symbol,
        tracked: true,
        source: 'watchlist',
        addedAt: new Date().toISOString(), // We don't track when symbols were added
      }));
    } catch (error) {
      console.error('[Export] Watchlists export error:', error);
      throw new Error('Failed to export watchlists');
    }
  }
  
  async exportPatterns(): Promise<any[]> {
    const db = getDb();
    
    try {
      const patterns = db.prepare('SELECT * FROM trade_patterns ORDER BY created_at DESC').all() as any[];
      
      return patterns.map(pattern => ({
        id: pattern.id,
        name: pattern.name,
        description: pattern.description,
        tradeId: pattern.trade_id,
        conditions: JSON.parse(pattern.conditions || '[]'),
        statistics: JSON.parse(pattern.statistics || '{}'),
        riskFactors: JSON.parse(pattern.risk_factors || '[]'),
        bestTimeframes: JSON.parse(pattern.best_timeframes || '[]'),
        marketConditions: JSON.parse(pattern.market_conditions || '[]'),
        usedCount: pattern.used_count,
        liveWinRate: pattern.live_win_rate,
        liveTradeCount: pattern.live_trade_count,
        createdAt: pattern.created_at,
      }));
    } catch (error) {
      console.error('[Export] Patterns export error:', error);
      throw new Error('Failed to export patterns');
    }
  }
  
  async exportConditions(): Promise<any[]> {
    const db = getDb();
    
    try {
      const conditions = db.prepare('SELECT * FROM opportunity_conditions ORDER BY created_at DESC').all() as any[];
      
      return conditions.map(condition => ({
        id: condition.id,
        name: condition.name,
        description: condition.description,
        rules: JSON.parse(condition.rules || '[]'),
        logic: condition.logic,
        symbols: condition.symbols ? JSON.parse(condition.symbols) : null,
        enabled: !!condition.enabled,
        notifyOnTrigger: !!condition.notify_on_trigger,
        triggerCount: condition.trigger_count,
        createdAt: condition.created_at,
        lastTriggered: condition.last_triggered,
        lastEvaluated: condition.last_evaluated,
      }));
    } catch (error) {
      console.error('[Export] Conditions export error:', error);
      throw new Error('Failed to export conditions');
    }
  }
  
  async exportHolders(): Promise<any[]> {
    const db = getDb();
    
    try {
      const holders = db.prepare('SELECT * FROM tracked_holders ORDER BY name').all() as any[];
      
      return holders.map(holder => ({
        id: holder.id,
        name: holder.name,
        type: holder.type,
        cik: holder.cik,
        trackedSince: holder.tracked_since,
        lastCheck: holder.last_check,
      }));
    } catch (error) {
      console.error('[Export] Holders export error:', error);
      throw new Error('Failed to export holders');
    }
  }
  
  formatAsCSV(data: any[], filename: string): { content: string; filename: string } {
    if (data.length === 0) {
      return { content: '', filename: `${filename}.csv` };
    }
    
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          if (value == null) return '';
          if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return String(value);
        }).join(',')
      )
    ].join('\n');
    
    return {
      content: csvContent,
      filename: `${filename}.csv`,
    };
  }
  
  formatAsJSON(data: any[], filename: string): { content: string; filename: string } {
    return {
      content: JSON.stringify(data, null, 2),
      filename: `${filename}.json`,
    };
  }
  
  sendExportResponse(res: Response, data: any[], type: string, format: 'csv' | 'json' = 'json') {
    try {
      const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const baseFilename = `stockwatch_${type}_${timestamp}`;
      
      let content: string;
      let filename: string;
      let contentType: string;
      
      if (format === 'csv') {
        const formatted = this.formatAsCSV(data, baseFilename);
        content = formatted.content;
        filename = formatted.filename;
        contentType = 'text/csv';
      } else {
        const formatted = this.formatAsJSON(data, baseFilename);
        content = formatted.content;
        filename = formatted.filename;
        contentType = 'application/json';
      }
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
    } catch (error) {
      console.error('[Export] Send response error:', error);
      res.status(500).json({ error: 'Failed to format export data' });
    }
  }
}

export const dataExport = new DataExportService();