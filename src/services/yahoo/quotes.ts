import axios from 'axios';
import { Quote, Candle } from '../../types/market';

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance';
const YAHOO_V7 = 'https://query1.finance.yahoo.com/v7/finance';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
};

export async function getYahooQuote(symbol: string): Promise<Quote | null> {
  try {
    const { data } = await axios.get(`${YAHOO_V7}/quote`, {
      params: { symbols: symbol },
      headers,
      timeout: 10000,
    });
    const q = data?.quoteResponse?.result?.[0];
    if (!q) return null;
    return {
      symbol: q.symbol,
      price: q.regularMarketPrice ?? 0,
      change: q.regularMarketChange ?? 0,
      changePercent: q.regularMarketChangePercent ?? 0,
      high: q.regularMarketDayHigh ?? 0,
      low: q.regularMarketDayLow ?? 0,
      open: q.regularMarketOpen ?? 0,
      previousClose: q.regularMarketPreviousClose ?? 0,
      volume: q.regularMarketVolume ?? 0,
      timestamp: (q.regularMarketTime ?? 0) * 1000,
    };
  } catch {
    return null;
  }
}

export async function getBulkQuotes(symbols: string[]): Promise<Quote[]> {
  try {
    const { data } = await axios.get(`${YAHOO_V7}/quote`, {
      params: { symbols: symbols.join(',') },
      headers,
      timeout: 15000,
    });
    const results = data?.quoteResponse?.result ?? [];
    return results.map((q: Record<string, number | string>) => ({
      symbol: q.symbol as string,
      price: (q.regularMarketPrice as number) ?? 0,
      change: (q.regularMarketChange as number) ?? 0,
      changePercent: (q.regularMarketChangePercent as number) ?? 0,
      high: (q.regularMarketDayHigh as number) ?? 0,
      low: (q.regularMarketDayLow as number) ?? 0,
      open: (q.regularMarketOpen as number) ?? 0,
      previousClose: (q.regularMarketPreviousClose as number) ?? 0,
      volume: (q.regularMarketVolume as number) ?? 0,
      timestamp: ((q.regularMarketTime as number) ?? 0) * 1000,
    }));
  } catch {
    return [];
  }
}

export async function getYahooCandles(
  symbol: string,
  interval: string = '1d',
  range: string = '1y',
): Promise<Candle[]> {
  try {
    const { data } = await axios.get(`${YAHOO_BASE}/chart/${symbol}`, {
      params: { interval, range, includePrePost: false },
      headers,
      timeout: 15000,
    });
    const result = data?.chart?.result?.[0];
    if (!result?.timestamp) return [];

    const ts: number[] = result.timestamp;
    const ohlcv = result.indicators?.quote?.[0];
    if (!ohlcv) return [];

    return ts.map((t: number, i: number) => ({
      timestamp: t * 1000,
      open: ohlcv.open?.[i] ?? 0,
      high: ohlcv.high?.[i] ?? 0,
      low: ohlcv.low?.[i] ?? 0,
      close: ohlcv.close?.[i] ?? 0,
      volume: ohlcv.volume?.[i] ?? 0,
    })).filter((c: Candle) => c.close > 0);
  } catch {
    return [];
  }
}

export async function getMovers(): Promise<{ gainers: Quote[]; losers: Quote[] }> {
  try {
    const [gainersResp, losersResp] = await Promise.all([
      axios.get(`${YAHOO_BASE}/screener`, {
        params: { scrIds: 'day_gainers', count: 10 },
        headers,
        timeout: 10000,
      }).catch(() => null),
      axios.get(`${YAHOO_BASE}/screener`, {
        params: { scrIds: 'day_losers', count: 10 },
        headers,
        timeout: 10000,
      }).catch(() => null),
    ]);

    const mapQuotes = (resp: { data?: { finance?: { result?: { quotes?: Record<string, number | string>[] }[] } } } | null): Quote[] => {
      const quotes = resp?.data?.finance?.result?.[0]?.quotes ?? [];
      return quotes.map((q: Record<string, number | string>) => ({
        symbol: q.symbol as string,
        price: (q.regularMarketPrice as number) ?? 0,
        change: (q.regularMarketChange as number) ?? 0,
        changePercent: (q.regularMarketChangePercent as number) ?? 0,
        high: (q.regularMarketDayHigh as number) ?? 0,
        low: (q.regularMarketDayLow as number) ?? 0,
        open: (q.regularMarketOpen as number) ?? 0,
        previousClose: (q.regularMarketPreviousClose as number) ?? 0,
        volume: (q.regularMarketVolume as number) ?? 0,
        timestamp: Date.now(),
      }));
    };

    return {
      gainers: mapQuotes(gainersResp),
      losers: mapQuotes(losersResp),
    };
  } catch {
    return { gainers: [], losers: [] };
  }
}
