import { Router, Request, Response } from 'express';
import { dataExport } from '../services/export/data';

const router = Router();

// GET /api/export/:type - Export various data types
router.get('/:type', async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const { format = 'json' } = req.query;

    if (!['json', 'csv'].includes(format as string)) {
      return res.status(400).json({ error: 'Format must be json or csv' });
    }

    let data: any[];

    switch (type) {
      case 'dashboards':
        data = await dataExport.exportDashboards();
        break;

      case 'journal':
        data = await dataExport.exportTradeJournal();
        break;

      case 'reports':
        data = await dataExport.exportReports();
        break;

      case 'watchlists':
        data = await dataExport.exportWatchlists();
        break;

      case 'patterns':
        data = await dataExport.exportPatterns();
        break;

      case 'conditions':
        data = await dataExport.exportConditions();
        break;

      case 'holders':
        data = await dataExport.exportHolders();
        break;

      default:
        return res.status(400).json({ 
          error: 'Invalid type. Supported: dashboards, journal, reports, watchlists, patterns, conditions, holders' 
        });
    }

    dataExport.sendExportResponse(res, data, type, format as 'json' | 'csv');
  } catch (err) {
    console.error(`[Export] ${req.params.type} export error:`, err);
    res.status(500).json({ 
      error: err instanceof Error ? err.message : 'Export failed' 
    });
  }
});

// GET /api/export/all - Export all data types as a ZIP (JSON only)
router.get('/all/bundle', async (req: Request, res: Response) => {
  try {
    const exports = {
      dashboards: await dataExport.exportDashboards(),
      journal: await dataExport.exportTradeJournal(),
      reports: await dataExport.exportReports(),
      watchlists: await dataExport.exportWatchlists(),
      patterns: await dataExport.exportPatterns(),
      conditions: await dataExport.exportConditions(),
      holders: await dataExport.exportHolders(),
    };

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `stockwatch_full_export_${timestamp}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json({
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
      ...exports,
    });
  } catch (err) {
    console.error('[Export] Full export error:', err);
    res.status(500).json({ error: 'Full export failed' });
  }
});

// GET /api/export/info - Get export information (what's available)
router.get('/info/available', async (req: Request, res: Response) => {
  try {
    const info = {
      availableTypes: [
        {
          type: 'dashboards',
          name: 'Dashboards',
          description: 'Dashboard configurations and layouts',
          formats: ['json'],
        },
        {
          type: 'journal',
          name: 'Trade Journal',
          description: 'Trading history, P&L, and notes',
          formats: ['json', 'csv'],
        },
        {
          type: 'reports',
          name: 'Research Reports',
          description: 'AI-generated research reports',
          formats: ['json'],
        },
        {
          type: 'watchlists',
          name: 'Watchlists',
          description: 'Tracked symbols and alerts',
          formats: ['json', 'csv'],
        },
        {
          type: 'patterns',
          name: 'Trading Patterns',
          description: 'AI-learned trading patterns',
          formats: ['json'],
        },
        {
          type: 'conditions',
          name: 'Opportunity Conditions',
          description: 'Custom opportunity detection rules',
          formats: ['json'],
        },
        {
          type: 'holders',
          name: 'Tracked Holders',
          description: 'Institutional and insider holders',
          formats: ['json', 'csv'],
        },
      ],
      formats: {
        json: 'JSON format - preserves full data structure',
        csv: 'CSV format - flattened for spreadsheet import',
      },
    };

    res.json(info);
  } catch (err) {
    console.error('[Export] Info error:', err);
    res.status(500).json({ error: 'Failed to get export info' });
  }
});

export default router;