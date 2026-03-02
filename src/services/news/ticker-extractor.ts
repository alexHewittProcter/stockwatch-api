import { TickerMention } from './types';

export class TickerExtractorService {
  private readonly tickerRegex = /\$([A-Z]{1,5})\b/g;
  private readonly companyTickerRegex = /\b([A-Z]+(?:\s+[A-Z]+)*)\s*\(([A-Z]{1,5})\)/g;
  
  // Common company names to ticker mappings (top 100 companies)
  private readonly companyToTicker: Record<string, string> = {
    'Apple': 'AAPL',
    'Apple Inc': 'AAPL',
    'Microsoft': 'MSFT',
    'Microsoft Corp': 'MSFT',
    'Microsoft Corporation': 'MSFT',
    'Amazon': 'AMZN',
    'Amazon.com': 'AMZN',
    'Alphabet': 'GOOGL',
    'Google': 'GOOGL',
    'Tesla': 'TSLA',
    'Tesla Inc': 'TSLA',
    'Meta': 'META',
    'Facebook': 'META',
    'Meta Platforms': 'META',
    'Nvidia': 'NVDA',
    'Netflix': 'NFLX',
    'Berkshire Hathaway': 'BRK.B',
    'JPMorgan': 'JPM',
    'JPMorgan Chase': 'JPM',
    'Johnson & Johnson': 'JNJ',
    'Procter & Gamble': 'PG',
    'Visa': 'V',
    'Walmart': 'WMT',
    'Mastercard': 'MA',
    'Home Depot': 'HD',
    'Pfizer': 'PFE',
    'Coca-Cola': 'KO',
    'Disney': 'DIS',
    'Walt Disney': 'DIS',
    'Salesforce': 'CRM',
    'Intel': 'INTC',
    'Cisco': 'CSCO',
    'Verizon': 'VZ',
    'Comcast': 'CMCSA',
    'AT&T': 'T',
    'Oracle': 'ORCL',
    'Adobe': 'ADBE',
    'PayPal': 'PYPL',
    'Chevron': 'CVX',
    'Exxon': 'XOM',
    'Exxon Mobil': 'XOM',
    'Bank of America': 'BAC',
    'Wells Fargo': 'WFC',
    'Goldman Sachs': 'GS',
    'Morgan Stanley': 'MS',
    'Citigroup': 'C',
    'American Express': 'AXP',
    'IBM': 'IBM',
    'McDonald\'s': 'MCD',
    'Nike': 'NKE',
    'Starbucks': 'SBUX',
    'Boeing': 'BA',
    'Caterpillar': 'CAT',
    'General Electric': 'GE',
    'Ford': 'F',
    'General Motors': 'GM',
    'Uber': 'UBER',
    'Lyft': 'LYFT',
    'Spotify': 'SPOT',
    'Twitter': 'TWTR',
    'Snapchat': 'SNAP',
    'Snap': 'SNAP',
    'Square': 'SQ',
    'Block': 'SQ',
    'Palantir': 'PLTR',
    'Robinhood': 'HOOD',
    'Coinbase': 'COIN',
    'AMC': 'AMC',
    'GameStop': 'GME',
    'BlackBerry': 'BB',
    'Nokia': 'NOK',
    'Virgin Galactic': 'SPCE',
    'Peloton': 'PTON',
    'Zoom': 'ZM',
    'Slack': 'WORK',
    'Snowflake': 'SNOW',
    'Airbnb': 'ABNB',
    'DoorDash': 'DASH',
    'Moderna': 'MRNA',
    'Shopify': 'SHOP',
    'Roblox': 'RBLX',
    'Rivian': 'RIVN',
    'Lucid': 'LCID',
    'Lucid Motors': 'LCID',
    'NIO': 'NIO',
    'XPeng': 'XPEV',
    'Li Auto': 'LI',
  };

  // Words that look like tickers but aren't (avoid false positives)
  private readonly falsePositives = new Set([
    'A', 'AN', 'THE', 'AND', 'OR', 'BUT', 'FOR', 'IN', 'ON', 'AT', 'TO', 'BY',
    'OF', 'UP', 'SO', 'IT', 'IS', 'AS', 'IF', 'US', 'WE', 'MY', 'HE', 'SHE',
    'ALL', 'CAN', 'GET', 'GOT', 'HAS', 'HAD', 'HIS', 'HER', 'HOW', 'ITS',
    'MAY', 'NEW', 'NOW', 'OLD', 'OUR', 'OUT', 'SEE', 'TWO', 'WAY', 'WHO',
    'BOY', 'DID', 'OWN', 'SAY', 'SHE', 'TOO', 'USE', 'DAY', 'BIG', 'END',
    'FAR', 'FEW', 'GOD', 'JOB', 'LOT', 'MAN', 'PUT', 'RUN', 'SIT', 'TRY',
    'ASK', 'BUY', 'CAR', 'CUT', 'DIE', 'EAR', 'EAT', 'EYE', 'FLY', 'FUN',
    'GUY', 'HIT', 'HOT', 'LET', 'LIE', 'MOM', 'PAY', 'RED', 'SIR', 'SIX',
    'SON', 'SUN', 'TAX', 'TOP', 'WAR', 'WIN', 'YES', 'YET', 'ADD', 'AGE',
    'AGO', 'AID', 'AIM', 'AIR', 'ANY', 'APP', 'ARM', 'ART', 'BAD', 'BAG',
    'BAR', 'BAT', 'BED', 'BET', 'BIT', 'BOX', 'CEO', 'CUP', 'DOG', 'EGG',
    'SEC', 'ETF', 'IPO', 'CEO', 'CFO', 'COO', 'CTO', 'CIO', 'GDP', 'API',
    'APP', 'URL', 'USB', 'GPS', 'NBA', 'NFL', 'NHL', 'MLB', 'CNN', 'BBC',
    'FBI', 'CIA', 'NSA', 'IRS', 'DMV', 'DVD', 'LCD', 'LED', 'CPU', 'GPU',
    'RAM', 'SSD', 'HDD', 'USB', 'PDF', 'ZIP', 'GIF', 'PNG', 'JPG', 'MP3',
    'MP4', 'AVI', 'MOV', 'WAV', 'DOC', 'XLS', 'PPT', 'SQL', 'XML', 'CSV',
    'JSON', 'HTTP', 'HTTPS', 'FTP', 'SSH', 'VPN', 'DNS', 'ISP', 'WWW',
    'EMAIL', 'SPAM', 'WIFI', 'CELL', 'SMS', 'MMS', 'GPS', 'GPS',
  ]);

  /**
   * Extract ticker mentions from text
   */
  extract(text: string): TickerMention[] {
    const mentions = new Map<string, TickerMention>();
    const upperText = text.toUpperCase();

    // Extract $TICKER patterns
    let match;
    this.tickerRegex.lastIndex = 0;
    while ((match = this.tickerRegex.exec(text)) !== null) {
      const ticker = match[1].toUpperCase();
      
      if (this.isValidTicker(ticker)) {
        this.addMention(mentions, ticker, 0.9, match.index);
      }
    }

    // Extract Company (TICKER) patterns
    this.companyTickerRegex.lastIndex = 0;
    while ((match = this.companyTickerRegex.exec(text)) !== null) {
      const ticker = match[2].toUpperCase();
      
      if (this.isValidTicker(ticker)) {
        this.addMention(mentions, ticker, 1.0, match.index);
      }
    }

    // Extract known company names
    for (const [companyName, ticker] of Object.entries(this.companyToTicker)) {
      const regex = new RegExp(`\\b${this.escapeRegex(companyName)}\\b`, 'gi');
      let companyMatch;
      
      while ((companyMatch = regex.exec(text)) !== null) {
        this.addMention(mentions, ticker, 0.8, companyMatch.index);
      }
    }

    // Look for standalone tickers (less confident)
    const words = text.match(/\b[A-Z]{2,5}\b/g) || [];
    for (const word of words) {
      if (this.isValidTicker(word) && !this.falsePositives.has(word)) {
        // Check if it's likely a ticker (appears in financial context)
        const contextScore = this.getContextScore(text, word);
        if (contextScore > 0.5) {
          const position = text.indexOf(word);
          this.addMention(mentions, word, contextScore * 0.6, position);
        }
      }
    }

    return Array.from(mentions.values())
      .filter(mention => mention.confidence > 0.4) // Filter low confidence mentions
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Add or update a ticker mention
   */
  private addMention(
    mentions: Map<string, TickerMention>, 
    ticker: string, 
    confidence: number, 
    position: number
  ): void {
    const existing = mentions.get(ticker);
    
    if (existing) {
      existing.mentionCount++;
      existing.confidence = Math.max(existing.confidence, confidence);
      existing.positions.push(position);
    } else {
      mentions.set(ticker, {
        ticker,
        confidence,
        mentionCount: 1,
        positions: [position],
      });
    }
  }

  /**
   * Check if a string could be a valid ticker
   */
  private isValidTicker(ticker: string): boolean {
    if (ticker.length < 1 || ticker.length > 5) return false;
    if (this.falsePositives.has(ticker)) return false;
    if (!/^[A-Z]+$/.test(ticker)) return false;
    return true;
  }

  /**
   * Score how likely a word is a ticker based on surrounding context
   */
  private getContextScore(text: string, word: string): number {
    const position = text.indexOf(word);
    if (position === -1) return 0;

    const context = text.substring(
      Math.max(0, position - 100), 
      Math.min(text.length, position + word.length + 100)
    ).toLowerCase();

    let score = 0;

    // Financial keywords nearby increase confidence
    const financialKeywords = [
      'stock', 'share', 'equity', 'market', 'trading', 'trade', 'buy', 'sell',
      'price', 'earnings', 'revenue', 'profit', 'loss', 'dividend', 'yield',
      'analyst', 'upgrade', 'downgrade', 'target', 'rating', 'bull', 'bear',
      'volume', 'nasdaq', 'nyse', 'exchange', 'ipo', 'merger', 'acquisition',
      'portfolio', 'investment', 'investor', 'fund', 'etf', 'options', 'calls',
      'puts', 'strike', 'expiry', 'volatility', 'beta', 'pe', 'eps', 'roe',
    ];

    for (const keyword of financialKeywords) {
      if (context.includes(keyword)) {
        score += 0.1;
      }
    }

    // Dollar signs or percentage nearby
    if (/[\$%]/.test(context)) {
      score += 0.2;
    }

    // Numbers nearby (could be prices)
    if (/\d+\.?\d*/.test(context)) {
      score += 0.1;
    }

    // Common stock phrases
    if (context.includes('shares of')) score += 0.3;
    if (context.includes('stock price')) score += 0.3;
    if (context.includes('trading at')) score += 0.3;
    if (context.includes('market cap')) score += 0.3;

    return Math.min(1.0, score);
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get ticker for company name
   */
  getTickerForCompany(companyName: string): string | null {
    const normalized = companyName.trim();
    return this.companyToTicker[normalized] || null;
  }

  /**
   * Add custom company-ticker mapping
   */
  addCompanyMapping(companyName: string, ticker: string): void {
    this.companyToTicker[companyName] = ticker.toUpperCase();
  }
}

export const tickerExtractor = new TickerExtractorService();