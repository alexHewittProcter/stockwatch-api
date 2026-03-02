import { Router, Request, Response } from 'express';
import { optionsChainService } from '../services/options/chain';
import { volatilityService } from '../services/options/volatility';
import { putCallRatioService } from '../services/options/putcall';
import { getDb } from '../db/schema';

const router = Router();

// GET /api/options/chain/:symbol
router.get('/chain/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const expiry = req.query.expiry as string;
    const type = req.query.type as string;

    const chain = await optionsChainService.getOptionsChain(symbol, expiry);

    // Filter by type if specified
    if (type && type !== 'all') {
      for (const expiry of chain.chains) {
        if (type === 'call') {
          expiry.puts = [];
        } else if (type === 'put') {
          expiry.calls = [];
        }
      }
    }

    res.json(chain);
  } catch (err) {
    console.error('[Options] Chain error:', err);
    res.status(500).json({ error: 'Failed to fetch options chain' });
  }
});

// GET /api/options/expirations/:symbol
router.get('/expirations/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const expirations = await optionsChainService.getExpirations(symbol);
    res.json({ symbol, expirations });
  } catch (err) {
    console.error('[Options] Expirations error:', err);
    res.status(500).json({ error: 'Failed to fetch expirations' });
  }
});

// GET /api/options/iv/:symbol
router.get('/iv/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const ivData = await volatilityService.getIVData(symbol);
    res.json(ivData);
  } catch (err) {
    console.error('[Options] IV error:', err);
    res.status(500).json({ error: 'Failed to fetch IV data' });
  }
});

// GET /api/options/iv/history/:symbol
router.get('/iv/history/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const ivData = await volatilityService.getIVData(symbol);
    res.json({
      symbol,
      history: ivData.history,
      currentIV: ivData.currentIV,
      ivRank: ivData.ivRank,
      ivPercentile: ivData.ivPercentile,
    });
  } catch (err) {
    console.error('[Options] IV history error:', err);
    res.status(500).json({ error: 'Failed to fetch IV history' });
  }
});

// GET /api/options/pcr/:symbol
router.get('/pcr/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const pcr = await putCallRatioService.getPutCallRatio(symbol);
    res.json(pcr);
  } catch (err) {
    console.error('[Options] PCR error:', err);
    res.status(500).json({ error: 'Failed to fetch put/call ratio' });
  }
});

// GET /api/options/flow
router.get('/flow', async (req: Request, res: Response) => {
  try {
    const minValue = parseInt(req.query.minValue as string) || 0;
    const type = req.query.type as string;
    const limit = parseInt(req.query.limit as string) || 50;

    const db = getDb();
    let query = `
      SELECT * FROM unusual_activity 
      WHERE notional_value >= ?
    `;
    const params: any[] = [minValue];

    if (type && ['bullish', 'bearish', 'neutral'].includes(type)) {
      query += ' AND sentiment = ?';
      params.push(type);
    }

    query += ' ORDER BY detected_at DESC, score DESC LIMIT ?';
    params.push(limit);

    const activities = db.prepare(query).all(...params);

    res.json({
      activities: (activities as any[]).map(activity => ({
        id: activity.id,
        ts: activity.detected_at,
        symbol: activity.symbol,
        type: activity.contract_type,
        strike: activity.strike,
        expiry: activity.expiry,
        sentiment: activity.sentiment,
        classification: activity.classification,
        volume: activity.volume,
        openInterest: activity.open_interest,
        volumeOIRatio: activity.volume_oi_ratio,
        notionalValue: activity.notional_value,
        score: activity.score,
        reason: activity.reason,
      })),
      total: activities.length,
      minValue,
      type: type || 'all',
    });
  } catch (err) {
    console.error('[Options] Flow error:', err);
    res.status(500).json({ error: 'Failed to fetch options flow' });
  }
});

// GET /api/options/flow/:symbol
router.get('/flow/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const limit = parseInt(req.query.limit as string) || 20;

    const db = getDb();
    const activities = db.prepare(`
      SELECT * FROM unusual_activity 
      WHERE symbol = ?
      ORDER BY detected_at DESC, score DESC 
      LIMIT ?
    `).all(symbol, limit);

    res.json({
      symbol,
      activities: (activities as any[]).map(activity => ({
        id: activity.id,
        ts: activity.detected_at,
        type: activity.contract_type,
        strike: activity.strike,
        expiry: activity.expiry,
        sentiment: activity.sentiment,
        classification: activity.classification,
        volume: activity.volume,
        openInterest: activity.open_interest,
        volumeOIRatio: activity.volume_oi_ratio,
        notionalValue: activity.notional_value,
        score: activity.score,
        reason: activity.reason,
      })),
      total: activities.length,
    });
  } catch (err) {
    console.error('[Options] Symbol flow error:', err);
    res.status(500).json({ error: 'Failed to fetch symbol options flow' });
  }
});

// GET /api/options/volatility/dashboard
router.get('/volatility/dashboard', async (req: Request, res: Response) => {
  try {
    const [vix, highestIV, biggestIVMoves, unusualActivity] = await Promise.all([
      volatilityService.getVIXData(),
      volatilityService.getHighestIVStocks(10),
      volatilityService.getBiggestIVMovers(10),
      getRecentUnusualActivity(10),
    ]);

    res.json({
      vix,
      highestIV,
      biggestIVMoves,
      unusualActivity,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Options] Dashboard error:', err);
    res.status(500).json({ error: 'Failed to fetch volatility dashboard' });
  }
});

// GET /api/options/pcr/market
router.get('/pcr/market', async (req: Request, res: Response) => {
  try {
    const marketPCR = await putCallRatioService.getMarketPCR();
    res.json(marketPCR);
  } catch (err) {
    console.error('[Options] Market PCR error:', err);
    res.status(500).json({ error: 'Failed to fetch market PCR' });
  }
});

// GET /api/options/extremes
router.get('/extremes', async (req: Request, res: Response) => {
  try {
    const extremeRatios = await putCallRatioService.getExtremeRatios();
    res.json({
      extremes: extremeRatios,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Options] Extremes error:', err);
    res.status(500).json({ error: 'Failed to fetch extreme ratios' });
  }
});

// GET /api/options/reversals
router.get('/reversals', async (req: Request, res: Response) => {
  try {
    const reversals = await putCallRatioService.detectReversals();
    res.json({
      reversals,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Options] Reversals error:', err);
    res.status(500).json({ error: 'Failed to detect reversals' });
  }
});

// Helper function to get recent unusual activity
async function getRecentUnusualActivity(limit: number) {
  try {
    const db = getDb();
    const activities = db.prepare(`
      SELECT * FROM unusual_activity 
      WHERE detected_at > datetime('now', '-24 hours')
      ORDER BY score DESC 
      LIMIT ?
    `).all(limit);

    return (activities as any[]).map(activity => ({
      id: activity.id,
      ts: activity.detected_at,
      symbol: activity.symbol,
      type: activity.contract_type,
      strike: activity.strike,
      expiry: activity.expiry,
      sentiment: activity.sentiment,
      classification: activity.classification,
      volume: activity.volume,
      openInterest: activity.open_interest,
      volumeOIRatio: activity.volume_oi_ratio,
      notionalValue: activity.notional_value,
      score: activity.score,
      reason: activity.reason,
    }));
  } catch (error) {
    console.error('[Options] Error getting recent unusual activity:', error);
    return [];
  }
}

export default router;