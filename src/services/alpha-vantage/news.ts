import axios from 'axios';
import { config } from '../../config';

export interface NewsArticle {
  title: string;
  url: string;
  summary: string;
  source: string;
  publishedAt: string;
  tickers: string[];
  sentiment: {
    score: number;    // -1 to 1
    label: string;    // bearish, neutral, bullish
  };
  image: string;
}

export async function getNews(
  tickers?: string[],
  topics?: string[],
  limit: number = 50,
): Promise<NewsArticle[]> {
  try {
    const params: Record<string, string> = {
      function: 'NEWS_SENTIMENT',
      apikey: config.alphaVantage.apiKey,
      limit: String(limit),
      sort: 'LATEST',
    };

    if (tickers?.length) params.tickers = tickers.join(',');
    if (topics?.length) params.topics = topics.join(',');

    const { data } = await axios.get(config.alphaVantage.baseUrl, {
      params,
      timeout: 15000,
    });

    const feed: Record<string, unknown>[] = data.feed ?? [];
    return feed.map((item) => {
      const tickerSentiments = (item.ticker_sentiment as { ticker: string; ticker_sentiment_score: string }[]) ?? [];
      const overallScore = parseFloat(String(item.overall_sentiment_score ?? '0'));

      return {
        title: String(item.title ?? ''),
        url: String(item.url ?? ''),
        summary: String(item.summary ?? ''),
        source: String(item.source ?? ''),
        publishedAt: String(item.time_published ?? ''),
        tickers: tickerSentiments.map((t) => t.ticker),
        sentiment: {
          score: overallScore,
          label: overallScore > 0.15 ? 'bullish' : overallScore < -0.15 ? 'bearish' : 'neutral',
        },
        image: String(item.banner_image ?? ''),
      };
    });
  } catch {
    return [];
  }
}
