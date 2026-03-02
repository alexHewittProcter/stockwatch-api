import { Server as HTTPServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { roomManager } from './rooms';
import { setupRelay } from './relay';
import { finnhubWS } from '../services/finnhub/websocket';
import { pollingManager } from '../services/polling/manager';
import { healthMetrics } from '../services/health/metrics';
import { wireFeed } from '../services/wire/feed';

interface WSMessage {
  type: string;
  symbols?: string[];
  symbol?: string;
}

export function createWebSocketServer(server: HTTPServer): { pricesWS: WebSocketServer, wireWS: WebSocketServer } {
  const pricesWS = new WebSocketServer({ server, path: '/ws/prices' });
  const wireWS = new WebSocketServer({ server, path: '/ws/wire' });

  setupRelay();

  // Message throttling: track last send time per symbol to limit to 1/sec
  const lastSentTime = new Map<string, number>();
  
  // Set up wire WebSocket connections
  setupWireWebSocket(wireWS);
  
  pricesWS.on('connection', (ws: WebSocket) => {
    healthMetrics.recordWebSocketConnection(1);
    console.log(`[WS] Client connected (total: ${roomManager.getClientCount() + 1})`);

    // Heartbeat
    let alive = true;
    ws.on('pong', () => {
      alive = true;
      pollingManager.recordActivity();
    });

    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, 30_000);

    ws.on('message', (raw: WebSocket.Data) => {
      try {
        const msg: WSMessage = JSON.parse(raw.toString());
        pollingManager.recordActivity();

        switch (msg.type) {
          case 'subscribe': {
            const symbols = msg.symbols ?? (msg.symbol ? [msg.symbol] : []);
            let subscriptionCount = 0;
            for (const symbol of symbols) {
              roomManager.subscribe(ws, symbol);
              finnhubWS.subscribe(symbol);
              subscriptionCount++;
            }
            healthMetrics.recordWebSocketSubscription(subscriptionCount);
            
            const response = JSON.stringify({
              type: 'subscribed',
              symbols: roomManager.getSymbolsForClient(ws),
            });
            ws.send(response);
            healthMetrics.recordWebSocketMessage();
            break;
          }

          case 'unsubscribe': {
            const symbols = msg.symbols ?? (msg.symbol ? [msg.symbol] : []);
            let unsubscriptionCount = 0;
            for (const symbol of symbols) {
              roomManager.unsubscribe(ws, symbol);
              unsubscriptionCount++;
            }
            healthMetrics.recordWebSocketSubscription(-unsubscriptionCount);
            
            // Check if any symbols are now orphaned
            const allSubscribed = roomManager.getAllSubscribedSymbols();
            for (const symbol of finnhubWS.getSubscribedSymbols()) {
              if (!allSubscribed.includes(symbol)) {
                finnhubWS.unsubscribe(symbol);
              }
            }
            
            const response = JSON.stringify({
              type: 'unsubscribed',
              symbols: roomManager.getSymbolsForClient(ws),
            });
            ws.send(response);
            healthMetrics.recordWebSocketMessage();
            break;
          }

          case 'ping':
            const pongResponse = JSON.stringify({ type: 'pong', timestamp: Date.now() });
            ws.send(pongResponse);
            healthMetrics.recordWebSocketMessage();
            break;
        }
      } catch {
        // ignore bad messages
      }
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      const orphaned = roomManager.removeClient(ws);
      
      // Track subscription removals and connection decrease
      healthMetrics.recordWebSocketSubscription(-orphaned.length);
      healthMetrics.recordWebSocketConnection(-1);
      
      for (const symbol of orphaned) {
        finnhubWS.unsubscribe(symbol);
      }
      console.log(`[WS] Client disconnected (total: ${roomManager.getClientCount()})`);
    });

    ws.on('error', () => {
      clearInterval(heartbeat);
      const orphaned = roomManager.removeClient(ws);
      healthMetrics.recordWebSocketSubscription(-orphaned.length);
      healthMetrics.recordWebSocketConnection(-1);
    });
  });

  // Connect to Finnhub WS
  finnhubWS.connect();

  console.log('[WS] WebSocket server ready on /ws/prices and /ws/wire');
  return { pricesWS, wireWS };
}

function setupWireWebSocket(wss: WebSocketServer) {
  const wireClients = new Set<WebSocket>();
  
  wss.on('connection', (ws: WebSocket) => {
    wireClients.add(ws);
    healthMetrics.recordWebSocketConnection(1);
    console.log(`[WS] Wire client connected (total: ${wireClients.size})`);

    // Send current filter preferences
    ws.send(JSON.stringify({
      type: 'connected',
      filters: ['recommended', 'favourites', 'all'],
      timestamp: new Date().toISOString(),
    }));

    let alive = true;
    ws.on('pong', () => {
      alive = true;
      pollingManager.recordActivity();
    });

    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, 30_000);

    let currentFilter: any = { filter: 'recommended' };

    ws.on('message', (raw: WebSocket.Data) => {
      try {
        const msg = JSON.parse(raw.toString());
        pollingManager.recordActivity();

        switch (msg.type) {
          case 'subscribe':
            currentFilter = {
              filter: msg.filter || 'recommended',
              types: msg.types,
              symbols: msg.symbols,
              impact: msg.impact,
              sentiment: msg.sentiment,
            };
            
            ws.send(JSON.stringify({
              type: 'subscribed',
              filter: currentFilter,
              timestamp: new Date().toISOString(),
            }));
            break;

          case 'ping':
            ws.send(JSON.stringify({ 
              type: 'pong', 
              timestamp: new Date().toISOString() 
            }));
            break;
        }
      } catch (error) {
        console.warn('[WS] Invalid wire message:', error);
      }
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      wireClients.delete(ws);
      healthMetrics.recordWebSocketConnection(-1);
      console.log(`[WS] Wire client disconnected (total: ${wireClients.size})`);
    });

    ws.on('error', () => {
      clearInterval(heartbeat);
      wireClients.delete(ws);
      healthMetrics.recordWebSocketConnection(-1);
    });
  });

  // Listen to wire feed events
  wireFeed.on('wireEvent', (event) => {
    const message = JSON.stringify({
      type: 'wireEvent',
      event,
      timestamp: new Date().toISOString(),
    });

    // Broadcast to all connected wire clients
    wireClients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
          healthMetrics.recordWebSocketMessage();
        } catch (error) {
          console.warn('[WS] Failed to send wire event:', error);
          wireClients.delete(ws);
        }
      }
    });
  });
}
