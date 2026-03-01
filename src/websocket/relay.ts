import WebSocket from 'ws';
import { finnhubWS } from '../services/finnhub/websocket';
import { roomManager } from './rooms';

export function setupRelay(): void {
  finnhubWS.on('price', (data: { symbol: string; price: number; timestamp: number; volume: number }) => {
    const clients = roomManager.getClientsForSymbol(data.symbol);

    const message = JSON.stringify({
      type: 'price',
      symbol: data.symbol,
      price: data.price,
      timestamp: data.timestamp,
      volume: data.volume,
    });

    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });
}
