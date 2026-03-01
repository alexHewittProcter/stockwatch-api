export interface FinnhubQuoteResponse {
  c: number;  // current
  d: number;  // change
  dp: number; // percent change
  h: number;  // high
  l: number;  // low
  o: number;  // open
  pc: number; // previous close
  t: number;  // timestamp
}

export interface FinnhubCandleResponse {
  c: number[];  // close
  h: number[];  // high
  l: number[];  // low
  o: number[];  // open
  s: string;    // status
  t: number[];  // timestamp
  v: number[];  // volume
}

export interface FinnhubSearchResponse {
  count: number;
  result: {
    description: string;
    displaySymbol: string;
    symbol: string;
    type: string;
  }[];
}

export interface FinnhubWSMessage {
  type: string;
  data?: {
    s: string;  // symbol
    p: number;  // price
    t: number;  // timestamp
    v: number;  // volume
  }[];
}
