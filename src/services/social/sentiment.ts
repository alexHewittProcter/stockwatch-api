const BULLISH_WORDS = [
  'moon', 'rocket', 'calls', 'bull', 'buy', 'long', 'tendies', 'diamond', 'hands',
  'squeeze', 'rally', 'breakout', 'undervalued', 'yolo', 'gain', 'pump', 'rip',
  'green', 'launch', 'upside', 'strong', 'dip', 'buying',
];

const BEARISH_WORDS = [
  'puts', 'bear', 'sell', 'short', 'crash', 'dump', 'bag', 'hold', 'loss',
  'overvalued', 'bubble', 'drop', 'tank', 'red', 'fade', 'drill', 'rug',
  'panic', 'fear', 'weak', 'top', 'guh',
];

const TICKER_PATTERN = /\$([A-Z]{1,5})\b/g;
const CASHTAG_OR_MENTION = /\b([A-Z]{2,5})\b/g;

const KNOWN_NON_TICKERS = new Set([
  'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE',
  'OUR', 'OUT', 'HAS', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'WAY',
  'WHO', 'DID', 'GET', 'LET', 'SAY', 'SHE', 'TOO', 'USE', 'CEO', 'DD', 'IMO', 'YOLO',
  'LMAO', 'FOMO', 'FUD', 'TBH', 'SMH', 'LOL', 'EOD', 'ATH', 'ATL', 'OTM', 'ITM',
  'GDP', 'CPI', 'FED', 'SEC', 'IPO', 'ETF',
]);

export function extractTickers(text: string): string[] {
  const cashTags: string[] = [];
  let match;

  // First priority: $TICKER format
  while ((match = TICKER_PATTERN.exec(text)) !== null) {
    cashTags.push(match[1]);
  }

  // Second: all-caps words that look like tickers
  while ((match = CASHTAG_OR_MENTION.exec(text)) !== null) {
    if (!KNOWN_NON_TICKERS.has(match[1])) {
      cashTags.push(match[1]);
    }
  }

  return [...new Set(cashTags)];
}

export function scoreSentiment(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  let count = 0;

  for (const word of BULLISH_WORDS) {
    if (lower.includes(word)) {
      score += 1;
      count++;
    }
  }
  for (const word of BEARISH_WORDS) {
    if (lower.includes(word)) {
      score -= 1;
      count++;
    }
  }

  if (count === 0) return 0;
  return Math.max(-1, Math.min(1, score / count));
}

export function getSentimentLabel(score: number): string {
  if (score > 0.3) return 'bullish';
  if (score < -0.3) return 'bearish';
  return 'neutral';
}
