import { Router, Request, Response } from 'express';
import { getOptionsChain, getIVData } from '../services/yahoo/options';

const router = Router();

// GET /api/options/chain/:symbol
router.get('/chain/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const expiration = req.query.expiration as string | undefined;
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
    const { symbol } = req.params;
    const ivData = await getIVData(symbol);
    res.json(ivData);
  } catch (err) {
    console.error('[Options] IV error:', err);
    res.status(500).json({ error: 'Failed to fetch IV data' });
  }
});

export default router;
