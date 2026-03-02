import axios from 'axios';
import { getDb } from '../../db/schema';
import { v4 } from '../opportunities/uuid';
import { OptionsChain, OptionContract, YahooOptionData, YahooOptionContract } from './types';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
};

export class OptionsChainService {
  /**
   * Fetch options chain from Yahoo Finance
   */
  async getOptionsChain(symbol: string, expiry?: string): Promise<OptionsChain> {
    try {
      // Check cache first
      const cached = this.getCachedChain(symbol, expiry);
      if (cached) return cached;

      const url = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}`;
      const params = expiry ? { date: this.expiryToUnixTimestamp(expiry) } : {};

      const response = await axios.get(url, { headers, params, timeout: 15000 });
      
      if (!response.data?.optionChain?.result?.[0]) {
        throw new Error('No options data found');
      }

      const data: YahooOptionData = response.data.optionChain.result[0];
      const chain = this.parseYahooOptions(data, symbol);

      // Cache the result
      this.cacheChain(chain);

      return chain;
    } catch (error) {
      console.error('[Options] Error fetching chain for', symbol, error);
      return {
        symbol,
        expirations: [],
        chains: [],
      };
    }
  }

  /**
   * Get available expiration dates for a symbol
   */
  async getExpirations(symbol: string): Promise<string[]> {
    try {
      const url = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}`;
      const response = await axios.get(url, { headers, timeout: 10000 });

      if (!response.data?.optionChain?.result?.[0]) {
        return [];
      }

      const data: YahooOptionData = response.data.optionChain.result[0];
      return data.expirationDates.map(timestamp => 
        new Date(timestamp * 1000).toISOString().split('T')[0]
      );
    } catch (error) {
      console.error('[Options] Error fetching expirations for', symbol, error);
      return [];
    }
  }

  /**
   * Parse Yahoo Finance options data into our format
   */
  private parseYahooOptions(data: YahooOptionData, symbol: string): OptionsChain {
    const expirations = data.expirationDates.map(timestamp => 
      new Date(timestamp * 1000).toISOString().split('T')[0]
    );

    const chains = data.options.map(option => {
      const expiry = new Date(option.expirationDate * 1000).toISOString().split('T')[0];
      const daysToExpiry = Math.ceil((option.expirationDate * 1000 - Date.now()) / (1000 * 60 * 60 * 24));

      return {
        expiry,
        daysToExpiry,
        calls: (option.calls || []).map(contract => this.parseContract(contract, 'call')),
        puts: (option.puts || []).map(contract => this.parseContract(contract, 'put')),
      };
    });

    return {
      symbol,
      expirations,
      chains,
    };
  }

  /**
   * Parse individual option contract
   */
  private parseContract(contract: YahooOptionContract, type: 'call' | 'put'): OptionContract {
    return {
      strike: contract.strike,
      lastPrice: contract.lastPrice || 0,
      bid: contract.bid || 0,
      ask: contract.ask || 0,
      change: contract.change || 0,
      changePct: contract.percentChange || 0,
      volume: contract.volume || 0,
      openInterest: contract.openInterest || 0,
      impliedVolatility: contract.impliedVolatility || 0,
      inTheMoney: contract.inTheMoney || false,
      contractSymbol: contract.contractSymbol || '',
    };
  }

  /**
   * Get cached options chain
   */
  private getCachedChain(symbol: string, expiry?: string): OptionsChain | null {
    try {
      const db = getDb();
      const cacheKey = expiry ? `${symbol}:${expiry}` : symbol;
      const cached = db.prepare(`
        SELECT data, updated_at FROM cached_options_chains 
        WHERE symbol = ? AND updated_at > ?
      `).get(cacheKey, Date.now() - 15 * 60 * 1000); // 15 min cache

      if (cached) {
        return JSON.parse((cached as any).data);
      }

      return null;
    } catch (error) {
      console.warn('[Options] Cache read error:', error);
      return null;
    }
  }

  /**
   * Cache options chain
   */
  private cacheChain(chain: OptionsChain): void {
    try {
      const db = getDb();
      const cacheKey = chain.symbol;

      db.prepare(`
        INSERT OR REPLACE INTO cached_options_chains (symbol, data, updated_at) 
        VALUES (?, ?, ?)
      `).run(cacheKey, JSON.stringify(chain), Date.now());
    } catch (error) {
      console.warn('[Options] Cache write error:', error);
    }
  }

  /**
   * Convert expiry date string to Unix timestamp
   */
  private expiryToUnixTimestamp(expiry: string): number {
    return Math.floor(new Date(expiry).getTime() / 1000);
  }

  /**
   * Calculate basic statistics for options chain
   */
  calculateChainStats(chain: OptionsChain) {
    const stats = {
      totalCallVolume: 0,
      totalPutVolume: 0,
      totalCallOI: 0,
      totalPutOI: 0,
      maxPain: 0,
      putCallRatio: 0,
    };

    for (const expiry of chain.chains) {
      for (const call of expiry.calls) {
        stats.totalCallVolume += call.volume;
        stats.totalCallOI += call.openInterest;
      }

      for (const put of expiry.puts) {
        stats.totalPutVolume += put.volume;
        stats.totalPutOI += put.openInterest;
      }
    }

    stats.putCallRatio = stats.totalCallVolume > 0 ? stats.totalPutVolume / stats.totalCallVolume : 0;

    return stats;
  }

  /**
   * Find unusual activity in options chain
   */
  detectUnusualActivity(chain: OptionsChain): Array<{
    type: 'call' | 'put';
    strike: number;
    expiry: string;
    volume: number;
    openInterest: number;
    volumeOIRatio: number;
    score: number;
    reason: string;
  }> {
    const unusual = [];

    for (const expiry of chain.chains) {
      // Check calls
      for (const call of expiry.calls) {
        const volumeOIRatio = call.openInterest > 0 ? call.volume / call.openInterest : call.volume;
        const notional = call.lastPrice * call.volume * 100; // 100 shares per contract

        let score = 0;
        const reasons = [];

        // High volume relative to open interest
        if (volumeOIRatio > 2) {
          score += Math.min(30, volumeOIRatio * 5);
          reasons.push(`Volume ${volumeOIRatio.toFixed(1)}x open interest`);
        }

        // Large notional value
        if (notional > 500000) {
          score += Math.min(30, Math.log10(notional / 100000) * 10);
          reasons.push(`$${(notional / 1000000).toFixed(1)}M notional`);
        }

        // Far out-of-the-money with volume
        if (!call.inTheMoney && call.volume > 100) {
          score += 20;
          reasons.push('Far OTM with volume');
        }

        if (score > 40) {
          unusual.push({
            type: 'call' as 'call',
            strike: call.strike,
            expiry: expiry.expiry,
            volume: call.volume,
            openInterest: call.openInterest,
            volumeOIRatio,
            score,
            reason: reasons.join(', '),
          });
        }
      }

      // Check puts (similar logic)
      for (const put of expiry.puts) {
        const volumeOIRatio = put.openInterest > 0 ? put.volume / put.openInterest : put.volume;
        const notional = put.lastPrice * put.volume * 100;

        let score = 0;
        const reasons = [];

        if (volumeOIRatio > 2) {
          score += Math.min(30, volumeOIRatio * 5);
          reasons.push(`Volume ${volumeOIRatio.toFixed(1)}x open interest`);
        }

        if (notional > 500000) {
          score += Math.min(30, Math.log10(notional / 100000) * 10);
          reasons.push(`$${(notional / 1000000).toFixed(1)}M notional`);
        }

        if (!put.inTheMoney && put.volume > 100) {
          score += 20;
          reasons.push('Far OTM with volume');
        }

        if (score > 40) {
          unusual.push({
            type: 'put' as 'put',
            strike: put.strike,
            expiry: expiry.expiry,
            volume: put.volume,
            openInterest: put.openInterest,
            volumeOIRatio,
            score,
            reason: reasons.join(', '),
          });
        }
      }
    }

    return unusual.sort((a, b) => b.score - a.score);
  }
}

export const optionsChainService = new OptionsChainService();