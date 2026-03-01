import { Router, Request, Response } from 'express';
import { getOptionsChain, getIVData } from '../services/yahoo/options';

const router = Router();

// GET /api/options/chain/:symbol
router.get('/chain/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const expiration = Array.isArray(req.query.expiration) ? req.query.expiration[0] as string : typeof req.query.expiration === 'string' ? req.query.expiration : undefined;
    const chain = await getOptionsChain(symbol, expiration);
    res.json(chain);
  } catch (err) {
    console.error('[Options] Chain error:', err);
    res.status(500).json({ error: 'Failed to fetch options chain' });
  }
});

// GET /api/options/iv/:symbol
router.get('/iv/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const ivData = await getIVData(symbol);
    res.json(ivData);
  } catch (err) {
    console.error('[Options] IV error:', err);
    res.status(500).json({ error: 'Failed to fetch IV data' });
  }
});

export default router;
