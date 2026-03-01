import { getDb } from '../../db/schema';
import { Opportunity, Signal } from '../../types/opportunity';
import { getConditions } from './conditions';
import { v4 } from './uuid';

export function evaluateConditions(): Opportunity[] {
  const conditions = getConditions().filter(c => c.enabled);
  const opportunities: Opportunity[] = [];

  for (const condition of conditions) {
    // Stub evaluation — in real implementation, this checks live data
    // against condition parameters
    const signals: Signal[] = [
      {
        type: condition.type,
        source: 'condition-evaluator',
        description: `Condition "${condition.name}" is being monitored`,
        strength: 0.5,
        timestamp: new Date().toISOString(),
      },
    ];

    // Only create opportunity if signals are strong enough
    const avgStrength = signals.reduce((sum, s) => sum + s.strength, 0) / signals.length;
    if (avgStrength > 0.3) {
      const opp: Opportunity = {
        id: v4(),
        title: condition.name,
        description: condition.description,
        symbols: condition.symbols,
        conditionId: condition.id,
        signals,
        score: avgStrength,
        createdAt: new Date().toISOString(),
      };
      opportunities.push(opp);
    }
  }

  return opportunities;
}

export function getOpportunities(limit: number = 20): Opportunity[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM opportunities ORDER BY score DESC, created_at DESC LIMIT ?')
    .all(limit) as Record<string, unknown>[];

  return rows.map(row => ({
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    symbols: JSON.parse(row.symbols as string),
    conditionId: (row.condition_id as string) || null,
    signals: JSON.parse(row.signals as string),
    score: row.score as number,
    createdAt: row.created_at as string,
  }));
}

export function saveOpportunity(opp: Opportunity): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO opportunities (id, title, description, symbols, condition_id, signals, score, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    opp.id,
    opp.title,
    opp.description,
    JSON.stringify(opp.symbols),
    opp.conditionId,
    JSON.stringify(opp.signals),
    opp.score,
    opp.createdAt,
  );
}
