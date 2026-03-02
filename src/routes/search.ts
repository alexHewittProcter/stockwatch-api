import { Router, Request, Response } from 'express';
import { globalSearch } from '../services/search/global';

const router = Router();

// GET /api/search - Global search across all data types
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const types = req.query.types as string | undefined;
    const limit = req.query.limit as string | undefined;
    const actions = req.query.actions as string || 'true';

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    let searchTypes: string[] | undefined = undefined;
    if (types && typeof types === 'string') {
      searchTypes = types.split(',').map((t: string) => t.trim());
    }

    const results = await globalSearch.search({
      query: query.trim(),
      types: searchTypes,
      limit: limit ? Number(limit) : undefined,
      includeActions: actions !== 'false',
    });

    res.json({
      query: query.trim(),
      results,
      total: results.length,
    });
  } catch (err) {
    console.error('[Search] Global search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/search/recent - Recent searches/activity
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit as string || '10';
    
    const results = await globalSearch.getRecentSearches(Number(limit));
    
    res.json({
      results,
      total: results.length,
    });
  } catch (err) {
    console.error('[Search] Recent search error:', err);
    res.status(500).json({ error: 'Failed to fetch recent searches' });
  }
});

// GET /api/search/suggestions/:type - Type-specific suggestions
router.get('/suggestions/:type', async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const queryParam = req.query.q;
    const query = Array.isArray(queryParam) ? queryParam[0] : (queryParam as string || '');

    if (!['symbol', 'holder', 'dashboard'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type' });
    }

    const queryString = typeof query === 'string' ? query : '';
    
    // @ts-ignore
    const results = await globalSearch.search({
      query: queryString,
      types: [type],
      limit: 8,
      includeActions: false,
    });

    res.json({
      type: type,
      // @ts-ignore
      query: queryString,
      suggestions: results.map(r => ({
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        data: r.data,
      })),
    });
  } catch (err) {
    console.error('[Search] Suggestions error:', err);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

export default router;