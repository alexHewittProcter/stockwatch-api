import Parser from 'rss-parser';
import { getDb } from '../../db/schema';
import { v4 } from '../opportunities/uuid';
import { NewsSource, NewsArticle } from './types';
import { tickerExtractor } from './ticker-extractor';
import { sentimentScorer } from './sentiment';

const parser = new Parser({
  timeout: 30000,
  headers: {
    'User-Agent': 'StockWatch/1.0 News Aggregator (basil.hewittprocter@gmail.com)',
  },
});

export class RSSAggregatorService {
  private readonly defaultSources: Omit<NewsSource, 'id'>[] = [
    { name: 'Morning Brew', url: 'https://www.morningbrew.com/daily/rss', enabled: true },
    { name: 'Reuters Business', url: 'http://feeds.reuters.com/reuters/businessNews', enabled: true },
    { name: 'MarketWatch', url: 'http://feeds.marketwatch.com/marketwatch/topstories', enabled: true },
    { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex', enabled: true },
    { name: 'Seeking Alpha', url: 'https://seekingalpha.com/market_currents.xml', enabled: true },
    { name: 'The Motley Fool', url: 'https://www.fool.com/feeds/index.aspx', enabled: true },
    { name: 'Investor\'s Business Daily', url: 'https://www.investors.com/feed/', enabled: true },
    { name: 'Barron\'s', url: 'https://www.barrons.com/feed', enabled: true },
    // Note: Some feeds may require special handling or headers
  ];

  /**
   * Initialize default sources if none exist
   */
  async initializeDefaultSources(): Promise<void> {
    const db = getDb();
    const existingSources = db.prepare('SELECT COUNT(*) as count FROM news_sources').get() as { count: number };
    
    if (existingSources.count === 0) {
      for (const source of this.defaultSources) {
        const id = v4();
        db.prepare(`
          INSERT INTO news_sources (id, name, url, enabled, created_at) 
          VALUES (?, ?, ?, ?, ?)
        `).run(id, source.name, source.url, source.enabled ? 1 : 0, new Date().toISOString());
      }
      console.log('[RSS] Initialized default news sources');
    }
  }

  /**
   * Get all configured sources
   */
  getSources(): NewsSource[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM news_sources 
      ORDER BY enabled DESC, name ASC
    `).all();

    return (rows as any[]).map(row => ({
      id: row.id,
      name: row.name,
      url: row.url,
      enabled: Boolean(row.enabled),
      lastChecked: row.last_checked,
      articleCount: row.article_count || 0,
    }));
  }

  /**
   * Add a new RSS source
   */
  async addSource(name: string, url: string): Promise<NewsSource> {
    // Validate RSS feed by trying to fetch it
    try {
      await parser.parseURL(url);
    } catch (error) {
      throw new Error(`Invalid RSS feed: ${error}`);
    }

    const db = getDb();
    const id = v4();
    
    db.prepare(`
      INSERT INTO news_sources (id, name, url, enabled, created_at) 
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, url, 1, new Date().toISOString());

    return {
      id,
      name,
      url,
      enabled: true,
      articleCount: 0,
    };
  }

  /**
   * Remove a source
   */
  removeSource(id: string): void {
    const db = getDb();
    db.prepare('DELETE FROM news_sources WHERE id = ?').run(id);
    db.prepare('DELETE FROM news_articles WHERE source_id = ?').run(id);
  }

  /**
   * Fetch articles from all enabled sources
   */
  async fetchAllSources(): Promise<void> {
    const sources = this.getSources().filter(s => s.enabled);
    const results = await Promise.allSettled(
      sources.map(source => this.fetchSource(source))
    );

    let totalFetched = 0;
    let totalErrors = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const source = sources[i];
      
      if (result.status === 'fulfilled') {
        const count = result.value;
        totalFetched += count;
        console.log(`[RSS] ${source.name}: ${count} new articles`);
      } else {
        totalErrors++;
        console.error(`[RSS] ${source.name} failed:`, result.reason);
      }
    }

    console.log(`[RSS] Fetch complete: ${totalFetched} new articles, ${totalErrors} errors`);
  }

  /**
   * Fetch articles from a single source
   */
  async fetchSource(source: NewsSource): Promise<number> {
    try {
      const feed = await parser.parseURL(source.url);
      const db = getDb();
      let newArticles = 0;

      // Update last checked timestamp
      db.prepare(`
        UPDATE news_sources 
        SET last_checked = ? 
        WHERE id = ?
      `).run(new Date().toISOString(), source.id);

      for (const item of feed.items.slice(0, 20)) { // Limit to 20 most recent
        if (!item.link || !item.title) continue;

        // Check if article already exists
        const existing = db.prepare(`
          SELECT id FROM news_articles WHERE url = ?
        `).get(item.link);

        if (existing) continue;

        // Extract tickers from title and content
        const content = item.contentSnippet || item.content || '';
        const fullText = `${item.title} ${content}`;
        const tickers = tickerExtractor.extract(fullText);
        
        // Score sentiment
        const sentiment = sentimentScorer.score(fullText);

        // Create article
        const articleId = v4();
        const article: NewsArticle = {
          id: articleId,
          url: item.link,
          title: item.title,
          content: item.content || item.contentSnippet || '',
          contentSnippet: this.createSnippet(item.contentSnippet || item.content || ''),
          publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          source: source.id,
          sourceName: source.name,
          tickers,
          sentiment,
          author: item.creator || item.author,
          imageUrl: this.extractImageUrl(item),
        };

        // Store in database
        db.prepare(`
          INSERT INTO news_articles (
            id, url, title, content, content_snippet, published_at, 
            source_id, source_name, tickers, sentiment_score, 
            sentiment_label, author, image_url, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          article.id,
          article.url,
          article.title,
          article.content,
          article.contentSnippet,
          article.publishedAt,
          article.source,
          article.sourceName,
          JSON.stringify(article.tickers),
          article.sentiment.score,
          article.sentiment.label,
          article.author,
          article.imageUrl,
          new Date().toISOString()
        );

        newArticles++;
      }

      // Update article count for source
      db.prepare(`
        UPDATE news_sources 
        SET article_count = (
          SELECT COUNT(*) FROM news_articles WHERE source_id = ?
        ) 
        WHERE id = ?
      `).run(source.id, source.id);

      return newArticles;
    } catch (error) {
      console.error(`[RSS] Error fetching ${source.name}:`, error);
      throw error;
    }
  }

  /**
   * Get recent articles with optional filtering
   */
  getArticles(options: {
    limit?: number;
    offset?: number;
    symbols?: string[];
    sources?: string[];
    sentiment?: 'bullish' | 'bearish' | 'neutral';
    since?: string;
  } = {}): NewsArticle[] {
    const {
      limit = 50,
      offset = 0,
      symbols,
      sources,
      sentiment,
      since,
    } = options;

    const db = getDb();
    let query = 'SELECT * FROM news_articles WHERE 1=1';
    const params: any[] = [];

    if (since) {
      query += ' AND published_at >= ?';
      params.push(since);
    }

    if (sources && sources.length > 0) {
      const placeholders = sources.map(() => '?').join(',');
      query += ` AND source_name IN (${placeholders})`;
      params.push(...sources);
    }

    if (sentiment) {
      query += ' AND sentiment_label = ?';
      params.push(sentiment);
    }

    if (symbols && symbols.length > 0) {
      // Filter by ticker mentions
      const tickerConditions = symbols.map(() => 'tickers LIKE ?').join(' OR ');
      query += ` AND (${tickerConditions})`;
      params.push(...symbols.map(symbol => `%"ticker":"${symbol}"%`));
    }

    query += ' ORDER BY published_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(query).all(...params);

    return (rows as any[]).map(row => ({
      id: row.id,
      url: row.url,
      title: row.title,
      content: row.content,
      contentSnippet: row.content_snippet,
      publishedAt: row.published_at,
      source: row.source_id,
      sourceName: row.source_name,
      tickers: JSON.parse(row.tickers || '[]'),
      sentiment: {
        score: row.sentiment_score,
        label: row.sentiment_label,
        confidence: 0.8, // Default confidence
        breakdown: { positive: 0, negative: 0, neutral: 0 },
      },
      author: row.author,
      imageUrl: row.image_url,
    }));
  }

  /**
   * Get article by ID
   */
  getArticleById(id: string): NewsArticle | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM news_articles WHERE id = ?').get(id);
    
    if (!row) return null;

    const article = row as any;
    return {
      id: article.id,
      url: article.url,
      title: article.title,
      content: article.content,
      contentSnippet: article.content_snippet,
      publishedAt: article.published_at,
      source: article.source_id,
      sourceName: article.source_name,
      tickers: JSON.parse(article.tickers || '[]'),
      sentiment: {
        score: article.sentiment_score,
        label: article.sentiment_label,
        confidence: 0.8,
        breakdown: { positive: 0, negative: 0, neutral: 0 },
      },
      author: article.author,
      imageUrl: article.image_url,
    };
  }

  /**
   * Clean up old articles (keep last 30 days)
   */
  cleanupOldArticles(): number {
    const db = getDb();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    
    const result = db.prepare(`
      DELETE FROM news_articles 
      WHERE published_at < ?
    `).run(cutoff.toISOString());

    return result.changes;
  }

  /**
   * Create content snippet
   */
  private createSnippet(content: string, maxLength: number = 200): string {
    const plainText = content.replace(/<[^>]*>/g, '').trim();
    if (plainText.length <= maxLength) return plainText;
    
    const truncated = plainText.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    return lastSpace > maxLength * 0.8 
      ? truncated.substring(0, lastSpace) + '...'
      : truncated + '...';
  }

  /**
   * Extract image URL from RSS item
   */
  private extractImageUrl(item: any): string | undefined {
    // Try different RSS fields for images
    if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) {
      return item.enclosure.url;
    }
    
    if (item['media:thumbnail']?.['$']?.url) {
      return item['media:thumbnail']['$'].url;
    }
    
    if (item['media:content']?.[0]?.['$']?.url) {
      return item['media:content'][0]['$'].url;
    }
    
    // Extract from content
    const content = item.content || item.contentSnippet || '';
    const imgMatch = content.match(/<img[^>]+src="([^"]+)"/);
    if (imgMatch) {
      return imgMatch[1];
    }

    return undefined;
  }
}

export const rssAggregator = new RSSAggregatorService();