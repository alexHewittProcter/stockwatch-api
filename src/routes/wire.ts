import { Router, Request, Response } from 'express';
import { wireFeed } from '../services/wire/feed';

const router = Router();

// GET /api/wire/feed - Get wire feed events
router.get('/feed', async (req: Request, res: Response) => {
  try {
    const {
      filter = 'all',
      types,
      symbols,
      impact,
      sentiment,
      limit = 50,
      before,
      historical = 'false',
    } = req.query;

    const wireFilter = {
      filter: filter as 'recommended' | 'favourites' | 'all',
      types: types ? (types as string).split(',') : undefined,
      symbols: symbols ? (symbols as string).split(',') : undefined,
      impact: impact as string,
      sentiment: sentiment as string,
    };

    const events = historical === 'true' 
      ? wireFeed.getHistoricalFeed(wireFilter, Number(limit), before as string)
      : wireFeed.getFeed(wireFilter, Number(limit), before as string);

    res.json({
      events,
      total: events.length,
      filter: wireFilter,
      hasMore: events.length === Number(limit),
      cursor: events.length > 0 ? events[events.length - 1].id : null,
    });
  } catch (error) {
    console.error('[Wire] Get feed error:', error);
    res.status(500).json({ error: 'Failed to get wire feed' });
  }
});

// GET /api/wire/stats - Get wire feed statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = wireFeed.getStats();
    
    res.json({
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Wire] Get stats error:', error);
    res.status(500).json({ error: 'Failed to get wire stats' });
  }
});

// POST /api/wire/alert - Add custom alert to wire
router.post('/alert', async (req: Request, res: Response) => {
  try {
    const { type, symbol, message, impact = 'medium' } = req.body;
    
    if (!type || !symbol || !message) {
      return res.status(400).json({ 
        error: 'Missing required fields: type, symbol, message' 
      });
    }
    
    if (!['low', 'medium', 'high'].includes(impact)) {
      return res.status(400).json({ 
        error: 'Impact must be one of: low, medium, high' 
      });
    }
    
    wireFeed.addAlert(type, symbol, message, impact);
    
    res.status(201).json({
      success: true,
      message: 'Alert added to wire feed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Wire] Add alert error:', error);
    res.status(500).json({ error: 'Failed to add alert' });
  }
});

// POST /api/wire/economic - Add economic event to wire
router.post('/economic', async (req: Request, res: Response) => {
  try {
    const { type, title, impact = 'medium' } = req.body;
    
    if (!type || !title) {
      return res.status(400).json({ 
        error: 'Missing required fields: type, title' 
      });
    }
    
    if (!['low', 'medium', 'high'].includes(impact)) {
      return res.status(400).json({ 
        error: 'Impact must be one of: low, medium, high' 
      });
    }
    
    wireFeed.addEconomicEvent(type, title, impact);
    
    res.status(201).json({
      success: true,
      message: 'Economic event added to wire feed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Wire] Add economic event error:', error);
    res.status(500).json({ error: 'Failed to add economic event' });
  }
});

// GET /api/wire/types - Get available event types
router.get('/types', async (req: Request, res: Response) => {
  try {
    const types = [
      {
        id: 'price_move',
        name: 'Price Movements',
        description: 'Significant price changes and volume spikes',
        icon: '📈',
        color: '#10b981',
      },
      {
        id: 'news',
        name: 'News',
        description: 'Financial news and press releases',
        icon: '📰',
        color: '#3b82f6',
      },
      {
        id: 'social',
        name: 'Social',
        description: 'Social media mentions and sentiment',
        icon: '💬',
        color: '#8b5cf6',
      },
      {
        id: 'holder',
        name: 'Holders',
        description: 'Institutional and insider activity',
        icon: '🏛️',
        color: '#f59e0b',
      },
      {
        id: 'options_flow',
        name: 'Options Flow',
        description: 'Unusual options activity',
        icon: '📊',
        color: '#ef4444',
      },
      {
        id: 'opportunity',
        name: 'Opportunities',
        description: 'AI-detected trading opportunities',
        icon: '🎯',
        color: '#06b6d4',
      },
      {
        id: 'trade',
        name: 'Trades',
        description: 'Auto-trader executions',
        icon: '🤖',
        color: '#84cc16',
      },
      {
        id: 'alert',
        name: 'Alerts',
        description: 'Custom price and condition alerts',
        icon: '⚠️',
        color: '#f97316',
      },
      {
        id: 'economic',
        name: 'Economic',
        description: 'Economic indicators and events',
        icon: '🏦',
        color: '#6366f1',
      },
    ];
    
    res.json({
      types,
      total: types.length,
    });
  } catch (error) {
    console.error('[Wire] Get types error:', error);
    res.status(500).json({ error: 'Failed to get event types' });
  }
});

// GET /api/wire/sources - Get available event sources
router.get('/sources', async (req: Request, res: Response) => {
  try {
    const sources = [
      {
        id: 'market_data',
        name: 'Market Data',
        description: 'Real-time price and volume data',
        active: true,
      },
      {
        id: 'news',
        name: 'Financial News',
        description: 'RSS feeds from financial news sources',
        active: true,
      },
      {
        id: 'reddit',
        name: 'Reddit',
        description: 'Social sentiment from trading subreddits',
        active: true,
      },
      {
        id: 'sec_edgar',
        name: 'SEC EDGAR',
        description: 'Institutional filings and insider trades',
        active: true,
      },
      {
        id: 'options_scanner',
        name: 'Options Scanner',
        description: 'Unusual options activity detection',
        active: true,
      },
      {
        id: 'opportunity_engine',
        name: 'Opportunity Engine',
        description: 'AI opportunity detection system',
        active: true,
      },
      {
        id: 'auto_trader',
        name: 'Auto Trader',
        description: 'Automated trading system',
        active: true,
      },
      {
        id: 'alert_system',
        name: 'Alert System',
        description: 'Custom alerts and notifications',
        active: true,
      },
      {
        id: 'economic_calendar',
        name: 'Economic Calendar',
        description: 'Economic indicators and events',
        active: false, // Would be enabled with data source
      },
    ];
    
    res.json({
      sources,
      active: sources.filter(s => s.active).length,
      total: sources.length,
    });
  } catch (error) {
    console.error('[Wire] Get sources error:', error);
    res.status(500).json({ error: 'Failed to get event sources' });
  }
});

// GET /api/wire/filters - Get available filters with counts
router.get('/filters', async (req: Request, res: Response) => {
  try {
    // This would typically query the database for actual counts
    // For now, return static filter options
    const filters = {
      main: [
        { id: 'recommended', name: 'Recommended', count: 42, icon: '⭐' },
        { id: 'favourites', name: 'Favourites', count: 18, icon: '❤️' },
        { id: 'all', name: 'All Events', count: 247, icon: '🌐' },
      ],
      impact: [
        { id: 'high', name: 'High Impact', count: 23, color: '#ef4444' },
        { id: 'medium', name: 'Medium Impact', count: 89, color: '#f59e0b' },
        { id: 'low', name: 'Low Impact', count: 135, color: '#6b7280' },
      ],
      sentiment: [
        { id: 'bullish', name: 'Bullish', count: 97, color: '#10b981' },
        { id: 'bearish', name: 'Bearish', count: 54, color: '#ef4444' },
        { id: 'neutral', name: 'Neutral', count: 96, color: '#6b7280' },
      ],
    };
    
    res.json({
      filters,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Wire] Get filters error:', error);
    res.status(500).json({ error: 'Failed to get filters' });
  }
});

// POST /api/wire/preferences - Update wire preferences
router.post('/preferences', async (req: Request, res: Response) => {
  try {
    const { 
      enableSound = false, 
      soundVolume = 50,
      autoScroll = true,
      refreshInterval = 5000,
      compactMode = false,
      showThumbnails = true,
      maxEvents = 100,
    } = req.body;
    
    // In a full implementation, save to database
    const preferences = {
      enableSound,
      soundVolume,
      autoScroll,
      refreshInterval,
      compactMode,
      showThumbnails,
      maxEvents,
      updatedAt: new Date().toISOString(),
    };
    
    res.json({
      success: true,
      preferences,
    });
  } catch (error) {
    console.error('[Wire] Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// GET /api/wire/preferences - Get wire preferences
router.get('/preferences', async (req: Request, res: Response) => {
  try {
    // Default preferences - in full implementation, load from database
    const preferences = {
      enableSound: false,
      soundVolume: 50,
      autoScroll: true,
      refreshInterval: 5000,
      compactMode: false,
      showThumbnails: true,
      maxEvents: 100,
      updatedAt: new Date().toISOString(),
    };
    
    res.json({
      preferences,
    });
  } catch (error) {
    console.error('[Wire] Get preferences error:', error);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

// GET /api/wire/search - Search wire events
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { 
      q: query,
      type,
      symbol,
      fromDate,
      toDate,
      limit = 50,
    } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    
    // Simple search implementation - in full version would use database FTS
    const allEvents = wireFeed.getHistoricalFeed({ filter: 'all' }, 1000);
    
    const filteredEvents = allEvents.filter(event => {
      const matchesQuery = event.title.toLowerCase().includes((query as string).toLowerCase()) ||
                          (event.detail && event.detail.toLowerCase().includes((query as string).toLowerCase()));
      
      if (!matchesQuery) return false;
      
      if (type && event.type !== type) return false;
      if (symbol && event.symbol !== symbol) return false;
      
      if (fromDate && new Date(event.ts) < new Date(fromDate as string)) return false;
      if (toDate && new Date(event.ts) > new Date(toDate as string)) return false;
      
      return true;
    }).slice(0, Number(limit));
    
    res.json({
      events: filteredEvents,
      total: filteredEvents.length,
      query,
      filters: { type, symbol, fromDate, toDate },
    });
  } catch (error) {
    console.error('[Wire] Search error:', error);
    res.status(500).json({ error: 'Failed to search wire events' });
  }
});

export default router;