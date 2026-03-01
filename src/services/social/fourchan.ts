import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractTickers, scoreSentiment, getSentimentLabel } from './sentiment';

export interface ChanPost {
  id: number;
  body: string;
  tickers: string[];
  sentiment: number;
  sentimentLabel: string;
  createdAt: string;
  replies: number;
  threadId: number;
}

const headers = {
  'User-Agent': 'StockWatch/1.0',
};

export async function getBizCatalog(): Promise<ChanPost[]> {
  try {
    const { data } = await axios.get('https://a.4cdn.org/biz/catalog.json', {
      headers,
      timeout: 10000,
    });

    const posts: ChanPost[] = [];

    for (const page of data) {
      for (const thread of page.threads) {
        const rawText = thread.com ?? '';
        const text = stripHtml(rawText);
        const sub = thread.sub ? stripHtml(thread.sub) : '';
        const fullText = `${sub} ${text}`;

        const tickers = extractTickers(fullText);
        if (tickers.length === 0 && !hasFinancialContent(fullText)) continue;

        const sentimentScore = scoreSentiment(fullText);

        posts.push({
          id: thread.no,
          body: fullText.slice(0, 500),
          tickers,
          sentiment: sentimentScore,
          sentimentLabel: getSentimentLabel(sentimentScore),
          createdAt: new Date(thread.time * 1000).toISOString(),
          replies: thread.replies ?? 0,
          threadId: thread.no,
        });
      }
    }

    return posts.sort((a, b) => b.replies - a.replies);
  } catch {
    return [];
  }
}

export async function getBizThread(threadId: number): Promise<ChanPost[]> {
  try {
    const { data } = await axios.get(`https://a.4cdn.org/biz/thread/${threadId}.json`, {
      headers,
      timeout: 10000,
    });

    return (data.posts ?? []).map((post: Record<string, unknown>) => {
      const text = stripHtml((post.com as string) ?? '');
      const sentimentScore = scoreSentiment(text);

      return {
        id: post.no as number,
        body: text.slice(0, 500),
        tickers: extractTickers(text),
        sentiment: sentimentScore,
        sentimentLabel: getSentimentLabel(sentimentScore),
        createdAt: new Date((post.time as number) * 1000).toISOString(),
        replies: 0,
        threadId,
      };
    });
  } catch {
    return [];
  }
}

function stripHtml(html: string): string {
  const $ = cheerio.load(`<div>${html}</div>`);
  return $('div').text().trim();
}

function hasFinancialContent(text: string): boolean {
  const lower = text.toLowerCase();
  const keywords = ['stock', 'trade', 'market', 'crypto', 'bitcoin', 'buy', 'sell', 'invest', 'portfolio', 'gains', 'loss'];
  return keywords.some(k => lower.includes(k));
}

export function countChanTickerMentions(posts: ChanPost[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const ticker of post.tickers) {
      counts.set(ticker, (counts.get(ticker) || 0) + 1);
    }
  }
  return counts;
}
