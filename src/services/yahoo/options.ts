import axios from 'axios';
import { OptionsChain, OptionContract, IVData } from '../../types/options';

const YAHOO_V7 = 'https://query1.finance.yahoo.com/v7/finance';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
};

export async function getOptionsChain(symbol: string, expiration?: string): Promise<OptionsChain> {
  try {
    const params: Record<string, string> = {};
    if (expiration) params.date = String(Math.floor(new Date(expiration).getTime() / 1000));

    const { data } = await axios.get(`${YAHOO_V7}/options/${symbol}`, {
      params,
      headers,
      timeout: 15000,
    });

    const result = data?.optionChain?.result?.[0];
    if (!result) {
      return { symbol, expirations: [], calls: [], puts: [], underlyingPrice: 0 };
    }

    const expirations = (result.expirationDates ?? []).map((ts: number) =>
      new Date(ts * 1000).toISOString().split('T')[0],
    );

    const underlyingPrice = result.quote?.regularMarketPrice ?? 0;
    const options = result.options?.[0] ?? {};

    const mapContract = (c: Record<string, unknown>, type: 'call' | 'put'): OptionContract => ({
      symbol: (c.contractSymbol as string) ?? '',
      type,
      strike: (c.strike as number) ?? 0,
      expiration: new Date(((c.expiration as number) ?? 0) * 1000).toISOString().split('T')[0],
      bid: (c.bid as number) ?? 0,
      ask: (c.ask as number) ?? 0,
      last: (c.lastPrice as number) ?? 0,
      volume: (c.volume as number) ?? 0,
      openInterest: (c.openInterest as number) ?? 0,
      impliedVolatility: (c.impliedVolatility as number) ?? 0,
      delta: 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      inTheMoney: (c.inTheMoney as boolean) ?? false,
    });

    return {
      symbol,
      expirations,
      calls: (options.calls ?? []).map((c: Record<string, unknown>) => mapContract(c, 'call')),
      puts: (options.puts ?? []).map((c: Record<string, unknown>) => mapContract(c, 'put')),
      underlyingPrice,
    };
  } catch {
    return { symbol, expirations: [], calls: [], puts: [], underlyingPrice: 0 };
  }
}

export async function getIVData(symbol: string): Promise<IVData> {
  // Approximate IV from options chain
  try {
    const chain = await getOptionsChain(symbol);
    const allContracts = [...chain.calls, ...chain.puts];
    const ivValues = allContracts
      .map(c => c.impliedVolatility)
      .filter(iv => iv > 0);

    const currentIV = ivValues.length > 0
      ? ivValues.reduce((sum, iv) => sum + iv, 0) / ivValues.length
      : 0;

    return {
      symbol,
      currentIV: Math.round(currentIV * 10000) / 100, // as percentage
      ivRank: 50, // placeholder — needs historical data
      ivPercentile: 50,
      history: [],
    };
  } catch {
    return { symbol, currentIV: 0, ivRank: 0, ivPercentile: 0, history: [] };
  }
}
