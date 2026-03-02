import axios from 'axios';
import * as xml2js from 'xml2js';
import { SECFiling, Filing13F, Holding13F, CIKEntity } from './types';
import { getDb } from '../../db/schema';
import { v4 } from '../opportunities/uuid';

const SEC_API_BASE = 'https://efts.sec.gov/LATEST';
const SEC_ARCHIVE_BASE = 'https://www.sec.gov/Archives/edgar/data';

const headers = {
  'User-Agent': 'StockWatch/1.0 basil.hewittprocter@gmail.com',
  'Accept-Encoding': 'gzip, deflate',
  'Accept': '*/*',
  'Host': 'efts.sec.gov',
};

export class SECEdgarService {
  private parser = new xml2js.Parser({
    explicitArray: false,
    normalizeTags: true,
    normalize: true,
    trim: true,
  });

  /**
   * Search for filings by CIK and form type
   */
  async searchFilings(
    cik: string,
    formType: string = '13F-HR',
    startDate?: string,
    endDate?: string,
    count: number = 20
  ): Promise<SECFiling[]> {
    try {
      const params = new URLSearchParams({
        q: cik,
        forms: formType,
        count: count.toString(),
        ...(startDate && { startdt: startDate }),
        ...(endDate && { enddt: endDate }),
      });

      const url = `${SEC_API_BASE}/search-index?${params}`;
      const response = await axios.get(url, { headers });

      const filings: SECFiling[] = [];
      
      if (response.data && response.data.hits && response.data.hits.hits) {
        for (const hit of response.data.hits.hits) {
          const source = hit._source;
          filings.push({
            cik: source.ciks?.[0] || cik,
            accessionNumber: source.accession_number,
            formType: source.form,
            filingDate: source.file_date,
            periodEndDate: source.period_ending,
            companyName: source.display_names?.[0] || 'Unknown',
            url: `${SEC_ARCHIVE_BASE}/${cik.replace(/^0+/, '')}/${source.accession_number.replace(/-/g, '')}/${source.accession_number}.txt`,
          });
        }
      }

      return filings;
    } catch (error) {
      console.error('[SEC] Error searching filings:', error);
      return [];
    }
  }

  /**
   * Parse a 13F-HR filing and extract holdings
   */
  async parse13F(filing: SECFiling): Promise<Filing13F | null> {
    try {
      // Check if already cached
      const db = getDb();
      const cached = db.prepare('SELECT data FROM sec_filings WHERE accession_number = ?').get(filing.accessionNumber) as { data: string } | undefined;
      
      if (cached) {
        return JSON.parse(cached.data);
      }

      const response = await axios.get(filing.url, { headers, timeout: 30000 });
      const content = response.data;

      // Extract the information table (XML part) from the filing
      const xmlMatch = content.match(/<INFORMATION-TABLE>[\s\S]*?<\/INFORMATION-TABLE>/i);
      if (!xmlMatch) {
        console.warn('[SEC] No information table found in 13F filing');
        return null;
      }

      const xmlContent = xmlMatch[0];
      const parsedXml = await this.parser.parseStringPromise(xmlContent);
      
      const holdings: Holding13F[] = [];
      const infoTable = parsedXml?.informationtable || parsedXml?.['information-table'];
      
      if (infoTable && infoTable.infotable) {
        const tables = Array.isArray(infoTable.infotable) ? infoTable.infotable : [infoTable.infotable];
        
        for (const table of tables) {
          try {
            const holding: Holding13F = {
              nameOfIssuer: table.nameofissuer || 'Unknown',
              cusip: table.cusip || '',
              value: parseInt(table.value || '0') * 1000, // SEC values are in thousands
              sharesOrPrincipalAmount: parseInt(table.shrsorprnamtorprincipalamount?.sshprnamt || '0'),
              investmentDiscretion: table.investmentdiscretion || 'SOLE',
              votingAuthority: {
                sole: parseInt(table.votingauthority?.sole || '0'),
                shared: parseInt(table.votingauthority?.shared || '0'),
                none: parseInt(table.votingauthority?.none || '0'),
              },
            };
            holdings.push(holding);
          } catch (holdingError) {
            console.warn('[SEC] Error parsing holding entry:', holdingError);
          }
        }
      }

      const filing13F: Filing13F = {
        ...filing,
        holdings,
        totalValue: holdings.reduce((sum, h) => sum + h.value, 0),
        entryCount: holdings.length,
        reportDate: filing.periodEndDate || filing.filingDate,
      };

      // Cache the parsed filing
      db.prepare(`
        INSERT OR REPLACE INTO sec_filings 
        (id, cik, form_type, accession_number, filing_date, period_end_date, data) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        v4(),
        filing.cik,
        filing.formType,
        filing.accessionNumber,
        filing.filingDate,
        filing.periodEndDate,
        JSON.stringify(filing13F)
      );

      return filing13F;
    } catch (error) {
      console.error('[SEC] Error parsing 13F filing:', error);
      return null;
    }
  }

  /**
   * Get CIK by ticker symbol
   */
  async getCIKByTicker(ticker: string): Promise<string | null> {
    try {
      // Check cache first
      const db = getDb();
      const cached = db.prepare('SELECT cik FROM cik_lookup WHERE ticker = ?').get(ticker);
      if (cached) return (cached as any).cik;

      // Search SEC database
      const params = new URLSearchParams({
        q: ticker,
        category: 'custom',
        forms: '10-K,10-Q,13F-HR',
        count: '1',
      });

      const response = await axios.get(`${SEC_API_BASE}/search-index?${params}`, { headers });
      
      if (response.data?.hits?.hits?.[0]) {
        const hit = response.data.hits.hits[0];
        const cik = hit._source.ciks?.[0];
        const entityName = hit._source.display_names?.[0];
        
        if (cik) {
          // Cache the result
          db.prepare(`
            INSERT OR REPLACE INTO cik_lookup (cik, entity_name, ticker) 
            VALUES (?, ?, ?)
          `).run(cik, entityName, ticker.toUpperCase());
          
          return cik;
        }
      }

      return null;
    } catch (error) {
      console.error('[SEC] Error getting CIK for ticker:', ticker, error);
      return null;
    }
  }

  /**
   * Get entity name by CIK
   */
  async getEntityName(cik: string): Promise<string> {
    try {
      const db = getDb();
      const cached = db.prepare('SELECT entity_name FROM cik_lookup WHERE cik = ?').get(cik);
      if (cached) return (cached as any).entity_name;

      // Fetch from SEC if not cached
      const filings = await this.searchFilings(cik, '13F-HR', undefined, undefined, 1);
      if (filings.length > 0) {
        const entityName = filings[0].companyName;
        db.prepare(`
          INSERT OR REPLACE INTO cik_lookup (cik, entity_name) 
          VALUES (?, ?)
        `).run(cik, entityName);
        return entityName;
      }

      return 'Unknown Entity';
    } catch (error) {
      console.error('[SEC] Error getting entity name:', error);
      return 'Unknown Entity';
    }
  }

  /**
   * Map CUSIP to ticker symbol using OpenFIGI
   */
  async cusipToTicker(cusip: string): Promise<string | null> {
    try {
      const response = await axios.post(
        'https://api.openfigi.com/v3/mapping',
        [{ idType: 'ID_CUSIP', idValue: cusip }],
        {
          headers: {
            'Content-Type': 'application/json',
            'X-OPENFIGI-APIKEY': process.env.OPENFIGI_API_KEY || '', // Optional API key
          },
        }
      );

      if (response.data?.[0]?.data?.[0]?.ticker) {
        return response.data[0].data[0].ticker;
      }

      return null;
    } catch (error) {
      // Fallback: use simple CUSIP to symbol logic or return null
      console.warn('[SEC] CUSIP lookup failed for', cusip);
      return null;
    }
  }
}

export const secEdgarService = new SECEdgarService();