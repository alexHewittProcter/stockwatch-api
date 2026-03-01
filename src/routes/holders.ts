import { Router, Request, Response } from 'express';
import { getHolders } from '../services/yahoo/holders';
import { getDb } from '../db/schema';
import { v4 } from '../services/opportunities/uuid';

const router = Router();

// GET /api/holders/:symbol
router.get('/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const data = await getHolders(symbol);
    res.json(data);
  } catch (err) {
    console.error('[Holders] Error:', err);
    res.status(500).json({ error: 'Failed to fetch holders' });
  }
});

// GET /api/holders/institution/:name
router.get('/institution/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    // Stub — Yahoo Finance doesn't easily provide institution-level portfolio
    res.json({
      institution: name,
      holdings: [],
      note: 'Full institution holdings require SEC EDGAR 13F parsing (Phase 2)',
    });
  } catch (err) {
    console.error('[Holders] Institution error:', err);
    res.status(500).json({ error: 'Failed to fetch institution data' });
  }
});

// GET /api/holders/tracked
router.get('/tracked', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const holders = db.prepare('SELECT * FROM tracked_holders ORDER BY tracked_since DESC').all();
    res.json(holders);
  } catch (err) {
    console.error('[Holders] Tracked error:', err);
    res.status(500).json({ error: 'Failed to fetch tracked holders' });
  }
});

// POST /api/holders/track
router.post('/track', (req: Request, res: Response) => {
  try {
    const { name, type } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    if (!['institution', 'insider'].includes(type)) {
      return res.status(400).json({ error: 'Type must be "institution" or "insider"' });
    }

    const db = getDb();
    const id = v4();

    db.prepare(`
      INSERT INTO tracked_holders (id, name, type) VALUES (?, ?, ?)
    `).run(id, name, type);

    res.status(201).json({ id, name, type, tracked_since: new Date().toISOString() });
  } catch (err) {
    console.error('[Holders] Track error:', err);
    res.status(500).json({ error: 'Failed to track holder' });
  }
});

export default router;
