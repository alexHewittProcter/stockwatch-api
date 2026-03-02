export interface OptionContract {
  strike: number;
  lastPrice: number;
  bid: number;
  ask: number;
  change: number;
  changePct: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
  contractSymbol: string;
}

export interface OptionsChain {
  symbol: string;
  expirations: string[];
  chains: {
    expiry: string;
    daysToExpiry: number;
    calls: OptionContract[];
    puts: OptionContract[];
  }[];
}

export interface UnusualActivity {
  ts: string;
  symbol: string;
  type: 'call' | 'put';
  strike: number;
  expiry: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  classification: 'sweep' | 'block' | 'split' | 'unknown';
  volume: number;
  openInterest: number;
  volumeOIRatio: number;
  notionalValue: number;
  premium: number;
  score: number;
  reason: string;
}

export interface IVData {
  symbol: string;
  currentIV: number;
  ivRank: number;
  ivPercentile: number;
  iv52wHigh: number;
  iv52wLow: number;
  ivChange1d: number;
  ivChange1w: number;
  history: { date: string; iv: number }[];
  termStructure: { expiry: string; iv: number }[];
}

export interface PutCallRatio {
  symbol: string;
  ratio: number;
  putVolume: number;
  callVolume: number;
  sentiment: 'extreme_bearish' | 'bearish' | 'neutral' | 'bullish' | 'extreme_bullish';
  history: { date: string; ratio: number }[];
}

export interface VolatilityDashboard {
  vix: {
    current: number;
    change: number;
    changePct: number;
    chart: { timestamp: number; value: number }[];
  };
  highestIV: {
    symbol: string;
    iv: number;
    ivRank: number;
  }[];
  biggestIVMoves: {
    symbol: string;
    iv: number;
    change: number;
    changePct: number;
  }[];
  unusualActivity: UnusualActivity[];
}

export interface YahooOptionData {
  strikes: number[];
  expirationDates: number[];
  hasMiniOptions: boolean;
  quote: any;
  options: {
    expirationDate: number;
    hasMiniOptions: boolean;
    calls?: YahooOptionContract[];
    puts?: YahooOptionContract[];
  }[];
}

export interface YahooOptionContract {
  contractSymbol: string;
  strike: number;
  currency: string;
  lastPrice: number;
  change: number;
  percentChange: number;
  volume: number;
  openInterest: number;
  bid: number;
  ask: number;
  contractSize: string;
  expiration: number;
  lastTradeDate: number;
  impliedVolatility: number;
  inTheMoney: boolean;
}