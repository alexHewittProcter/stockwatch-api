import axios from 'axios';
import * as cheerio from 'cheerio';
import { HolderData, InstitutionalHolder, InsiderHolder } from '../../types/holder';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
};

export async function getHolders(symbol: string): Promise<HolderData> {
  const result: HolderData = {
    symbol,
    institutional: [],
    insider: [],
    institutionalCount: 0,
    institutionalSharesHeld: 0,
    insiderSharesHeld: 0,
  };

  try {
    const { data: html } = await axios.get(
      `https://finance.yahoo.com/quote/${symbol}/holders/`,
      { headers, timeout: 15000 },
    );

    const $ = cheerio.load(html);

    // Parse institutional holders table
    const instRows = $('table').eq(1).find('tbody tr');
    instRows.each((_i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 5) {
        const holder: InstitutionalHolder = {
          name: $(cells[0]).text().trim(),
          shares: parseNumber($(cells[1]).text()),
          value: parseNumber($(cells[3]).text()),
          percentHeld: parseFloat($(cells[4]).text()) || 0,
          changeShares: 0,
          changePercent: 0,
          filingDate: $(cells[2]).text().trim(),
        };
        result.institutional.push(holder);
      }
    });

    // Parse insider holders
    const insiderRows = $('table').eq(2).find('tbody tr');
    insiderRows.each((_i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 5) {
        const holder: InsiderHolder = {
          name: $(cells[0]).text().trim(),
          title: $(cells[1]).text().trim(),
          shares: parseNumber($(cells[3]).text()),
          lastTransaction: $(cells[2]).text().trim(),
          lastTransactionType: 'buy',
          lastTransactionShares: 0,
          lastTransactionValue: 0,
          filingDate: $(cells[4]).text().trim(),
        };
        result.insider.push(holder);
      }
    });

    result.institutionalCount = result.institutional.length;
    result.institutionalSharesHeld = result.institutional.reduce((sum, h) => sum + h.shares, 0);
    result.insiderSharesHeld = result.insider.reduce((sum, h) => sum + h.shares, 0);
  } catch {
    // Return empty data on failure
  }

  return result;
}

function parseNumber(str: string): number {
  const cleaned = str.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
}
