import { Router, Request, Response } from 'express';
import { finnhubRest } from '../services/finnhub/rest';
import { getYahooCandles, getMovers } from '../services/yahoo/quotes';
import { getCachedQuote, setCachedQuote, getCachedCandles, setCachedCandles } from '../services/cache/sqlite';

const router = Router();

// GET /api/market/quote/:symbol
router.get('/quote/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;

    // Check cache first
    const cached = getCachedQuote(symbol);
    if (cached) {
      return res.json(cached);
    }

    const quote = await finnhubRest.getQuote(symbol);
    setCachedQuote(symbol, quote);
    res.json(quote);
  } catch (err) {
    console.error('[Market] Quote error:', err);
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

// GET /api/market/candles/:symbol
router.get('/candles/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const interval = (req.query.interval as string) || 'D';
    const from = req.query.from ? parseInt(req.query.from as string) : undefined;
    const to = req.query.to ? parseInt(req.query.to as string) : undefined;

    // Check cache
    const cached = getCachedCandles(symbol, interval);
    if (cached && !from && !to) {
      return res.json(cached);
    }

    // Try Finnhub first, fall back to Yahoo
    let candles = await finnhubRest.getCandles(symbol, interval as '1' | '5' | '15' | '30' | '60' | 'D' | 'W' | 'M', from, to);

    if (candles.length === 0) {
      // Fallback to Yahoo Finance
      const yahooInterval = mapToYahooInterval(interval);
      const yahooRange = mapToYahooRange(interval);
      candles = await getYahooCandles(symbol, yahooInterval, yahooRange);
    }

    if (candles.length > 0 && !from && !to) {
      setCachedCandles(symbol, interval, candles);
    }

    res.json(candles);
  } catch (err) {
    console.error('[Market] Candles error:', err);
    res.status(500).json({ error: 'Failed to fetch candles' });
  }
});

// GET /api/market/search?q=
router.get('/search', async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string;
    if (!q || q.length < 1) {
      return res.json([]);
    }

    const results = await finnhubRest.search(q);
    res.json(results);
  } catch (err) {
    console.error('[Market] Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/market/movers
router.get('/movers', async (_req: Request, res: Response) => {
  try {
    const movers = await getMovers();
    res.json(movers);
  } catch (err) {
    console.error('[Market] Movers error:', err);
    res.status(500).json({ error: 'Failed to fetch movers' });
  }
});

function mapToYahooInterval(finnhubInterval: string): string {
  const map: Record<string, string> = {
    '1': '1m', '5': '5m', '15': '15m', '30': '30m', '60': '1h',
    'D': '1d', 'W': '1wk', 'M': '1mo',
  };
  return map[finnhubInterval] || '1d';
}

function mapToYahooRange(finnhubInterval: string): string {
  const map: Record<string, string> = {
    '1': '1d', '5': '5d', '15': '1mo', '30': '1mo', '60': '3mo',
    'D': '1y', 'W': '2y', 'M': '5y',
  };
  return map[finnhubInterval] || '1y';
}

export default router;
