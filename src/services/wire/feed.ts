import { getDb } from '../../db/schema';
import { EventEmitter } from 'events';

/**
 * Wire Feed Service
 * 
 * Real-time ticker-tape-style feed aggregating all market events.
 * Think Bloomberg terminal wire feed.
 */

export interface WireEvent {
  id: string;
  ts: string;
  type: 'price_move' | 'news' | 'social' | 'holder' | 'options_flow' | 'opportunity' | 'trade' | 'alert' | 'economic';
  symbol?: string;
  title: string;
  detail?: string;
  sentiment?: 'bullish' | 'bearish' | 'neutral';
  impact: 'low' | 'medium' | 'high';
  source: string;
  tags: string[];
  isRecommended: boolean;
  isFavourite: boolean;
  url?: string;
  metadata?: Record<string, any>;
}

export interface WireFilter {
  filter: 'recommended' | 'favourites' | 'all';
  types?: string[];
  symbols?: string[];
  impact?: string;
  sentiment?: string;
}

export interface WireStats {
  eventsPerMinute: number;
  topSymbol: string;
  dominantSentiment: string;
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySource: Record<string, number>;
}

class WireFeedService extends EventEmitter {
  private isRunning = false;
  private events: WireEvent[] = [];
  private maxEventsInMemory = 1000;
  private favouriteSymbols = new Set<string>();
  private trackedHolders = new Set<string>();
  
  // Event generation intervals (ms)
  private intervals = {
    priceMove: 30000,     // Every 30 seconds
    news: 120000,         // Every 2 minutes
    social: 60000,        // Every minute
    holder: 300000,       // Every 5 minutes
    optionsFlow: 180000,  // Every 3 minutes
    opportunity: 90000,   // Every 1.5 minutes
  };

  constructor() {
    super();
    this.initializeTables();
    this.loadUserPreferences();
  }

  private initializeTables() {
    const db = getDb();
    
    // Wire events table (for persistence and history)
    db.exec(`
      CREATE TABLE IF NOT EXISTS wire_events (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        symbol TEXT,
        title TEXT NOT NULL,
        detail TEXT,
        sentiment TEXT,
        impact TEXT NOT NULL,
        source TEXT NOT NULL,
        tags TEXT NOT NULL,
        is_recommended BOOLEAN DEFAULT FALSE,
        is_favourite BOOLEAN DEFAULT FALSE,
        url TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Wire preferences
    db.exec(`
      CREATE TABLE IF NOT EXISTS wire_preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index for performance
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_wire_events_timestamp ON wire_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_wire_events_type ON wire_events(type);
      CREATE INDEX IF NOT EXISTS idx_wire_events_symbol ON wire_events(symbol);
    `);
  }

  private loadUserPreferences() {
    const db = getDb();
    
    // Load favourite symbols from watchlists/dashboards
    try {
      const dashboards = db.prepare('SELECT symbols FROM dashboards WHERE id IS NOT NULL').all() as any[];
      dashboards.forEach(dashboard => {
        if (dashboard.symbols) {
          const symbols = JSON.parse(dashboard.symbols);
          symbols.forEach((symbol: string) => this.favouriteSymbols.add(symbol));
        }
      });
    } catch (error) {
      console.warn('[Wire] Could not load favourite symbols:', error);
    }

    // Load tracked holders
    try {
      const holders = db.prepare('SELECT name FROM tracked_holders').all() as any[];
      holders.forEach(holder => this.trackedHolders.add(holder.name));
    } catch (error) {
      console.warn('[Wire] Could not load tracked holders:', error);
    }
    
    console.log(`[Wire] Loaded ${this.favouriteSymbols.size} favourite symbols, ${this.trackedHolders.size} tracked holders`);
  }

  startFeed() {
    if (this.isRunning) return;
    
    console.log('[Wire] Starting wire feed service...');
    this.isRunning = true;
    
    // Start event generators
    this.startPriceMoveGenerator();
    this.startNewsGenerator();
    this.startSocialGenerator();
    this.startHolderGenerator();
    this.startOptionsFlowGenerator();
    this.startOpportunityGenerator();
    
    // Start periodic cleanup
    setInterval(() => this.cleanupOldEvents(), 60000); // Every minute
  }

  stopFeed() {
    console.log('[Wire] Stopping wire feed service...');
    this.isRunning = false;
  }

  private async startPriceMoveGenerator() {
    const generate = async () => {
      if (!this.isRunning) return;
      
      try {
        const events = await this.generatePriceMoveEvents();
        events.forEach(event => this.addEvent(event));
      } catch (error) {
        console.error('[Wire] Price move generator error:', error);
      }
      
      setTimeout(generate, this.intervals.priceMove + Math.random() * 10000);
    };
    
    setTimeout(generate, Math.random() * 10000);
  }

  private async startNewsGenerator() {
    const generate = async () => {
      if (!this.isRunning) return;
      
      try {
        const events = await this.generateNewsEvents();
        events.forEach(event => this.addEvent(event));
      } catch (error) {
        console.error('[Wire] News generator error:', error);
      }
      
      setTimeout(generate, this.intervals.news + Math.random() * 30000);
    };
    
    setTimeout(generate, Math.random() * 20000);
  }

  private async startSocialGenerator() {
    const generate = async () => {
      if (!this.isRunning) return;
      
      try {
        const events = await this.generateSocialEvents();
        events.forEach(event => this.addEvent(event));
      } catch (error) {
        console.error('[Wire] Social generator error:', error);
      }
      
      setTimeout(generate, this.intervals.social + Math.random() * 15000);
    };
    
    setTimeout(generate, Math.random() * 15000);
  }

  private async startHolderGenerator() {
    const generate = async () => {
      if (!this.isRunning) return;
      
      try {
        const events = await this.generateHolderEvents();
        events.forEach(event => this.addEvent(event));
      } catch (error) {
        console.error('[Wire] Holder generator error:', error);
      }
      
      setTimeout(generate, this.intervals.holder + Math.random() * 60000);
    };
    
    setTimeout(generate, Math.random() * 30000);
  }

  private async startOptionsFlowGenerator() {
    const generate = async () => {
      if (!this.isRunning) return;
      
      try {
        const events = await this.generateOptionsFlowEvents();
        events.forEach(event => this.addEvent(event));
      } catch (error) {
        console.error('[Wire] Options flow generator error:', error);
      }
      
      setTimeout(generate, this.intervals.optionsFlow + Math.random() * 30000);
    };
    
    setTimeout(generate, Math.random() * 45000);
  }

  private async startOpportunityGenerator() {
    const generate = async () => {
      if (!this.isRunning) return;
      
      try {
        const events = await this.generateOpportunityEvents();
        events.forEach(event => this.addEvent(event));
      } catch (error) {
        console.error('[Wire] Opportunity generator error:', error);
      }
      
      setTimeout(generate, this.intervals.opportunity + Math.random() * 20000);
    };
    
    setTimeout(generate, Math.random() * 30000);
  }

  private async generatePriceMoveEvents(): Promise<WireEvent[]> {
    const db = getDb();
    const events: WireEvent[] = [];
    
    try {
      // Get some cached quotes for mock price moves
      const quotes = db.prepare('SELECT symbol, price FROM cached_quotes ORDER BY RANDOM() LIMIT 5').all() as any[];
      
      for (const quote of quotes) {
        // Generate random price movement
        const priceChange = (Math.random() - 0.5) * 0.1; // ±10%
        const newPrice = quote.price * (1 + priceChange);
        const changePercent = (priceChange * 100).toFixed(2);
        
        // Only create events for significant moves
        if (Math.abs(priceChange) > 0.02) { // >2%
          const impact = Math.abs(priceChange) > 0.05 ? 'high' : 'medium';
          const sentiment = priceChange > 0 ? 'bullish' : 'bearish';
          const direction = priceChange > 0 ? 'up' : 'down';
          
          events.push({
            id: this.generateEventId(),
            ts: new Date().toISOString(),
            type: 'price_move',
            symbol: quote.symbol,
            title: `${quote.symbol} ${direction} ${Math.abs(parseFloat(changePercent))}% to $${newPrice.toFixed(2)}`,
            detail: `Large price movement detected. Previous: $${quote.price}, Current: $${newPrice.toFixed(2)}`,
            sentiment,
            impact,
            source: 'market_data',
            tags: ['price', 'movement', direction, impact],
            isRecommended: this.isRecommended('price_move', quote.symbol, impact),
            isFavourite: this.favouriteSymbols.has(quote.symbol),
            metadata: {
              previousPrice: quote.price,
              currentPrice: newPrice,
              changePercent: parseFloat(changePercent),
            },
          });
        }
      }
    } catch (error) {
      console.warn('[Wire] Price move generation error:', error);
    }
    
    return events;
  }

  private async generateNewsEvents(): Promise<WireEvent[]> {
    const db = getDb();
    const events: WireEvent[] = [];
    
    try {
      // Get recent news articles that haven't been wire'd yet
      const articles = db.prepare(`
        SELECT * FROM news_articles 
        WHERE published_at > datetime('now', '-10 minutes')
        ORDER BY published_at DESC 
        LIMIT 3
      `).all() as any[];
      
      for (const article of articles) {
        const symbol = article.mentioned_tickers ? JSON.parse(article.mentioned_tickers)[0] : null;
        const sentiment = article.sentiment || 'neutral';
        const impact = article.title.toLowerCase().includes('breaking') ? 'high' : 'medium';
        
        events.push({
          id: this.generateEventId(),
          ts: new Date().toISOString(),
          type: 'news',
          symbol,
          title: article.title,
          detail: article.summary || article.content?.substring(0, 200) + '...',
          sentiment: sentiment as any,
          impact,
          source: article.source || 'news',
          tags: ['news', article.source, sentiment],
          isRecommended: this.isRecommended('news', symbol, impact),
          isFavourite: symbol ? this.favouriteSymbols.has(symbol) : false,
          url: article.url,
          metadata: {
            source: article.source,
            publishedAt: article.published_at,
            mentionedTickers: article.mentioned_tickers,
          },
        });
      }
    } catch (error) {
      console.warn('[Wire] News generation error:', error);
    }
    
    return events;
  }

  private async generateSocialEvents(): Promise<WireEvent[]> {
    const db = getDb();
    const events: WireEvent[] = [];
    
    try {
      // Get recent high-scored social posts
      const posts = db.prepare(`
        SELECT * FROM social_posts 
        WHERE score > 70 AND created_at > datetime('now', '-5 minutes')
        ORDER BY score DESC 
        LIMIT 2
      `).all() as any[];
      
      for (const post of posts) {
        const symbol = post.mentioned_tickers ? JSON.parse(post.mentioned_tickers)[0] : null;
        const sentiment = post.sentiment || 'neutral';
        const impact = post.score > 90 ? 'high' : 'medium';
        
        events.push({
          id: this.generateEventId(),
          ts: new Date().toISOString(),
          type: 'social',
          symbol,
          title: `${post.platform.toUpperCase()}: ${symbol ? symbol + ' ' : ''}trending (score: ${post.score})`,
          detail: post.content?.substring(0, 150) + '...',
          sentiment: sentiment as any,
          impact,
          source: post.platform,
          tags: ['social', post.platform, sentiment, 'trending'],
          isRecommended: this.isRecommended('social', symbol, impact),
          isFavourite: symbol ? this.favouriteSymbols.has(symbol) : false,
          url: post.url,
          metadata: {
            platform: post.platform,
            score: post.score,
            author: post.author,
            upvotes: post.upvotes,
          },
        });
      }
    } catch (error) {
      console.warn('[Wire] Social generation error:', error);
    }
    
    return events;
  }

  private async generateHolderEvents(): Promise<WireEvent[]> {
    const db = getDb();
    const events: WireEvent[] = [];
    
    try {
      // Get recent holder changes
      const changes = db.prepare(`
        SELECT * FROM holder_changes 
        WHERE created_at > datetime('now', '-15 minutes')
        ORDER BY created_at DESC 
        LIMIT 2
      `).all() as any[];
      
      for (const change of changes) {
        const isTracked = this.trackedHolders.has(change.holder_name);
        const impact = isTracked ? 'high' : 'medium';
        const sentiment = change.change_shares > 0 ? 'bullish' : 'bearish';
        const action = change.change_shares > 0 ? 'bought' : 'sold';
        
        events.push({
          id: this.generateEventId(),
          ts: new Date().toISOString(),
          type: 'holder',
          symbol: change.symbol,
          title: `${change.holder_name} ${action} ${Math.abs(change.change_shares).toLocaleString()} shares of ${change.symbol}`,
          detail: `Position change: ${change.change_shares > 0 ? '+' : ''}${change.change_shares.toLocaleString()} shares. New total: ${change.current_shares?.toLocaleString() || 'Unknown'}`,
          sentiment: sentiment as any,
          impact,
          source: 'sec_edgar',
          tags: ['holder', 'institutional', action, isTracked ? 'tracked' : 'untracked'],
          isRecommended: this.isRecommended('holder', change.symbol, impact),
          isFavourite: this.favouriteSymbols.has(change.symbol),
          metadata: {
            holderName: change.holder_name,
            changeShares: change.change_shares,
            currentShares: change.current_shares,
            filingDate: change.filing_date,
            isTracked,
          },
        });
      }
    } catch (error) {
      console.warn('[Wire] Holder generation error:', error);
    }
    
    return events;
  }

  private async generateOptionsFlowEvents(): Promise<WireEvent[]> {
    const db = getDb();
    const events: WireEvent[] = [];
    
    try {
      // Get recent unusual options activity
      const activities = db.prepare(`
        SELECT * FROM unusual_activity 
        WHERE score > 75 AND detected_at > datetime('now', '-10 minutes')
        ORDER BY score DESC 
        LIMIT 2
      `).all() as any[];
      
      for (const activity of activities) {
        const sentiment = activity.type === 'calls' ? 'bullish' : 'bearish';
        const impact = activity.score > 85 ? 'high' : 'medium';
        
        events.push({
          id: this.generateEventId(),
          ts: new Date().toISOString(),
          type: 'options_flow',
          symbol: activity.symbol,
          title: `Unusual ${activity.type} activity in ${activity.symbol} (score: ${activity.score})`,
          detail: `Large ${activity.type} volume detected. Strike: $${activity.strike}, Expiry: ${activity.expiry}`,
          sentiment: sentiment as any,
          impact,
          source: 'options_scanner',
          tags: ['options', activity.type, 'unusual', 'flow'],
          isRecommended: this.isRecommended('options_flow', activity.symbol, impact),
          isFavourite: this.favouriteSymbols.has(activity.symbol),
          metadata: {
            type: activity.type,
            strike: activity.strike,
            expiry: activity.expiry,
            volume: activity.volume,
            score: activity.score,
          },
        });
      }
    } catch (error) {
      console.warn('[Wire] Options flow generation error:', error);
    }
    
    return events;
  }

  private async generateOpportunityEvents(): Promise<WireEvent[]> {
    const db = getDb();
    const events: WireEvent[] = [];
    
    try {
      // Get recent high-confidence opportunities
      const opportunities = db.prepare(`
        SELECT * FROM opportunity_opportunities 
        WHERE confidence > 70 AND created_at > datetime('now', '-5 minutes')
        ORDER BY confidence DESC 
        LIMIT 2
      `).all() as any[];
      
      for (const opp of opportunities) {
        const impact = opp.confidence > 80 ? 'high' : 'medium';
        
        events.push({
          id: this.generateEventId(),
          ts: new Date().toISOString(),
          type: 'opportunity',
          symbol: opp.symbol,
          title: `${opp.type} opportunity in ${opp.symbol} (${opp.confidence}% confidence)`,
          detail: opp.description || `Multi-signal opportunity detected with ${opp.confidence}% confidence`,
          sentiment: 'neutral',
          impact,
          source: 'opportunity_engine',
          tags: ['opportunity', opp.type, 'ai'],
          isRecommended: this.isRecommended('opportunity', opp.symbol, impact),
          isFavourite: this.favouriteSymbols.has(opp.symbol),
          metadata: {
            type: opp.type,
            confidence: opp.confidence,
            expectedReturn: opp.expected_return,
            riskLevel: opp.risk_level,
          },
        });
      }
    } catch (error) {
      console.warn('[Wire] Opportunity generation error:', error);
    }
    
    return events;
  }

  private addEvent(event: WireEvent) {
    // Add to in-memory list
    this.events.unshift(event);
    
    // Limit in-memory events
    if (this.events.length > this.maxEventsInMemory) {
      this.events = this.events.slice(0, this.maxEventsInMemory);
    }
    
    // Save to database
    this.saveEventToDatabase(event);
    
    // Emit to WebSocket clients
    this.emit('wireEvent', event);
    
    console.log(`[Wire] 📡 ${event.type.toUpperCase()}: ${event.title}`);
  }

  private saveEventToDatabase(event: WireEvent) {
    try {
      const db = getDb();
      db.prepare(`
        INSERT INTO wire_events 
        (id, timestamp, type, symbol, title, detail, sentiment, impact, source, 
         tags, is_recommended, is_favourite, url, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        event.id,
        event.ts,
        event.type,
        event.symbol,
        event.title,
        event.detail,
        event.sentiment,
        event.impact,
        event.source,
        JSON.stringify(event.tags),
        event.isRecommended,
        event.isFavourite,
        event.url,
        JSON.stringify(event.metadata || {})
      );
    } catch (error) {
      console.error('[Wire] Database save error:', error);
    }
  }

  private isRecommended(type: string, symbol: string | null, impact: string): boolean {
    // Simple recommendation logic
    if (impact === 'high') return true;
    if (symbol && this.favouriteSymbols.has(symbol)) return true;
    if (type === 'holder' && impact === 'medium') return true;
    if (type === 'opportunity') return true;
    
    return false;
  }

  private generateEventId(): string {
    return `wire_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private cleanupOldEvents() {
    // Remove events older than 24 hours from database
    const db = getDb();
    db.prepare("DELETE FROM wire_events WHERE timestamp < datetime('now', '-24 hours')").run();
    
    // Clean up in-memory events older than 2 hours
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    this.events = this.events.filter(event => new Date(event.ts).getTime() > twoHoursAgo);
  }

  // Public API methods

  getFeed(filter: WireFilter, limit: number = 50, before?: string): WireEvent[] {
    let events = [...this.events];
    
    // Apply before cursor
    if (before) {
      const beforeIndex = events.findIndex(e => e.id === before);
      if (beforeIndex > 0) {
        events = events.slice(beforeIndex);
      }
    }
    
    // Apply filters
    events = this.applyFilters(events, filter);
    
    // Sort by timestamp (newest first)
    events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    
    return events.slice(0, limit);
  }

  getHistoricalFeed(filter: WireFilter, limit: number = 100, before?: string): WireEvent[] {
    const db = getDb();
    let query = 'SELECT * FROM wire_events WHERE 1=1';
    const params: any[] = [];
    
    // Apply before cursor
    if (before) {
      query += ' AND timestamp < (SELECT timestamp FROM wire_events WHERE id = ?)';
      params.push(before);
    }
    
    // Apply type filter
    if (filter.types && filter.types.length > 0) {
      query += ` AND type IN (${filter.types.map(() => '?').join(',')})`;
      params.push(...filter.types);
    }
    
    // Apply symbol filter
    if (filter.symbols && filter.symbols.length > 0) {
      query += ` AND symbol IN (${filter.symbols.map(() => '?').join(',')})`;
      params.push(...filter.symbols);
    }
    
    // Apply impact filter
    if (filter.impact) {
      query += ' AND impact = ?';
      params.push(filter.impact);
    }
    
    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);
    
    const rows = db.prepare(query).all(...params) as any[];
    
    const events = rows.map(row => ({
      id: row.id,
      ts: row.timestamp,
      type: row.type,
      symbol: row.symbol,
      title: row.title,
      detail: row.detail,
      sentiment: row.sentiment,
      impact: row.impact,
      source: row.source,
      tags: JSON.parse(row.tags || '[]'),
      isRecommended: row.is_recommended,
      isFavourite: row.is_favourite,
      url: row.url,
      metadata: JSON.parse(row.metadata || '{}'),
    }));
    
    // Apply remaining filters
    return this.applyFilters(events, filter);
  }

  private applyFilters(events: WireEvent[], filter: WireFilter): WireEvent[] {
    return events.filter(event => {
      // Apply main filter
      if (filter.filter === 'recommended' && !event.isRecommended) {
        return false;
      }
      
      if (filter.filter === 'favourites' && !event.isFavourite) {
        return false;
      }
      
      // Apply type filter
      if (filter.types && filter.types.length > 0 && !filter.types.includes(event.type)) {
        return false;
      }
      
      // Apply symbol filter
      if (filter.symbols && filter.symbols.length > 0 && 
          (!event.symbol || !filter.symbols.includes(event.symbol))) {
        return false;
      }
      
      // Apply impact filter
      if (filter.impact && event.impact !== filter.impact) {
        return false;
      }
      
      // Apply sentiment filter
      if (filter.sentiment && event.sentiment !== filter.sentiment) {
        return false;
      }
      
      return true;
    });
  }

  getStats(): WireStats {
    const now = Date.now();
    const oneMinuteAgo = now - (60 * 1000);
    
    // Get events from last minute
    const recentEvents = this.events.filter(event => 
      new Date(event.ts).getTime() > oneMinuteAgo
    );
    
    // Calculate stats
    const eventsByType: Record<string, number> = {};
    const eventsBySource: Record<string, number> = {};
    const symbolCounts: Record<string, number> = {};
    const sentimentCounts: Record<string, number> = {};
    
    for (const event of this.events.slice(0, 100)) { // Last 100 events
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      eventsBySource[event.source] = (eventsBySource[event.source] || 0) + 1;
      
      if (event.symbol) {
        symbolCounts[event.symbol] = (symbolCounts[event.symbol] || 0) + 1;
      }
      
      if (event.sentiment) {
        sentimentCounts[event.sentiment] = (sentimentCounts[event.sentiment] || 0) + 1;
      }
    }
    
    const topSymbol = Object.entries(symbolCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || '';
    
    const dominantSentiment = Object.entries(sentimentCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'neutral';
    
    return {
      eventsPerMinute: recentEvents.length,
      topSymbol,
      dominantSentiment,
      totalEvents: this.events.length,
      eventsByType,
      eventsBySource,
    };
  }

  // Auto-trader integration
  addTradeEvent(strategyName: string, symbol: string, action: 'enter' | 'exit', 
               details: any) {
    const sentiment = action === 'enter' ? 'neutral' : 'neutral';
    const impact = 'medium';
    
    const event: WireEvent = {
      id: this.generateEventId(),
      ts: new Date().toISOString(),
      type: 'trade',
      symbol,
      title: `Auto-trader ${action === 'enter' ? 'entered' : 'exited'} ${symbol} position`,
      detail: `Strategy: ${strategyName}. ${action === 'enter' ? 'Entry' : 'Exit'} price: $${details.price?.toFixed(2) || 'N/A'}${details.pnl ? `. P&L: $${details.pnl.toFixed(2)}` : ''}`,
      sentiment,
      impact,
      source: 'auto_trader',
      tags: ['trade', 'auto', action, strategyName.toLowerCase().replace(/\s+/g, '_')],
      isRecommended: true, // Always recommend trade events
      isFavourite: this.favouriteSymbols.has(symbol),
      metadata: {
        strategyName,
        action,
        ...details,
      },
    };
    
    this.addEvent(event);
  }

  // Economic events (mock for now)
  addEconomicEvent(type: string, title: string, impact: 'low' | 'medium' | 'high') {
    const event: WireEvent = {
      id: this.generateEventId(),
      ts: new Date().toISOString(),
      type: 'economic',
      title,
      detail: `Economic event: ${type}`,
      sentiment: 'neutral',
      impact,
      source: 'economic_calendar',
      tags: ['economic', type.toLowerCase()],
      isRecommended: impact === 'high',
      isFavourite: false,
      metadata: { type },
    };
    
    this.addEvent(event);
  }

  // Alert events
  addAlert(type: string, symbol: string, message: string, impact: 'low' | 'medium' | 'high' = 'medium') {
    const event: WireEvent = {
      id: this.generateEventId(),
      ts: new Date().toISOString(),
      type: 'alert',
      symbol,
      title: `${type}: ${symbol}`,
      detail: message,
      sentiment: 'neutral',
      impact,
      source: 'alert_system',
      tags: ['alert', type.toLowerCase()],
      isRecommended: impact !== 'low',
      isFavourite: this.favouriteSymbols.has(symbol),
      metadata: { type, alertType: type },
    };
    
    this.addEvent(event);
  }
}

export const wireFeed = new WireFeedService();