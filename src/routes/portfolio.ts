import { Router, Request, Response } from 'express';
import { alpacaTrading } from '../services/alpaca/trading';
import { getDb } from '../db/schema';
import { v4 } from '../services/opportunities/uuid';
import { tradeJournalService } from '../services/portfolio/journal';
import { aiLearnService } from '../services/ai/learn';

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

// Enhanced Trade Journal Routes

// GET /api/portfolio/journal - all journal entries
router.get('/journal', async (req: Request, res: Response) => {
  try {
    const {
      status,
      symbol,
      direction,
      fromDate,
      toDate,
      hasPattern,
      limit,
      offset,
    } = req.query;

    const filters: any = {};
    if (status) filters.status = status as string;
    if (symbol) filters.symbol = symbol as string;
    if (direction) filters.direction = direction as string;
    if (fromDate) filters.fromDate = fromDate as string;
    if (toDate) filters.toDate = toDate as string;
    if (hasPattern !== undefined) filters.hasPattern = hasPattern === 'true';
    if (limit) filters.limit = Number(limit);
    if (offset) filters.offset = Number(offset);

    const entries = await tradeJournalService.getTrades(filters);
    res.json({ entries, total: entries.length });
  } catch (err) {
    console.error('[Portfolio] Journal error:', err);
    res.status(500).json({ error: 'Failed to fetch trade journal' });
  }
});

// GET /api/portfolio/journal/:id - entry detail
router.get('/journal/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const entry = await tradeJournalService.getTrade(id);
    
    if (!entry) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }
    
    res.json(entry);
  } catch (err) {
    console.error('[Portfolio] Get journal entry error:', err);
    res.status(500).json({ error: 'Failed to fetch journal entry' });
  }
});

// POST /api/portfolio/journal - create new trade entry
router.post('/journal', async (req: Request, res: Response) => {
  try {
    const {
      symbol,
      direction,
      entryDate,
      entryPrice,
      quantity,
      thesis,
      opportunityId,
      reportId,
      signals,
      notes,
      tags,
    } = req.body;

    if (!symbol || !direction || !entryDate || !entryPrice || !quantity || !thesis) {
      return res.status(400).json({ 
        error: 'symbol, direction, entryDate, entryPrice, quantity, and thesis are required' 
      });
    }

    if (!['long', 'short'].includes(direction)) {
      return res.status(400).json({ error: 'direction must be "long" or "short"' });
    }

    const entry = await tradeJournalService.createTrade({
      symbol: symbol.toUpperCase(),
      direction,
      entryDate,
      entryPrice: Number(entryPrice),
      quantity: Number(quantity),
      thesis,
      opportunityId,
      reportId,
      signals,
      notes,
      tags,
    });

    res.status(201).json(entry);
  } catch (err) {
    console.error('[Portfolio] Create journal entry error:', err);
    res.status(500).json({ 
      error: err instanceof Error ? err.message : 'Failed to create journal entry' 
    });
  }
});

// PUT /api/portfolio/journal/:id - update notes/tags
router.put('/journal/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { notes, tags } = req.body;

    const updated = await tradeJournalService.updateTrade(id, { notes, tags });
    
    if (!updated) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    res.json({ success: true, notes, tags });
  } catch (err) {
    console.error('[Portfolio] Update journal entry error:', err);
    res.status(500).json({ error: 'Failed to update journal entry' });
  }
});

// PUT /api/portfolio/journal/:id/close - close a trade
router.put('/journal/:id/close', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { exitPrice, exitDate } = req.body;

    if (!exitPrice) {
      return res.status(400).json({ error: 'exitPrice is required' });
    }

    const entry = await tradeJournalService.closeTrade(id, Number(exitPrice), exitDate);
    res.json(entry);
  } catch (err) {
    console.error('[Portfolio] Close trade error:', err);
    res.status(500).json({ 
      error: err instanceof Error ? err.message : 'Failed to close trade' 
    });
  }
});

// GET /api/portfolio/journal/stats - win rate, avg P&L, best/worst, by direction
router.get('/journal/stats', async (req: Request, res: Response) => {
  try {
    const { fromDate, toDate, symbol, direction } = req.query;

    const filters: any = {};
    if (fromDate) filters.fromDate = fromDate as string;
    if (toDate) filters.toDate = toDate as string;
    if (symbol) filters.symbol = symbol as string;
    if (direction) filters.direction = direction as string;

    const stats = await tradeJournalService.getTradeStats(filters);
    res.json(stats);
  } catch (err) {
    console.error('[Portfolio] Journal stats error:', err);
    res.status(500).json({ error: 'Failed to calculate trade statistics' });
  }
});

// POST /api/portfolio/journal/:id/learn - trigger AI Learn on this trade
router.post('/journal/:id/learn', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    
    const pattern = await aiLearnService.analyzeTradeForPattern(id);
    res.json({ success: true, pattern });
  } catch (err) {
    console.error('[Portfolio] Learn error:', err);
    res.status(500).json({ 
      error: err instanceof Error ? err.message : 'Failed to analyze trade' 
    });
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
