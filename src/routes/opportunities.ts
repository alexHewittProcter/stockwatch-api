import { Router, Request, Response } from 'express';
import { conditionService } from '../services/opportunities/conditions';
import { opportunityEngine } from '../services/opportunities/engine';
import { signalManager } from '../services/opportunities/signals';

const router = Router();

// GET /api/opportunities - ranked opportunity feed
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      direction,
      confidence,
      timeframe,
      limit = 20,
      offset = 0,
    } = req.query;

    const filters: any = {
      limit: Number(limit),
      offset: Number(offset),
    };

    if (direction && ['long', 'short', 'neutral'].includes(direction as string)) {
      filters.direction = direction as 'long' | 'short' | 'neutral';
    }

    if (confidence) {
      filters.confidence = Number(confidence);
    }

    if (timeframe && ['day', 'swing', 'position'].includes(timeframe as string)) {
      filters.timeframe = timeframe as 'day' | 'swing' | 'position';
    }

    const opportunities = await opportunityEngine.getOpportunities(filters);
    
    res.json({
      opportunities,
      total: opportunities.length,
      filters,
    });
  } catch (err) {
    console.error('[Opportunities] List error:', err);
    res.status(500).json({ error: 'Failed to fetch opportunities' });
  }
});

// GET /api/opportunities/:id - full opportunity detail
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const opportunity = await opportunityEngine.getOpportunity(id);
    
    if (!opportunity) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    res.json(opportunity);
  } catch (err) {
    console.error('[Opportunities] Get opportunity error:', err);
    res.status(500).json({ error: 'Failed to fetch opportunity' });
  }
});

// PUT /api/opportunities/:id/status - update opportunity status
router.put('/:id/status', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status, outcome } = req.body;

    if (!['active', 'triggered', 'expired', 'won', 'lost'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updated = await opportunityEngine.updateOpportunityStatus(id, status, outcome);
    
    if (!updated) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    res.json({ success: true, status, outcome });
  } catch (err) {
    console.error('[Opportunities] Update status error:', err);
    res.status(500).json({ error: 'Failed to update opportunity status' });
  }
});

// POST /api/opportunities/generate - manually trigger opportunity generation
router.post('/generate', async (req: Request, res: Response) => {
  try {
    console.log('[Opportunities] Manual opportunity generation requested');
    const opportunities = await opportunityEngine.generateOpportunities();
    
    res.json({
      generated: opportunities.length,
      opportunities: opportunities.slice(0, 10), // Return top 10
    });
  } catch (err) {
    console.error('[Opportunities] Generate error:', err);
    res.status(500).json({ error: 'Failed to generate opportunities' });
  }
});

// GET /api/opportunities/signals - raw signal feed
router.get('/signals/recent', async (req: Request, res: Response) => {
  try {
    const { hours = 24, limit = 100 } = req.query;
    
    const signals = await signalManager.getRecentSignals(Number(hours), Number(limit));
    
    res.json({
      signals,
      total: signals.length,
      timeframe: `${hours}h`,
    });
  } catch (err) {
    console.error('[Opportunities] Signals error:', err);
    res.status(500).json({ error: 'Failed to fetch signals' });
  }
});

// POST /api/opportunities/signals/detect - manually trigger signal detection
router.post('/signals/detect', async (req: Request, res: Response) => {
  try {
    const { symbols } = req.body;
    
    console.log('[Opportunities] Manual signal detection requested', { symbols });
    const detectedSignals = await signalManager.detectAllSignals(symbols);
    
    res.json({
      detected: detectedSignals.length,
      signals: detectedSignals.slice(0, 20), // Return first 20
    });
  } catch (err) {
    console.error('[Opportunities] Signal detection error:', err);
    res.status(500).json({ error: 'Failed to detect signals' });
  }
});

// POST /api/opportunities/conditions - create custom condition
router.post('/conditions', async (req: Request, res: Response) => {
  try {
    const { name, description, rules, logic, symbols, notifyOnTrigger } = req.body;

    if (!name || !rules || !Array.isArray(rules) || rules.length === 0) {
      return res.status(400).json({ 
        error: 'Name and rules array are required' 
      });
    }

    if (!['AND', 'OR'].includes(logic)) {
      return res.status(400).json({ error: 'Logic must be AND or OR' });
    }

    // Validate rules
    for (const rule of rules) {
      if (!rule.metric || !rule.comparator || rule.value === undefined) {
        return res.status(400).json({ 
          error: 'Each rule must have metric, comparator, and value' 
        });
      }
    }

    const condition = await conditionService.createCondition({
      name,
      description,
      rules,
      logic,
      symbols,
      notifyOnTrigger,
    });

    res.status(201).json(condition);
  } catch (err) {
    console.error('[Opportunities] Create condition error:', err);
    res.status(500).json({ error: 'Failed to create condition' });
  }
});

// GET /api/opportunities/conditions - list all conditions
router.get('/conditions', async (req: Request, res: Response) => {
  try {
    const conditions = await conditionService.getConditions();
    res.json({ conditions });
  } catch (err) {
    console.error('[Opportunities] List conditions error:', err);
    res.status(500).json({ error: 'Failed to list conditions' });
  }
});

// GET /api/opportunities/conditions/:id - get specific condition
router.get('/conditions/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const condition = await conditionService.getCondition(id);
    
    if (!condition) {
      return res.status(404).json({ error: 'Condition not found' });
    }

    res.json(condition);
  } catch (err) {
    console.error('[Opportunities] Get condition error:', err);
    res.status(500).json({ error: 'Failed to fetch condition' });
  }
});

// PUT /api/opportunities/conditions/:id - update condition
router.put('/conditions/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const updates = req.body;

    const updated = await conditionService.updateCondition(id, updates);
    
    if (!updated) {
      return res.status(404).json({ error: 'Condition not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Opportunities] Update condition error:', err);
    res.status(500).json({ error: 'Failed to update condition' });
  }
});

// DELETE /api/opportunities/conditions/:id - delete condition
router.delete('/conditions/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const deleted = await conditionService.deleteCondition(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Condition not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Opportunities] Delete condition error:', err);
    res.status(500).json({ error: 'Failed to delete condition' });
  }
});

// POST /api/opportunities/conditions/evaluate - evaluate all conditions
router.post('/conditions/evaluate', async (req: Request, res: Response) => {
  try {
    console.log('[Opportunities] Manual condition evaluation requested');
    const results = await conditionService.evaluateConditions();
    
    const triggered = results.filter(r => r.triggered);
    
    res.json({
      evaluated: results.length,
      triggered: triggered.length,
      results: results.map(r => ({
        condition: {
          id: r.condition.id,
          name: r.condition.name,
        },
        triggered: r.triggered,
        symbols: r.symbols,
      })),
    });
  } catch (err) {
    console.error('[Opportunities] Evaluate conditions error:', err);
    res.status(500).json({ error: 'Failed to evaluate conditions' });
  }
});

// POST /api/opportunities/conditions/:id/backtest - backtest a condition
router.post('/conditions/:id/backtest', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { fromDate, toDate } = req.body;

    if (!fromDate || !toDate) {
      return res.status(400).json({ 
        error: 'fromDate and toDate are required' 
      });
    }

    const condition = await conditionService.getCondition(id);
    if (!condition) {
      return res.status(404).json({ error: 'Condition not found' });
    }

    console.log(`[Opportunities] Backtesting condition ${condition.name} from ${fromDate} to ${toDate}`);
    const result = await conditionService.backtestCondition(condition, fromDate, toDate);

    res.json(result);
  } catch (err) {
    console.error('[Opportunities] Backtest error:', err);
    res.status(500).json({ error: 'Failed to backtest condition' });
  }
});

// GET /api/opportunities/backtests - get backtest results
router.get('/backtests', async (req: Request, res: Response) => {
  try {
    const { conditionId } = req.query;
    
    const backtests = await conditionService.getBacktests(conditionId as string);
    res.json({ backtests });
  } catch (err) {
    console.error('[Opportunities] Get backtests error:', err);
    res.status(500).json({ error: 'Failed to fetch backtests' });
  }
});

// Legacy routes for compatibility
router.post('/condition', async (req: Request, res: Response) => {
  // Forward to new endpoint
  const { name, description, type, parameters, symbols } = req.body;

  if (!name || !type) {
    return res.status(400).json({ error: 'Name and type are required' });
  }

  if (!['price', 'volume', 'holder', 'technical', 'custom'].includes(type)) {
    return res.status(400).json({ error: 'Invalid condition type' });
  }

  try {
    // Convert old format to new format
    const rules = [{
      id: Date.now().toString(),
      metric: type,
      comparator: 'gt' as const,
      value: parameters?.value || 0,
      timeframe: parameters?.timeframe,
    }];

    const condition = await conditionService.createCondition({
      name,
      description,
      rules,
      logic: 'AND',
      symbols: symbols || [],
    });

    res.status(201).json(condition);
  } catch (err) {
    console.error('[Opportunities] Legacy create condition error:', err);
    res.status(500).json({ error: 'Failed to create condition' });
  }
});

router.delete('/condition/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const deleted = await conditionService.deleteCondition(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Condition not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Opportunities] Legacy delete condition error:', err);
    res.status(500).json({ error: 'Failed to delete condition' });
  }
});

router.put('/condition/:id/toggle', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { enabled } = req.body;
    
    const updated = await conditionService.updateCondition(id, { enabled });

    if (!updated) {
      return res.status(404).json({ error: 'Condition not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Opportunities] Toggle condition error:', err);
    res.status(500).json({ error: 'Failed to toggle condition' });
  }
});

router.post('/evaluate', async (req: Request, res: Response) => {
  try {
    // Legacy method - use new opportunities generation
    const opportunities = await opportunityEngine.generateOpportunities();
    res.json(opportunities.slice(0, 20));
  } catch (err) {
    console.error('[Opportunities] Legacy evaluate error:', err);
    res.status(500).json({ error: 'Failed to evaluate conditions' });
  }
});

export default router;