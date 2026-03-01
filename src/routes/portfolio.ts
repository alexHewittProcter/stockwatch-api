import { Router, Request, Response } from 'express';
import { alpacaTrading } from '../services/alpaca/trading';
import { getDb } from '../db/schema';
import { v4 } from '../services/opportunities/uuid';

const router = Router();

// GET /api/portfolio/positions
router.get('/positions', async (_req: Request, res: Response) => {
  try {
    const positions = await alpacaTrading.getPositions();
    res.json(positions);
  } catch (err) {
    console.error('[Portfolio] Positions error:', err);
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

// GET /api/portfolio/history
router.get('/history', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || '1M';
    const timeframe = (req.query.timeframe as string) || '1D';
    const history = await alpacaTrading.getPortfolioHistory(period, timeframe);
    res.json(history);
  } catch (err) {
    console.error('[Portfolio] History error:', err);
    res.status(500).json({ error: 'Failed to fetch portfolio history' });
  }
});

// POST /api/portfolio/order
router.post('/order', async (req: Request, res: Response) => {
  try {
    const { symbol, qty, side, type, time_in_force, limit_price, stop_price } = req.body;

    if (!symbol || !qty || !side || !type) {
      return res.status(400).json({ error: 'symbol, qty, side, and type are required' });
    }

    if (!['buy', 'sell'].includes(side)) {
      return res.status(400).json({ error: 'side must be "buy" or "sell"' });
    }

    if (!['market', 'limit', 'stop', 'stop_limit'].includes(type)) {
      return res.status(400).json({ error: 'type must be market, limit, stop, or stop_limit' });
    }

    if (type === 'limit' && limit_price == null) {
      return res.status(400).json({ error: 'limit_price required for limit orders' });
    }

    if ((type === 'stop' || type === 'stop_limit') && stop_price == null) {
      return res.status(400).json({ error: 'stop_price required for stop orders' });
    }

    const order = await alpacaTrading.submitOrder({
      symbol,
      qty: Number(qty),
      side,
      type,
      time_in_force,
      limit_price: limit_price != null ? Number(limit_price) : undefined,
      stop_price: stop_price != null ? Number(stop_price) : undefined,
    });

    // Auto-log to trade journal
    const db = getDb();
    db.prepare(`
      INSERT INTO trade_journal (id, symbol, side, qty, price, order_type, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      v4(),
      symbol.toUpperCase(),
      side,
      Number(qty),
      Number(order.filled_avg_price || limit_price || 0),
      type,
      order.status,
    );

    res.status(201).json(order);
  } catch (err) {
    console.error('[Portfolio] Order error:', err);
    res.status(500).json({ error: 'Failed to submit order' });
  }
});

// GET /api/portfolio/journal
router.get('/journal', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const entries = db.prepare('SELECT * FROM trade_journal ORDER BY created_at DESC LIMIT 100').all();
    res.json(entries);
  } catch (err) {
    console.error('[Portfolio] Journal error:', err);
    res.status(500).json({ error: 'Failed to fetch trade journal' });
  }
});

// POST /api/portfolio/journal/:id/learn
router.post('/journal/:id/learn', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = getDb();
    const entry = db.prepare('SELECT * FROM trade_journal WHERE id = ?').get(id) as Record<string, unknown> | undefined;

    if (!entry) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    // Stub — real implementation uses Norman Agent
    const analysis = `AI analysis stub for ${entry.symbol} ${entry.side} trade. Norman Agent will provide pattern recognition, risk/reward analysis, and timing evaluation once integrated.`;

    db.prepare('UPDATE trade_journal SET ai_analysis = ? WHERE id = ?').run(analysis, id);

    res.json({ id, analysis });
  } catch (err) {
    console.error('[Portfolio] Learn error:', err);
    res.status(500).json({ error: 'Failed to analyze trade' });
  }
});

// GET /api/portfolio/account
router.get('/account', async (_req: Request, res: Response) => {
  try {
    const account = await alpacaTrading.getAccount();
    res.json(account);
  } catch (err) {
    console.error('[Portfolio] Account error:', err);
    res.status(500).json({ error: 'Failed to fetch account' });
  }
});

export default router;
