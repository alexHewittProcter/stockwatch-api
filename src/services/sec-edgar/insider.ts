import axios from 'axios';
import * as xml2js from 'xml2js';
import { Filing4, Form4Transaction } from './types';
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

export class InsiderTradingService {
  private parser = new xml2js.Parser({
    explicitArray: false,
    normalizeTags: true,
    normalize: true,
    trim: true,
  });

  /**
   * Get recent Form 4 filings for a specific symbol
   */
  async getInsiderTransactions(symbol: string, days: number = 30): Promise<Form4Transaction[]> {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
      
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // First get the CIK for this symbol
      const params = new URLSearchParams({
        q: symbol,
        forms: '4',
        dateRange: 'custom',
        startdt: startDateStr,
        enddt: endDateStr,
        count: '100',
      });

      const url = `${SEC_API_BASE}/search-index?${params}`;
      const response = await axios.get(url, { headers });

      const transactions: Form4Transaction[] = [];
      
      if (response.data?.hits?.hits) {
        for (const hit of response.data.hits.hits) {
          const source = hit._source;
          
          // Parse each Form 4 filing
          const filing: Filing4 = {
            cik: source.ciks?.[0] || '',
            accessionNumber: source.accession_number,
            formType: 'Form 4',
            filingDate: source.file_date,
            companyName: source.display_names?.[0] || 'Unknown',
            url: `${SEC_ARCHIVE_BASE}/${source.ciks?.[0]?.replace(/^0+/, '') || ''}/${source.accession_number.replace(/-/g, '')}/${source.accession_number}.txt`,
            transactions: [],
            issuerSymbol: symbol.toUpperCase(),
          };

          const filingTransactions = await this.parseForm4(filing);
          transactions.push(...filingTransactions);
        }
      }

      // Store in database
      const db = getDb();
      for (const transaction of transactions) {
        db.prepare(`
          INSERT OR REPLACE INTO insider_transactions 
          (id, symbol, insider_name, insider_title, transaction_type, shares, price, value, transaction_date, filing_date, form_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          v4(),
          transaction.symbol,
          transaction.insiderName,
          transaction.insiderTitle,
          transaction.transactionCode,
          transaction.transactionShares,
          transaction.transactionPrice,
          transaction.transactionShares * transaction.transactionPrice,
          transaction.transactionDate,
          new Date().toISOString().split('T')[0],
          'Form 4'
        );
      }

      return transactions.sort((a, b) => 
        new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
      );
    } catch (error) {
      console.error('[Insider] Error fetching transactions:', error);
      return [];
    }
  }

  /**
   * Parse a Form 4 filing to extract transactions
   */
  private async parseForm4(filing: Filing4): Promise<Form4Transaction[]> {
    try {
      const response = await axios.get(filing.url, { headers, timeout: 30000 });
      const content = response.data;

      // Extract XML content from the filing
      const xmlMatch = content.match(/<XML>[\s\S]*?<\/XML>/i);
      if (!xmlMatch) {
        console.warn('[Insider] No XML section found in Form 4');
        return [];
      }

      const xmlContent = xmlMatch[0].replace(/<\/?XML>/gi, '');
      const parsedXml = await this.parser.parseStringPromise(xmlContent);

      const transactions: Form4Transaction[] = [];
      
      // Extract issuer information
      const issuerInfo = parsedXml?.ownershipdocument?.issuertradingsymbol || 
                        parsedXml?.ownershipDocument?.issuerTradingSymbol ||
                        filing.issuerSymbol;

      // Extract reporting owner info
      const reportingOwner = parsedXml?.ownershipdocument?.reportingowner ||
                           parsedXml?.ownershipDocument?.reportingOwner;
      
      let insiderName = 'Unknown';
      let insiderTitle = 'Unknown';
      
      if (reportingOwner) {
        const ownerId = reportingOwner.reportingownerid || reportingOwner.reportingOwnerId;
        if (ownerId) {
          insiderName = ownerId.rptownername || ownerId.rptOwnerName || 'Unknown';
          insiderTitle = reportingOwner.reportingownerrelationship?.reportingownertitle ||
                        reportingOwner.reportingOwnerRelationship?.reportingOwnerTitle || 
                        'Unknown';
        }
      }

      // Parse non-derivative transactions
      const nonDerivativeTable = parsedXml?.ownershipdocument?.nonderivativetable ||
                                 parsedXml?.ownershipDocument?.nonDerivativeTable;

      if (nonDerivativeTable?.nonderivativetransaction) {
        const txns = Array.isArray(nonDerivativeTable.nonderivativetransaction) 
          ? nonDerivativeTable.nonderivativetransaction 
          : [nonDerivativeTable.nonderivativetransaction];

        for (const txn of txns) {
          try {
            const transaction: Form4Transaction = {
              symbol: issuerInfo || filing.issuerSymbol,
              insiderName,
              insiderTitle,
              transactionCode: txn.transactionamounts?.transactioncode || 
                              txn.transactionAmounts?.transactionCode || 'Unknown',
              transactionShares: parseFloat(txn.transactionamounts?.transactionshares || 
                                          txn.transactionAmounts?.transactionShares || '0'),
              transactionPrice: parseFloat(txn.transactionamounts?.transactionpricepershare || 
                                         txn.transactionAmounts?.transactionPricePerShare || '0'),
              sharesOwned: parseFloat(txn.posttransactionamounts?.sharesownedfollowingtransaction ||
                                    txn.postTransactionAmounts?.sharesOwnedFollowingTransaction || '0'),
              transactionDate: txn.transactiondate?.value || txn.transactionDate?.value || filing.filingDate,
            };

            // Only include significant transactions (> $10K or > 1000 shares)
            const transactionValue = transaction.transactionShares * transaction.transactionPrice;
            if (transactionValue > 10000 || transaction.transactionShares > 1000) {
              transactions.push(transaction);
            }
          } catch (txnError) {
            console.warn('[Insider] Error parsing transaction:', txnError);
          }
        }
      }

      return transactions;
    } catch (error) {
      console.error('[Insider] Error parsing Form 4:', error);
      return [];
    }
  }

  /**
   * Get cached insider transactions from database
   */
  getCachedTransactions(symbol: string, days: number = 30): Form4Transaction[] {
    try {
      const db = getDb();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const rows = db.prepare(`
        SELECT * FROM insider_transactions 
        WHERE symbol = ? AND transaction_date >= ?
        ORDER BY transaction_date DESC
      `).all(symbol.toUpperCase(), cutoffDate.toISOString().split('T')[0]);

      return rows.map((row: any) => ({
        symbol: row.symbol,
        insiderName: row.insider_name,
        insiderTitle: row.insider_title,
        transactionCode: row.transaction_type,
        transactionShares: row.shares,
        transactionPrice: row.price,
        sharesOwned: 0, // Not stored in our simplified schema
        transactionDate: row.transaction_date,
      }));
    } catch (error) {
      console.error('[Insider] Error getting cached transactions:', error);
      return [];
    }
  }

  /**
   * Check for significant insider buying clusters (potential signal)
   */
  detectInsiderBuyingSignals(symbol: string): boolean {
    try {
      const db = getDb();
      
      // Look for multiple insider purchases in last 30 days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);
      
      const buyCount = db.prepare(`
        SELECT COUNT(*) as count FROM insider_transactions 
        WHERE symbol = ? 
          AND transaction_date >= ? 
          AND transaction_type IN ('P', 'Purchase')
          AND value > 100000
      `).get(symbol.toUpperCase(), cutoffDate.toISOString().split('T')[0]);

      return (buyCount as any)?.count >= 3; // 3+ large purchases = signal
    } catch (error) {
      console.error('[Insider] Error detecting signals:', error);
      return false;
    }
  }
}

export const insiderTradingService = new InsiderTradingService();