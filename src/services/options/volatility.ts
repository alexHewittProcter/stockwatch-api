import { getDb } from '../../db/schema';
import { v4 } from '../opportunities/uuid';
import { IVData } from './types';

export class VolatilityService {
  /**
   * Calculate implied volatility data for a symbol
   */
  async getIVData(symbol: string): Promise<IVData> {
    try {
      const db = getDb();
      
      // Get current IV (we'll use the average IV from options chain)
      const currentIV = await this.calculateCurrentIV(symbol);
      
      // Get historical IV data
      const history = this.getIVHistory(symbol, 365); // 1 year
      
      // Calculate IV rank and percentile
      const { ivRank, ivPercentile, iv52wHigh, iv52wLow } = this.calculateIVMetrics(currentIV, history);
      
      // Get recent changes
      const ivChange1d = this.getIVChange(history, 1);
      const ivChange1w = this.getIVChange(history, 7);
      
      // Get term structure
      const termStructure = await this.getIVTermStructure(symbol);

      return {
        symbol,
        currentIV,
        ivRank,
        ivPercentile,
        iv52wHigh,
        iv52wLow,
        ivChange1d,
        ivChange1w,
        history: history.slice(-30), // Last 30 days for charting
        termStructure,
      };
    } catch (error) {
      console.error('[Volatility] Error getting IV data for', symbol, error);
      return this.getEmptyIVData(symbol);
    }
  }

  /**
   * Calculate current implied volatility from options chain
   */
  private async calculateCurrentIV(symbol: string): Promise<number> {
    try {
      // Get cached options chain
      const db = getDb();
      const cached = db.prepare(`
        SELECT data FROM cached_options_chains 
        WHERE symbol = ? 
        ORDER BY updated_at DESC 
        LIMIT 1
      `).get(symbol);

      if (!cached) {
        return 0;
      }

      const chain = JSON.parse((cached as any).data);
      let totalIV = 0;
      let count = 0;

      // Calculate weighted average IV from at-the-money options
      for (const expiry of chain.chains) {
        if (expiry.daysToExpiry < 7) continue; // Skip weekly options
        
        // Find ATM options (closest to current price)
        const atmCalls = expiry.calls.filter((c: any) => c.volume > 0 && c.impliedVolatility > 0);
        const atmPuts = expiry.puts.filter((p: any) => p.volume > 0 && p.impliedVolatility > 0);
        
        for (const call of atmCalls.slice(0, 3)) { // Top 3 by volume
          totalIV += call.impliedVolatility * call.volume;
          count += call.volume;
        }
        
        for (const put of atmPuts.slice(0, 3)) {
          totalIV += put.impliedVolatility * put.volume;
          count += put.volume;
        }
      }

      return count > 0 ? totalIV / count : 0;
    } catch (error) {
      console.error('[Volatility] Error calculating current IV:', error);
      return 0;
    }
  }

  /**
   * Get historical IV data from database
   */
  private getIVHistory(symbol: string, days: number): { date: string; iv: number }[] {
    try {
      const db = getDb();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const rows = db.prepare(`
        SELECT date, iv FROM iv_history 
        WHERE symbol = ? AND date >= ? 
        ORDER BY date ASC
      `).all(symbol, cutoff.toISOString().split('T')[0]);

      return (rows as any[]).map(row => ({
        date: row.date,
        iv: row.iv,
      }));
    } catch (error) {
      console.error('[Volatility] Error getting IV history:', error);
      return [];
    }
  }

  /**
   * Calculate IV rank and percentile
   */
  private calculateIVMetrics(currentIV: number, history: { date: string; iv: number }[]) {
    if (history.length < 30) {
      return {
        ivRank: 0,
        ivPercentile: 0,
        iv52wHigh: currentIV,
        iv52wLow: currentIV,
      };
    }

    const ivValues = history.map(h => h.iv).filter(iv => iv > 0);
    
    if (ivValues.length === 0) {
      return {
        ivRank: 0,
        ivPercentile: 0,
        iv52wHigh: currentIV,
        iv52wLow: currentIV,
      };
    }

    const iv52wHigh = Math.max(...ivValues);
    const iv52wLow = Math.min(...ivValues);
    
    // IV Rank: where current IV sits in 52-week range
    const ivRank = iv52wHigh > iv52wLow 
      ? ((currentIV - iv52wLow) / (iv52wHigh - iv52wLow)) * 100 
      : 0;

    // IV Percentile: % of days where IV was lower than current
    const lowerCount = ivValues.filter(iv => iv < currentIV).length;
    const ivPercentile = (lowerCount / ivValues.length) * 100;

    return {
      ivRank: Math.max(0, Math.min(100, ivRank)),
      ivPercentile: Math.max(0, Math.min(100, ivPercentile)),
      iv52wHigh,
      iv52wLow,
    };
  }

  /**
   * Get IV change over N days
   */
  private getIVChange(history: { date: string; iv: number }[], days: number): number {
    if (history.length < days + 1) return 0;

    const current = history[history.length - 1].iv;
    const previous = history[history.length - 1 - days].iv;

    return previous > 0 ? ((current - previous) / previous) * 100 : 0;
  }

  /**
   * Get IV term structure (IV across different expiry dates)
   */
  private async getIVTermStructure(symbol: string): Promise<{ expiry: string; iv: number }[]> {
    try {
      const db = getDb();
      const cached = db.prepare(`
        SELECT data FROM cached_options_chains 
        WHERE symbol = ? 
        ORDER BY updated_at DESC 
        LIMIT 1
      `).get(symbol);

      if (!cached) return [];

      const chain = JSON.parse((cached as any).data);
      const termStructure = [];

      for (const expiry of chain.chains) {
        // Calculate average IV for this expiry
        let totalIV = 0;
        let count = 0;

        // Use ATM options for term structure
        const allOptions = [...expiry.calls, ...expiry.puts];
        for (const option of allOptions) {
          if (option.volume > 0 && option.impliedVolatility > 0) {
            totalIV += option.impliedVolatility;
            count++;
          }
        }

        if (count > 0) {
          termStructure.push({
            expiry: expiry.expiry,
            iv: totalIV / count,
          });
        }
      }

      return termStructure.sort((a, b) => a.expiry.localeCompare(b.expiry));
    } catch (error) {
      console.error('[Volatility] Error getting term structure:', error);
      return [];
    }
  }

  /**
   * Store daily IV snapshot
   */
  async storeIVSnapshot(symbol: string, iv: number): Promise<void> {
    try {
      const db = getDb();
      const today = new Date().toISOString().split('T')[0];

      db.prepare(`
        INSERT OR REPLACE INTO iv_history (id, symbol, date, iv, created_at) 
        VALUES (?, ?, ?, ?, ?)
      `).run(v4(), symbol, today, iv, new Date().toISOString());
    } catch (error) {
      console.error('[Volatility] Error storing IV snapshot:', error);
    }
  }

  /**
   * Get VIX data (using SPY options as proxy)
   */
  async getVIXData(): Promise<{
    current: number;
    change: number;
    changePct: number;
    chart: { timestamp: number; value: number }[];
  }> {
    try {
      // For now, calculate VIX-like metric from SPY options
      const spyIV = await this.calculateCurrentIV('SPY');
      const spyHistory = this.getIVHistory('SPY', 30);

      const current = spyIV * 100; // Convert to VIX-like scale
      const change = spyHistory.length > 1 
        ? current - (spyHistory[spyHistory.length - 2].iv * 100)
        : 0;
      const changePct = spyHistory.length > 1 && spyHistory[spyHistory.length - 2].iv > 0
        ? (change / (spyHistory[spyHistory.length - 2].iv * 100)) * 100
        : 0;

      const chart = spyHistory.slice(-30).map(h => ({
        timestamp: new Date(h.date).getTime(),
        value: h.iv * 100,
      }));

      return { current, change, changePct, chart };
    } catch (error) {
      console.error('[Volatility] Error getting VIX data:', error);
      return { current: 0, change: 0, changePct: 0, chart: [] };
    }
  }

  /**
   * Get stocks with highest IV
   */
  async getHighestIVStocks(limit: number = 10): Promise<{
    symbol: string;
    iv: number;
    ivRank: number;
  }[]> {
    try {
      const db = getDb();
      const rows = db.prepare(`
        SELECT DISTINCT symbol FROM cached_options_chains 
        WHERE updated_at > ?
        LIMIT 50
      `).all(Date.now() - 60 * 60 * 1000); // Last hour

      const results = [];
      
      for (const row of rows as any[]) {
        const ivData = await this.getIVData(row.symbol);
        if (ivData.currentIV > 0) {
          results.push({
            symbol: row.symbol,
            iv: ivData.currentIV,
            ivRank: ivData.ivRank,
          });
        }
      }

      return results
        .sort((a, b) => b.iv - a.iv)
        .slice(0, limit);
    } catch (error) {
      console.error('[Volatility] Error getting highest IV stocks:', error);
      return [];
    }
  }

  /**
   * Get biggest IV movers today
   */
  async getBiggestIVMovers(limit: number = 10): Promise<{
    symbol: string;
    iv: number;
    change: number;
    changePct: number;
  }[]> {
    try {
      const db = getDb();
      const rows = db.prepare(`
        SELECT DISTINCT symbol FROM cached_options_chains 
        WHERE updated_at > ?
        LIMIT 50
      `).all(Date.now() - 60 * 60 * 1000);

      const results = [];

      for (const row of rows as any[]) {
        const ivData = await this.getIVData(row.symbol);
        if (ivData.currentIV > 0 && Math.abs(ivData.ivChange1d) > 5) {
          results.push({
            symbol: row.symbol,
            iv: ivData.currentIV,
            change: ivData.ivChange1d,
            changePct: ivData.ivChange1d,
          });
        }
      }

      return results
        .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
        .slice(0, limit);
    } catch (error) {
      console.error('[Volatility] Error getting IV movers:', error);
      return [];
    }
  }

  /**
   * Get empty IV data structure
   */
  private getEmptyIVData(symbol: string): IVData {
    return {
      symbol,
      currentIV: 0,
      ivRank: 0,
      ivPercentile: 0,
      iv52wHigh: 0,
      iv52wLow: 0,
      ivChange1d: 0,
      ivChange1w: 0,
      history: [],
      termStructure: [],
    };
  }
}

export const volatilityService = new VolatilityService();