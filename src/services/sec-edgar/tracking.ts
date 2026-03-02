import { getDb } from '../../db/schema';
import { secEdgarService } from './filings';
import { v4 } from '../opportunities/uuid';

export interface HolderChange {
  id: string;
  cik: string;
  holderName: string;
  symbol: string;
  action: 'new' | 'increased' | 'decreased' | 'exited';
  sharesChange: number;
  valueChange: number;
  pctChange: number;
  quarter: string;
  createdAt: string;
}

export interface SmartMoneySignal {
  symbol: string;
  holderCount: number;
  totalValue: number;
  holders: Array<{
    name: string;
    action: string;
    sharesChange: number;
    valueChange: number;
  }>;
  confidence: number; // 0-100
  detectedAt: string;
}

export class HolderTrackingService {
  /**
   * Process 13F filing and detect changes from previous quarter
   */
  async processQuarterlyFiling(cik: string): Promise<HolderChange[]> {
    try {
      // Get latest 13F filing for this CIK
      const filings = await secEdgarService.searchFilings(cik, '13F-HR', undefined, undefined, 2);
      if (filings.length === 0) {
        console.log(`[Tracking] No 13F filings found for CIK ${cik}`);
        return [];
      }

      // Parse current and previous filings
      const currentFiling = await secEdgarService.parse13F(filings[0]);
      const previousFiling = filings.length > 1 ? await secEdgarService.parse13F(filings[1]) : null;

      if (!currentFiling) {
        console.warn(`[Tracking] Could not parse current 13F for CIK ${cik}`);
        return [];
      }

      const holderName = await secEdgarService.getEntityName(cik);
      const quarter = this.getQuarterFromDate(currentFiling.reportDate);
      
      // Store current positions
      const db = getDb();
      for (const holding of currentFiling.holdings) {
        const symbol = await this.getSymbolFromHolding(holding);
        if (symbol) {
          db.prepare(`
            INSERT OR REPLACE INTO holder_positions 
            (id, cik, holder_name, symbol, cusip, shares, value, quarter, filing_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            v4(),
            cik,
            holderName,
            symbol,
            holding.cusip,
            holding.sharesOrPrincipalAmount,
            holding.value,
            quarter,
            currentFiling.filingDate
          );
        }
      }

      // Detect changes if we have a previous filing
      const changes: HolderChange[] = [];
      if (previousFiling) {
        changes.push(...this.detectChanges(cik, holderName, currentFiling, previousFiling, quarter));
      }

      // Update tracked holder last check time
      db.prepare('UPDATE tracked_holders SET last_check = ? WHERE cik = ?')
        .run(new Date().toISOString(), cik);

      return changes;
    } catch (error) {
      console.error('[Tracking] Error processing quarterly filing:', error);
      return [];
    }
  }

  /**
   * Detect changes between current and previous 13F filings
   */
  private detectChanges(
    cik: string,
    holderName: string,
    current: any,
    previous: any,
    quarter: string
  ): HolderChange[] {
    const changes: HolderChange[] = [];
    const db = getDb();

    // Create maps for easier comparison
    const currentMap = new Map();
    const previousMap = new Map();

    for (const holding of current.holdings) {
      currentMap.set(holding.cusip, holding);
    }

    for (const holding of previous.holdings) {
      previousMap.set(holding.cusip, holding);
    }

    // Check for new, increased, decreased, and exited positions
    for (const [cusip, currentHolding] of currentMap) {
      const previousHolding = previousMap.get(cusip);
      const symbol = this.getSymbolFromCusip(cusip);
      
      if (!symbol) continue;

      if (!previousHolding) {
        // New position
        changes.push(this.createChange(
          cik, holderName, symbol, 'new', 
          currentHolding.sharesOrPrincipalAmount, 
          currentHolding.value, 
          100, // 100% increase (new position)
          quarter
        ));
      } else {
        // Changed position
        const sharesChange = currentHolding.sharesOrPrincipalAmount - previousHolding.sharesOrPrincipalAmount;
        const valueChange = currentHolding.value - previousHolding.value;
        const pctChange = previousHolding.sharesOrPrincipalAmount > 0 
          ? (sharesChange / previousHolding.sharesOrPrincipalAmount) * 100 
          : 0;

        if (Math.abs(pctChange) > 5) { // Only track changes > 5%
          const action = sharesChange > 0 ? 'increased' : 'decreased';
          changes.push(this.createChange(
            cik, holderName, symbol, action, 
            sharesChange, valueChange, pctChange, quarter
          ));
        }
      }
    }

    // Check for exited positions
    for (const [cusip, previousHolding] of previousMap) {
      if (!currentMap.has(cusip)) {
        const symbol = this.getSymbolFromCusip(cusip);
        if (symbol) {
          changes.push(this.createChange(
            cik, holderName, symbol, 'exited',
            -previousHolding.sharesOrPrincipalAmount,
            -previousHolding.value,
            -100,
            quarter
          ));
        }
      }
    }

    // Store changes in database
    for (const change of changes) {
      db.prepare(`
        INSERT INTO holder_changes 
        (id, cik, holder_name, symbol, action, shares_change, value_change, pct_change, quarter)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        change.id,
        change.cik,
        change.holderName,
        change.symbol,
        change.action,
        change.sharesChange,
        change.valueChange,
        change.pctChange,
        change.quarter
      );
    }

    return changes;
  }

  /**
   * Create a HolderChange object
   */
  private createChange(
    cik: string,
    holderName: string,
    symbol: string,
    action: 'new' | 'increased' | 'decreased' | 'exited',
    sharesChange: number,
    valueChange: number,
    pctChange: number,
    quarter: string
  ): HolderChange {
    return {
      id: v4(),
      cik,
      holderName,
      symbol,
      action,
      sharesChange,
      valueChange,
      pctChange,
      quarter,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Detect smart money signals (multiple tracked holders converging on same stock)
   */
  detectSmartMoneySignals(quarter?: string): SmartMoneySignal[] {
    try {
      const db = getDb();
      const targetQuarter = quarter || this.getCurrentQuarter();

      // Find symbols with multiple holder changes in the same quarter
      const convergenceQuery = `
        SELECT 
          symbol, 
          COUNT(DISTINCT cik) as holder_count,
          SUM(CASE WHEN action IN ('new', 'increased') THEN value_change ELSE 0 END) as total_buy_value,
          SUM(CASE WHEN action IN ('decreased', 'exited') THEN ABS(value_change) ELSE 0 END) as total_sell_value
        FROM holder_changes 
        WHERE quarter = ? 
          AND cik IN (SELECT cik FROM tracked_holders WHERE cik IS NOT NULL)
        GROUP BY symbol 
        HAVING holder_count >= 3
        ORDER BY holder_count DESC, total_buy_value DESC
      `;

      const convergences = db.prepare(convergenceQuery).all(targetQuarter);
      const signals: SmartMoneySignal[] = [];

      for (const conv of convergences as any[]) {
        // Get detailed holder actions for this symbol
        const holderActions = db.prepare(`
          SELECT holder_name, action, shares_change, value_change 
          FROM holder_changes 
          WHERE symbol = ? AND quarter = ?
            AND cik IN (SELECT cik FROM tracked_holders WHERE cik IS NOT NULL)
        `).all(conv.symbol, targetQuarter);

        // Calculate confidence score based on:
        // - Number of holders (more = higher confidence)
        // - Net positive buying vs selling
        // - Size of position changes
        const netValue = conv.total_buy_value - conv.total_sell_value;
        const confidence = Math.min(100, Math.max(0, 
          (conv.holder_count * 20) + // 20 points per holder
          (netValue > 0 ? 30 : -20) + // Bonus for net buying
          Math.min(30, Math.log10(Math.max(conv.total_buy_value, 1000000)) * 10) // Size bonus
        ));

        if (confidence >= 60) { // Only report high-confidence signals
          signals.push({
            symbol: conv.symbol,
            holderCount: conv.holder_count,
            totalValue: conv.total_buy_value,
            holders: holderActions.map((h: any) => ({
              name: h.holder_name,
              action: h.action,
              sharesChange: h.shares_change,
              valueChange: h.value_change,
            })),
            confidence,
            detectedAt: new Date().toISOString(),
          });
        }
      }

      return signals;
    } catch (error) {
      console.error('[Tracking] Error detecting smart money signals:', error);
      return [];
    }
  }

  /**
   * Get all changes for a specific holder
   */
  getHolderChanges(cik: string, quarters?: number): HolderChange[] {
    try {
      const db = getDb();
      const query = quarters 
        ? 'SELECT * FROM holder_changes WHERE cik = ? ORDER BY quarter DESC, created_at DESC LIMIT ?'
        : 'SELECT * FROM holder_changes WHERE cik = ? ORDER BY quarter DESC, created_at DESC';
      
      const params = quarters ? [cik, quarters * 20] : [cik]; // Approximate 20 changes per quarter
      const rows = db.prepare(query).all(...params);

      return rows.map((row: any) => ({
        id: row.id,
        cik: row.cik,
        holderName: row.holder_name,
        symbol: row.symbol,
        action: row.action,
        sharesChange: row.shares_change,
        valueChange: row.value_change,
        pctChange: row.pct_change,
        quarter: row.quarter,
        createdAt: row.created_at,
      }));
    } catch (error) {
      console.error('[Tracking] Error getting holder changes:', error);
      return [];
    }
  }

  /**
   * Helper: Get current quarter string
   */
  private getCurrentQuarter(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const quarter = Math.ceil(month / 3);
    return `${year}Q${quarter}`;
  }

  /**
   * Helper: Get quarter from date
   */
  private getQuarterFromDate(dateStr: string): string {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const quarter = Math.ceil(month / 3);
    return `${year}Q${quarter}`;
  }

  /**
   * Helper: Get symbol from holding (try CUSIP lookup, fallback to name matching)
   */
  private async getSymbolFromHolding(holding: any): Promise<string | null> {
    if (holding.cusip) {
      const symbol = await secEdgarService.cusipToTicker(holding.cusip);
      if (symbol) return symbol;
    }

    // Fallback: try to extract ticker from issuer name
    const name = holding.nameOfIssuer || '';
    const tickerMatch = name.match(/\b([A-Z]{1,5})\b/);
    return tickerMatch ? tickerMatch[1] : null;
  }

  /**
   * Helper: Get symbol from CUSIP (cached lookup)
   */
  private getSymbolFromCusip(cusip: string): string | null {
    // Simple implementation - in practice would use CUSIP->ticker mapping
    return null;
  }
}

export const holderTrackingService = new HolderTrackingService();