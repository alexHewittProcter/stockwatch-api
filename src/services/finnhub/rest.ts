import axios, { AxiosInstance } from 'axios';
import { config } from '../../config';
import { Quote, Candle, SearchResult, CandleInterval } from '../../types/market';
import { FinnhubQuoteResponse, FinnhubCandleResponse, FinnhubSearchResponse } from './types';

class FinnhubRest {
  private client: AxiosInstance;
  private callTimestamps: number[] = [];
  private readonly rateLimit = config.finnhub.rateLimit;

  constructor() {
    this.client = axios.create({
      baseURL: config.finnhub.baseUrl,
      params: { token: config.finnhub.apiKey },
      timeout: 10000,
    });
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    this.callTimestamps = this.callTimestamps.filter(t => now - t < 60_000);
    if (this.callTimestamps.length >= this.rateLimit) {
      const oldest = this.callTimestamps[0];
      const waitMs = 60_000 - (now - oldest) + 100;
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
    this.callTimestamps.push(Date.now());
  }

  async getQuote(symbol: string): Promise<Quote> {
    await this.throttle();
    const { data } = await this.client.get<FinnhubQuoteResponse>('/quote', {
      params: { symbol: symbol.toUpperCase() },
    });

    return {
      symbol: symbol.toUpperCase(),
      price: data.c,
      change: data.d,
      changePercent: data.dp,
      high: data.h,
      low: data.l,
      open: data.o,
      previousClose: data.pc,
      volume: 0,
      timestamp: data.t * 1000,
    };
  }

  async getCandles(
    symbol: string,
    resolution: CandleInterval = 'D',
    from?: number,
    to?: number,
  ): Promise<Candle[]> {
    await this.throttle();
    const now = Math.floor(Date.now() / 1000);
    const { data } = await this.client.get<FinnhubCandleResponse>('/stock/candle', {
      params: {
        symbol: symbol.toUpperCase(),
        resolution,
        from: from || now - 365 * 24 * 60 * 60,
        to: to || now,
      },
    });

    if (data.s !== 'ok' || !data.t) return [];

    return data.t.map((t, i) => ({
      timestamp: t * 1000,
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i],
      volume: data.v[i],
    }));
  }

  async search(query: string): Promise<SearchResult[]> {
    await this.throttle();
    const { data } = await this.client.get<FinnhubSearchResponse>('/search', {
      params: { q: query },
    });

    return data.result.map(r => ({
      symbol: r.symbol,
      description: r.description,
      type: r.type,
      exchange: '',
    }));
  }

  async getMarketStatus(): Promise<{ exchange: string; isOpen: boolean }> {
    await this.throttle();
    const { data } = await this.client.get('/stock/market-status', {
      params: { exchange: 'US' },
    });
    return { exchange: 'US', isOpen: data.isOpen };
  }
}

export const finnhubRest = new FinnhubRest();
