import { Router, Request, Response } from 'express';
import { globalSearch } from '../services/search/global';

const router = Router();

// GET /api/search - Global search across all data types
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      q: query,
      types,
      limit,
      actions = 'true',
    } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    let searchTypes: string[] | undefined = undefined;
    if (types) {
      const typesString = Array.isArray(types) ? types[0] : types;
      searchTypes = String(typesString).split(',').map((t: string) => t.trim());
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
    const { limit = 10 } = req.query;
    
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
    const { q: query = '' } = req.query;

    if (!['symbol', 'holder', 'dashboard'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type' });
    }

    const queryString = Array.isArray(query) ? query[0] : String(query || '');
    
    const results = await globalSearch.search({
      query: queryString,
      types: [type],
      limit: 8,
      includeActions: false,
    });

    res.json({
      type,
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