import { getDb } from '../../db/schema';
import { Opportunity, Signal, Evidence, OpportunityTemplate, OPPORTUNITY_TEMPLATES } from '../../types/opportunity';
import { signalManager } from './signals';
import { v4 } from './uuid';

/**
 * Opportunity Detection Engine
 * 
 * Combines multiple signals to identify high-probability trading opportunities
 * using predefined templates and confidence scoring algorithms.
 */

export class OpportunityEngine {
  
  async generateOpportunities(): Promise<Opportunity[]> {
    console.log('[OpportunityEngine] Starting opportunity generation...');
    
    // Get recent signals (last 24 hours)
    const recentSignals = await signalManager.getRecentSignals(24, 500);
    console.log(`[OpportunityEngine] Found ${recentSignals.length} recent signals`);
    
    // Group signals by symbol
    const signalsBySymbol = this.groupSignalsBySymbol(recentSignals);
    
    const opportunities: Opportunity[] = [];
    
    // For each symbol, try to match against opportunity templates
    for (const [symbol, signals] of signalsBySymbol.entries()) {
      const symbolOpportunities = await this.generateOpportunitiesForSymbol(symbol, signals);
      opportunities.push(...symbolOpportunities);
    }
    
    // Sort by confidence score
    opportunities.sort((a, b) => b.confidence - a.confidence);
    
    // Save to database
    await this.saveOpportunities(opportunities);
    
    console.log(`[OpportunityEngine] Generated ${opportunities.length} opportunities`);
    return opportunities;
  }

  private async generateOpportunitiesForSymbol(symbol: string, signals: Signal[]): Promise<Opportunity[]> {
    const opportunities: Opportunity[] = [];
    
    // Try each template to see if signals match
    for (const template of OPPORTUNITY_TEMPLATES) {
      const opportunity = await this.tryTemplate(symbol, signals, template);
      if (opportunity) {
        opportunities.push(opportunity);
      }
    }
    
    // Also generate generic multi-signal opportunities if we have strong signals
    const genericOpportunity = await this.generateGenericOpportunity(symbol, signals);
    if (genericOpportunity) {
      opportunities.push(genericOpportunity);
    }
    
    return opportunities;
  }

  private async tryTemplate(symbol: string, signals: Signal[], template: OpportunityTemplate): Promise<Opportunity | null> {
    // Check if we have signals matching the template requirements
    const matchingSignals = signals.filter(s => template.signalTypes.includes(s.type));
    
    if (matchingSignals.length < 2) return null; // Need at least 2 matching signals
    
    // Calculate confidence based on template weights
    const confidence = this.calculateTemplateConfidence(matchingSignals, template);
    
    if (confidence < 40) return null; // Minimum confidence threshold
    
    // Determine overall direction
    const direction = this.determineDirection(matchingSignals);
    
    // Generate price targets
    const priceTargets = await this.calculatePriceTargets(symbol, direction, template.riskRewardRatio);
    
    // Generate evidence
    const evidence = this.generateEvidence(matchingSignals);
    
    // Create opportunity
    const opportunity: Opportunity = {
      id: v4(),
      createdAt: new Date().toISOString(),
      symbol,
      title: `${symbol}: ${this.generateTitle(matchingSignals, template)}`,
      thesis: this.generateThesis(matchingSignals, template),
      confidence: Math.round(confidence),
      direction,
      timeframe: template.timeframe,
      signals: matchingSignals,
      evidence,
      suggestedEntry: priceTargets.entry,
      suggestedStop: priceTargets.stop,
      suggestedTarget: priceTargets.target,
      riskReward: priceTargets.riskReward,
      status: 'active',
      tags: template.tags,
    };
    
    return opportunity;
  }

  private async generateGenericOpportunity(symbol: string, signals: Signal[]): Promise<Opportunity | null> {
    if (signals.length < 3) return null; // Need at least 3 signals
    
    // Calculate signal strength
    const avgStrength = signals.reduce((sum, s) => sum + s.strength, 0) / signals.length;
    if (avgStrength < 0.6) return null; // Minimum average strength
    
    // Check for signal diversity (different categories)
    const categories = new Set(signals.map(s => s.category));
    const diversityBonus = categories.size >= 3 ? 1.3 : categories.size === 2 ? 1.1 : 1.0;
    
    const confidence = Math.min(avgStrength * 80 * diversityBonus, 100);
    
    // Determine direction
    const direction = this.determineDirection(signals);
    
    // Generic risk/reward
    const priceTargets = await this.calculatePriceTargets(symbol, direction, 2.5);
    
    const evidence = this.generateEvidence(signals);
    
    const opportunity: Opportunity = {
      id: v4(),
      createdAt: new Date().toISOString(),
      symbol,
      title: `${symbol}: Multi-signal convergence (${signals.length} signals)`,
      thesis: `Multiple strong signals across ${categories.size} categories suggest ${direction} momentum. ${this.getTopSignalTypes(signals).join(', ')}.`,
      confidence: Math.round(confidence),
      direction,
      timeframe: 'swing',
      signals,
      evidence,
      suggestedEntry: priceTargets.entry,
      suggestedStop: priceTargets.stop,
      suggestedTarget: priceTargets.target,
      riskReward: priceTargets.riskReward,
      status: 'active',
      tags: ['multi-signal', 'convergence'],
    };
    
    return opportunity;
  }

  private calculateTemplateConfidence(signals: Signal[], template: OpportunityTemplate): number {
    let totalWeight = 0;
    let weightedStrength = 0;
    
    for (const signal of signals) {
      const weight = template.confidenceWeights[signal.type] || 0.1;
      totalWeight += weight;
      weightedStrength += signal.strength * weight;
    }
    
    if (totalWeight === 0) return 0;
    
    const baseConfidence = (weightedStrength / totalWeight) * 100;
    
    // Apply bonuses and penalties
    let confidence = baseConfidence;
    
    // Diversity bonus (signals from different categories)
    const categories = new Set(signals.map(s => s.category));
    if (categories.size >= 3) confidence *= 1.2;
    else if (categories.size === 2) confidence *= 1.1;
    
    // Directional alignment bonus
    const directions = signals.map(s => s.direction);
    const bullishCount = directions.filter(d => d === 'bullish').length;
    const bearishCount = directions.filter(d => d === 'bearish').length;
    const neutralCount = directions.filter(d => d === 'neutral').length;
    
    const totalDirectional = bullishCount + bearishCount;
    const alignment = Math.max(bullishCount, bearishCount) / directions.length;
    
    if (alignment > 0.8) confidence *= 1.15; // Strong alignment
    else if (alignment > 0.6) confidence *= 1.05; // Moderate alignment
    else if (bullishCount > 0 && bearishCount > 0) confidence *= 0.9; // Conflicting signals
    
    // Recency bonus (signals within last 6 hours get boost)
    const recentCount = signals.filter(s => {
      const signalAge = Date.now() - new Date(s.detectedAt).getTime();
      return signalAge < 6 * 60 * 60 * 1000; // 6 hours
    }).length;
    
    if (recentCount >= signals.length * 0.7) confidence *= 1.1;
    
    return Math.min(confidence, 100);
  }

  private determineDirection(signals: Signal[]): 'long' | 'short' | 'neutral' {
    const bullishCount = signals.filter(s => s.direction === 'bullish').length;
    const bearishCount = signals.filter(s => s.direction === 'bearish').length;
    
    if (bullishCount > bearishCount) return 'long';
    if (bearishCount > bullishCount) return 'short';
    return 'neutral';
  }

  private async calculatePriceTargets(symbol: string, direction: 'long' | 'short' | 'neutral', riskRewardRatio: number): Promise<{
    entry: number;
    stop: number;
    target: number;
    riskReward: number;
  }> {
    // Get current price (mock for now)
    const currentPrice = await this.getCurrentPrice(symbol);
    
    if (direction === 'long') {
      const stop = currentPrice * 0.95; // 5% stop loss
      const risk = currentPrice - stop;
      const target = currentPrice + (risk * riskRewardRatio);
      
      return {
        entry: currentPrice,
        stop,
        target,
        riskReward: riskRewardRatio,
      };
    } else if (direction === 'short') {
      const stop = currentPrice * 1.05; // 5% stop loss
      const risk = stop - currentPrice;
      const target = currentPrice - (risk * riskRewardRatio);
      
      return {
        entry: currentPrice,
        stop,
        target,
        riskReward: riskRewardRatio,
      };
    } else {
      return {
        entry: currentPrice,
        stop: currentPrice * 0.95,
        target: currentPrice * 1.05,
        riskReward: 1.0,
      };
    }
  }

  private generateEvidence(signals: Signal[]): Evidence[] {
    const evidence: Evidence[] = [];
    
    for (const signal of signals) {
      const evidenceItem: Evidence = {
        type: signal.category as Evidence['type'],
        description: signal.description,
        value: signal.strength,
        unit: 'strength',
        context: `${signal.source} - ${signal.type}`,
        timestamp: signal.timestamp,
      };
      
      // Add specific data from signal
      if (signal.data) {
        if (typeof signal.data === 'object') {
          const dataKeys = Object.keys(signal.data);
          if (dataKeys.length > 0) {
            const key = dataKeys[0];
            const value = signal.data[key];
            if (typeof value === 'number') {
              evidenceItem.value = value;
              evidenceItem.unit = key;
            }
          }
        }
      }
      
      evidence.push(evidenceItem);
    }
    
    return evidence;
  }

  private generateTitle(signals: Signal[], template: OpportunityTemplate): string {
    const signalTypes = signals.map(s => s.type.replace(/_/g, ' '));
    const uniqueTypes = [...new Set(signalTypes)].slice(0, 2); // Top 2 unique types
    return uniqueTypes.join(' + ');
  }

  private generateThesis(signals: Signal[], template: OpportunityTemplate): string {
    let thesis = template.thesis;
    
    // Customize based on actual signals
    const signalDescriptions = signals.slice(0, 3).map(s => s.description.toLowerCase());
    const context = signalDescriptions.join('. ');
    
    return `${thesis} Current signals: ${context}.`;
  }

  private getTopSignalTypes(signals: Signal[]): string[] {
    const typeCount = new Map<string, number>();
    
    for (const signal of signals) {
      const count = typeCount.get(signal.type) || 0;
      typeCount.set(signal.type, count + 1);
    }
    
    return Array.from(typeCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type]) => type.replace(/_/g, ' '));
  }

  private groupSignalsBySymbol(signals: Signal[]): Map<string, Signal[]> {
    const grouped = new Map<string, Signal[]>();
    
    for (const signal of signals) {
      const existing = grouped.get(signal.symbol) || [];
      existing.push(signal);
      grouped.set(signal.symbol, existing);
    }
    
    return grouped;
  }

  private async getCurrentPrice(symbol: string): Promise<number> {
    // Mock current price - in real implementation, this would fetch from market data
    return 100 + Math.random() * 200;
  }

  private async saveOpportunities(opportunities: Opportunity[]): Promise<void> {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO opportunity_opportunities 
      (id, symbol, title, thesis, confidence, direction, timeframe, signals, evidence, 
       suggested_entry, suggested_stop, suggested_target, risk_reward, status, tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const opp of opportunities) {
      stmt.run(
        opp.id,
        opp.symbol,
        opp.title,
        opp.thesis,
        opp.confidence,
        opp.direction,
        opp.timeframe,
        JSON.stringify(opp.signals),
        JSON.stringify(opp.evidence),
        opp.suggestedEntry,
        opp.suggestedStop,
        opp.suggestedTarget,
        opp.riskReward,
        opp.status,
        JSON.stringify(opp.tags),
        opp.createdAt,
      );
    }
    
    console.log(`[OpportunityEngine] Saved ${opportunities.length} opportunities to database`);
  }

  async getOpportunities(filters?: {
    direction?: 'long' | 'short' | 'neutral';
    confidence?: number;
    timeframe?: 'day' | 'swing' | 'position';
    limit?: number;
    offset?: number;
  }): Promise<Opportunity[]> {
    const db = getDb();
    
    let query = 'SELECT * FROM opportunity_opportunities WHERE 1=1';
    const params: any[] = [];
    
    if (filters?.direction) {
      query += ' AND direction = ?';
      params.push(filters.direction);
    }
    
    if (filters?.confidence) {
      query += ' AND confidence >= ?';
      params.push(filters.confidence);
    }
    
    if (filters?.timeframe) {
      query += ' AND timeframe = ?';
      params.push(filters.timeframe);
    }
    
    query += ' ORDER BY confidence DESC, created_at DESC';
    
    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
      
      if (filters?.offset) {
        query += ' OFFSET ?';
        params.push(filters.offset);
      }
    }
    
    const rows = db.prepare(query).all(...params) as any[];
    
    return rows.map(row => ({
      id: row.id,
      createdAt: row.created_at,
      symbol: row.symbol,
      title: row.title,
      thesis: row.thesis,
      confidence: row.confidence,
      direction: row.direction,
      timeframe: row.timeframe,
      signals: JSON.parse(row.signals || '[]'),
      evidence: JSON.parse(row.evidence || '[]'),
      suggestedEntry: row.suggested_entry,
      suggestedStop: row.suggested_stop,
      suggestedTarget: row.suggested_target,
      riskReward: row.risk_reward,
      status: row.status,
      tags: JSON.parse(row.tags || '[]'),
      outcome: row.outcome ? JSON.parse(row.outcome) : undefined,
      updatedAt: row.updated_at,
    }));
  }

  async getOpportunity(id: string): Promise<Opportunity | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM opportunity_opportunities WHERE id = ?').get(id) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      createdAt: row.created_at,
      symbol: row.symbol,
      title: row.title,
      thesis: row.thesis,
      confidence: row.confidence,
      direction: row.direction,
      timeframe: row.timeframe,
      signals: JSON.parse(row.signals || '[]'),
      evidence: JSON.parse(row.evidence || '[]'),
      suggestedEntry: row.suggested_entry,
      suggestedStop: row.suggested_stop,
      suggestedTarget: row.suggested_target,
      riskReward: row.risk_reward,
      status: row.status,
      tags: JSON.parse(row.tags || '[]'),
      outcome: row.outcome ? JSON.parse(row.outcome) : undefined,
      updatedAt: row.updated_at,
    };
  }

  async updateOpportunityStatus(id: string, status: Opportunity['status'], outcome?: Opportunity['outcome']): Promise<boolean> {
    const db = getDb();
    
    if (outcome) {
      const result = db.prepare(`
        UPDATE opportunity_opportunities 
        SET status = ?, outcome = ?, updated_at = ?
        WHERE id = ?
      `).run(status, JSON.stringify(outcome), new Date().toISOString(), id);
      
      return result.changes > 0;
    } else {
      const result = db.prepare(`
        UPDATE opportunity_opportunities 
        SET status = ?, updated_at = ?
        WHERE id = ?
      `).run(status, new Date().toISOString(), id);
      
      return result.changes > 0;
    }
  }

  // Legacy methods for compatibility
  evaluateConditions(): Opportunity[] {
    // This method is called by the existing routes
    // For now, return empty array - the new system uses generateOpportunities()
    return [];
  }

  getOpportunities_Legacy(limit: number = 20): Opportunity[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM opportunity_opportunities ORDER BY confidence DESC, created_at DESC LIMIT ?')
      .all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      createdAt: row.created_at,
      symbol: row.symbol,
      title: row.title,
      thesis: row.thesis,
      confidence: row.confidence,
      direction: row.direction,
      timeframe: row.timeframe,
      signals: JSON.parse(row.signals || '[]'),
      evidence: JSON.parse(row.evidence || '[]'),
      suggestedEntry: row.suggested_entry,
      suggestedStop: row.suggested_stop,
      suggestedTarget: row.suggested_target,
      riskReward: row.risk_reward,
      status: row.status,
      tags: JSON.parse(row.tags || '[]'),
      outcome: row.outcome ? JSON.parse(row.outcome) : undefined,
      updatedAt: row.updated_at,
    }));
  }

  saveOpportunity(opp: Opportunity): void {
    this.saveOpportunities([opp]);
  }
}

export const opportunityEngine = new OpportunityEngine();

// Maintain legacy exports for existing code
export const evaluateConditions = () => opportunityEngine.evaluateConditions();
export const getOpportunities = (limit?: number) => opportunityEngine.getOpportunities_Legacy(limit);
export const saveOpportunity = (opp: Opportunity) => opportunityEngine.saveOpportunity(opp);