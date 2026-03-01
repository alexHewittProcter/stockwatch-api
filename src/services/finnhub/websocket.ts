import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { config } from '../../config';
import { FinnhubWSMessage } from './types';

class FinnhubWebSocket extends EventEmitter {
  private ws: WebSocket | null = null;
  private subscribedSymbols = new Set<string>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;

  connect(): void {
    if (this.ws || this.isConnecting) return;
    if (!config.finnhub.apiKey) {
      console.warn('[FinnhubWS] No API key configured, skipping connection');
      return;
    }

    this.isConnecting = true;
    console.log('[FinnhubWS] Connecting...');

    this.ws = new WebSocket(`${config.finnhub.wsUrl}?token=${config.finnhub.apiKey}`);

    this.ws.on('open', () => {
      console.log('[FinnhubWS] Connected');
      this.isConnecting = false;
      this.startHeartbeat();

      // Resubscribe to all symbols
      for (const symbol of this.subscribedSymbols) {
        this.sendSubscribe(symbol);
      }
    });

    this.ws.on('message', (raw: WebSocket.Data) => {
      try {
        const msg: FinnhubWSMessage = JSON.parse(raw.toString());
        if (msg.type === 'trade' && msg.data) {
          for (const trade of msg.data) {
            this.emit('price', {
              symbol: trade.s,
              price: trade.p,
              timestamp: trade.t,
              volume: trade.v,
            });
          }
        }
      } catch {
        // ignore parse errors
      }
    });

    this.ws.on('close', () => {
      console.log('[FinnhubWS] Disconnected');
      this.isConnecting = false;
      this.ws = null;
      this.stopHeartbeat();
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[FinnhubWS] Error:', err.message);
      this.isConnecting = false;
    });
  }

  subscribe(symbol: string): void {
    const s = symbol.toUpperCase();
    this.subscribedSymbols.add(s);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe(s);
    } else {
      this.connect();
    }
  }

  unsubscribe(symbol: string): void {
    const s = symbol.toUpperCase();
    this.subscribedSymbols.delete(s);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'unsubscribe', symbol: s }));
    }
  }

  getSubscribedSymbols(): string[] {
    return Array.from(this.subscribedSymbols);
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscribedSymbols.clear();
  }

  private sendSubscribe(symbol: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', symbol }));
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }
}

export const finnhubWS = new FinnhubWebSocket();
