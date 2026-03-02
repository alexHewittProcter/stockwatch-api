export interface NewsSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  lastChecked?: string;
  articleCount?: number;
}

export interface NewsArticle {
  id: string;
  url: string;
  title: string;
  content: string;
  contentSnippet: string;
  publishedAt: string;
  source: string;
  sourceName: string;
  tickers: TickerMention[];
  sentiment: SentimentScore;
  summary?: string;
  imageUrl?: string;
  author?: string;
  category?: string;
}

export interface TickerMention {
  ticker: string;
  confidence: number;
  mentionCount: number;
  positions: number[]; // Character positions in text
}

export interface SentimentScore {
  score: number; // -1.0 to 1.0
  confidence: number; // 0.0 to 1.0
  label: 'bullish' | 'bearish' | 'neutral';
  breakdown: {
    positive: number;
    negative: number;
    neutral: number;
  };
}

export interface SocialPost {
  id: string;
  platform: 'reddit' | 'fourchan' | 'twitter';
  source: string; // subreddit name, board name, etc.
  title: string;
  content: string;
  author: string;
  score: number;
  commentCount: number;
  publishedAt: string;
  url: string;
  tickers: TickerMention[];
  sentiment: SentimentScore;
  isFiltered?: boolean; // for profanity filtering display
}

export interface TrendingTicker {
  ticker: string;
  mentions: number;
  mentionsChange: number; // vs previous period
  mentionsChangePercent: number;
  sentiment: number;
  sources: {
    reddit: number;
    fourchan: number;
    news: number;
  };
  topPosts: SocialPost[];
  trendingScore: number;
}

export interface SocialSentiment {
  ticker: string;
  period: string; // '1h', '4h', '24h', '7d'
  mentions: number;
  sentiment: number;
  confidence: number;
  history: {
    timestamp: string;
    mentions: number;
    sentiment: number;
  }[];
  sources: {
    platform: string;
    mentions: number;
    sentiment: number;
  }[];
}

export interface NewsFilterOptions {
  tab?: 'foryou' | 'trending' | 'opportunities' | 'social';
  symbols?: string[];
  sources?: string[];
  sentiment?: 'bullish' | 'bearish' | 'neutral';
  limit?: number;
  offset?: number;
  period?: string;
}

export interface HypeAlert {
  ticker: string;
  mentions: number;
  baseline: number; // 7-day average
  multiplier: number; // mentions / baseline
  confidence: number;
  platforms: string[];
  detectedAt: string;
}