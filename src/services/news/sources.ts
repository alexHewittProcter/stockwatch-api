export interface RSSSource {
  name: string;
  url: string;
  category: 'general' | 'tech' | 'finance' | 'crypto' | 'commodities';
}

export const DEFAULT_RSS_SOURCES: RSSSource[] = [
  // Morning Brew
  { name: 'Morning Brew', url: 'https://www.morningbrew.com/daily/rss', category: 'general' },
  // Reuters
  { name: 'Reuters Business', url: 'https://www.reutersagency.com/feed/?taxonomy=best-sectors&post_type=best', category: 'finance' },
  // Bloomberg (via RSS)
  { name: 'Bloomberg Markets', url: 'https://feeds.bloomberg.com/markets/news.rss', category: 'finance' },
  // CNBC
  { name: 'CNBC Top News', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', category: 'general' },
  { name: 'CNBC Market', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258', category: 'finance' },
  // MarketWatch
  { name: 'MarketWatch Top Stories', url: 'http://feeds.marketwatch.com/marketwatch/topstories/', category: 'general' },
  { name: 'MarketWatch Stocks', url: 'http://feeds.marketwatch.com/marketwatch/StockstoWatch/', category: 'finance' },
  // Seeking Alpha
  { name: 'Seeking Alpha Market News', url: 'https://seekingalpha.com/market_currents.xml', category: 'finance' },
  { name: 'Seeking Alpha Top Ideas', url: 'https://seekingalpha.com/tag/top-ideas.xml', category: 'finance' },
  // Yahoo Finance
  { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex', category: 'general' },
  // Financial Times
  { name: 'FT Markets', url: 'https://www.ft.com/markets?format=rss', category: 'finance' },
];
