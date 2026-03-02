import Database from 'better-sqlite3';
import path from 'path';
import { config } from '../config';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(path.resolve(config.db.path));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  // Create tables first
  db.exec(`
    CREATE TABLE IF NOT EXISTS cached_quotes (
      symbol TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cached_candles (
      symbol TEXT NOT NULL,
      interval TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (symbol, interval)
    );

    CREATE TABLE IF NOT EXISTS dashboards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      widgets TEXT NOT NULL DEFAULT '[]',
      layout TEXT NOT NULL DEFAULT '{}',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS preferences (
      id TEXT PRIMARY KEY DEFAULT 'default',
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS price_alerts (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      target_price REAL NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('above', 'below')),
      triggered INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tracked_holders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('institution', 'insider')),
      tracked_since TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trade_journal (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      qty REAL NOT NULL,
      price REAL NOT NULL,
      order_type TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT DEFAULT '',
      ai_analysis TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conditions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      type TEXT NOT NULL,
      parameters TEXT NOT NULL DEFAULT '{}',
      symbols TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_triggered TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      symbols TEXT NOT NULL DEFAULT '[]',
      condition_id TEXT DEFAULT NULL,
      signals TEXT NOT NULL DEFAULT '[]',
      score REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS news_subscriptions (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      enabled INTEGER NOT NULL DEFAULT 1
    );

    -- SEC EDGAR tables for holder tracking
    CREATE TABLE IF NOT EXISTS sec_filings (
      id TEXT PRIMARY KEY,
      cik TEXT NOT NULL,
      form_type TEXT NOT NULL,
      accession_number TEXT NOT NULL UNIQUE,
      filing_date TEXT NOT NULL,
      period_end_date TEXT DEFAULT NULL,
      data TEXT NOT NULL,
      processed_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS holder_positions (
      id TEXT PRIMARY KEY,
      cik TEXT NOT NULL,
      holder_name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      cusip TEXT DEFAULT NULL,
      shares INTEGER NOT NULL,
      value INTEGER NOT NULL,
      quarter TEXT NOT NULL,
      filing_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS holder_changes (
      id TEXT PRIMARY KEY,
      cik TEXT NOT NULL,
      holder_name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('new', 'increased', 'decreased', 'exited')),
      shares_change INTEGER NOT NULL,
      value_change INTEGER NOT NULL,
      pct_change REAL NOT NULL,
      quarter TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS insider_transactions (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      insider_name TEXT NOT NULL,
      insider_title TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      shares INTEGER NOT NULL,
      price REAL NOT NULL,
      value REAL NOT NULL,
      transaction_date TEXT NOT NULL,
      filing_date TEXT NOT NULL,
      form_type TEXT NOT NULL DEFAULT 'Form 4',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cik_lookup (
      cik TEXT PRIMARY KEY,
      entity_name TEXT NOT NULL,
      ticker TEXT DEFAULT NULL,
      last_updated TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Options tables for volatility intelligence
    CREATE TABLE IF NOT EXISTS cached_options_chains (
      symbol TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS iv_history (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      iv REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(symbol, date)
    );

    CREATE TABLE IF NOT EXISTS pcr_history (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      ratio REAL NOT NULL,
      put_volume INTEGER NOT NULL DEFAULT 0,
      call_volume INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(symbol, date)
    );

    CREATE TABLE IF NOT EXISTS unusual_activity (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      contract_type TEXT NOT NULL CHECK(contract_type IN ('call', 'put')),
      strike REAL NOT NULL,
      expiry TEXT NOT NULL,
      volume INTEGER NOT NULL,
      open_interest INTEGER NOT NULL,
      volume_oi_ratio REAL NOT NULL,
      notional_value REAL NOT NULL,
      score REAL NOT NULL,
      sentiment TEXT NOT NULL CHECK(sentiment IN ('bullish', 'bearish', 'neutral')),
      classification TEXT NOT NULL DEFAULT 'unknown',
      reason TEXT NOT NULL,
      detected_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_sec_filings_cik_date ON sec_filings(cik, filing_date);
    CREATE INDEX IF NOT EXISTS idx_holder_positions_cik_quarter ON holder_positions(cik, quarter);
    CREATE INDEX IF NOT EXISTS idx_holder_positions_symbol_quarter ON holder_positions(symbol, quarter);
    CREATE INDEX IF NOT EXISTS idx_holder_changes_quarter ON holder_changes(quarter);
    CREATE INDEX IF NOT EXISTS idx_insider_transactions_symbol_date ON insider_transactions(symbol, transaction_date);
    CREATE INDEX IF NOT EXISTS idx_cik_lookup_ticker ON cik_lookup(ticker);
    
    -- Options indexes
    CREATE INDEX IF NOT EXISTS idx_iv_history_symbol_date ON iv_history(symbol, date);
    CREATE INDEX IF NOT EXISTS idx_pcr_history_symbol_date ON pcr_history(symbol, date);
    CREATE INDEX IF NOT EXISTS idx_unusual_activity_symbol_detected ON unusual_activity(symbol, detected_at);
    CREATE INDEX IF NOT EXISTS idx_unusual_activity_score ON unusual_activity(score DESC);

    -- Opportunity engine tables
    CREATE TABLE IF NOT EXISTS detected_signals (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('price', 'volume', 'holder', 'options', 'news', 'social', 'technical')),
      symbol TEXT NOT NULL,
      source TEXT NOT NULL,
      description TEXT NOT NULL,
      strength REAL NOT NULL CHECK(strength >= 0 AND strength <= 1),
      direction TEXT NOT NULL CHECK(direction IN ('bullish', 'bearish', 'neutral')),
      data TEXT NOT NULL DEFAULT '{}',
      timestamp TEXT NOT NULL,
      detected_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS opportunity_conditions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      rules TEXT NOT NULL DEFAULT '[]',
      logic TEXT NOT NULL DEFAULT 'AND' CHECK(logic IN ('AND', 'OR')),
      symbols TEXT DEFAULT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      notify_on_trigger INTEGER NOT NULL DEFAULT 1,
      trigger_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_triggered TEXT DEFAULT NULL,
      last_evaluated TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS opportunity_opportunities (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      title TEXT NOT NULL,
      thesis TEXT NOT NULL,
      confidence INTEGER NOT NULL CHECK(confidence >= 0 AND confidence <= 100),
      direction TEXT NOT NULL CHECK(direction IN ('long', 'short', 'neutral')),
      timeframe TEXT NOT NULL CHECK(timeframe IN ('day', 'swing', 'position')),
      signals TEXT NOT NULL DEFAULT '[]',
      evidence TEXT NOT NULL DEFAULT '[]',
      suggested_entry REAL DEFAULT NULL,
      suggested_stop REAL DEFAULT NULL,
      suggested_target REAL DEFAULT NULL,
      risk_reward REAL DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'triggered', 'expired', 'won', 'lost')),
      tags TEXT NOT NULL DEFAULT '[]',
      outcome TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS opportunity_backtests (
      id TEXT PRIMARY KEY,
      condition_id TEXT NOT NULL,
      period_from TEXT NOT NULL,
      period_to TEXT NOT NULL,
      triggers TEXT NOT NULL DEFAULT '[]',
      summary TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (condition_id) REFERENCES opportunity_conditions(id) ON DELETE CASCADE
    );

    -- Opportunity indexes
    CREATE INDEX IF NOT EXISTS idx_detected_signals_symbol ON detected_signals(symbol);
    CREATE INDEX IF NOT EXISTS idx_detected_signals_type ON detected_signals(type);
    CREATE INDEX IF NOT EXISTS idx_detected_signals_category ON detected_signals(category);
    CREATE INDEX IF NOT EXISTS idx_detected_signals_detected ON detected_signals(detected_at DESC);
    CREATE INDEX IF NOT EXISTS idx_detected_signals_strength ON detected_signals(strength DESC);
    
    CREATE INDEX IF NOT EXISTS idx_opportunity_conditions_enabled ON opportunity_conditions(enabled);
    CREATE INDEX IF NOT EXISTS idx_opportunity_conditions_last_triggered ON opportunity_conditions(last_triggered DESC);
    
    CREATE INDEX IF NOT EXISTS idx_opportunity_opportunities_symbol ON opportunity_opportunities(symbol);
    CREATE INDEX IF NOT EXISTS idx_opportunity_opportunities_confidence ON opportunity_opportunities(confidence DESC);
    CREATE INDEX IF NOT EXISTS idx_opportunity_opportunities_status ON opportunity_opportunities(status);
    CREATE INDEX IF NOT EXISTS idx_opportunity_opportunities_direction ON opportunity_opportunities(direction);
    CREATE INDEX IF NOT EXISTS idx_opportunity_opportunities_timeframe ON opportunity_opportunities(timeframe);
    CREATE INDEX IF NOT EXISTS idx_opportunity_opportunities_created ON opportunity_opportunities(created_at DESC);

    -- News tables
    CREATE TABLE IF NOT EXISTS news_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_checked TEXT DEFAULT NULL,
      article_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS news_articles (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      content_snippet TEXT DEFAULT '',
      published_at TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      tickers TEXT DEFAULT '[]',
      sentiment_score REAL DEFAULT 0,
      sentiment_label TEXT DEFAULT 'neutral',
      author TEXT DEFAULT NULL,
      image_url TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Social posts tables
    CREATE TABLE IF NOT EXISTS social_posts (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL CHECK(platform IN ('reddit', 'fourchan', 'twitter')),
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      author TEXT DEFAULT '',
      score INTEGER DEFAULT 0,
      comment_count INTEGER DEFAULT 0,
      published_at TEXT NOT NULL,
      url TEXT DEFAULT '',
      tickers TEXT DEFAULT '[]',
      sentiment_score REAL DEFAULT 0,
      sentiment_label TEXT DEFAULT 'neutral',
      is_filtered INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(platform, external_id)
    );

    -- Social mentions aggregation
    CREATE TABLE IF NOT EXISTS social_mentions (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      platform TEXT NOT NULL,
      hour_bucket TEXT NOT NULL,
      mentions INTEGER DEFAULT 0,
      total_score INTEGER DEFAULT 0,
      avg_sentiment REAL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(ticker, platform, hour_bucket)
    );

    -- Trending data
    CREATE TABLE IF NOT EXISTS trending_tickers (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      period TEXT NOT NULL,
      mentions INTEGER DEFAULT 0,
      mentions_change INTEGER DEFAULT 0,
      mentions_change_percent REAL DEFAULT 0,
      sentiment REAL DEFAULT 0,
      trending_score REAL DEFAULT 0,
      sources TEXT DEFAULT '{}',
      calculated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(ticker, period, calculated_at)
    );

    -- Hype alerts
    CREATE TABLE IF NOT EXISTS hype_alerts (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      mentions INTEGER NOT NULL,
      baseline INTEGER NOT NULL,
      multiplier REAL NOT NULL,
      confidence REAL NOT NULL,
      platforms TEXT DEFAULT '[]',
      detected_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- News indexes
    CREATE INDEX IF NOT EXISTS idx_news_articles_published ON news_articles(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_news_articles_source ON news_articles(source_id);
    CREATE INDEX IF NOT EXISTS idx_news_articles_sentiment ON news_articles(sentiment_label);
    CREATE INDEX IF NOT EXISTS idx_news_articles_tickers ON news_articles(tickers);

    -- Social indexes
    CREATE INDEX IF NOT EXISTS idx_social_posts_platform_published ON social_posts(platform, published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_social_posts_source ON social_posts(source);
    CREATE INDEX IF NOT EXISTS idx_social_posts_tickers ON social_posts(tickers);
    CREATE INDEX IF NOT EXISTS idx_social_mentions_ticker_hour ON social_mentions(ticker, hour_bucket);
    CREATE INDEX IF NOT EXISTS idx_trending_tickers_period ON trending_tickers(period, calculated_at DESC);
  `);

  // Add columns to tracked_holders if they don't exist
  try {
    db.exec('ALTER TABLE tracked_holders ADD COLUMN cik TEXT DEFAULT NULL;');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.exec('ALTER TABLE tracked_holders ADD COLUMN last_check TEXT DEFAULT NULL;');
  } catch (e) {
    // Column already exists, ignore
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
