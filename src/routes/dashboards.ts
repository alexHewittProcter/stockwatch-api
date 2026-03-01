import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import { DEFAULT_DASHBOARDS } from '../db/seed/default-dashboards';
import { v4 } from '../services/opportunities/uuid';

const router = Router();

// GET /api/dashboards
router.get('/', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM dashboards WHERE is_default = 0 ORDER BY updated_at DESC')
      .all() as Record<string, unknown>[];

    const dashboards = rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      widgets: JSON.parse(row.widgets as string),
      layout: JSON.parse(row.layout as string),
      isDefault: false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    res.json(dashboards);
  } catch (err) {
    console.error('[Dashboards] List error:', err);
    res.status(500).json({ error: 'Failed to list dashboards' });
  }
});

// GET /api/dashboards/defaults
router.get('/defaults', (_req: Request, res: Response) => {
  res.json(DEFAULT_DASHBOARDS);
});

// GET /api/dashboards/:id
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check defaults first
    const defaultDash = DEFAULT_DASHBOARDS.find(d => d.id === id);
    if (defaultDash) {
      return res.json(defaultDash);
    }

    const db = getDb();
    const row = db.prepare('SELECT * FROM dashboards WHERE id = ?').get(id) as Record<string, unknown> | undefined;

    if (!row) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    res.json({
      id: row.id,
      name: row.name,
      description: row.description,
      widgets: JSON.parse(row.widgets as string),
      layout: JSON.parse(row.layout as string),
      isDefault: !!(row.is_default as number),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error('[Dashboards] Get error:', err);
    res.status(500).json({ error: 'Failed to get dashboard' });
  }
});

// POST /api/dashboards
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, description, widgets, layout } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const db = getDb();
    const id = v4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO dashboards (id, name, description, widgets, layout, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      id,
      name,
      description || '',
      JSON.stringify(widgets || []),
      JSON.stringify(layout || { columns: 3, rows: 3 }),
      now,
      now,
    );

    res.status(201).json({
      id,
      name,
      description: description || '',
      widgets: widgets || [],
      layout: layout || { columns: 3, rows: 3 },
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    console.error('[Dashboards] Create error:', err);
    res.status(500).json({ error: 'Failed to create dashboard' });
  }
});

// PUT /api/dashboards/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, widgets, layout } = req.body;

    const db = getDb();
    const existing = db.prepare('SELECT * FROM dashboards WHERE id = ?').get(id) as Record<string, unknown> | undefined;

    if (!existing) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE dashboards SET name = ?, description = ?, widgets = ?, layout = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name ?? existing.name,
      description ?? existing.description,
      widgets ? JSON.stringify(widgets) : (existing.widgets as string),
      layout ? JSON.stringify(layout) : (existing.layout as string),
      now,
      id,
    );

    res.json({
      id,
      name: name ?? existing.name,
      description: description ?? existing.description,
      widgets: widgets ?? JSON.parse(existing.widgets as string),
      layout: layout ?? JSON.parse(existing.layout as string),
      updatedAt: now,
    });
  } catch (err) {
    console.error('[Dashboards] Update error:', err);
    res.status(500).json({ error: 'Failed to update dashboard' });
  }
});

// DELETE /api/dashboards/:id
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = getDb();
    const result = db.prepare('DELETE FROM dashboards WHERE id = ? AND is_default = 0').run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Dashboard not found or is a default dashboard' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Dashboards] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete dashboard' });
  }
});

export default router;
