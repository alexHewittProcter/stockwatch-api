import { Router, Request, Response } from 'express';
import { aiLearnService } from '../services/ai/learn';
import { reportGeneratorService } from '../services/ai/reports';

const router = Router();

// AI Learning Routes

// POST /api/ai/learn/:tradeId - trigger AI analysis on a completed trade
router.post('/learn/:tradeId', async (req: Request, res: Response) => {
  try {
    const tradeId = req.params.tradeId as string;
    
    console.log(`[AI] Learning from trade ${tradeId}`);
    const pattern = await aiLearnService.analyzeTradeForPattern(tradeId);
    
    res.json({ success: true, pattern });
  } catch (err) {
    console.error('[AI] Learn error:', err);
    res.status(500).json({ 
      error: err instanceof Error ? err.message : 'Failed to analyze trade' 
    });
  }
});

// GET /api/ai/patterns - list all learned patterns
router.get('/patterns', async (req: Request, res: Response) => {
  try {
    const patterns = await aiLearnService.getPatterns();
    res.json({ patterns });
  } catch (err) {
    console.error('[AI] Get patterns error:', err);
    res.status(500).json({ error: 'Failed to fetch patterns' });
  }
});

// GET /api/ai/patterns/:id - pattern detail with stats
router.get('/patterns/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const pattern = await aiLearnService.getPattern(id);
    
    if (!pattern) {
      return res.status(404).json({ error: 'Pattern not found' });
    }
    
    res.json(pattern);
  } catch (err) {
    console.error('[AI] Get pattern error:', err);
    res.status(500).json({ error: 'Failed to fetch pattern' });
  }
});

// Research Report Routes

// GET /api/reports - list all reports (paginated, filterable)
router.get('/reports', async (req: Request, res: Response) => {
  try {
    const {
      symbol,
      status,
      outcome,
      minConfidence,
      limit = 20,
      offset = 0,
    } = req.query;

    const filters: any = {
      limit: Number(limit),
      offset: Number(offset),
    };

    if (symbol) filters.symbol = symbol as string;
    if (status) filters.status = status as string;
    if (outcome) filters.outcome = outcome as string;
    if (minConfidence) filters.minConfidence = Number(minConfidence);

    const reports = await reportGeneratorService.getReports(filters);
    
    res.json({ reports, total: reports.length });
  } catch (err) {
    console.error('[Reports] List error:', err);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// GET /api/reports/:id - full report
router.get('/reports/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const report = await reportGeneratorService.getReport(id);
    
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    res.json(report);
  } catch (err) {
    console.error('[Reports] Get report error:', err);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// POST /api/reports/generate - manually trigger report for a symbol
router.post('/reports/generate', async (req: Request, res: Response) => {
  try {
    const { symbol, direction, context, opportunityId } = req.body;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    console.log(`[Reports] Generating report for ${symbol}`);
    const report = await reportGeneratorService.generateReport(symbol, {
      direction,
      context,
      opportunityId,
    });

    res.status(201).json(report);
  } catch (err) {
    console.error('[Reports] Generate error:', err);
    res.status(500).json({ 
      error: err instanceof Error ? err.message : 'Failed to generate report' 
    });
  }
});

// PUT /api/reports/:id/outcome - mark outcome after trade closes
router.put('/reports/:id/outcome', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { outcome, notes } = req.body;

    if (!outcome || !['won', 'lost'].includes(outcome)) {
      return res.status(400).json({ error: 'Valid outcome (won/lost) is required' });
    }

    const updated = await reportGeneratorService.updateReportOutcome(id, outcome, notes);
    
    if (!updated) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ success: true, outcome, notes });
  } catch (err) {
    console.error('[Reports] Update outcome error:', err);
    res.status(500).json({ error: 'Failed to update report outcome' });
  }
});

// GET /api/reports/performance - aggregate stats
router.get('/reports/performance', async (req: Request, res: Response) => {
  try {
    const allReports = await reportGeneratorService.getReports({});
    
    const totalReports = allReports.length;
    const completedReports = allReports.filter(r => r.outcome === 'won' || r.outcome === 'lost');
    const wonReports = allReports.filter(r => r.outcome === 'won');
    const lostReports = allReports.filter(r => r.outcome === 'lost');
    
    const winRate = completedReports.length > 0 ? (wonReports.length / completedReports.length) * 100 : 0;
    const avgConfidence = totalReports > 0 
      ? allReports.reduce((sum, r) => sum + r.recommendation.confidence, 0) / totalReports 
      : 0;

    // Calculate performance by confidence bucket
    const highConfidenceReports = completedReports.filter(r => r.recommendation.confidence >= 70);
    const highConfidenceWinRate = highConfidenceReports.length > 0 
      ? (highConfidenceReports.filter(r => r.outcome === 'won').length / highConfidenceReports.length) * 100
      : 0;

    const performance = {
      totalReports,
      completedReports: completedReports.length,
      pendingReports: allReports.filter(r => r.outcome === 'pending').length,
      winRate,
      winCount: wonReports.length,
      lossCount: lostReports.length,
      avgConfidence,
      highConfidenceWinRate,
      highConfidenceCount: highConfidenceReports.length,
    };

    res.json(performance);
  } catch (err) {
    console.error('[Reports] Performance error:', err);
    res.status(500).json({ error: 'Failed to calculate performance' });
  }
});

export default router;