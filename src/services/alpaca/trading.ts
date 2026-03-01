import axios, { AxiosInstance } from 'axios';
import { config } from '../../config';

export interface AlpacaOrder {
  id: string;
  symbol: string;
  qty: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  time_in_force: 'day' | 'gtc' | 'ioc' | 'fok';
  limit_price?: string;
  stop_price?: string;
  status: string;
  filled_avg_price?: string;
  filled_qty?: string;
  created_at: string;
}

export interface AlpacaPosition {
  symbol: string;
  qty: string;
  side: 'long' | 'short';
  market_value: string;
  avg_entry_price: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
  change_today: string;
}

export interface AlpacaAccount {
  id: string;
  status: string;
  currency: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  equity: string;
}

class AlpacaTrading {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.alpaca.baseUrl,
      headers: {
        'APCA-API-KEY-ID': config.alpaca.apiKey,
        'APCA-API-SECRET-KEY': config.alpaca.secretKey,
      },
      timeout: 10000,
    });
  }

  async getAccount(): Promise<AlpacaAccount> {
    const { data } = await this.client.get('/v2/account');
    return data;
  }

  async getPositions(): Promise<AlpacaPosition[]> {
    const { data } = await this.client.get('/v2/positions');
    return data;
  }

  async getOrders(status: string = 'all', limit: number = 50): Promise<AlpacaOrder[]> {
    const { data } = await this.client.get('/v2/orders', {
      params: { status, limit, direction: 'desc' },
    });
    return data;
  }

  async submitOrder(params: {
    symbol: string;
    qty: number;
    side: 'buy' | 'sell';
    type: 'market' | 'limit' | 'stop' | 'stop_limit';
    time_in_force?: 'day' | 'gtc' | 'ioc' | 'fok';
    limit_price?: number;
    stop_price?: number;
  }): Promise<AlpacaOrder> {
    const body: Record<string, unknown> = {
      symbol: params.symbol.toUpperCase(),
      qty: String(params.qty),
      side: params.side,
      type: params.type,
      time_in_force: params.time_in_force || 'day',
    };

    if (params.limit_price != null) body.limit_price = String(params.limit_price);
    if (params.stop_price != null) body.stop_price = String(params.stop_price);

    const { data } = await this.client.post('/v2/orders', body);
    return data;
  }

  async getPortfolioHistory(
    period: string = '1M',
    timeframe: string = '1D',
  ): Promise<{ timestamp: number[]; equity: number[]; profit_loss: number[] }> {
    const { data } = await this.client.get('/v2/account/portfolio/history', {
      params: { period, timeframe },
    });
    return data;
  }
}

export const alpacaTrading = new AlpacaTrading();
