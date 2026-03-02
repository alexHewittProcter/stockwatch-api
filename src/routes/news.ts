import { Router, Request, Response } from 'express';
import { rssAggregator } from '../services/news/rss-aggregator';
import { redditScraper } from '../services/social/reddit';
import { socialTrending } from '../services/social/trending';

const router = Router();

// GET /api/news/feed
router.get('/feed', async (req: Request, res: Response) => {
  try {
    const {
      tab = 'foryou',
      symbols,
      sources,
      sentiment,
      limit = 50,
      offset = 0,
    } = req.query;

    let articles = [];

    switch (tab) {
      case 'trending':
        articles = await getTrendingNews(Number(limit), Number(offset));
        break;
      case 'opportunities':
        articles = await getOpportunityNews(Number(limit), Number(offset));
        break;
      case 'social':
        articles = await getSocialFeed(Number(limit), Number(offset));
        break;
      case 'foryou':
      default:
        articles = rssAggregator.getArticles({
          limit: Number(limit),
          offset: Number(offset),
          symbols: symbols ? (symbols as string).split(',') : undefined,
          sources: sources ? (sources as string).split(',') : undefined,
          sentiment: sentiment as 'bullish' | 'bearish' | 'neutral',
        });
        break;
    }

    res.json({
      tab,
      articles,
      total: articles.length,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (err) {
    console.error('[News] Feed error:', err);
    res.status(500).json({ error: 'Failed to fetch news feed' });
  }
});

// GET /api/news/article/:id
router.get('/article/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const article = rssAggregator.getArticleById(id);
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    res.json(article);
  } catch (err) {
    console.error('[News] Article error:', err);
    res.status(500).json({ error: 'Failed to fetch article' });
  }
});

// GET /api/news/sources
router.get('/sources', async (req: Request, res: Response) => {
  try {
    const sources = rssAggregator.getSources();
    res.json({ sources });
  } catch (err) {
    console.error('[News] Sources error:', err);
    res.status(500).json({ error: 'Failed to fetch sources' });
  }
});

// POST /api/news/sources
router.post('/sources', async (req: Request, res: Response) => {
  try {
    const { name, url } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }

    const source = await rssAggregator.addSource(name as string, url as string);
    res.status(201).json(source);
  } catch (err) {
    console.error('[News] Add source error:', err);
    res.status(500).json({ error: 'Failed to add source: ' + err });
  }
});

// DELETE /api/news/sources/:id
router.delete('/sources/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    rssAggregator.removeSource(id as string);
    res.json({ success: true });
  } catch (err) {
    console.error('[News] Remove source error:', err);
    res.status(500).json({ error: 'Failed to remove source' });
  }
});

// Helper functions

async function getTrendingNews(limit: number, offset: number) {
  // Get articles about trending tickers
  const trending = socialTrending.getCachedTrending('24h');
  const trendingSymbols = trending.slice(0, 10).map(t => t.ticker);
  
  if (trendingSymbols.length === 0) {
    return rssAggregator.getArticles({ limit, offset });
  }

  return rssAggregator.getArticles({
    limit,
    offset,
    symbols: trendingSymbols,
  });
}

async function getOpportunityNews(limit: number, offset: number) {
  // Get articles with strong sentiment
  const bullishArticles = rssAggregator.getArticles({
    limit: Math.ceil(limit / 2),
    offset,
    sentiment: 'bullish',
  });

  const bearishArticles = rssAggregator.getArticles({
    limit: Math.floor(limit / 2),
    offset: Math.ceil(offset / 2),
    sentiment: 'bearish',
  });

  // Combine and sort by absolute sentiment score
  return [...bullishArticles, ...bearishArticles]
    .sort((a, b) => Math.abs(b.sentiment.score) - Math.abs(a.sentiment.score));
}

async function getSocialFeed(limit: number, offset: number) {
  // Return recent high-scoring social posts formatted as news items
  const hotPosts = redditScraper.getHotPosts(limit);
  
  // Convert social posts to news-like format
  return hotPosts.map(post => ({
    id: post.id,
    url: post.url,
    title: post.title,
    content: post.content,
    contentSnippet: post.content.length > 200 ? post.content.substring(0, 200) + '...' : post.content,
    publishedAt: post.publishedAt,
    source: post.platform,
    sourceName: `r/${post.source}`,
    tickers: post.tickers,
    sentiment: post.sentiment,
    author: post.author,
    category: 'social',
  }));
}

export default router;