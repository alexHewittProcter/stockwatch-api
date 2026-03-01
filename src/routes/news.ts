import { Router, Request, Response } from 'express';
import { rssAggregator } from '../services/news/rss-aggregator';
import { getNews } from '../services/alpha-vantage/news';

const router = Router();

// GET /api/news/feed?tab=foryou|trending|opportunities|social
router.get('/feed', async (req: Request, res: Response) => {
  try {
    const tab = (req.query.tab as string) || 'foryou';
    const articles = await rssAggregator.fetchByTab(tab);

    // If RSS yields few results, supplement with Alpha Vantage
    if (articles.length < 5) {
      const avNews = await getNews();
      const combined = [
        ...articles,
        ...avNews.map(a => ({
          id: a.url,
          title: a.title,
          link: a.url,
          summary: a.summary,
          source: a.source,
          category: 'finance',
          publishedAt: a.publishedAt,
          tickers: a.tickers,
          sentiment: a.sentiment.score,
        })),
      ];
      return res.json(combined.slice(0, 50));
    }

    res.json(articles);
  } catch (err) {
    console.error('[News] Feed error:', err);
    res.status(500).json({ error: 'Failed to fetch news feed' });
  }
});

// POST /api/news/subscribe
router.post('/subscribe', (req: Request, res: Response) => {
  try {
    const { name, url, category } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }

    rssAggregator.addSource({
      name,
      url,
      category: category || 'general',
    });

    res.status(201).json({ success: true, sources: rssAggregator.getSources() });
  } catch (err) {
    console.error('[News] Subscribe error:', err);
    res.status(500).json({ error: 'Failed to subscribe to source' });
  }
});

export default router;
