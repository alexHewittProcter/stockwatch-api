import { Server as HTTPServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { roomManager } from './rooms';
import { setupRelay } from './relay';
import { finnhubWS } from '../services/finnhub/websocket';
import { pollingManager } from '../services/polling/manager';
import { healthMetrics } from '../services/health/metrics';

interface WSMessage {
  type: string;
  symbols?: string[];
  symbol?: string;
}

export function createWebSocketServer(server: HTTPServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws/prices' });

  setupRelay();

  // Message throttling: track last send time per symbol to limit to 1/sec
  const lastSentTime = new Map<string, number>();
  
  wss.on('connection', (ws: WebSocket) => {
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

  console.log('[WS] WebSocket server ready on /ws/prices');
  return wss;
}
