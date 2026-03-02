import { getDb } from '../../db/schema';

/**
 * Global Search Service
 * 
 * Provides spotlight-style search across all StockWatch data types.
 */

export interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  type: 'symbol' | 'holder' | 'dashboard' | 'report' | 'condition' | 'pattern';
  data: any;
  relevance: number; // 0-1 score
  quickActions?: Array<{
    label: string;
    action: string;
    params?: any;
  }>;
}

export interface SearchOptions {
  query: string;
  types?: string[];
  limit?: number;
  includeActions?: boolean;
}

class GlobalSearchService {
  
  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, types, limit = 20, includeActions = true } = options;
    
    if (!query || query.length < 1) {
      return [];
    }
    
    const results: SearchResult[] = [];
    
    // Search symbols (always included unless specifically excluded)
    if (!types || types.includes('symbol')) {
      results.push(...await this.searchSymbols(query, includeActions));
    }
    
    // Search holders
    if (!types || types.includes('holder')) {
      results.push(...await this.searchHolders(query, includeActions));
    }
    
    // Search dashboards
    if (!types || types.includes('dashboard')) {
      results.push(...await this.searchDashboards(query, includeActions));
    }
    
    // Search reports
    if (!types || types.includes('report')) {
      results.push(...await this.searchReports(query, includeActions));
    }
    
    // Search conditions
    if (!types || types.includes('condition')) {
      results.push(...await this.searchConditions(query, includeActions));
    }
    
    // Search patterns
    if (!types || types.includes('pattern')) {
      results.push(...await this.searchPatterns(query, includeActions));
    }
    
    // Sort by relevance and limit
    results.sort((a, b) => b.relevance - a.relevance);
    
    return results.slice(0, limit);
  }
  
  private async searchSymbols(query: string, includeActions: boolean): Promise<SearchResult[]> {
    const db = getDb();
    const upperQuery = query.toUpperCase();
    const results: SearchResult[] = [];
    
    // Direct symbol matches from cached quotes
    try {
      const symbolRows = db.prepare(`
        SELECT symbol FROM cached_quotes 
        WHERE symbol LIKE ? OR symbol LIKE ?
        ORDER BY 
          CASE 
            WHEN symbol = ? THEN 1
            WHEN symbol LIKE ? THEN 2
            ELSE 3
          END
        LIMIT 10
      `).all(`${upperQuery}%`, `%${upperQuery}%`, upperQuery, `${upperQuery}%`) as any[];
      
      for (const row of symbolRows) {
        const relevance = this.calculateSymbolRelevance(row.symbol, upperQuery);
        
        results.push({
          id: `symbol:${row.symbol}`,
          title: row.symbol,
          subtitle: 'Stock Symbol',
          type: 'symbol',
          data: { symbol: row.symbol },
          relevance,
          quickActions: includeActions ? [
            { label: 'Add to Dashboard', action: 'add_to_dashboard', params: { symbol: row.symbol } },
            { label: 'Set Price Alert', action: 'set_alert', params: { symbol: row.symbol } },
            { label: 'Research Report', action: 'generate_report', params: { symbol: row.symbol } },
            { label: 'Track Options', action: 'track_options', params: { symbol: row.symbol } },
          ] : undefined,
        });
      }
    } catch (error) {
      console.warn('[Search] Symbol search error:', error);
    }
    
    return results;
  }
  
  private async searchHolders(query: string, includeActions: boolean): Promise<SearchResult[]> {
    const db = getDb();
    const results: SearchResult[] = [];
    
    try {
      // Search tracked holders
      const holderRows = db.prepare(`
        SELECT * FROM tracked_holders 
        WHERE name LIKE ? OR name LIKE ?
        ORDER BY 
          CASE 
            WHEN name LIKE ? THEN 1
            ELSE 2
          END
        LIMIT 5
      `).all(`${query}%`, `%${query}%`, `${query}%`) as any[];
      
      for (const row of holderRows) {
        const relevance = this.calculateTextRelevance(row.name, query);
        
        results.push({
          id: `holder:${row.id}`,
          title: row.name,
          subtitle: `${row.type === 'institution' ? 'Institution' : 'Insider'}`,
          type: 'holder',
          data: row,
          relevance,
          quickActions: includeActions ? [
            { label: 'View Holdings', action: 'view_holdings', params: { holderId: row.id } },
            { label: 'Track Changes', action: 'track_changes', params: { holderId: row.id } },
          ] : undefined,
        });
      }
      
      // Also search in CIK lookup
      const cikRows = db.prepare(`
        SELECT * FROM cik_lookup 
        WHERE entity_name LIKE ? OR entity_name LIKE ?
        LIMIT 5
      `).all(`${query}%`, `%${query}%`) as any[];
      
      for (const row of cikRows) {
        const relevance = this.calculateTextRelevance(row.entity_name, query);
        
        results.push({
          id: `entity:${row.cik}`,
          title: row.entity_name,
          subtitle: row.ticker ? `Entity (${row.ticker})` : 'Entity',
          type: 'holder',
          data: row,
          relevance: relevance * 0.8, // Slightly lower relevance than tracked holders
          quickActions: includeActions ? [
            { label: 'Track Entity', action: 'track_holder', params: { cik: row.cik, name: row.entity_name } },
          ] : undefined,
        });
      }
    } catch (error) {
      console.warn('[Search] Holder search error:', error);
    }
    
    return results;
  }
  
  private async searchDashboards(query: string, includeActions: boolean): Promise<SearchResult[]> {
    const db = getDb();
    const results: SearchResult[] = [];
    
    try {
      const dashboardRows = db.prepare(`
        SELECT * FROM dashboards 
        WHERE name LIKE ? OR description LIKE ?
        ORDER BY 
          CASE 
            WHEN name LIKE ? THEN 1
            ELSE 2
          END
        LIMIT 5
      `).all(`%${query}%`, `%${query}%`, `${query}%`) as any[];
      
      for (const row of dashboardRows) {
        const relevance = this.calculateTextRelevance(row.name, query);
        
        results.push({
          id: `dashboard:${row.id}`,
          title: row.name,
          subtitle: row.description || 'Dashboard',
          type: 'dashboard',
          data: row,
          relevance,
          quickActions: includeActions ? [
            { label: 'Open Dashboard', action: 'open_dashboard', params: { dashboardId: row.id } },
            { label: 'Edit Dashboard', action: 'edit_dashboard', params: { dashboardId: row.id } },
          ] : undefined,
        });
      }
    } catch (error) {
      console.warn('[Search] Dashboard search error:', error);
    }
    
    return results;
  }
  
  private async searchReports(query: string, includeActions: boolean): Promise<SearchResult[]> {
    const db = getDb();
    const results: SearchResult[] = [];
    
    try {
      const reportRows = db.prepare(`
        SELECT * FROM research_reports 
        WHERE title LIKE ? OR symbol LIKE ? OR executive_summary LIKE ?
        ORDER BY created_at DESC
        LIMIT 5
      `).all(`%${query}%`, `%${query}%`, `%${query}%`) as any[];
      
      for (const row of reportRows) {
        const relevance = this.calculateTextRelevance(row.title, query);
        
        results.push({
          id: `report:${row.id}`,
          title: row.title,
          subtitle: `Report • ${row.symbol} • ${this.formatDate(row.created_at)}`,
          type: 'report',
          data: row,
          relevance,
          quickActions: includeActions ? [
            { label: 'View Report', action: 'view_report', params: { reportId: row.id } },
            { label: 'Update Outcome', action: 'update_outcome', params: { reportId: row.id } },
          ] : undefined,
        });
      }
    } catch (error) {
      console.warn('[Search] Report search error:', error);
    }
    
    return results;
  }
  
  private async searchConditions(query: string, includeActions: boolean): Promise<SearchResult[]> {
    const db = getDb();
    const results: SearchResult[] = [];
    
    try {
      const conditionRows = db.prepare(`
        SELECT * FROM opportunity_conditions 
        WHERE name LIKE ? OR description LIKE ?
        ORDER BY created_at DESC
        LIMIT 5
      `).all(`%${query}%`, `%${query}%`) as any[];
      
      for (const row of conditionRows) {
        const relevance = this.calculateTextRelevance(row.name, query);
        
        results.push({
          id: `condition:${row.id}`,
          title: row.name,
          subtitle: `Condition • ${row.enabled ? 'Active' : 'Disabled'}`,
          type: 'condition',
          data: row,
          relevance,
          quickActions: includeActions ? [
            { label: 'View Condition', action: 'view_condition', params: { conditionId: row.id } },
            { label: 'Edit Condition', action: 'edit_condition', params: { conditionId: row.id } },
            { label: row.enabled ? 'Disable' : 'Enable', action: 'toggle_condition', params: { conditionId: row.id } },
          ] : undefined,
        });
      }
    } catch (error) {
      console.warn('[Search] Condition search error:', error);
    }
    
    return results;
  }
  
  private async searchPatterns(query: string, includeActions: boolean): Promise<SearchResult[]> {
    const db = getDb();
    const results: SearchResult[] = [];
    
    try {
      const patternRows = db.prepare(`
        SELECT * FROM trade_patterns 
        WHERE name LIKE ? OR description LIKE ?
        ORDER BY used_count DESC, created_at DESC
        LIMIT 5
      `).all(`%${query}%`, `%${query}%`) as any[];
      
      for (const row of patternRows) {
        const relevance = this.calculateTextRelevance(row.name, query);
        const statistics = JSON.parse(row.statistics || '{}');
        
        results.push({
          id: `pattern:${row.id}`,
          title: row.name,
          subtitle: `Pattern • ${(statistics.historicalWinRate * 100).toFixed(0)}% win rate • ${row.used_count} uses`,
          type: 'pattern',
          data: row,
          relevance,
          quickActions: includeActions ? [
            { label: 'View Pattern', action: 'view_pattern', params: { patternId: row.id } },
            { label: 'Find Matches', action: 'find_matches', params: { patternId: row.id } },
          ] : undefined,
        });
      }
    } catch (error) {
      console.warn('[Search] Pattern search error:', error);
    }
    
    return results;
  }
  
  private calculateSymbolRelevance(symbol: string, query: string): number {
    if (symbol === query) return 1.0;
    if (symbol.startsWith(query)) return 0.9;
    if (symbol.includes(query)) return 0.7;
    return 0.3;
  }
  
  private calculateTextRelevance(text: string, query: string): number {
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    
    if (lowerText === lowerQuery) return 1.0;
    if (lowerText.startsWith(lowerQuery)) return 0.8;
    if (lowerText.includes(` ${lowerQuery}`)) return 0.7;
    if (lowerText.includes(lowerQuery)) return 0.6;
    
    // Check word boundaries
    const words = lowerText.split(/\s+/);
    const queryWords = lowerQuery.split(/\s+/);
    
    let matchingWords = 0;
    for (const queryWord of queryWords) {
      for (const word of words) {
        if (word.startsWith(queryWord)) {
          matchingWords++;
          break;
        }
      }
    }
    
    return (matchingWords / queryWords.length) * 0.5;
  }
  
  private formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
      return `${Math.floor(diffDays / 30)}mo ago`;
    } catch {
      return dateString;
    }
  }
  
  async getRecentSearches(limit: number = 10): Promise<SearchResult[]> {
    // This would be implemented with a search history table
    // For now, return recent reports as "searches"
    const db = getDb();
    
    try {
      const recentReports = db.prepare(`
        SELECT * FROM research_reports 
        ORDER BY created_at DESC 
        LIMIT ?
      `).all(limit) as any[];
      
      return recentReports.map(row => ({
        id: `report:${row.id}`,
        title: row.title,
        subtitle: `Report • ${row.symbol}`,
        type: 'report' as const,
        data: row,
        relevance: 0.5,
      }));
    } catch {
      return [];
    }
  }
}

export const globalSearch = new GlobalSearchService();