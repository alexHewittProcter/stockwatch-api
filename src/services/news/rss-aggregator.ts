import Parser from 'rss-parser';
import { DEFAULT_RSS_SOURCES, RSSSource } from './sources';

export interface FeedArticle {
  id: string;
  title: string;
  link: string;
  summary: string;
  source: string;
  category: string;
  publishedAt: string;
  tickers: string[];
  sentiment: number; // -1 to 1
}

// Common ticker patterns — used for extraction from text
const TICKER_PATTERN = /\b([A-Z]{1,5})\b/g;
const KNOWN_NON_TICKERS = new Set([
  'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE',
  'OUR', 'OUT', 'HAS', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'WAY',
  'WHO', 'DID', 'GET', 'LET', 'SAY', 'SHE', 'TOO', 'USE', 'CEO', 'CFO', 'CTO', 'IPO',
  'GDP', 'CPI', 'FED', 'SEC', 'ETF', 'NYSE', 'FDA', 'API', 'USA', 'USD', 'EUR', 'GBP',
  'RSS', 'AI', 'CEO', 'US', 'UK', 'EU',
]);

const BULLISH_WORDS = ['surge', 'rally', 'gain', 'rise', 'up', 'bull', 'growth', 'profit', 'beat', 'record', 'high', 'upgrade', 'buy', 'outperform', 'strong'];
const BEARISH_WORDS = ['drop', 'fall', 'decline', 'loss', 'down', 'bear', 'crash', 'sell', 'miss', 'low', 'cut', 'downgrade', 'weak', 'risk', 'fear'];

class RSSAggregator {
  private parser: Parser;
  private sources: RSSSource[];
  private cachedArticles: FeedArticle[] = [];
  private lastFetch = 0;
  private readonly cacheDuration = 5 * 60 * 1000; // 5 min

  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'StockWatch/1.0',
      },
    });
    this.sources = [...DEFAULT_RSS_SOURCES];
  }

  async fetchAll(): Promise<FeedArticle[]> {
    if (Date.now() - this.lastFetch < this.cacheDuration && this.cachedArticles.length > 0) {
      return this.cachedArticles;
    }

    const results = await Promise.allSettled(
      this.sources.map(source => this.fetchSource(source)),
    );

    const articles: FeedArticle[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        articles.push(...result.value);
      }
    }

    // Sort by date, newest first
    articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    this.cachedArticles = articles;
    this.lastFetch = Date.now();
    return articles;
  }

  async fetchByTab(tab: string): Promise<FeedArticle[]> {
    const all = await this.fetchAll();

    switch (tab) {
      case 'trending':
        return all.slice(0, 50);
      case 'opportunities':
        return all.filter(a => Math.abs(a.sentiment) > 0.3).slice(0, 30);
      case 'social':
        return []; // Social feed comes from social service
      case 'foryou':
      default:
        return all.slice(0, 30);
    }
  }

  addSource(source: RSSSource): void {
    this.sources.push(source);
    this.lastFetch = 0; // invalidate cache
  }

  getSources(): RSSSource[] {
    return this.sources;
  }

  private async fetchSource(source: RSSSource): Promise<FeedArticle[]> {
    try {
      const feed = await this.parser.parseURL(source.url);
      return (feed.items ?? []).map(item => {
        const text = `${item.title ?? ''} ${item.contentSnippet ?? ''}`;
        return {
          id: item.guid || item.link || `${source.name}-${item.title}`,
          title: item.title ?? '',
          link: item.link ?? '',
          summary: (item.contentSnippet ?? '').slice(0, 500),
          source: source.name,
          category: source.category,
          publishedAt: item.isoDate ?? item.pubDate ?? new Date().toISOString(),
          tickers: this.extractTickers(text),
          sentiment: this.scoreSentiment(text),
        };
      });
    } catch {
      return [];
    }
  }

  private extractTickers(text: string): string[] {
    const matches = text.match(TICKER_PATTERN) ?? [];
    return [...new Set(
      matches.filter(m => m.length >= 2 && m.length <= 5 && !KNOWN_NON_TICKERS.has(m)),
    )].slice(0, 10);
  }

  private scoreSentiment(text: string): number {
    const lower = text.toLowerCase();
    let score = 0;
    for (const word of BULLISH_WORDS) {
      if (lower.includes(word)) score += 0.1;
    }
    for (const word of BEARISH_WORDS) {
      if (lower.includes(word)) score -= 0.1;
    }
    return Math.max(-1, Math.min(1, score));
  }
}

export const rssAggregator = new RSSAggregator();
