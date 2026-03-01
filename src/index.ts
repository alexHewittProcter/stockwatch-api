import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { config } from './config';
import { getDb, closeDb } from './db/schema';
import { createWebSocketServer } from './websocket/server';
import { pollingManager } from './services/polling/manager';

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

// --- Start ---

const server = createServer(app);

// Initialize database
getDb();

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
