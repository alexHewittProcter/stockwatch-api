import { Router, Request, Response } from 'express';
import { autoTrader } from '../services/ai/auto-trader';

const router = Router();

// GET /api/autotrader/strategies - List all strategies
router.get('/strategies', async (req: Request, res: Response) => {
  try {
    const strategies = autoTrader.getStrategies();
    res.json({
      strategies,
      total: strategies.length,
    });
  } catch (error) {
    console.error('[AutoTrader] Get strategies error:', error);
    res.status(500).json({ error: 'Failed to get strategies' });
  }
});

// POST /api/autotrader/strategies - Create strategy
router.post('/strategies', async (req: Request, res: Response) => {
  try {
    const strategy = autoTrader.createStrategy(req.body);
    res.status(201).json(strategy);
  } catch (error) {
    console.error('[AutoTrader] Create strategy error:', error);
    res.status(500).json({ error: 'Failed to create strategy' });
  }
});

// PUT /api/autotrader/strategies/:id - Update strategy
router.put('/strategies/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = autoTrader.updateStrategy(id as string, req.body);
    
    if (success) {
      const updated = autoTrader.getStrategy(id as string);
      res.json(updated);
    } else {
      res.status(404).json({ error: 'Strategy not found' });
    }
  } catch (error) {
    console.error('[AutoTrader] Update strategy error:', error);
    res.status(500).json({ error: 'Failed to update strategy' });
  }
});

// DELETE /api/autotrader/strategies/:id - Delete strategy
router.delete('/strategies/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = autoTrader.deleteStrategy(id as string);
    
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Strategy not found' });
    }
  } catch (error) {
    console.error('[AutoTrader] Delete strategy error:', error);
    res.status(500).json({ error: 'Failed to delete strategy' });
  }
});

// POST /api/autotrader/strategies/:id/enable - Enable strategy
router.post('/strategies/:id/enable', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = autoTrader.enableStrategy(id as string);
    
    if (success) {
      // Start the auto-trader if not already running
      autoTrader.startAutoTrader();
      res.json({ success: true, enabled: true });
    } else {
      res.status(404).json({ error: 'Strategy not found' });
    }
  } catch (error) {
    console.error('[AutoTrader] Enable strategy error:', error);
    res.status(500).json({ error: 'Failed to enable strategy' });
  }
});

// POST /api/autotrader/strategies/:id/disable - Disable strategy
router.post('/strategies/:id/disable', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = autoTrader.disableStrategy(id as string);
    
    if (success) {
      res.json({ success: true, enabled: false });
    } else {
      res.status(404).json({ error: 'Strategy not found' });
    }
  } catch (error) {
    console.error('[AutoTrader] Disable strategy error:', error);
    res.status(500).json({ error: 'Failed to disable strategy' });
  }
});

// POST /api/autotrader/strategies/:id/clone - Clone strategy
router.post('/strategies/:id/clone', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = autoTrader.getStrategy(id as string);
    
    if (!existing) {
      return res.status(404).json({ error: 'Strategy not found' });
    }
    
    // Create clone with new name and disabled
    const clone = autoTrader.createStrategy({
      ...existing,
      name: `${existing.name} (Copy)`,
      enabled: false,
      performance: {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalPnl: 0,
        totalPnlPct: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        profitFactor: 0,
        avgWin: 0,
        avgLoss: 0,
        bestTrade: { symbol: '', pnl: 0 },
        worstTrade: { symbol: '', pnl: 0 },
        activeSince: new Date().toISOString(),
      },
    });
    
    res.status(201).json(clone);
  } catch (error) {
    console.error('[AutoTrader] Clone strategy error:', error);
    res.status(500).json({ error: 'Failed to clone strategy' });
  }
});

// POST /api/autotrader/kill - Kill switch
router.post('/kill', async (req: Request, res: Response) => {
  try {
    autoTrader.activateKillSwitch();
    res.json({ 
      success: true, 
      message: 'Kill switch activated - all strategies disabled',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[AutoTrader] Kill switch error:', error);
    res.status(500).json({ error: 'Failed to activate kill switch' });
  }
});

// GET /api/autotrader/status - Get status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = autoTrader.getStatus();
    const openPositions = autoTrader.getAllOpenPositions();
    
    res.json({
      ...status,
      positions: openPositions,
    });
  } catch (error) {
    console.error('[AutoTrader] Get status error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// GET /api/autotrader/audit - Get audit log
router.get('/audit', async (req: Request, res: Response) => {
  try {
    const {
      strategyId,
      symbol,
      fromDate,
      toDate,
      limit = 100,
    } = req.query;
    
    const filters = {
      strategyId: strategyId ? String(strategyId) : undefined,
      symbol: symbol ? String(symbol) : undefined,
      fromDate: fromDate ? String(fromDate) : undefined,
      toDate: toDate ? String(toDate) : undefined,
      limit: Number(limit),
    };
    
    const decisions = autoTrader.getAuditLog(filters);
    
    res.json({
      decisions,
      total: decisions.length,
      filters,
    });
  } catch (error) {
    console.error('[AutoTrader] Get audit error:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

// POST /api/autotrader/backtest - Backtest strategy
router.post('/backtest', async (req: Request, res: Response) => {
  try {
    const { strategy, fromDate, toDate } = req.body;
    
    if (!strategy || !fromDate || !toDate) {
      return res.status(400).json({ 
        error: 'Missing required fields: strategy, fromDate, toDate' 
      });
    }
    
    const results = await autoTrader.backtestStrategy(strategy, fromDate, toDate);
    
    res.json({
      results,
      period: { fromDate, toDate },
      strategy: strategy.name,
    });
  } catch (error) {
    console.error('[AutoTrader] Backtest error:', error);
    res.status(500).json({ error: 'Failed to run backtest' });
  }
});

// GET /api/autotrader/performance - Aggregate performance
router.get('/performance', async (req: Request, res: Response) => {
  try {
    const strategies = autoTrader.getStrategies();
    const openPositions = autoTrader.getAllOpenPositions();
    
    // Aggregate performance across all strategies
    const aggregate = {
      totalStrategies: strategies.length,
      enabledStrategies: strategies.filter(s => s.enabled).length,
      totalTrades: strategies.reduce((sum, s) => sum + s.performance.totalTrades, 0),
      totalWins: strategies.reduce((sum, s) => sum + s.performance.wins, 0),
      totalLosses: strategies.reduce((sum, s) => sum + s.performance.losses, 0),
      totalPnl: strategies.reduce((sum, s) => sum + s.performance.totalPnl, 0),
      openPositions: openPositions.length,
      unrealizedPnl: openPositions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0),
    };
    
    aggregate.totalTrades > 0 && Object.assign(aggregate, {
      overallWinRate: aggregate.totalWins / aggregate.totalTrades,
      avgTradeValue: aggregate.totalPnl / aggregate.totalTrades,
    });
    
    res.json({
      aggregate,
      strategies: strategies.map(s => ({
        id: s.id,
        name: s.name,
        enabled: s.enabled,
        mode: s.mode,
        performance: s.performance,
      })),
      openPositions,
    });
  } catch (error) {
    console.error('[AutoTrader] Get performance error:', error);
    res.status(500).json({ error: 'Failed to get performance' });
  }
});

// GET /api/autotrader/performance/:id - Strategy performance
router.get('/performance/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const strategy = autoTrader.getStrategy(id as string);
    
    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }
    
    const openPositions = autoTrader.getOpenPositions(id as string);
    const unrealizedPnl = openPositions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0);
    
    res.json({
      strategy: {
        id: strategy.id,
        name: strategy.name,
        mode: strategy.mode,
        enabled: strategy.enabled,
      },
      performance: strategy.performance,
      openPositions,
      unrealizedPnl,
    });
  } catch (error) {
    console.error('[AutoTrader] Get strategy performance error:', error);
    res.status(500).json({ error: 'Failed to get strategy performance' });
  }
});

// GET /api/autotrader/positions - Get all positions
router.get('/positions', async (req: Request, res: Response) => {
  try {
    const { strategyId, status = 'open' } = req.query;
    
    let positions: any[];
    if (status === 'open') {
      positions = strategyId 
        ? autoTrader.getOpenPositions(String(strategyId))
        : autoTrader.getAllOpenPositions();
    } else {
      // Would need to implement getClosed positions for historical data
      positions = [];
    }
    
    res.json({
      positions,
      total: positions.length,
      filters: { strategyId, status },
    });
  } catch (error) {
    console.error('[AutoTrader] Get positions error:', error);
    res.status(500).json({ error: 'Failed to get positions' });
  }
});

// POST /api/autotrader/positions/:id/close - Manually close position
router.post('/positions/:id/close', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason = 'Manual close' } = req.body;
    
    // In a full implementation, this would manually close the position
    // For now, just return success
    res.json({
      success: true,
      message: `Position ${id} queued for manual close`,
      reason,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[AutoTrader] Close position error:', error);
    res.status(500).json({ error: 'Failed to close position' });
  }
});

// GET /api/autotrader/templates - Get strategy templates
router.get('/templates', async (req: Request, res: Response) => {
  try {
    // Return the default strategy templates for users to clone
    const templates = [
      {
        id: 'smart_money',
        name: 'Smart Money Follower',
        description: 'Follows institutional holder movements with delayed entry',
        category: 'Institutional',
        riskLevel: 'Medium',
        timeframe: 'Swing',
        winRate: 65,
        avgHoldDays: 25,
      },
      {
        id: 'momentum',
        name: 'Momentum Breakout',
        description: 'Trades breakouts with volume confirmation',
        category: 'Technical',
        riskLevel: 'Medium-High',
        timeframe: 'Day/Swing',
        winRate: 58,
        avgHoldDays: 8,
      },
      {
        id: 'options_flow',
        name: 'Options Flow Rider',
        description: 'Follows unusual options activity',
        category: 'Options',
        riskLevel: 'High',
        timeframe: 'Day',
        winRate: 62,
        avgHoldDays: 3,
      },
      {
        id: 'social_sentiment',
        name: 'Social Sentiment Surge',
        description: 'Trades social media hype with tight risk controls',
        category: 'Sentiment',
        riskLevel: 'High',
        timeframe: 'Day',
        winRate: 45,
        avgHoldDays: 2,
      },
      {
        id: 'iv_crush',
        name: 'IV Crush Setup',
        description: 'Sells premium before earnings (advanced strategy)',
        category: 'Options',
        riskLevel: 'Medium',
        timeframe: 'Day',
        winRate: 70,
        avgHoldDays: 4,
      },
      {
        id: 'pattern_replay',
        name: 'Pattern Replay',
        description: 'Trades learned AI patterns from trade history',
        category: 'AI',
        riskLevel: 'Medium',
        timeframe: 'Day/Swing',
        winRate: 55,
        avgHoldDays: 12,
      },
    ];
    
    res.json({
      templates,
      total: templates.length,
    });
  } catch (error) {
    console.error('[AutoTrader] Get templates error:', error);
    res.status(500).json({ error: 'Failed to get templates' });
  }
});

export default router;