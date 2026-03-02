import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { config } from './config';
import { getDb, closeDb } from './db/schema';
import { createWebSocketServer } from './websocket/server';
import { pollingManager } from './services/polling/manager';
import { rssAggregator } from './services/news/rss-aggregator';
import { redditScraper } from './services/social/reddit';
import { socialTrending } from './services/social/trending';

// Routes
import marketRoutes from './routes/market';
import dashboardRoutes from './routes/dashboards';
import preferencesRoutes from './routes/preferences';
import holderRoutes from './routes/holders';
import optionsRoutes from './routes/options';
import newsRoutes from './routes/news';
import socialRoutes from './routes/social';
import portfolioRoutes from './routes/portfolio';
import opportunityRoutes from './routes/opportunities';
import normanRoutes from './routes/norman';
import aiRoutes from './routes/ai';

const app = express();

// --- Middleware ---

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, _res, next) => {
  const start = Date.now();
  _res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${_res.statusCode} ${duration}ms`);
  });
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/', limiter);

// --- Routes ---

app.use('/api/market', marketRoutes);
app.use('/api/dashboards', dashboardRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api/holders', holderRoutes);
app.use('/api/options', optionsRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/opportunities', opportunityRoutes);
app.use('/api/norman', normanRoutes);
app.use('/api/ai', aiRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    polling: pollingManager.getStats(),
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Initialize News Services ---

async function initializeNewsServices() {
  try {
    // Initialize default RSS sources
    await rssAggregator.initializeDefaultSources();
    
    // Set up periodic fetching
    setInterval(async () => {
      try {
        await rssAggregator.fetchAllSources();
      } catch (error) {
        console.error('[News] RSS fetch error:', error);
      }
    }, 10 * 60 * 1000); // Every 10 minutes

    setInterval(async () => {
      try {
        await redditScraper.scrapeAll();
      } catch (error) {
        console.error('[Social] Reddit scrape error:', error);
      }
    }, 15 * 60 * 1000); // Every 15 minutes

    setInterval(async () => {
      try {
        await socialTrending.calculateTrending('24h');
        await socialTrending.detectHypeAlerts();
      } catch (error) {
        console.error('[Social] Trending calculation error:', error);
      }
    }, 30 * 60 * 1000); // Every 30 minutes

    // Initial fetch (delayed to allow server startup)
    setTimeout(async () => {
      try {
        console.log('[News] Starting initial RSS fetch...');
        await rssAggregator.fetchAllSources();
        console.log('[Social] Starting initial Reddit scrape...');
        await redditScraper.scrapeAll();
      } catch (error) {
        console.error('[Init] Initial fetch error:', error);
      }
    }, 5000); // Wait 5 seconds after startup

    console.log('[News] News services initialized');
  } catch (error) {
    console.error('[News] Failed to initialize news services:', error);
  }
}

// --- Start ---

const server = createServer(app);

async function startServer() {
  // Initialize database
  getDb();

  // Initialize news services
  await initializeNewsServices();

  // WebSocket server
  createWebSocketServer(server);

  // Adaptive polling
  pollingManager.start();

  server.listen(config.port, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║         StockWatch API v1.0.0             ║
║   http://localhost:${config.port}                  ║
║   WebSocket: ws://localhost:${config.port}/ws/prices ║
╚═══════════════════════════════════════════╝
    `);
  });
}

startServer().catch(console.error);

// Graceful shutdown
const shutdown = () => {
  console.log('\n[Server] Shutting down...');
  pollingManager.stop();
  closeDb();
  server.close(() => {
    console.log('[Server] Closed');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
