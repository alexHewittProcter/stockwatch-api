import { getDb } from '../../db/schema';
import { Quote, Candle } from '../../types/market';

const QUOTE_TTL = 30_000; // 30 seconds
const CANDLE_TTL = 5 * 60_000; // 5 minutes

export function getCachedQuote(symbol: string): Quote | null {
  const db = getDb();
  const row = db.prepare('SELECT data, updated_at FROM cached_quotes WHERE symbol = ?')
    .get(symbol.toUpperCase()) as { data: string; updated_at: number } | undefined;

  if (!row) return null;
  if (Date.now() - row.updated_at > QUOTE_TTL) return null;

  return JSON.parse(row.data);
}

export function setCachedQuote(symbol: string, quote: Quote): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO cached_quotes (symbol, data, updated_at) VALUES (?, ?, ?)
  `).run(symbol.toUpperCase(), JSON.stringify(quote), Date.now());
}

export function getCachedCandles(symbol: string, interval: string): Candle[] | null {
  const db = getDb();
  const row = db.prepare('SELECT data, updated_at FROM cached_candles WHERE symbol = ? AND interval = ?')
    .get(symbol.toUpperCase(), interval) as { data: string; updated_at: number } | undefined;

  if (!row) return null;
  if (Date.now() - row.updated_at > CANDLE_TTL) return null;

  return JSON.parse(row.data);
}

export function setCachedCandles(symbol: string, interval: string, candles: Candle[]): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO cached_candles (symbol, interval, data, updated_at) VALUES (?, ?, ?, ?)
  `).run(symbol.toUpperCase(), interval, JSON.stringify(candles), Date.now());
}
