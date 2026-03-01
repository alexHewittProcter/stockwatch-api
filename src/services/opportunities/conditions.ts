import { getDb } from '../../db/schema';
import { Condition } from '../../types/opportunity';
import { v4 } from './uuid';

export function createCondition(params: {
  name: string;
  description?: string;
  type: Condition['type'];
  parameters: Record<string, unknown>;
  symbols: string[];
}): Condition {
  const db = getDb();
  const id = v4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO conditions (id, name, description, type, parameters, symbols, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    id,
    params.name,
    params.description || '',
    params.type,
    JSON.stringify(params.parameters),
    JSON.stringify(params.symbols),
    now,
  );

  return {
    id,
    name: params.name,
    description: params.description || '',
    type: params.type,
    parameters: params.parameters,
    symbols: params.symbols,
    enabled: true,
    createdAt: now,
    lastTriggered: null,
  };
}

export function getConditions(): Condition[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM conditions ORDER BY created_at DESC').all() as Record<string, unknown>[];

  return rows.map(row => ({
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    type: row.type as Condition['type'],
    parameters: JSON.parse(row.parameters as string),
    symbols: JSON.parse(row.symbols as string),
    enabled: !!(row.enabled as number),
    createdAt: row.created_at as string,
    lastTriggered: (row.last_triggered as string) || null,
  }));
}

export function getCondition(id: string): Condition | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM conditions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;

  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    type: row.type as Condition['type'],
    parameters: JSON.parse(row.parameters as string),
    symbols: JSON.parse(row.symbols as string),
    enabled: !!(row.enabled as number),
    createdAt: row.created_at as string,
    lastTriggered: (row.last_triggered as string) || null,
  };
}

export function deleteCondition(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM conditions WHERE id = ?').run(id);
  return result.changes > 0;
}

export function updateConditionEnabled(id: string, enabled: boolean): boolean {
  const db = getDb();
  const result = db.prepare('UPDATE conditions SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
  return result.changes > 0;
}
