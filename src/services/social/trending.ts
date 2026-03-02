import { getDb } from '../../db/schema';
import { v4 } from '../opportunities/uuid';
import { TrendingTicker, HypeAlert } from '../news/types';

export class SocialTrendingService {
  /**
   * Calculate trending tickers across all platforms
   */
  async calculateTrending(period: '1h' | '4h' | '24h' | '7d' = '24h'): Promise<TrendingTicker[]> {
    const db = getDb();
    const periodHours = this.getPeriodHours(period);
    
    // Get current mentions
    const currentMentions = this.getMentionsForPeriod(periodHours);
    
    // Get baseline mentions for comparison (previous period)
    const baselineMentions = this.getMentionsForPeriod(periodHours, periodHours);
    
    // Calculate trending scores
    const trendingTickers: TrendingTicker[] = [];
    
    for (const [ticker, currentData] of currentMentions) {
      const baseline = baselineMentions.get(ticker) || { mentions: 0, sentiment: 0, sources: {} };
      
      const mentionsChange = currentData.mentions - baseline.mentions;
      const mentionsChangePercent = baseline.mentions > 0 
        ? (mentionsChange / baseline.mentions) * 100 
        : currentData.mentions > 0 ? 100 : 0;
      
      // Calculate trending score: mentions × momentum × abs(sentiment)
      const momentum = baseline.mentions > 0 ? currentData.mentions / baseline.mentions : 1;
      const trendingScore = currentData.mentions * momentum * Math.abs(currentData.sentiment);
      
      if (currentData.mentions >= 3) { // Minimum threshold
        trendingTickers.push({
          ticker,
          mentions: currentData.mentions,
          mentionsChange,
          mentionsChangePercent,
          sentiment: currentData.sentiment,
          sources: currentData.sources,
          topPosts: [], // Will be populated separately if needed
          trendingScore,
        });
      }
    }
    
    // Sort by trending score and take top 20
    const topTrending = trendingTickers
      .sort((a, b) => b.trendingScore - a.trendingScore)
      .slice(0, 20);
    
    // Store trending data
    const calculatedAt = new Date().toISOString();
    for (const trending of topTrending) {
      db.prepare(`
        INSERT INTO trending_tickers (
          id, ticker, period, mentions, mentions_change, mentions_change_percent,
          sentiment, trending_score, sources, calculated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        v4(),
        trending.ticker,
        period,
        trending.mentions,
        trending.mentionsChange,
        trending.mentionsChangePercent,
        trending.sentiment,
        trending.trendingScore,
        JSON.stringify(trending.sources),
        calculatedAt
      );
    }
    
    return topTrending;
  }

  /**
   * Get mentions for a specific time period
   */
  private getMentionsForPeriod(
    hours: number, 
    offsetHours: number = 0
  ): Map<string, { mentions: number; sentiment: number; sources: any }> {
    const db = getDb();
    const endTime = new Date();
    endTime.setHours(endTime.getHours() - offsetHours);
    
    const startTime = new Date(endTime);
    startTime.setHours(startTime.getHours() - hours);
    
    const rows = db.prepare(`
      SELECT ticker, platform, SUM(mentions) as total_mentions, AVG(avg_sentiment) as avg_sentiment
      FROM social_mentions 
      WHERE hour_bucket >= ? AND hour_bucket < ?
      GROUP BY ticker, platform
    `).all(
      startTime.toISOString().substring(0, 13) + ':00:00.000Z',
      endTime.toISOString().substring(0, 13) + ':00:00.000Z'
    );

    const tickerData = new Map<string, { mentions: number; sentiment: number; sources: any }>();

    for (const row of rows as any[]) {
      const existing = tickerData.get(row.ticker) || { mentions: 0, sentiment: 0, sources: {} };
      
      existing.mentions += row.total_mentions;
      existing.sentiment = (existing.sentiment * existing.mentions + row.avg_sentiment * row.total_mentions) 
        / (existing.mentions + row.total_mentions);
      existing.sources[row.platform] = (existing.sources[row.platform] || 0) + row.total_mentions;
      
      tickerData.set(row.ticker, existing);
    }

    return tickerData;
  }

  /**
   * Detect hype alerts (unusual mention spikes)
   */
  async detectHypeAlerts(): Promise<HypeAlert[]> {
    const db = getDb();
    const alerts: HypeAlert[] = [];
    
    // Get current hour mentions
    const currentHour = new Date().toISOString().substring(0, 13) + ':00:00.000Z';
    const currentMentions = db.prepare(`
      SELECT ticker, SUM(mentions) as current_mentions, GROUP_CONCAT(platform) as platforms
      FROM social_mentions 
      WHERE hour_bucket = ?
      GROUP BY ticker
      HAVING current_mentions >= 10
    `).all(currentHour);

    for (const current of currentMentions as any[]) {
      // Get 7-day baseline average
      const baselineRows = db.prepare(`
        SELECT AVG(mentions) as baseline_avg
        FROM social_mentions 
        WHERE ticker = ? 
          AND hour_bucket >= datetime('now', '-7 days')
          AND hour_bucket < datetime('now', '-1 hour')
      `).get(current.ticker) as any;

      const baseline = baselineRows?.baseline_avg || 1;
      const multiplier = current.current_mentions / baseline;

      if (multiplier >= 5.0) { // 5x spike threshold
        const confidence = Math.min(1.0, (multiplier - 5) / 10 + 0.6);
        const platforms = current.platforms.split(',');

        const alert: HypeAlert = {
          ticker: current.ticker,
          mentions: current.current_mentions,
          baseline: Math.round(baseline),
          multiplier,
          confidence,
          platforms,
          detectedAt: new Date().toISOString(),
        };

        // Store alert
        db.prepare(`
          INSERT INTO hype_alerts (
            id, ticker, mentions, baseline, multiplier, confidence, platforms, detected_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          v4(),
          alert.ticker,
          alert.mentions,
          alert.baseline,
          alert.multiplier,
          alert.confidence,
          JSON.stringify(alert.platforms),
          alert.detectedAt
        );

        alerts.push(alert);
      }
    }

    return alerts.sort((a, b) => b.multiplier - a.multiplier);
  }

  /**
   * Get recent hype alerts
   */
  getRecentHypeAlerts(hours: number = 24): HypeAlert[] {
    const db = getDb();
    const since = new Date();
    since.setHours(since.getHours() - hours);

    const rows = db.prepare(`
      SELECT * FROM hype_alerts 
      WHERE detected_at >= ?
      ORDER BY multiplier DESC
    `).all(since.toISOString());

    return (rows as any[]).map(row => ({
      ticker: row.ticker,
      mentions: row.mentions,
      baseline: row.baseline,
      multiplier: row.multiplier,
      confidence: row.confidence,
      platforms: JSON.parse(row.platforms || '[]'),
      detectedAt: row.detected_at,
    }));
  }

  /**
   * Get cached trending data
   */
  getCachedTrending(period: '1h' | '4h' | '24h' | '7d' = '24h'): TrendingTicker[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM trending_tickers 
      WHERE period = ?
      ORDER BY calculated_at DESC, trending_score DESC
      LIMIT 20
    `).all(period);

    return (rows as any[]).map(row => ({
      ticker: row.ticker,
      mentions: row.mentions,
      mentionsChange: row.mentions_change,
      mentionsChangePercent: row.mentions_change_percent,
      sentiment: row.sentiment,
      sources: JSON.parse(row.sources || '{}'),
      topPosts: [], // Populated separately if needed
      trendingScore: row.trending_score,
    }));
  }

  /**
   * Get sentiment analysis for a ticker
   */
  getTickerSentimentAnalysis(ticker: string, period: '1h' | '4h' | '24h' | '7d' = '24h') {
    const db = getDb();
    const hours = this.getPeriodHours(period);
    const since = new Date();
    since.setHours(since.getHours() - hours);

    const data = db.prepare(`
      SELECT 
        platform,
        SUM(mentions) as total_mentions,
        AVG(avg_sentiment) as avg_sentiment
      FROM social_mentions 
      WHERE ticker = ? AND hour_bucket >= ?
      GROUP BY platform
    `).all(ticker, since.toISOString().substring(0, 13) + ':00:00.000Z');

    const history = db.prepare(`
      SELECT 
        hour_bucket as timestamp,
        SUM(mentions) as mentions,
        AVG(avg_sentiment) as sentiment
      FROM social_mentions 
      WHERE ticker = ? AND hour_bucket >= ?
      GROUP BY hour_bucket
      ORDER BY hour_bucket
    `).all(ticker, since.toISOString().substring(0, 13) + ':00:00.000Z');

    const totalMentions = (data as any[]).reduce((sum, row) => sum + row.total_mentions, 0);
    const overallSentiment = totalMentions > 0 
      ? (data as any[]).reduce((sum, row) => sum + (row.avg_sentiment * row.total_mentions), 0) / totalMentions
      : 0;

    return {
      ticker,
      period,
      mentions: totalMentions,
      sentiment: overallSentiment,
      confidence: totalMentions >= 10 ? 0.8 : totalMentions >= 5 ? 0.6 : 0.4,
      history: (history as any[]).map(row => ({
        timestamp: row.timestamp,
        mentions: row.mentions,
        sentiment: row.sentiment,
      })),
      sources: (data as any[]).map(row => ({
        platform: row.platform,
        mentions: row.total_mentions,
        sentiment: row.avg_sentiment,
      })),
    };
  }

  /**
   * Convert period string to hours
   */
  private getPeriodHours(period: string): number {
    switch (period) {
      case '1h': return 1;
      case '4h': return 4;
      case '24h': return 24;
      case '7d': return 24 * 7;
      default: return 24;
    }
  }

  /**
   * Clean up old data
   */
  cleanupOldData(): void {
    const db = getDb();
    
    // Keep social mentions for 30 days
    const mentionsCutoff = new Date();
    mentionsCutoff.setDate(mentionsCutoff.getDate() - 30);
    
    db.prepare(`
      DELETE FROM social_mentions 
      WHERE hour_bucket < ?
    `).run(mentionsCutoff.toISOString().substring(0, 13) + ':00:00.000Z');

    // Keep trending data for 7 days
    const trendingCutoff = new Date();
    trendingCutoff.setDate(trendingCutoff.getDate() - 7);
    
    db.prepare(`
      DELETE FROM trending_tickers 
      WHERE calculated_at < ?
    `).run(trendingCutoff.toISOString());

    // Keep hype alerts for 7 days
    db.prepare(`
      DELETE FROM hype_alerts 
      WHERE detected_at < ?
    `).run(trendingCutoff.toISOString());
  }
}

export const socialTrending = new SocialTrendingService();