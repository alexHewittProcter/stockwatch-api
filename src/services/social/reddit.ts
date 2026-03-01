import axios from 'axios';
import { extractTickers, scoreSentiment, getSentimentLabel } from './sentiment';

export interface SocialPost {
  id: string;
  title: string;
  body: string;
  author: string;
  url: string;
  source: string;
  subreddit?: string;
  score: number;
  comments: number;
  tickers: string[];
  sentiment: number;
  sentimentLabel: string;
  createdAt: string;
}

const headers = {
  'User-Agent': 'StockWatch/1.0',
};

const SUBREDDITS = ['wallstreetbets', 'stocks', 'options'];

export async function getSubredditPosts(
  subreddit: string,
  sort: string = 'hot',
  limit: number = 25,
): Promise<SocialPost[]> {
  try {
    const { data } = await axios.get(
      `https://www.reddit.com/r/${subreddit}/${sort}.json`,
      {
        params: { limit, raw_json: 1 },
        headers,
        timeout: 10000,
      },
    );

    const posts = data?.data?.children ?? [];
    return posts.map((child: { data: Record<string, unknown> }) => {
      const post = child.data;
      const text = `${post.title} ${post.selftext ?? ''}`;
      const sentimentScore = scoreSentiment(text);

      return {
        id: post.id as string,
        title: post.title as string,
        body: ((post.selftext as string) ?? '').slice(0, 1000),
        author: post.author as string,
        url: `https://reddit.com${post.permalink}`,
        source: 'reddit',
        subreddit,
        score: (post.score as number) ?? 0,
        comments: (post.num_comments as number) ?? 0,
        tickers: extractTickers(text),
        sentiment: sentimentScore,
        sentimentLabel: getSentimentLabel(sentimentScore),
        createdAt: new Date(((post.created_utc as number) ?? 0) * 1000).toISOString(),
      };
    });
  } catch {
    return [];
  }
}

export async function getAllSubredditPosts(): Promise<SocialPost[]> {
  const results = await Promise.allSettled(
    SUBREDDITS.map(sub => getSubredditPosts(sub)),
  );

  const allPosts: SocialPost[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allPosts.push(...result.value);
    }
  }

  return allPosts.sort((a, b) => b.score - a.score);
}

export function countTickerMentions(posts: SocialPost[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const ticker of post.tickers) {
      counts.set(ticker, (counts.get(ticker) || 0) + 1);
    }
  }
  return counts;
}

export function getTickerSentiment(
  posts: SocialPost[],
  symbol: string,
): { mentions: number; avgSentiment: number; label: string; posts: SocialPost[] } {
  const relevant = posts.filter(p => p.tickers.includes(symbol.toUpperCase()));
  if (relevant.length === 0) {
    return { mentions: 0, avgSentiment: 0, label: 'neutral', posts: [] };
  }

  const avgSentiment = relevant.reduce((sum, p) => sum + p.sentiment, 0) / relevant.length;
  return {
    mentions: relevant.length,
    avgSentiment,
    label: getSentimentLabel(avgSentiment),
    posts: relevant.slice(0, 10),
  };
}
