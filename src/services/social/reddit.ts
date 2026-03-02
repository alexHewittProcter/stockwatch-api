import axios from 'axios';
import { getDb } from '../../db/schema';
import { v4 } from '../opportunities/uuid';
import { SocialPost } from '../news/types';
import { tickerExtractor } from '../news/ticker-extractor';
import { sentimentScorer } from '../news/sentiment';

const SUBREDDITS = [
  'wallstreetbets',
  'stocks',
  'options',
  'investing',
  'StockMarket',
  'SecurityAnalysis',
  'ValueInvesting',
  'pennystocks',
  'RobinHood',
  'thecorporation',
];

const headers = {
  'User-Agent': 'StockWatch/1.0 Social Analytics (basil.hewittprocter@gmail.com)',
};

export class RedditScrapingService {
  /**
   * Scrape posts from all tracked subreddits
   */
  async scrapeAll(): Promise<void> {
    const results = await Promise.allSettled(
      SUBREDDITS.map(subreddit => this.scrapeSubreddit(subreddit))
    );

    let totalPosts = 0;
    let totalErrors = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const subreddit = SUBREDDITS[i];

      if (result.status === 'fulfilled') {
        totalPosts += result.value;
        console.log(`[Reddit] r/${subreddit}: ${result.value} new posts`);
      } else {
        totalErrors++;
        console.error(`[Reddit] r/${subreddit} failed:`, result.reason);
      }
    }

    console.log(`[Reddit] Scrape complete: ${totalPosts} new posts, ${totalErrors} errors`);
    
    // Update mention counts
    await this.updateMentionCounts();
  }

  /**
   * Scrape posts from a specific subreddit
   */
  async scrapeSubreddit(subreddit: string, limit: number = 50): Promise<number> {
    try {
      const [hotPosts, newPosts] = await Promise.all([
        this.fetchSubredditPosts(subreddit, 'hot', Math.ceil(limit / 2)),
        this.fetchSubredditPosts(subreddit, 'new', Math.ceil(limit / 2)),
      ]);

      const allPosts = [...hotPosts, ...newPosts];
      const db = getDb();
      let newPostCount = 0;

      for (const post of allPosts) {
        // Check if post already exists
        const existing = db.prepare(`
          SELECT id FROM social_posts 
          WHERE platform = 'reddit' AND external_id = ?
        `).get(post.data.id);

        if (existing) continue;

        // Extract content
        const title = post.data.title || '';
        const content = post.data.selftext || '';
        const fullText = `${title} ${content}`;

        // Skip deleted/removed posts
        if (content === '[deleted]' || content === '[removed]') continue;

        // Extract tickers and sentiment
        const tickers = tickerExtractor.extract(fullText);
        const sentiment = sentimentScorer.score(fullText);

        // Filter out potentially offensive content for display
        const isFiltered = this.containsProfanity(fullText);

        // Create social post
        const socialPost: SocialPost = {
          id: v4(),
          platform: 'reddit',
          source: subreddit,
          title,
          content,
          author: post.data.author || '[deleted]',
          score: post.data.score || 0,
          commentCount: post.data.num_comments || 0,
          publishedAt: new Date(post.data.created_utc * 1000).toISOString(),
          url: `https://www.reddit.com${post.data.permalink}`,
          tickers,
          sentiment,
          isFiltered,
        };

        // Store in database
        db.prepare(`
          INSERT OR IGNORE INTO social_posts (
            id, platform, source, external_id, title, content, author, 
            score, comment_count, published_at, url, tickers, 
            sentiment_score, sentiment_label, is_filtered
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          socialPost.id,
          socialPost.platform,
          socialPost.source,
          post.data.id,
          socialPost.title,
          socialPost.content,
          socialPost.author,
          socialPost.score,
          socialPost.commentCount,
          socialPost.publishedAt,
          socialPost.url,
          JSON.stringify(socialPost.tickers),
          socialPost.sentiment.score,
          socialPost.sentiment.label,
          isFiltered ? 1 : 0
        );

        newPostCount++;
      }

      return newPostCount;
    } catch (error) {
      console.error(`[Reddit] Error scraping r/${subreddit}:`, error);
      throw error;
    }
  }

  /**
   * Fetch posts from Reddit JSON API
   */
  private async fetchSubredditPosts(
    subreddit: string, 
    sort: 'hot' | 'new' | 'top' = 'hot', 
    limit: number = 25
  ): Promise<any[]> {
    try {
      const url = `https://www.reddit.com/r/${subreddit}/${sort}.json`;
      const params = { limit: Math.min(limit, 100) };

      const response = await axios.get(url, {
        headers,
        params,
        timeout: 15000,
      });

      if (!response.data?.data?.children) {
        return [];
      }

      return response.data.data.children;
    } catch (error) {
      console.error(`[Reddit] Error fetching r/${subreddit}/${sort}:`, error);
      return [];
    }
  }

  /**
   * Get posts from specific subreddit from database
   */
  getSubredditPosts(subreddit: string, limit: number = 50): SocialPost[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM social_posts 
      WHERE platform = 'reddit' AND source = ? 
      ORDER BY published_at DESC 
      LIMIT ?
    `).all(subreddit, limit);

    return this.rowsToSocialPosts(rows as any[]);
  }

  /**
   * Get hot posts from all subreddits
   */
  getHotPosts(limit: number = 100): SocialPost[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM social_posts 
      WHERE platform = 'reddit' 
        AND score > 50 
        AND published_at > datetime('now', '-24 hours')
      ORDER BY score DESC 
      LIMIT ?
    `).all(limit);

    return this.rowsToSocialPosts(rows as any[]);
  }

  /**
   * Get posts mentioning specific ticker
   */
  getTickerPosts(ticker: string, hours: number = 24): SocialPost[] {
    const db = getDb();
    const since = new Date();
    since.setHours(since.getHours() - hours);

    const rows = db.prepare(`
      SELECT * FROM social_posts 
      WHERE platform = 'reddit' 
        AND tickers LIKE ? 
        AND published_at >= ?
      ORDER BY published_at DESC
    `).all(`%"ticker":"${ticker}"%`, since.toISOString());

    return this.rowsToSocialPosts(rows as any[]);
  }

  /**
   * Update hourly mention counts
   */
  private async updateMentionCounts(): Promise<void> {
    const db = getDb();
    const currentHour = new Date().toISOString().substring(0, 13) + ':00:00.000Z';

    // Get all tickers mentioned in the last hour
    const posts = db.prepare(`
      SELECT tickers, sentiment_score FROM social_posts 
      WHERE platform = 'reddit' 
        AND published_at >= datetime('now', '-1 hour')
        AND tickers != '[]'
    `).all();

    const tickerCounts = new Map<string, { count: number; totalSentiment: number }>();

    for (const post of posts as any[]) {
      try {
        const tickers = JSON.parse(post.tickers || '[]');
        const sentiment = post.sentiment_score || 0;

        for (const tickerMention of tickers) {
          const ticker = tickerMention.ticker;
          const current = tickerCounts.get(ticker) || { count: 0, totalSentiment: 0 };
          
          tickerCounts.set(ticker, {
            count: current.count + 1,
            totalSentiment: current.totalSentiment + sentiment,
          });
        }
      } catch (error) {
        // Skip malformed ticker data
      }
    }

    // Update mention counts in database
    for (const [ticker, data] of tickerCounts) {
      const avgSentiment = data.count > 0 ? data.totalSentiment / data.count : 0;

      db.prepare(`
        INSERT OR REPLACE INTO social_mentions 
        (id, ticker, platform, hour_bucket, mentions, avg_sentiment) 
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        v4(),
        ticker,
        'reddit',
        currentHour,
        data.count,
        avgSentiment
      );
    }
  }

  /**
   * Convert database rows to SocialPost objects
   */
  private rowsToSocialPosts(rows: any[]): SocialPost[] {
    return rows.map(row => ({
      id: row.id,
      platform: 'reddit' as const,
      source: row.source,
      title: row.title,
      content: row.content,
      author: row.author,
      score: row.score,
      commentCount: row.comment_count,
      publishedAt: row.published_at,
      url: row.url,
      tickers: JSON.parse(row.tickers || '[]'),
      sentiment: {
        score: row.sentiment_score,
        label: row.sentiment_label,
        confidence: 0.8, // Default confidence
        breakdown: { positive: 0, negative: 0, neutral: 0 },
      },
      isFiltered: Boolean(row.is_filtered),
    }));
  }

  /**
   * Basic profanity filter
   */
  private containsProfanity(text: string): boolean {
    const profanityWords = [
      // Add basic profanity detection - this is a simplified version
      'fuck', 'shit', 'damn', 'bitch', 'ass', 'bastard', 'crap', 'hell',
      'piss', 'slut', 'whore', 'fag', 'retard', 'gay', 'homo', 'dyke',
      // Add racial slurs and other offensive terms as needed
    ];

    const lowerText = text.toLowerCase();
    return profanityWords.some(word => lowerText.includes(word));
  }

  /**
   * Get mention statistics for a ticker
   */
  getTickerMentionStats(ticker: string, hours: number = 24): {
    totalMentions: number;
    averageSentiment: number;
    hourlyBreakdown: { hour: string; mentions: number; sentiment: number }[];
  } {
    const db = getDb();
    const since = new Date();
    since.setHours(since.getHours() - hours);

    const rows = db.prepare(`
      SELECT hour_bucket, mentions, avg_sentiment 
      FROM social_mentions 
      WHERE platform = 'reddit' 
        AND ticker = ? 
        AND hour_bucket >= ?
      ORDER BY hour_bucket
    `).all(ticker, since.toISOString().substring(0, 13) + ':00:00.000Z');

    const hourlyData = rows as { hour_bucket: string; mentions: number; avg_sentiment: number }[];
    const totalMentions = hourlyData.reduce((sum, row) => sum + row.mentions, 0);
    const averageSentiment = totalMentions > 0 
      ? hourlyData.reduce((sum, row) => sum + (row.avg_sentiment * row.mentions), 0) / totalMentions
      : 0;

    return {
      totalMentions,
      averageSentiment,
      hourlyBreakdown: hourlyData.map(row => ({
        hour: row.hour_bucket,
        mentions: row.mentions,
        sentiment: row.avg_sentiment,
      })),
    };
  }

  /**
   * Get subreddit list
   */
  getTrackedSubreddits(): string[] {
    return SUBREDDITS;
  }
}

export const redditScraper = new RedditScrapingService();