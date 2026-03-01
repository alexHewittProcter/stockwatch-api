import { Router, Request, Response } from 'express';
import { createCondition, getConditions, deleteCondition, updateConditionEnabled } from '../services/opportunities/conditions';
import { getOpportunities, evaluateConditions } from '../services/opportunities/engine';

const router = Router();

// GET /api/opportunities
router.get('/', (_req: Request, res: Response) => {
  try {
    const opportunities = getOpportunities();
    res.json(opportunities);
  } catch (err) {
    console.error('[Opportunities] List error:', err);
    res.status(500).json({ error: 'Failed to fetch opportunities' });
  }
});

// POST /api/opportunities/condition
router.post('/condition', (req: Request, res: Response) => {
  try {
    const { name, description, type, parameters, symbols } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    if (!['price', 'volume', 'holder', 'technical', 'custom'].includes(type)) {
      return res.status(400).json({ error: 'Invalid condition type' });
    }

    const condition = createCondition({
      name,
      description,
      type,
      parameters: parameters || {},
      symbols: symbols || [],
    });

    res.status(201).json(condition);
  } catch (err) {
    console.error('[Opportunities] Create condition error:', err);
    res.status(500).json({ error: 'Failed to create condition' });
  }
});

// GET /api/opportunities/conditions
router.get('/conditions', (_req: Request, res: Response) => {
  try {
    const conditions = getConditions();
    res.json(conditions);
  } catch (err) {
    console.error('[Opportunities] List conditions error:', err);
    res.status(500).json({ error: 'Failed to list conditions' });
  }
});

// DELETE /api/opportunities/condition/:id
router.delete('/condition/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = deleteCondition(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Condition not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Opportunities] Delete condition error:', err);
    res.status(500).json({ error: 'Failed to delete condition' });
  }
});

// PUT /api/opportunities/condition/:id/toggle
router.put('/condition/:id/toggle', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;
    const updated = updateConditionEnabled(id, enabled);

    if (!updated) {
      return res.status(404).json({ error: 'Condition not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Opportunities] Toggle condition error:', err);
    res.status(500).json({ error: 'Failed to toggle condition' });
  }
});

// POST /api/opportunities/evaluate
router.post('/evaluate', (_req: Request, res: Response) => {
  try {
    const opportunities = evaluateConditions();
    res.json(opportunities);
  } catch (err) {
    console.error('[Opportunities] Evaluate error:', err);
    res.status(500).json({ error: 'Failed to evaluate conditions' });
  }
});

export default router;
