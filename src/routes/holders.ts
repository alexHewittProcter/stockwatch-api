import { Router, Request, Response } from 'express';
import { getHolders } from '../services/yahoo/holders';
import { getDb } from '../db/schema';
import { v4 } from '../services/opportunities/uuid';
import { secEdgarService } from '../services/sec-edgar/filings';
import { insiderTradingService } from '../services/sec-edgar/insider';
import { holderTrackingService } from '../services/sec-edgar/tracking';

const router = Router();

// GET /api/holders/tracked
router.get('/tracked', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const holders = db.prepare(`
      SELECT th.*, 
             COUNT(hc.id) as recent_changes,
             MAX(hc.created_at) as last_activity
      FROM tracked_holders th
      LEFT JOIN holder_changes hc ON th.cik = hc.cik 
        AND hc.created_at > datetime('now', '-30 days')
      GROUP BY th.id
      ORDER BY tracked_since DESC
    `).all();

    res.json(holders);
  } catch (err) {
    console.error('[Holders] Tracked error:', err);
    res.status(500).json({ error: 'Failed to fetch tracked holders' });
  }
});

// GET /api/holders/changes
router.get('/changes', (req: Request, res: Response) => {
  try {
    const quarter = req.query.quarter as string;
    const limit = parseInt((req.query.limit as string) || '50');
    
    const db = getDb();
    const query = quarter 
      ? 'SELECT * FROM holder_changes WHERE quarter = ? ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM holder_changes ORDER BY created_at DESC LIMIT ?';
    
    const params = quarter ? [quarter, limit] : [limit];
    const changes = db.prepare(query).all(...params);

    res.json({
      changes: changes.map((c: any) => ({
        id: c.id,
        cik: c.cik,
        holderName: c.holder_name,
        symbol: c.symbol,
        action: c.action,
        sharesChange: c.shares_change,
        valueChange: c.value_change,
        pctChange: c.pct_change,
        quarter: c.quarter,
        createdAt: c.created_at,
      })),
      quarter: quarter || 'all',
    });
  } catch (err) {
    console.error('[Holders] Changes error:', err);
    res.status(500).json({ error: 'Failed to fetch holder changes' });
  }
});

// GET /api/holders/changes/:cik
router.get('/changes/:cik', (req: Request, res: Response) => {
  try {
    const cik = req.params.cik as string;
    const quarters = parseInt((req.query.quarters as string) || '4');
    
    const changes = holderTrackingService.getHolderChanges(cik, quarters);
    
    res.json({
      cik,
      changes,
      summary: {
        totalChanges: changes.length,
        newPositions: changes.filter(c => c.action === 'new').length,
        exitedPositions: changes.filter(c => c.action === 'exited').length,
        increasedPositions: changes.filter(c => c.action === 'increased').length,
        decreasedPositions: changes.filter(c => c.action === 'decreased').length,
      },
    });
  } catch (err) {
    console.error('[Holders] Holder changes error:', err);
    res.status(500).json({ error: 'Failed to fetch holder changes' });
  }
});

// GET /api/holders/signals
router.get('/signals', (req: Request, res: Response) => {
  try {
    const quarter = req.query.quarter as string;
    const signals = holderTrackingService.detectSmartMoneySignals(quarter);
    
    res.json({
      signals,
      quarter: quarter || 'current',
      detectedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Holders] Signals error:', err);
    res.status(500).json({ error: 'Failed to detect smart money signals' });
  }
});

// GET /api/holders/institution/:cik
router.get('/institution/:cik', async (req: Request, res: Response) => {
  try {
    const cik = req.params.cik as string;
    
    // Get latest 13F filing for this institution
    const filings = await secEdgarService.searchFilings(cik, '13F-HR', undefined, undefined, 1);
    if (filings.length === 0) {
      return res.json({
        cik,
        name: await secEdgarService.getEntityName(cik),
        totalValue: 0,
        positionCount: 0,
        filingDate: null,
        holdings: [],
        quarterOverQuarter: {
          newPositions: 0,
          exitedPositions: 0,
          increasedPositions: 0,
          decreasedPositions: 0,
        },
      });
    }

    const filing13F = await secEdgarService.parse13F(filings[0]);
    if (!filing13F) {
      throw new Error('Could not parse 13F filing');
    }

    // Get position changes from tracking service
    const changes = holderTrackingService.getHolderChanges(cik, 1);
    
    // Calculate quarter-over-quarter summary
    const qoq = {
      newPositions: changes.filter(c => c.action === 'new').length,
      exitedPositions: changes.filter(c => c.action === 'exited').length,
      increasedPositions: changes.filter(c => c.action === 'increased').length,
      decreasedPositions: changes.filter(c => c.action === 'decreased').length,
    };

    // Build holdings response
    const holdings = await Promise.all(filing13F.holdings.map(async holding => {
      const symbol = await secEdgarService.cusipToTicker(holding.cusip);
      const change = changes.find(c => c.symbol === symbol);
      
      return {
        symbol: symbol || 'Unknown',
        name: holding.nameOfIssuer,
        shares: holding.sharesOrPrincipalAmount,
        value: holding.value,
        pctOfPortfolio: filing13F.totalValue > 0 ? (holding.value / filing13F.totalValue) * 100 : 0,
        changeFromPrev: change?.sharesChange || 0,
        changeType: change?.action || 'unchanged',
      };
    }));

    const response = {
      cik,
      name: await secEdgarService.getEntityName(cik),
      totalValue: filing13F.totalValue,
      positionCount: filing13F.entryCount,
      filingDate: filing13F.filingDate,
      holdings,
      quarterOverQuarter: qoq,
    };

    res.json(response);
  } catch (err) {
    console.error('[Holders] Institution error:', err);
    res.status(500).json({ error: 'Failed to fetch institution data' });
  }
});

// GET /api/holders/insider/:symbol
router.get('/insider/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const days = parseInt((req.query.days as string) || '90');
    
    const transactions = await insiderTradingService.getInsiderTransactions(symbol, days);
    
    res.json({
      symbol: symbol.toUpperCase(),
      transactions,
      buyingSignal: insiderTradingService.detectInsiderBuyingSignals(symbol),
      summary: {
        totalTransactions: transactions.length,
        largeBuys: transactions.filter(t => 
          t.transactionCode === 'P' && t.transactionShares * t.transactionPrice > 100000
        ).length,
        largeSells: transactions.filter(t => 
          t.transactionCode === 'S' && t.transactionShares * t.transactionPrice > 100000
        ).length,
      },
    });
  } catch (err) {
    console.error('[Holders] Insider error:', err);
    res.status(500).json({ error: 'Failed to fetch insider data' });
  }
});

// POST /api/holders/track
router.post('/track', async (req: Request, res: Response) => {
  try {
    const { name, cik } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const db = getDb();
    const id = v4();
    
    // If CIK provided, validate it exists
    let resolvedCik = cik;
    if (!resolvedCik && name) {
      // Try to find CIK by entity name search
      resolvedCik = await secEdgarService.getCIKByTicker(name);
    }

    db.prepare(`
      INSERT INTO tracked_holders (id, name, type, cik) VALUES (?, ?, ?, ?)
    `).run(id, name, 'institution', resolvedCik);

    // If we have a CIK, immediately process their latest filing
    if (resolvedCik) {
      try {
        await holderTrackingService.processQuarterlyFiling(resolvedCik);
      } catch (processingError) {
        console.warn('[Holders] Could not process initial filing:', processingError);
      }
    }

    res.status(201).json({ 
      id, 
      name, 
      type: 'institution',
      cik: resolvedCik,
      tracked_since: new Date().toISOString() 
    });
  } catch (err) {
    console.error('[Holders] Track error:', err);
    res.status(500).json({ error: 'Failed to track holder' });
  }
});

// DELETE /api/holders/track/:cik
router.delete('/track/:cik', (req: Request, res: Response) => {
  try {
    const cik = req.params.cik as string;
    const db = getDb();
    
    const result = db.prepare('DELETE FROM tracked_holders WHERE cik = ?').run(cik);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Tracked holder not found' });
    }

    res.json({ success: true, message: 'Holder untracked successfully' });
  } catch (err) {
    console.error('[Holders] Untrack error:', err);
    res.status(500).json({ error: 'Failed to untrack holder' });
  }
});

// GET /api/holders/:symbol (must come last to avoid conflicts)
router.get('/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    
    // Get Yahoo Finance data (baseline)
    const yahooData = await getHolders(symbol);
    
    // Get insider transactions from SEC
    const insiderTransactions = await insiderTradingService.getInsiderTransactions(symbol, 90);
    
    // Check for insider buying signals
    const hasInsiderSignal = insiderTradingService.detectInsiderBuyingSignals(symbol);

    // Enhanced response with SEC data
    const response = {
      symbol: yahooData.symbol,
      institutionalOwnership: 0,
      insiderOwnership: 0,
      topInstitutional: yahooData.institutional.map(holder => ({
        name: holder.name,
        cik: null, // Would need reverse lookup
        shares: holder.shares,
        value: holder.value,
        pctOfPortfolio: 0, // Not available from Yahoo
        changeFromPrev: holder.changeShares,
        changeType: holder.changeShares > 0 ? 'increased' : 
                   holder.changeShares < 0 ? 'decreased' : 'unchanged',
        filingDate: holder.filingDate,
      })),
      topInsider: yahooData.insider.map(holder => ({
        name: holder.name,
        title: holder.title,
        lastTransaction: holder.lastTransactionType,
        shares: holder.shares,
        value: holder.lastTransactionValue,
        date: holder.filingDate,
      })),
      topFunds: [], // Yahoo doesn't distinguish funds separately
      recentInsiderTransactions: insiderTransactions.slice(0, 10),
      insiderBuyingSignal: hasInsiderSignal,
    };

    // Calculate ownership percentages if we have the data
    const totalInstitutional = yahooData.institutionalSharesHeld;
    const totalInsider = yahooData.insiderSharesHeld;
    
    response.institutionalOwnership = totalInstitutional;
    response.insiderOwnership = totalInsider;

    res.json(response);
  } catch (err) {
    console.error('[Holders] Error:', err);
    res.status(500).json({ error: 'Failed to fetch holders' });
  }
});

// GET /api/holders/institution/:cik
router.get('/institution/:cik', async (req: Request, res: Response) => {
  try {
    const cik = req.params.cik as string;
    
    // Get latest 13F filing for this institution
    const filings = await secEdgarService.searchFilings(cik, '13F-HR', undefined, undefined, 1);
    if (filings.length === 0) {
      return res.json({
        cik,
        name: await secEdgarService.getEntityName(cik),
        totalValue: 0,
        positionCount: 0,
        filingDate: null,
        holdings: [],
        quarterOverQuarter: {
          newPositions: 0,
          exitedPositions: 0,
          increasedPositions: 0,
          decreasedPositions: 0,
        },
      });
    }

    const filing13F = await secEdgarService.parse13F(filings[0]);
    if (!filing13F) {
      throw new Error('Could not parse 13F filing');
    }

    // Get position changes from tracking service
    const changes = holderTrackingService.getHolderChanges(cik, 1);
    
    // Calculate quarter-over-quarter summary
    const qoq = {
      newPositions: changes.filter(c => c.action === 'new').length,
      exitedPositions: changes.filter(c => c.action === 'exited').length,
      increasedPositions: changes.filter(c => c.action === 'increased').length,
      decreasedPositions: changes.filter(c => c.action === 'decreased').length,
    };

    // Build holdings response
    const holdings = await Promise.all(filing13F.holdings.map(async holding => {
      const symbol = await secEdgarService.cusipToTicker(holding.cusip);
      const change = changes.find(c => c.symbol === symbol);
      
      return {
        symbol: symbol || 'Unknown',
        name: holding.nameOfIssuer,
        shares: holding.sharesOrPrincipalAmount,
        value: holding.value,
        pctOfPortfolio: filing13F.totalValue > 0 ? (holding.value / filing13F.totalValue) * 100 : 0,
        changeFromPrev: change?.sharesChange || 0,
        changeType: change?.action || 'unchanged',
      };
    }));

    const response = {
      cik,
      name: await secEdgarService.getEntityName(cik),
      totalValue: filing13F.totalValue,
      positionCount: filing13F.entryCount,
      filingDate: filing13F.filingDate,
      holdings,
      quarterOverQuarter: qoq,
    };

    res.json(response);
  } catch (err) {
    console.error('[Holders] Institution error:', err);
    res.status(500).json({ error: 'Failed to fetch institution data' });
  }
});

// GET /api/holders/insider/:symbol
router.get('/insider/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const days = parseInt((req.query.days as string) || '90');
    
    const transactions = await insiderTradingService.getInsiderTransactions(symbol, days);
    
    res.json({
      symbol: symbol.toUpperCase(),
      transactions,
      buyingSignal: insiderTradingService.detectInsiderBuyingSignals(symbol),
      summary: {
        totalTransactions: transactions.length,
        largeBuys: transactions.filter(t => 
          t.transactionCode === 'P' && t.transactionShares * t.transactionPrice > 100000
        ).length,
        largeSells: transactions.filter(t => 
          t.transactionCode === 'S' && t.transactionShares * t.transactionPrice > 100000
        ).length,
      },
    });
  } catch (err) {
    console.error('[Holders] Insider error:', err);
    res.status(500).json({ error: 'Failed to fetch insider data' });
  }
});

// GET /api/holders/tracked
router.get('/tracked', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const holders = db.prepare(`
      SELECT th.*, 
             COUNT(hc.id) as recent_changes,
             MAX(hc.created_at) as last_activity
      FROM tracked_holders th
      LEFT JOIN holder_changes hc ON th.cik = hc.cik 
        AND hc.created_at > datetime('now', '-30 days')
      GROUP BY th.id
      ORDER BY tracked_since DESC
    `).all();

    res.json(holders);
  } catch (err) {
    console.error('[Holders] Tracked error:', err);
    res.status(500).json({ error: 'Failed to fetch tracked holders' });
  }
});

// POST /api/holders/track
router.post('/track', async (req: Request, res: Response) => {
  try {
    const { name, cik } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const db = getDb();
    const id = v4();
    
    // If CIK provided, validate it exists
    let resolvedCik = cik;
    if (!resolvedCik && name) {
      // Try to find CIK by entity name search
      resolvedCik = await secEdgarService.getCIKByTicker(name);
    }

    db.prepare(`
      INSERT INTO tracked_holders (id, name, type, cik) VALUES (?, ?, ?, ?)
    `).run(id, name, 'institution', resolvedCik);

    // If we have a CIK, immediately process their latest filing
    if (resolvedCik) {
      try {
        await holderTrackingService.processQuarterlyFiling(resolvedCik);
      } catch (processingError) {
        console.warn('[Holders] Could not process initial filing:', processingError);
      }
    }

    res.status(201).json({ 
      id, 
      name, 
      type: 'institution',
      cik: resolvedCik,
      tracked_since: new Date().toISOString() 
    });
  } catch (err) {
    console.error('[Holders] Track error:', err);
    res.status(500).json({ error: 'Failed to track holder' });
  }
});

// DELETE /api/holders/track/:cik
router.delete('/track/:cik', (req: Request, res: Response) => {
  try {
    const cik = req.params.cik as string;
    const db = getDb();
    
    const result = db.prepare('DELETE FROM tracked_holders WHERE cik = ?').run(cik);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Tracked holder not found' });
    }

    res.json({ success: true, message: 'Holder untracked successfully' });
  } catch (err) {
    console.error('[Holders] Untrack error:', err);
    res.status(500).json({ error: 'Failed to untrack holder' });
  }
});

// GET /api/holders/changes
router.get('/changes', (req: Request, res: Response) => {
  try {
    const quarter = req.query.quarter as string;
    const limit = parseInt((req.query.limit as string) || '50');
    
    const db = getDb();
    const query = quarter 
      ? 'SELECT * FROM holder_changes WHERE quarter = ? ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM holder_changes ORDER BY created_at DESC LIMIT ?';
    
    const params = quarter ? [quarter, limit] : [limit];
    const changes = db.prepare(query).all(...params);

    res.json({
      changes: changes.map((c: any) => ({
        id: c.id,
        cik: c.cik,
        holderName: c.holder_name,
        symbol: c.symbol,
        action: c.action,
        sharesChange: c.shares_change,
        valueChange: c.value_change,
        pctChange: c.pct_change,
        quarter: c.quarter,
        createdAt: c.created_at,
      })),
      quarter: quarter || 'all',
    });
  } catch (err) {
    console.error('[Holders] Changes error:', err);
    res.status(500).json({ error: 'Failed to fetch holder changes' });
  }
});

// GET /api/holders/changes/:cik
router.get('/changes/:cik', (req: Request, res: Response) => {
  try {
    const cik = req.params.cik as string;
    const quarters = parseInt((req.query.quarters as string) || '4');
    
    const changes = holderTrackingService.getHolderChanges(cik, quarters);
    
    res.json({
      cik,
      changes,
      summary: {
        totalChanges: changes.length,
        newPositions: changes.filter(c => c.action === 'new').length,
        exitedPositions: changes.filter(c => c.action === 'exited').length,
        increasedPositions: changes.filter(c => c.action === 'increased').length,
        decreasedPositions: changes.filter(c => c.action === 'decreased').length,
      },
    });
  } catch (err) {
    console.error('[Holders] Holder changes error:', err);
    res.status(500).json({ error: 'Failed to fetch holder changes' });
  }
});

// GET /api/holders/signals
router.get('/signals', (req: Request, res: Response) => {
  try {
    const quarter = req.query.quarter as string;
    const signals = holderTrackingService.detectSmartMoneySignals(quarter);
    
    res.json({
      signals,
      quarter: quarter || 'current',
      detectedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Holders] Signals error:', err);
    res.status(500).json({ error: 'Failed to detect smart money signals' });
  }
});

export default router;
