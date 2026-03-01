import { Router, Request, Response } from 'express';
import { getAllSubredditPosts, getSubredditPosts, countTickerMentions, getTickerSentiment } from '../services/social/reddit';
import { getBizCatalog, countChanTickerMentions } from '../services/social/fourchan';

const router = Router();

// GET /api/social/trending
router.get('/trending', async (_req: Request, res: Response) => {
  try {
    const [redditPosts, chanPosts] = await Promise.all([
      getAllSubredditPosts(),
      getBizCatalog(),
    ]);

    const redditMentions = countTickerMentions(redditPosts);
    const chanMentions = countChanTickerMentions(chanPosts);

    // Combine mentions
    const combined = new Map<string, { reddit: number; chan: number; total: number }>();

    for (const [ticker, count] of redditMentions) {
      const existing = combined.get(ticker) || { reddit: 0, chan: 0, total: 0 };
      existing.reddit = count;
      existing.total += count;
      combined.set(ticker, existing);
    }

    for (const [ticker, count] of chanMentions) {
      const existing = combined.get(ticker) || { reddit: 0, chan: 0, total: 0 };
      existing.chan = count;
      existing.total += count;
      combined.set(ticker, existing);
    }

    // Sort by total mentions
    const trending = Array.from(combined.entries())
      .map(([ticker, counts]) => ({ ticker, ...counts }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 25);

    res.json({
      trending,
      redditPostCount: redditPosts.length,
      chanPostCount: chanPosts.length,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Social] Trending error:', err);
    res.status(500).json({ error: 'Failed to fetch trending data' });
  }
});

// GET /api/social/sentiment/:symbol
router.get('/sentiment/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const redditPosts = await getAllSubredditPosts();
    const sentiment = getTickerSentiment(redditPosts, symbol);

    res.json({
      symbol: symbol.toUpperCase(),
      ...sentiment,
    });
  } catch (err) {
    console.error('[Social] Sentiment error:', err);
    res.status(500).json({ error: 'Failed to fetch sentiment' });
  }
});

// GET /api/social/reddit/:subreddit
router.get('/reddit/:subreddit', async (req: Request, res: Response) => {
  try {
    const { subreddit } = req.params;
    const sort = (req.query.sort as string) || 'hot';
    const limit = parseInt(req.query.limit as string) || 25;

    const posts = await getSubredditPosts(subreddit, sort, limit);
    res.json(posts);
  } catch (err) {
    console.error('[Social] Reddit error:', err);
    res.status(500).json({ error: 'Failed to fetch reddit posts' });
  }
});

// GET /api/social/4chan
router.get('/4chan', async (_req: Request, res: Response) => {
  try {
    const posts = await getBizCatalog();
    res.json(posts);
  } catch (err) {
    console.error('[Social] 4chan error:', err);
    res.status(500).json({ error: 'Failed to fetch 4chan posts' });
  }
});

export default router;
