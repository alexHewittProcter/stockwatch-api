export interface OptionContract {
  symbol: string;
  type: 'call' | 'put';
  strike: number;
  expiration: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  inTheMoney: boolean;
}

export interface OptionsChain {
  symbol: string;
  expirations: string[];
  calls: OptionContract[];
  puts: OptionContract[];
  underlyingPrice: number;
}

export interface IVData {
  symbol: string;
  currentIV: number;
  ivRank: number;
  ivPercentile: number;
  history: { date: string; iv: number }[];
}
