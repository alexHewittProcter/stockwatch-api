import { getDb } from '../../db/schema';
import { v4 } from '../opportunities/uuid';
import { PutCallRatio } from './types';
import { optionsChainService } from './chain';

export class PutCallRatioService {
  /**
   * Calculate put/call ratio for a symbol
   */
  async getPutCallRatio(symbol: string): Promise<PutCallRatio> {
    try {
      const chain = await optionsChainService.getOptionsChain(symbol);
      const stats = optionsChainService.calculateChainStats(chain);
      
      const ratio = stats.totalCallVolume > 0 ? stats.totalPutVolume / stats.totalCallVolume : 0;
      const sentiment = this.classifySentiment(ratio);
      const history = this.getPCRHistory(symbol, 30);

      // Store today's ratio
      await this.storePCRSnapshot(symbol, ratio, stats.totalPutVolume, stats.totalCallVolume);

      return {
        symbol,
        ratio,
        putVolume: stats.totalPutVolume,
        callVolume: stats.totalCallVolume,
        sentiment,
        history,
      };
    } catch (error) {
      console.error('[PCR] Error calculating put/call ratio for', symbol, error);
      return this.getEmptyPCR(symbol);
    }
  }

  /**
   * Calculate market-wide put/call ratio
   */
  async getMarketPCR(): Promise<PutCallRatio> {
    try {
      const db = getDb();
      
      // Get today's PCR data for all symbols
      const today = new Date().toISOString().split('T')[0];
      const rows = db.prepare(`
        SELECT put_volume, call_volume FROM pcr_history 
        WHERE date = ?
      `).all(today);

      let totalPutVolume = 0;
      let totalCallVolume = 0;

      for (const row of rows as any[]) {
        totalPutVolume += row.put_volume;
        totalCallVolume += row.call_volume;
      }

      const ratio = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 0;
      const sentiment = this.classifySentiment(ratio);
      const history = this.getMarketPCRHistory(30);

      return {
        symbol: 'MARKET',
        ratio,
        putVolume: totalPutVolume,
        callVolume: totalCallVolume,
        sentiment,
        history,
      };
    } catch (error) {
      console.error('[PCR] Error calculating market PCR:', error);
      return this.getEmptyPCR('MARKET');
    }
  }

  /**
   * Classify sentiment based on P/C ratio
   */
  private classifySentiment(ratio: number): 'extreme_bearish' | 'bearish' | 'neutral' | 'bullish' | 'extreme_bullish' {
    if (ratio > 2.0) return 'extreme_bearish';
    if (ratio > 1.5) return 'bearish';
    if (ratio < 0.3) return 'extreme_bullish';
    if (ratio < 0.6) return 'bullish';
    return 'neutral';
  }

  /**
   * Get historical P/C ratio data
   */
  private getPCRHistory(symbol: string, days: number): { date: string; ratio: number }[] {
    try {
      const db = getDb();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const rows = db.prepare(`
        SELECT date, ratio FROM pcr_history 
        WHERE symbol = ? AND date >= ? 
        ORDER BY date ASC
      `).all(symbol, cutoff.toISOString().split('T')[0]);

      return (rows as any[]).map(row => ({
        date: row.date,
        ratio: row.ratio,
      }));
    } catch (error) {
      console.error('[PCR] Error getting PCR history:', error);
      return [];
    }
  }

  /**
   * Get market-wide P/C ratio history
   */
  private getMarketPCRHistory(days: number): { date: string; ratio: number }[] {
    try {
      const db = getDb();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const rows = db.prepare(`
        SELECT date, 
               SUM(put_volume) as total_put_volume,
               SUM(call_volume) as total_call_volume
        FROM pcr_history 
        WHERE date >= ? 
        GROUP BY date
        ORDER BY date ASC
      `).all(cutoff.toISOString().split('T')[0]);

      return (rows as any[]).map(row => ({
        date: row.date,
        ratio: row.total_call_volume > 0 ? row.total_put_volume / row.total_call_volume : 0,
      }));
    } catch (error) {
      console.error('[PCR] Error getting market PCR history:', error);
      return [];
    }
  }

  /**
   * Store daily P/C ratio snapshot
   */
  async storePCRSnapshot(symbol: string, ratio: number, putVolume: number, callVolume: number): Promise<void> {
    try {
      const db = getDb();
      const today = new Date().toISOString().split('T')[0];

      db.prepare(`
        INSERT OR REPLACE INTO pcr_history 
        (id, symbol, date, ratio, put_volume, call_volume, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        v4(),
        symbol,
        today,
        ratio,
        putVolume,
        callVolume,
        new Date().toISOString()
      );
    } catch (error) {
      console.error('[PCR] Error storing PCR snapshot:', error);
    }
  }

  /**
   * Get extreme P/C ratio alerts
   */
  async getExtremeRatios(): Promise<{
    symbol: string;
    ratio: number;
    sentiment: string;
    change: number;
  }[]> {
    try {
      const db = getDb();
      
      // Get symbols with recent options activity
      const symbols = db.prepare(`
        SELECT DISTINCT symbol FROM cached_options_chains 
        WHERE updated_at > ?
        LIMIT 20
      `).all(Date.now() - 60 * 60 * 1000);

      const extremes = [];

      for (const row of symbols as any[]) {
        const pcr = await this.getPutCallRatio(row.symbol);
        
        // Flag extreme ratios
        if (pcr.sentiment === 'extreme_bearish' || pcr.sentiment === 'extreme_bullish') {
          const change = this.calculatePCRChange(pcr.history);
          
          extremes.push({
            symbol: pcr.symbol,
            ratio: pcr.ratio,
            sentiment: pcr.sentiment,
            change,
          });
        }
      }

      return extremes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    } catch (error) {
      console.error('[PCR] Error getting extreme ratios:', error);
      return [];
    }
  }

  /**
   * Calculate P/C ratio change over time
   */
  private calculatePCRChange(history: { date: string; ratio: number }[]): number {
    if (history.length < 2) return 0;

    const current = history[history.length - 1].ratio;
    const previous = history[history.length - 2].ratio;

    return previous > 0 ? ((current - previous) / previous) * 100 : 0;
  }

  /**
   * Detect P/C ratio reversals (contrarian signals)
   */
  async detectReversals(): Promise<{
    symbol: string;
    ratio: number;
    previousRatio: number;
    reversalType: 'bullish' | 'bearish';
    strength: number;
  }[]> {
    try {
      const db = getDb();
      
      const symbols = db.prepare(`
        SELECT DISTINCT symbol FROM cached_options_chains 
        WHERE updated_at > ?
        LIMIT 30
      `).all(Date.now() - 2 * 60 * 60 * 1000); // Last 2 hours

      const reversals = [];

      for (const row of symbols as any[]) {
        const pcr = await this.getPutCallRatio(row.symbol);
        
        if (pcr.history.length >= 5) {
          const recent = pcr.history.slice(-5);
          const reversalSignal = this.analyzeReversalPattern(recent);
          
          if (reversalSignal) {
            reversals.push({
              symbol: pcr.symbol,
              ratio: pcr.ratio,
              previousRatio: recent[recent.length - 2].ratio,
              reversalType: reversalSignal.type,
              strength: reversalSignal.strength,
            });
          }
        }
      }

      return reversals.sort((a, b) => b.strength - a.strength);
    } catch (error) {
      console.error('[PCR] Error detecting reversals:', error);
      return [];
    }
  }

  /**
   * Analyze P/C ratio pattern for reversal signals
   */
  private analyzeReversalPattern(history: { date: string; ratio: number }[]): {
    type: 'bullish' | 'bearish';
    strength: number;
  } | null {
    if (history.length < 3) return null;

    const current = history[history.length - 1].ratio;
    const previous = history[history.length - 2].ratio;
    const older = history[history.length - 3].ratio;

    // Bullish reversal: High P/C ratio dropping (fear subsiding)
    if (previous > 1.5 && current < previous * 0.8 && older > previous) {
      const strength = Math.min(100, ((previous - current) / previous) * 200);
      return { type: 'bullish', strength };
    }

    // Bearish reversal: Low P/C ratio rising (complacency ending)
    if (previous < 0.6 && current > previous * 1.2 && older < previous) {
      const strength = Math.min(100, ((current - previous) / previous) * 200);
      return { type: 'bearish', strength };
    }

    return null;
  }

  /**
   * Get empty P/C ratio structure
   */
  private getEmptyPCR(symbol: string): PutCallRatio {
    return {
      symbol,
      ratio: 0,
      putVolume: 0,
      callVolume: 0,
      sentiment: 'neutral',
      history: [],
    };
  }
}

export const putCallRatioService = new PutCallRatioService();