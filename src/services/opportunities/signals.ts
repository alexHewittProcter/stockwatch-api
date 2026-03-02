import { getDb } from '../../db/schema';
import { Signal } from '../../types/opportunity';
import { v4 } from './uuid';

/**
 * Signal Detection Engine
 * 
 * Detects various types of trading signals from price data, holder activity,
 * options flow, news, and social sentiment.
 */

export interface SignalDetector {
  detect(symbols?: string[]): Promise<Signal[]>;
  getLastRun(): Date | null;
  setLastRun(date: Date): void;
}

export class PriceVolumeSignalDetector implements SignalDetector {
  private lastRun: Date | null = null;

  async detect(symbols?: string[]): Promise<Signal[]> {
    const signals: Signal[] = [];
    const db = getDb();

    // Get recent price data for analysis
    const symbolList = symbols || await this.getActiveSymbols();

    for (const symbol of symbolList) {
      try {
        // Get 252 days (1 year) of price data for analysis
        const priceData = await this.getPriceData(symbol, 252);
        if (priceData.length < 50) continue; // Need at least 50 days

        const latest = priceData[priceData.length - 1];
        const previous = priceData[priceData.length - 2];

        // Breakout signals
        const signals_breakout = await this.detectBreakouts(symbol, priceData, latest);
        signals.push(...signals_breakout);

        // Volume signals
        const signals_volume = await this.detectVolumeSpikes(symbol, priceData, latest);
        signals.push(...signals_volume);

        // Gap signals
        const signals_gaps = await this.detectGaps(symbol, previous, latest);
        signals.push(...signals_gaps);

        // Momentum signals
        const signals_momentum = await this.detectMomentum(symbol, priceData, latest);
        signals.push(...signals_momentum);

        // Moving average signals
        const signals_ma = await this.detectMovingAverageCrosses(symbol, priceData, latest);
        signals.push(...signals_ma);

      } catch (error) {
        console.error(`[Signals] Error processing ${symbol}:`, error);
      }
    }

    return signals;
  }

  private async detectBreakouts(symbol: string, priceData: any[], latest: any): Promise<Signal[]> {
    const signals: Signal[] = [];
    
    // Calculate 52-week high/low
    const prices = priceData.map(d => d.high);
    const lows = priceData.map(d => d.low);
    const high52w = Math.max(...prices.slice(-252));
    const low52w = Math.min(...lows.slice(-252));

    // Breakout above 52-week high
    if (latest.high > high52w * 1.01) { // 1% buffer to avoid false signals
      signals.push({
        id: v4(),
        type: 'breakout_high',
        category: 'price',
        symbol,
        source: 'price_analysis',
        description: `${symbol} breaks above 52-week high of $${high52w.toFixed(2)}`,
        strength: 0.8,
        direction: 'bullish',
        data: {
          currentPrice: latest.close,
          high52w,
          breakoutPercent: ((latest.high - high52w) / high52w) * 100,
        },
        timestamp: latest.date,
        detectedAt: new Date().toISOString(),
      });
    }

    // Breakout below 52-week low
    if (latest.low < low52w * 0.99) { // 1% buffer
      signals.push({
        id: v4(),
        type: 'breakout_low',
        category: 'price',
        symbol,
        source: 'price_analysis',
        description: `${symbol} breaks below 52-week low of $${low52w.toFixed(2)}`,
        strength: 0.8,
        direction: 'bearish',
        data: {
          currentPrice: latest.close,
          low52w,
          breakdownPercent: ((low52w - latest.low) / low52w) * 100,
        },
        timestamp: latest.date,
        detectedAt: new Date().toISOString(),
      });
    }

    return signals;
  }

  private async detectVolumeSpikes(symbol: string, priceData: any[], latest: any): Promise<Signal[]> {
    const signals: Signal[] = [];
    
    // Calculate 20-day average volume
    const recentVolumes = priceData.slice(-20).map(d => d.volume);
    const avgVolume = recentVolumes.reduce((sum, v) => sum + v, 0) / recentVolumes.length;

    // Volume spike (3x average)
    if (latest.volume > avgVolume * 3) {
      const volumeRatio = latest.volume / avgVolume;
      signals.push({
        id: v4(),
        type: 'volume_spike',
        category: 'volume',
        symbol,
        source: 'volume_analysis',
        description: `${symbol} volume spike: ${volumeRatio.toFixed(1)}x average`,
        strength: Math.min(volumeRatio / 10, 1), // Cap at 1.0
        direction: 'neutral',
        data: {
          currentVolume: latest.volume,
          avgVolume20d: avgVolume,
          volumeRatio,
        },
        timestamp: latest.date,
        detectedAt: new Date().toISOString(),
      });
    }

    return signals;
  }

  private async detectGaps(symbol: string, previous: any, latest: any): Promise<Signal[]> {
    const signals: Signal[] = [];
    
    const gapPercent = ((latest.open - previous.close) / previous.close) * 100;

    // Gap up (>2%)
    if (gapPercent > 2) {
      signals.push({
        id: v4(),
        type: 'gap_up',
        category: 'price',
        symbol,
        source: 'gap_analysis',
        description: `${symbol} gaps up ${gapPercent.toFixed(1)}% on open`,
        strength: Math.min(gapPercent / 10, 1),
        direction: 'bullish',
        data: {
          previousClose: previous.close,
          openPrice: latest.open,
          gapPercent,
        },
        timestamp: latest.date,
        detectedAt: new Date().toISOString(),
      });
    }

    // Gap down (<-2%)
    if (gapPercent < -2) {
      signals.push({
        id: v4(),
        type: 'gap_down',
        category: 'price',
        symbol,
        source: 'gap_analysis',
        description: `${symbol} gaps down ${Math.abs(gapPercent).toFixed(1)}% on open`,
        strength: Math.min(Math.abs(gapPercent) / 10, 1),
        direction: 'bearish',
        data: {
          previousClose: previous.close,
          openPrice: latest.open,
          gapPercent,
        },
        timestamp: latest.date,
        detectedAt: new Date().toISOString(),
      });
    }

    return signals;
  }

  private async detectMomentum(symbol: string, priceData: any[], latest: any): Promise<Signal[]> {
    const signals: Signal[] = [];
    
    // Calculate RSI (14-day)
    const rsi = this.calculateRSI(priceData, 14);
    if (rsi === null) return signals;

    // RSI overbought (>70)
    if (rsi > 70) {
      signals.push({
        id: v4(),
        type: 'momentum',
        category: 'technical',
        symbol,
        source: 'rsi_analysis',
        description: `${symbol} RSI overbought at ${rsi.toFixed(1)}`,
        strength: (rsi - 70) / 30, // 0-1 scale
        direction: 'bearish',
        data: {
          rsi,
          condition: 'overbought',
        },
        timestamp: latest.date,
        detectedAt: new Date().toISOString(),
      });
    }

    // RSI oversold (<30)
    if (rsi < 30) {
      signals.push({
        id: v4(),
        type: 'momentum',
        category: 'technical',
        symbol,
        source: 'rsi_analysis',
        description: `${symbol} RSI oversold at ${rsi.toFixed(1)}`,
        strength: (30 - rsi) / 30, // 0-1 scale
        direction: 'bullish',
        data: {
          rsi,
          condition: 'oversold',
        },
        timestamp: latest.date,
        detectedAt: new Date().toISOString(),
      });
    }

    return signals;
  }

  private async detectMovingAverageCrosses(symbol: string, priceData: any[], latest: any): Promise<Signal[]> {
    const signals: Signal[] = [];
    
    if (priceData.length < 200) return signals;

    // Calculate 50-day and 200-day moving averages
    const ma50 = this.calculateSMA(priceData.slice(-50).map(d => d.close));
    const ma200 = this.calculateSMA(priceData.slice(-200).map(d => d.close));
    const prevMa50 = this.calculateSMA(priceData.slice(-51, -1).map(d => d.close));
    const prevMa200 = this.calculateSMA(priceData.slice(-201, -1).map(d => d.close));

    // Golden cross (50-day MA crosses above 200-day MA)
    if (prevMa50 <= prevMa200 && ma50 > ma200) {
      signals.push({
        id: v4(),
        type: 'moving_average_cross',
        category: 'technical',
        symbol,
        source: 'ma_analysis',
        description: `${symbol} golden cross: 50-day MA crosses above 200-day MA`,
        strength: 0.9,
        direction: 'bullish',
        data: {
          ma50,
          ma200,
          crossType: 'golden',
        },
        timestamp: latest.date,
        detectedAt: new Date().toISOString(),
      });
    }

    // Death cross (50-day MA crosses below 200-day MA)
    if (prevMa50 >= prevMa200 && ma50 < ma200) {
      signals.push({
        id: v4(),
        type: 'moving_average_cross',
        category: 'technical',
        symbol,
        source: 'ma_analysis',
        description: `${symbol} death cross: 50-day MA crosses below 200-day MA`,
        strength: 0.9,
        direction: 'bearish',
        data: {
          ma50,
          ma200,
          crossType: 'death',
        },
        timestamp: latest.date,
        detectedAt: new Date().toISOString(),
      });
    }

    return signals;
  }

  private calculateRSI(priceData: any[], period: number): number | null {
    if (priceData.length < period + 1) return null;

    const closes = priceData.map(d => d.close);
    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? -change : 0);
    }

    const avgGain = gains.slice(-period).reduce((sum, g) => sum + g, 0) / period;
    const avgLoss = losses.slice(-period).reduce((sum, l) => sum + l, 0) / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateSMA(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private async getActiveSymbols(): Promise<string[]> {
    // Get symbols from cached quotes (most actively tracked)
    const db = getDb();
    const rows = db.prepare('SELECT DISTINCT symbol FROM cached_quotes LIMIT 100').all() as { symbol: string }[];
    return rows.map(r => r.symbol);
  }

  private async getPriceData(symbol: string, days: number): Promise<any[]> {
    // This would normally fetch from market data API
    // For now, return mock data structure
    const mockData = [];
    const basePrice = 100 + Math.random() * 200;
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - i));
      
      const price = basePrice + (Math.random() - 0.5) * 20;
      mockData.push({
        date: date.toISOString().split('T')[0],
        open: price,
        high: price * (1 + Math.random() * 0.05),
        low: price * (1 - Math.random() * 0.05),
        close: price,
        volume: Math.floor(1000000 + Math.random() * 5000000),
      });
    }
    
    return mockData;
  }

  getLastRun(): Date | null {
    return this.lastRun;
  }

  setLastRun(date: Date): void {
    this.lastRun = date;
  }
}

export class HolderSignalDetector implements SignalDetector {
  private lastRun: Date | null = null;

  async detect(symbols?: string[]): Promise<Signal[]> {
    const signals: Signal[] = [];
    const db = getDb();

    // Get insider transactions from last 30 days
    const insiderSignals = await this.detectInsiderSignals(symbols);
    signals.push(...insiderSignals);

    // Get institutional changes from last quarter
    const institutionalSignals = await this.detectInstitutionalSignals(symbols);
    signals.push(...institutionalSignals);

    return signals;
  }

  private async detectInsiderSignals(symbols?: string[]): Promise<Signal[]> {
    const signals: Signal[] = [];
    const db = getDb();
    
    const symbolFilter = symbols?.length ? `AND symbol IN (${symbols.map(() => '?').join(',')})` : '';
    const params = symbols || [];

    // Insider cluster buying (3+ insiders in 2 weeks)
    const clusterBuys = db.prepare(`
      SELECT symbol, COUNT(*) as insider_count, SUM(value) as total_value
      FROM insider_transactions 
      WHERE transaction_type = 'Purchase' 
        AND transaction_date >= date('now', '-14 days')
        ${symbolFilter}
      GROUP BY symbol
      HAVING COUNT(*) >= 3
    `).all(...params) as any[];

    for (const cluster of clusterBuys) {
      signals.push({
        id: v4(),
        type: 'insider_cluster_buy',
        category: 'holder',
        symbol: cluster.symbol,
        source: 'sec_edgar',
        description: `${cluster.insider_count} insiders bought $${(cluster.total_value / 1000000).toFixed(1)}M in ${cluster.symbol}`,
        strength: Math.min(cluster.insider_count / 5, 1),
        direction: 'bullish',
        data: {
          insiderCount: cluster.insider_count,
          totalValue: cluster.total_value,
          timeframe: '14d',
        },
        timestamp: new Date().toISOString(),
        detectedAt: new Date().toISOString(),
      });
    }

    // Large insider purchases (>$500K)
    const largeBuys = db.prepare(`
      SELECT * FROM insider_transactions
      WHERE transaction_type = 'Purchase'
        AND value > 500000
        AND transaction_date >= date('now', '-30 days')
        ${symbolFilter}
    `).all(...params) as any[];

    for (const buy of largeBuys) {
      signals.push({
        id: v4(),
        type: 'insider_large_buy',
        category: 'holder',
        symbol: buy.symbol,
        source: 'sec_edgar',
        description: `${buy.insider_name} purchased $${(buy.value / 1000000).toFixed(1)}M of ${buy.symbol}`,
        strength: Math.min(buy.value / 5000000, 1), // Cap at $5M for max strength
        direction: 'bullish',
        data: {
          insiderName: buy.insider_name,
          insiderTitle: buy.insider_title,
          value: buy.value,
          shares: buy.shares,
          price: buy.price,
          transactionDate: buy.transaction_date,
        },
        timestamp: buy.transaction_date,
        detectedAt: new Date().toISOString(),
      });
    }

    return signals;
  }

  private async detectInstitutionalSignals(symbols?: string[]): Promise<Signal[]> {
    const signals: Signal[] = [];
    const db = getDb();
    
    const symbolFilter = symbols?.length ? `AND symbol IN (${symbols.map(() => '?').join(',')})` : '';
    const params = symbols || [];

    // Institution accumulation (>20% increase)
    const accumulations = db.prepare(`
      SELECT * FROM holder_changes
      WHERE action = 'increased'
        AND pct_change > 20
        AND quarter = (SELECT MAX(quarter) FROM holder_changes)
        ${symbolFilter}
    `).all(...params) as any[];

    for (const acc of accumulations) {
      signals.push({
        id: v4(),
        type: 'institution_accumulation',
        category: 'holder',
        symbol: acc.symbol,
        source: 'sec_edgar',
        description: `${acc.holder_name} increased ${acc.symbol} position by ${acc.pct_change.toFixed(1)}%`,
        strength: Math.min(acc.pct_change / 100, 1),
        direction: 'bullish',
        data: {
          holderName: acc.holder_name,
          cik: acc.cik,
          sharesChange: acc.shares_change,
          valueChange: acc.value_change,
          pctChange: acc.pct_change,
          quarter: acc.quarter,
        },
        timestamp: acc.quarter,
        detectedAt: new Date().toISOString(),
      });
    }

    // New institutional positions
    const newPositions = db.prepare(`
      SELECT * FROM holder_changes
      WHERE action = 'new'
        AND quarter = (SELECT MAX(quarter) FROM holder_changes)
        ${symbolFilter}
    `).all(...params) as any[];

    for (const pos of newPositions) {
      signals.push({
        id: v4(),
        type: 'institution_new_position',
        category: 'holder',
        symbol: pos.symbol,
        source: 'sec_edgar',
        description: `${pos.holder_name} initiated new $${(pos.value_change / 1000000).toFixed(1)}M position in ${pos.symbol}`,
        strength: Math.min(pos.value_change / 100000000, 1), // Cap at $100M
        direction: 'bullish',
        data: {
          holderName: pos.holder_name,
          cik: pos.cik,
          shares: pos.shares_change,
          value: pos.value_change,
          quarter: pos.quarter,
        },
        timestamp: pos.quarter,
        detectedAt: new Date().toISOString(),
      });
    }

    return signals;
  }

  getLastRun(): Date | null {
    return this.lastRun;
  }

  setLastRun(date: Date): void {
    this.lastRun = date;
  }
}

export class OptionsSignalDetector implements SignalDetector {
  private lastRun: Date | null = null;

  async detect(symbols?: string[]): Promise<Signal[]> {
    const signals: Signal[] = [];
    
    // Get unusual options activity
    const db = getDb();
    const symbolFilter = symbols?.length ? `AND symbol IN (${symbols.map(() => '?').join(',')})` : '';
    const params = symbols || [];

    // Unusual call/put volume from stored unusual activity
    const unusualActivity = db.prepare(`
      SELECT * FROM unusual_activity
      WHERE detected_at >= date('now', '-7 days')
        ${symbolFilter}
      ORDER BY score DESC
    `).all(...params) as any[];

    for (const activity of unusualActivity) {
      signals.push({
        id: v4(),
        type: activity.contract_type === 'call' ? 'unusual_call_volume' : 'unusual_put_volume',
        category: 'options',
        symbol: activity.symbol,
        source: 'options_flow',
        description: `Unusual ${activity.contract_type} activity: ${activity.volume} contracts (${activity.volume_oi_ratio.toFixed(1)}x OI)`,
        strength: Math.min(activity.score / 100, 1),
        direction: activity.sentiment,
        data: {
          contractType: activity.contract_type,
          strike: activity.strike,
          expiry: activity.expiry,
          volume: activity.volume,
          openInterest: activity.open_interest,
          volumeOiRatio: activity.volume_oi_ratio,
          notionalValue: activity.notional_value,
          score: activity.score,
          reason: activity.reason,
        },
        timestamp: activity.detected_at,
        detectedAt: activity.detected_at,
      });
    }

    return signals;
  }

  getLastRun(): Date | null {
    return this.lastRun;
  }

  setLastRun(date: Date): void {
    this.lastRun = date;
  }
}

export class NewsSignalDetector implements SignalDetector {
  private lastRun: Date | null = null;

  async detect(symbols?: string[]): Promise<Signal[]> {
    const signals: Signal[] = [];
    const db = getDb();
    
    const symbolFilter = symbols?.length ? `AND json_extract(tickers, '$') LIKE '%${symbols.join('%') || symbols.join('%')}%'` : '';
    
    // High-impact news (strong sentiment + multiple tickers)
    const highImpactNews = db.prepare(`
      SELECT * FROM news_articles
      WHERE ABS(sentiment_score) > 0.7
        AND published_at >= datetime('now', '-24 hours')
        ${symbolFilter}
      ORDER BY ABS(sentiment_score) DESC
      LIMIT 20
    `).all() as any[];

    for (const article of highImpactNews) {
      const tickers = JSON.parse(article.tickers || '[]');
      for (const tickerMention of tickers) {
        signals.push({
          id: v4(),
          type: 'breaking_news',
          category: 'news',
          symbol: tickerMention.ticker,
          source: article.source_name,
          description: article.title,
          strength: Math.abs(article.sentiment_score),
          direction: article.sentiment_label === 'bullish' ? 'bullish' : article.sentiment_label === 'bearish' ? 'bearish' : 'neutral',
          data: {
            articleId: article.id,
            url: article.url,
            title: article.title,
            sourceName: article.source_name,
            sentimentScore: article.sentiment_score,
            sentimentLabel: article.sentiment_label,
            publishedAt: article.published_at,
          },
          timestamp: article.published_at,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return signals;
  }

  getLastRun(): Date | null {
    return this.lastRun;
  }

  setLastRun(date: Date): void {
    this.lastRun = date;
  }
}

export class SocialSignalDetector implements SignalDetector {
  private lastRun: Date | null = null;

  async detect(symbols?: string[]): Promise<Signal[]> {
    const signals: Signal[] = [];
    const db = getDb();
    
    // Get hype alerts from last 24 hours
    const hypeAlerts = db.prepare(`
      SELECT * FROM hype_alerts
      WHERE detected_at >= datetime('now', '-24 hours')
      ORDER BY multiplier DESC
    `).all() as any[];

    for (const alert of hypeAlerts) {
      if (symbols?.length && !symbols.includes(alert.ticker)) continue;
      
      signals.push({
        id: v4(),
        type: 'social_hype',
        category: 'social',
        symbol: alert.ticker,
        source: 'social_trending',
        description: `${alert.ticker} social hype: ${alert.multiplier.toFixed(1)}x mention spike`,
        strength: Math.min(alert.multiplier / 10, 1),
        direction: 'neutral',
        data: {
          mentions: alert.mentions,
          baseline: alert.baseline,
          multiplier: alert.multiplier,
          confidence: alert.confidence,
          platforms: JSON.parse(alert.platforms || '[]'),
          detectedAt: alert.detected_at,
        },
        timestamp: alert.detected_at,
        detectedAt: alert.detected_at,
      });
    }

    return signals;
  }

  getLastRun(): Date | null {
    return this.lastRun;
  }

  setLastRun(date: Date): void {
    this.lastRun = date;
  }
}

// Signal Manager
export class SignalManager {
  private detectors: SignalDetector[] = [
    new PriceVolumeSignalDetector(),
    new HolderSignalDetector(),
    new OptionsSignalDetector(),
    new NewsSignalDetector(),
    new SocialSignalDetector(),
  ];

  async detectAllSignals(symbols?: string[]): Promise<Signal[]> {
    const allSignals: Signal[] = [];
    
    for (const detector of this.detectors) {
      try {
        const signals = await detector.detect(symbols);
        allSignals.push(...signals);
        detector.setLastRun(new Date());
      } catch (error) {
        console.error('[SignalManager] Detector error:', error);
      }
    }

    // Save detected signals to database
    await this.saveSignals(allSignals);

    return allSignals;
  }

  async getRecentSignals(hours: number = 24, limit: number = 100): Promise<Signal[]> {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM detected_signals
      WHERE detected_at >= datetime('now', '-${hours} hours')
      ORDER BY detected_at DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      type: row.type,
      category: row.category,
      symbol: row.symbol,
      source: row.source,
      description: row.description,
      strength: row.strength,
      direction: row.direction,
      data: JSON.parse(row.data || '{}'),
      timestamp: row.timestamp,
      detectedAt: row.detected_at,
    }));
  }

  private async saveSignals(signals: Signal[]): Promise<void> {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO detected_signals 
      (id, type, category, symbol, source, description, strength, direction, data, timestamp, detected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const signal of signals) {
      stmt.run(
        signal.id,
        signal.type,
        signal.category,
        signal.symbol,
        signal.source,
        signal.description,
        signal.strength,
        signal.direction,
        JSON.stringify(signal.data),
        signal.timestamp,
        signal.detectedAt,
      );
    }
  }
}

export const signalManager = new SignalManager();