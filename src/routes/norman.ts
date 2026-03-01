import { Router, Request, Response } from 'express';
import { normanAgent } from '../services/norman/agent';

const router = Router();

// POST /api/norman/chat
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, context } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await normanAgent.chat({ message, context });
    res.json(response);
  } catch (err) {
    console.error('[Norman] Chat error:', err);
    res.status(500).json({ error: 'Norman chat failed' });
  }
});

// POST /api/norman/task
router.post('/task', async (req: Request, res: Response) => {
  try {
    const { type, description, params } = req.body;

    if (!type || !description) {
      return res.status(400).json({ error: 'Type and description are required' });
    }

    const task = await normanAgent.createTask(type, description, params);
    res.status(201).json(task);
  } catch (err) {
    console.error('[Norman] Task error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// POST /api/norman/learn
router.post('/learn', async (req: Request, res: Response) => {
  try {
    const tradeData = req.body;

    if (!tradeData.symbol) {
      return res.status(400).json({ error: 'Trade data with symbol is required' });
    }

    const result = await normanAgent.learnFromTrade(tradeData);
    res.json(result);
  } catch (err) {
    console.error('[Norman] Learn error:', err);
    res.status(500).json({ error: 'Failed to analyze trade' });
  }
});

// GET /api/norman/reports
router.get('/reports', async (_req: Request, res: Response) => {
  try {
    const reports = await normanAgent.getReports();
    res.json(reports);
  } catch (err) {
    console.error('[Norman] Reports error:', err);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// GET /api/norman/reports/:id
router.get('/reports/:id', async (req: Request, res: Response) => {
  try {
    const report = await normanAgent.getReport(req.params.id as string);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json(report);
  } catch (err) {
    console.error('[Norman] Report error:', err);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

export default router;
