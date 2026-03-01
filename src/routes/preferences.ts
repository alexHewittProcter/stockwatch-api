import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import { UserPreferences, DEFAULT_PREFERENCES } from '../types/preferences';

const router = Router();

function getPreferences(): UserPreferences {
  const db = getDb();
  const row = db.prepare("SELECT data FROM preferences WHERE id = 'default'")
    .get() as { data: string } | undefined;

  if (!row) return { ...DEFAULT_PREFERENCES };

  try {
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(row.data) };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

function savePreferences(prefs: UserPreferences): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO preferences (id, data, updated_at) VALUES ('default', ?, datetime('now'))
  `).run(JSON.stringify(prefs));
}

// GET /api/preferences
router.get('/', (_req: Request, res: Response) => {
  try {
    res.json(getPreferences());
  } catch (err) {
    console.error('[Preferences] Get error:', err);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

// PUT /api/preferences
router.put('/', (req: Request, res: Response) => {
  try {
    const current = getPreferences();
    const updated = { ...current, ...req.body };

    // Don't allow overwriting graphOverrides with a partial update here
    if (req.body.graphOverrides) {
      updated.graphOverrides = { ...current.graphOverrides, ...req.body.graphOverrides };
    }

    savePreferences(updated);
    res.json(updated);
  } catch (err) {
    console.error('[Preferences] Update error:', err);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// PUT /api/preferences/graph/:id — per-graph overrides
router.put('/graph/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { chartType, interval, indicators } = req.body;

    const prefs = getPreferences();
    prefs.graphOverrides[id] = {
      ...(prefs.graphOverrides[id] || {}),
      ...(chartType !== undefined ? { chartType } : {}),
      ...(interval !== undefined ? { interval } : {}),
      ...(indicators !== undefined ? { indicators } : {}),
    };

    savePreferences(prefs);
    res.json({ graphId: id, override: prefs.graphOverrides[id] });
  } catch (err) {
    console.error('[Preferences] Graph override error:', err);
    res.status(500).json({ error: 'Failed to update graph preferences' });
  }
});

export default router;
