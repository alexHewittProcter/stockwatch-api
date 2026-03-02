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
