import { Server as HTTPServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { roomManager } from './rooms';
import { setupRelay } from './relay';
import { finnhubWS } from '../services/finnhub/websocket';
import { pollingManager } from '../services/polling/manager';

interface WSMessage {
  type: string;
  symbols?: string[];
  symbol?: string;
}

export function createWebSocketServer(server: HTTPServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws/prices' });

  setupRelay();

  wss.on('connection', (ws: WebSocket) => {
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
            for (const symbol of symbols) {
              roomManager.subscribe(ws, symbol);
              finnhubWS.subscribe(symbol);
            }
            ws.send(JSON.stringify({
              type: 'subscribed',
              symbols: roomManager.getSymbolsForClient(ws),
            }));
            break;
          }

          case 'unsubscribe': {
            const symbols = msg.symbols ?? (msg.symbol ? [msg.symbol] : []);
            for (const symbol of symbols) {
              roomManager.unsubscribe(ws, symbol);
            }
            // Check if any symbols are now orphaned
            const allSubscribed = roomManager.getAllSubscribedSymbols();
            for (const symbol of finnhubWS.getSubscribedSymbols()) {
              if (!allSubscribed.includes(symbol)) {
                finnhubWS.unsubscribe(symbol);
              }
            }
            ws.send(JSON.stringify({
              type: 'unsubscribed',
              symbols: roomManager.getSymbolsForClient(ws),
            }));
            break;
          }

          case 'ping':
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
        }
      } catch {
        // ignore bad messages
      }
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      const orphaned = roomManager.removeClient(ws);
      for (const symbol of orphaned) {
        finnhubWS.unsubscribe(symbol);
      }
      console.log(`[WS] Client disconnected (total: ${roomManager.getClientCount()})`);
    });

    ws.on('error', () => {
      clearInterval(heartbeat);
      roomManager.removeClient(ws);
    });
  });

  // Connect to Finnhub WS
  finnhubWS.connect();

  console.log('[WS] WebSocket server ready on /ws/prices');
  return wss;
}
