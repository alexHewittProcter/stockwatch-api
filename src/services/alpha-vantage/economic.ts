import axios from 'axios';
import { config } from '../../config';

interface EconomicDataPoint {
  date: string;
  value: number;
}

interface EconomicIndicator {
  name: string;
  interval: string;
  unit: string;
  data: EconomicDataPoint[];
}

const client = axios.create({
  baseURL: config.alphaVantage.baseUrl,
  timeout: 15000,
});

async function fetchIndicator(
  fn: string,
  name: string,
  interval: string = 'annual',
  unit: string = '',
): Promise<EconomicIndicator> {
  try {
    const { data } = await client.get('', {
      params: {
        function: fn,
        interval,
        apikey: config.alphaVantage.apiKey,
      },
    });

    const rawData: { date: string; value: string }[] = data.data ?? [];
    return {
      name,
      interval,
      unit,
      data: rawData
        .filter((d) => d.value !== '.')
        .slice(0, 50)
        .map((d) => ({
          date: d.date,
          value: parseFloat(d.value),
        })),
    };
  } catch {
    return { name, interval, unit, data: [] };
  }
}

export async function getGDP(): Promise<EconomicIndicator> {
  return fetchIndicator('REAL_GDP', 'Real GDP', 'quarterly', 'billions USD');
}

export async function getCPI(): Promise<EconomicIndicator> {
  return fetchIndicator('CPI', 'Consumer Price Index', 'monthly', 'index');
}

export async function getFederalFundsRate(): Promise<EconomicIndicator> {
  return fetchIndicator('FEDERAL_FUNDS_RATE', 'Federal Funds Rate', 'monthly', 'percent');
}

export async function getUnemployment(): Promise<EconomicIndicator> {
  return fetchIndicator('UNEMPLOYMENT', 'Unemployment Rate', 'monthly', 'percent');
}

export async function getInflation(): Promise<EconomicIndicator> {
  return fetchIndicator('INFLATION', 'Inflation Rate', 'annual', 'percent');
}

export async function getTreasuryYield(maturity: string = '10year'): Promise<EconomicIndicator> {
  return fetchIndicator('TREASURY_YIELD', `Treasury Yield ${maturity}`, 'monthly', 'percent');
}

export async function getAllEconomicData(): Promise<Record<string, EconomicIndicator>> {
  const [gdp, cpi, fedRate, unemployment, inflation, treasury10y] = await Promise.all([
    getGDP(),
    getCPI(),
    getFederalFundsRate(),
    getUnemployment(),
    getInflation(),
    getTreasuryYield('10year'),
  ]);

  return { gdp, cpi, fedRate, unemployment, inflation, treasury10y };
}
