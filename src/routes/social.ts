import { Router, Request, Response } from 'express';
import { redditScraper } from '../services/social/reddit';
import { socialTrending } from '../services/social/trending';

const router = Router();

// GET /api/social/trending
router.get('/trending', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as '1h' | '4h' | '24h' | '7d') || '24h';
    
    // Try to get cached trending data first
    let trending = socialTrending.getCachedTrending(period);
    
    // If no cached data or data is stale, recalculate
    if (trending.length === 0) {
      trending = await socialTrending.calculateTrending(period);
    }

    res.json({
      period,
      trending,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Social] Trending error:', err);
    res.status(500).json({ error: 'Failed to fetch trending data' });
  }
});

// GET /api/social/sentiment/:symbol
router.get('/sentiment/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const period = (req.query.period as '1h' | '4h' | '24h' | '7d') || '24h';

    const sentimentData = socialTrending.getTickerSentimentAnalysis(symbol, period);
    res.json(sentimentData);
  } catch (err) {
    console.error('[Social] Sentiment error:', err);
    res.status(500).json({ error: 'Failed to fetch sentiment data' });
  }
});

// GET /api/social/mentions/:symbol
router.get('/mentions/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const hours = parseInt(req.query.hours as string) || 24;

    const mentionStats = redditScraper.getTickerMentionStats(symbol, hours);
    res.json({
      symbol,
      hours,
      ...mentionStats,
    });
  } catch (err) {
    console.error('[Social] Mentions error:', err);
    res.status(500).json({ error: 'Failed to fetch mention data' });
  }
});

// GET /api/social/reddit/hot
router.get('/reddit/hot', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const posts = redditScraper.getHotPosts(limit);
    
    res.json({
      posts,
      total: posts.length,
    });
  } catch (err) {
    console.error('[Social] Reddit hot error:', err);
    res.status(500).json({ error: 'Failed to fetch hot Reddit posts' });
  }
});

// GET /api/social/reddit/:subreddit
router.get('/reddit/:subreddit', async (req: Request, res: Response) => {
  try {
    const subreddit = req.params.subreddit as string;
    const limit = parseInt(req.query.limit as string) || 50;

    // Validate subreddit is in our tracked list
    const trackedSubreddits = redditScraper.getTrackedSubreddits();
    if (!trackedSubreddits.includes(subreddit)) {
      return res.status(400).json({ error: 'Subreddit not tracked' });
    }

    const posts = redditScraper.getSubredditPosts(subreddit, limit);
    
    res.json({
      subreddit,
      posts,
      total: posts.length,
    });
  } catch (err) {
    console.error('[Social] Subreddit error:', err);
    res.status(500).json({ error: 'Failed to fetch subreddit posts' });
  }
});

// GET /api/social/hype
router.get('/hype', async (req: Request, res: Response) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const alerts = socialTrending.getRecentHypeAlerts(hours);
    
    res.json({
      alerts,
      total: alerts.length,
      hours,
    });
  } catch (err) {
    console.error('[Social] Hype error:', err);
    res.status(500).json({ error: 'Failed to fetch hype alerts' });
  }
});

// GET /api/social/posts/:symbol
router.get('/posts/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const hours = parseInt(req.query.hours as string) || 24;
    const limit = parseInt(req.query.limit as string) || 50;

    const posts = redditScraper.getTickerPosts(symbol, hours).slice(0, limit);
    
    res.json({
      symbol,
      hours,
      posts,
      total: posts.length,
    });
  } catch (err) {
    console.error('[Social] Symbol posts error:', err);
    res.status(500).json({ error: 'Failed to fetch symbol posts' });
  }
});

// GET /api/social/subreddits
router.get('/subreddits', async (req: Request, res: Response) => {
  try {
    const subreddits = redditScraper.getTrackedSubreddits();
    res.json({ subreddits });
  } catch (err) {
    console.error('[Social] Subreddits error:', err);
    res.status(500).json({ error: 'Failed to fetch subreddits' });
  }
});

// POST /api/social/detect-hype
router.post('/detect-hype', async (req: Request, res: Response) => {
  try {
    const alerts = await socialTrending.detectHypeAlerts();
    res.json({
      alerts,
      detected: alerts.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Social] Detect hype error:', err);
    res.status(500).json({ error: 'Failed to detect hype alerts' });
  }
});

// POST /api/social/calculate-trending
router.post('/calculate-trending', async (req: Request, res: Response) => {
  try {
    const period = (req.body.period as '1h' | '4h' | '24h' | '7d') || '24h';
    const trending = await socialTrending.calculateTrending(period);
    
    res.json({
      period,
      trending,
      calculated: trending.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Social] Calculate trending error:', err);
    res.status(500).json({ error: 'Failed to calculate trending' });
  }
});

export default router;