import { getDb } from '../../db/schema';
import { ResearchReport } from '../../types/ai';
import { Opportunity } from '../../types/opportunity';
import { v4 } from '../opportunities/uuid';

/**
 * Research Report Generator
 * 
 * Auto-generates comprehensive research reports for high-confidence opportunities
 * or manually triggered analysis of any symbol.
 */

export class ReportGeneratorService {
  
  /**
   * Generate a research report for a symbol
   */
  async generateReport(symbol: string, options: {
    opportunityId?: string;
    direction?: 'long' | 'short';
    context?: string;
  } = {}): Promise<ResearchReport> {
    console.log(`[Reports] Generating research report for ${symbol}`);
    
    // Collect all available data
    const marketData = await this.collectMarketData(symbol);
    const holderData = await this.collectHolderData(symbol);
    const optionsData = await this.collectOptionsData(symbol);
    const newsData = await this.collectNewsData(symbol);
    const technicalData = await this.calculateTechnicals(symbol);
    
    // Generate report sections
    const report: ResearchReport = {
      id: v4(),
      symbol,
      title: await this.generateTitle(symbol, marketData, options.direction),
      createdAt: new Date().toISOString(),
      opportunityId: options.opportunityId,
      
      executiveSummary: await this.generateExecutiveSummary(symbol, marketData, newsData, options.direction),
      
      thesis: {
        direction: options.direction || this.determineDirection(marketData, technicalData, newsData),
        timeframe: this.determineTimeframe(technicalData, optionsData),
        rationale: await this.generateRationale(symbol, marketData, holderData, optionsData, newsData, technicalData),
      },
      
      priceAnalysis: {
        currentPrice: marketData.currentPrice,
        support: this.calculateSupportLevels(marketData),
        resistance: this.calculateResistanceLevels(marketData),
        trend: this.determineTrend(marketData),
        technicals: {
          rsi: technicalData.rsi,
          macd: technicalData.macd,
          movingAverages: technicalData.movingAverages,
        },
      },
      
      holderAnalysis: holderData ? {
        recentInsiderActivity: await this.analyzeInsiderActivity(holderData),
        institutionalChanges: await this.analyzeInstitutionalChanges(holderData),
        smartMoneySignals: await this.analyzeSmartMoneySignals(holderData),
      } : undefined,
      
      optionsAnalysis: optionsData ? {
        ivRank: optionsData.ivRank,
        unusualActivity: await this.analyzeUnusualActivity(optionsData),
        putCallRatio: await this.analyzePutCallRatio(optionsData),
        suggestedStrategy: await this.suggestOptionsStrategy(optionsData, options.direction),
      } : undefined,
      
      newsAnalysis: {
        sentiment: newsData.averageSentiment,
        sentimentTrend: this.analyzeSentimentTrend(newsData),
        keyArticles: newsData.keyArticles.slice(0, 3),
        socialBuzz: await this.analyzeSocialBuzz(newsData),
      },
      
      riskAnalysis: {
        risks: await this.identifyRisks(symbol, marketData, optionsData, newsData),
        catalysts: await this.identifyCatalysts(symbol, newsData, optionsData),
        maxLoss: this.calculateMaxLoss(marketData, options.direction),
      },
      
      recommendation: await this.generateRecommendation(symbol, marketData, technicalData, optionsData, options.direction),
      
      historicalComparison: await this.findHistoricalComparison(symbol, marketData, technicalData),
      
      tags: this.generateTags(marketData, holderData, optionsData, newsData),
      status: 'published',
      outcome: 'pending',
    };
    
    // Save to database
    await this.saveReport(report);
    
    console.log(`[Reports] Generated report: ${report.title}`);
    return report;
  }
  
  private async collectMarketData(symbol: string): Promise<any> {
    // Mock market data collection
    const basePrice = 100 + Math.random() * 200;
    
    return {
      symbol,
      currentPrice: basePrice,
      previousClose: basePrice * (0.98 + Math.random() * 0.04),
      dayHigh: basePrice * (1 + Math.random() * 0.03),
      dayLow: basePrice * (1 - Math.random() * 0.03),
      volume: Math.floor(1000000 + Math.random() * 5000000),
      avgVolume: Math.floor(800000 + Math.random() * 2000000),
      marketCap: Math.floor(1000000000 + Math.random() * 50000000000),
      peRatio: 15 + Math.random() * 20,
      week52High: basePrice * (1.1 + Math.random() * 0.4),
      week52Low: basePrice * (0.6 + Math.random() * 0.3),
    };
  }
  
  private async collectHolderData(symbol: string): Promise<any> {
    const db = getDb();
    
    // Get recent insider transactions
    const insiderTransactions = db.prepare(`
      SELECT * FROM insider_transactions 
      WHERE symbol = ? AND transaction_date >= date('now', '-30 days')
      ORDER BY transaction_date DESC
    `).all(symbol) as any[];
    
    // Get institutional changes
    const institutionalChanges = db.prepare(`
      SELECT * FROM holder_changes
      WHERE symbol = ? AND quarter = (SELECT MAX(quarter) FROM holder_changes)
    `).all(symbol) as any[];
    
    if (insiderTransactions.length === 0 && institutionalChanges.length === 0) {
      return null;
    }
    
    return {
      insiderTransactions,
      institutionalChanges,
    };
  }
  
  private async collectOptionsData(symbol: string): Promise<any> {
    const db = getDb();
    
    // Get IV history
    const ivHistory = db.prepare(`
      SELECT * FROM iv_history 
      WHERE symbol = ? 
      ORDER BY date DESC 
      LIMIT 30
    `).all(symbol) as any[];
    
    // Get P/C ratio
    const pcrHistory = db.prepare(`
      SELECT * FROM pcr_history 
      WHERE symbol = ? 
      ORDER BY date DESC 
      LIMIT 30
    `).all(symbol) as any[];
    
    // Get unusual activity
    const unusualActivity = db.prepare(`
      SELECT * FROM unusual_activity 
      WHERE symbol = ? AND detected_at >= datetime('now', '-7 days')
      ORDER BY score DESC
    `).all(symbol) as any[];
    
    if (ivHistory.length === 0 && pcrHistory.length === 0 && unusualActivity.length === 0) {
      return null;
    }
    
    const currentIv = ivHistory[0]?.iv || (25 + Math.random() * 50);
    const ivRank = this.calculateIvRank(currentIv, ivHistory);
    
    return {
      ivRank,
      currentIv,
      ivHistory,
      pcrHistory,
      unusualActivity,
    };
  }
  
  private calculateIvRank(currentIv: number, history: any[]): number {
    if (history.length < 5) return 50; // Default to 50th percentile
    
    const ivValues = history.map(h => h.iv).sort((a: number, b: number) => a - b);
    const rank = ivValues.filter((iv: number) => iv <= currentIv).length / ivValues.length;
    return Math.round(rank * 100);
  }
  
  private async collectNewsData(symbol: string): Promise<any> {
    const db = getDb();
    
    // Get recent news articles
    const articles = db.prepare(`
      SELECT * FROM news_articles
      WHERE json_extract(tickers, '$') LIKE '%${symbol}%'
        AND published_at >= datetime('now', '-7 days')
      ORDER BY published_at DESC
      LIMIT 20
    `).all() as any[];
    
    const keyArticles = articles.map((article: any) => ({
      title: article.title,
      source: article.source_name,
      sentiment: article.sentiment_label,
    }));
    
    const averageSentiment = articles.length > 0 
      ? articles.reduce((sum: number, a: any) => sum + a.sentiment_score, 0) / articles.length
      : 0;
    
    // Get social mentions
    const socialMentions = db.prepare(`
      SELECT * FROM social_mentions
      WHERE ticker = ? AND hour_bucket >= datetime('now', '-24 hours')
      ORDER BY hour_bucket DESC
    `).all(symbol) as any[];
    
    return {
      keyArticles,
      averageSentiment,
      articlesCount: articles.length,
      socialMentions,
    };
  }
  
  private async calculateTechnicals(symbol: string): Promise<any> {
    // Mock technical analysis
    const rsi = 30 + Math.random() * 40;
    const macdSignal = Math.random() > 0.5 ? 'bullish' : 'bearish';
    
    return {
      rsi,
      macd: `${macdSignal} crossover`,
      movingAverages: Math.random() > 0.5 ? 'Price above 20 & 50 MA' : 'Price below key MAs',
    };
  }
  
  private async generateTitle(symbol: string, marketData: any, direction?: string): Promise<string> {
    const directionText = direction === 'long' ? 'Bullish' : direction === 'short' ? 'Bearish' : 'Neutral';
    const priceChange = ((marketData.currentPrice - marketData.previousClose) / marketData.previousClose) * 100;
    
    if (Math.abs(priceChange) > 3) {
      return `${symbol}: ${directionText} Momentum — ${Math.abs(priceChange).toFixed(1)}% ${priceChange > 0 ? 'Surge' : 'Drop'}`;
    }
    
    return `${symbol}: ${directionText} Setup — Multi-Signal Convergence`;
  }
  
  private async generateExecutiveSummary(symbol: string, marketData: any, newsData: any, direction?: string): Promise<string> {
    const directionText = direction === 'long' ? 'bullish' : direction === 'short' ? 'bearish' : 'mixed';
    const sentimentText = newsData.averageSentiment > 0.2 ? 'positive' : newsData.averageSentiment < -0.2 ? 'negative' : 'neutral';
    
    return `${symbol} presents a ${directionText} opportunity with ${sentimentText} sentiment momentum. ` +
           `Trading at $${marketData.currentPrice.toFixed(2)}, the stock shows convergence of multiple signals. ` +
           `Technical setup supported by ${newsData.articlesCount} recent articles and elevated social interest. ` +
           `Risk/reward profile favors ${direction || 'tactical'} positioning with defined exit strategy.`;
  }
  
  private determineDirection(marketData: any, technicalData: any, newsData: any): 'long' | 'short' {
    let score = 0;
    
    // Price momentum
    if (marketData.currentPrice > marketData.previousClose) score += 1;
    else score -= 1;
    
    // Technical indicators
    if (technicalData.rsi < 30) score += 1; // Oversold
    if (technicalData.rsi > 70) score -= 1; // Overbought
    if (technicalData.macd.includes('bullish')) score += 1;
    if (technicalData.macd.includes('bearish')) score -= 1;
    
    // Sentiment
    if (newsData.averageSentiment > 0.2) score += 1;
    if (newsData.averageSentiment < -0.2) score -= 1;
    
    return score >= 0 ? 'long' : 'short';
  }
  
  private determineTimeframe(technicalData: any, optionsData: any): string {
    // Simple logic for timeframe determination
    if (optionsData && optionsData.ivRank > 80) {
      return 'Short-term (1-3 days)'; // High IV suggests quick moves
    }
    
    if (technicalData.rsi < 20 || technicalData.rsi > 80) {
      return 'Short-term (1-5 days)'; // Extreme RSI suggests quick reversal
    }
    
    return 'Medium-term (1-3 weeks)';
  }
  
  private async generateRationale(symbol: string, marketData: any, holderData: any, optionsData: any, newsData: any, technicalData: any): Promise<string> {
    const points = [];
    
    // Technical rationale
    if (technicalData.rsi < 35) {
      points.push(`oversold technical condition (RSI ${technicalData.rsi.toFixed(0)})`);
    }
    if (technicalData.macd.includes('bullish')) {
      points.push('bullish MACD crossover');
    }
    
    // Fundamental rationale
    if (newsData.averageSentiment > 0.2) {
      points.push('positive news sentiment momentum');
    }
    
    // Options rationale
    if (optionsData && optionsData.unusualActivity.length > 0) {
      points.push('unusual options activity detected');
    }
    
    // Holder rationale
    if (holderData && holderData.insiderTransactions.some((t: any) => t.transaction_type === 'Purchase')) {
      points.push('recent insider buying activity');
    }
    
    if (points.length === 0) {
      return 'Multiple technical and fundamental factors align to create this trading opportunity.';
    }
    
    return `The investment thesis is based on ${points.slice(0, 3).join(', ')}${points.length > 3 ? ' and other supporting factors' : ''}.`;
  }
  
  private calculateSupportLevels(marketData: any): number[] {
    const current = marketData.currentPrice;
    return [
      current * 0.95,
      current * 0.90,
      marketData.week52Low * 1.05,
    ].sort((a, b) => b - a).slice(0, 3);
  }
  
  private calculateResistanceLevels(marketData: any): number[] {
    const current = marketData.currentPrice;
    return [
      current * 1.05,
      current * 1.10,
      marketData.week52High * 0.95,
    ].sort((a, b) => a - b).slice(0, 3);
  }
  
  private determineTrend(marketData: any): 'uptrend' | 'downtrend' | 'sideways' {
    const priceChange = (marketData.currentPrice - marketData.previousClose) / marketData.previousClose;
    
    if (priceChange > 0.02) return 'uptrend';
    if (priceChange < -0.02) return 'downtrend';
    return 'sideways';
  }
  
  private async analyzeInsiderActivity(holderData: any): Promise<string> {
    const purchases = holderData.insiderTransactions.filter((t: any) => t.transaction_type === 'Purchase');
    const sales = holderData.insiderTransactions.filter((t: any) => t.transaction_type === 'Sale');
    
    if (purchases.length === 0 && sales.length === 0) {
      return 'No significant insider activity in the past 30 days.';
    }
    
    if (purchases.length > sales.length) {
      const totalValue = purchases.reduce((sum: number, p: any) => sum + p.value, 0);
      return `${purchases.length} insider purchases totaling $${(totalValue / 1000000).toFixed(1)}M in past 30 days suggests management confidence.`;
    }
    
    return `Mixed insider activity with ${purchases.length} purchases and ${sales.length} sales in past 30 days.`;
  }
  
  private async analyzeInstitutionalChanges(holderData: any): Promise<string> {
    const increases = holderData.institutionalChanges.filter((c: any) => c.action === 'increased');
    const decreases = holderData.institutionalChanges.filter((c: any) => c.action === 'decreased');
    
    if (increases.length > decreases.length) {
      return `${increases.length} institutions increased positions vs ${decreases.length} decreased, showing net institutional buying.`;
    }
    
    return `Institutional activity mixed with ${increases.length} increases and ${decreases.length} decreases.`;
  }
  
  private async analyzeSmartMoneySignals(holderData: any): Promise<string> {
    // Simple analysis of smart money activity
    const smartMoneyBuyers = holderData.institutionalChanges
      .filter((c: any) => c.action === 'increased' && c.value_change > 10000000) // >$10M
      .length;
    
    if (smartMoneyBuyers > 0) {
      return `${smartMoneyBuyers} large institutional buyers (>$10M positions) detected.`;
    }
    
    return 'No significant smart money accumulation detected.';
  }
  
  private async analyzeUnusualActivity(optionsData: any): Promise<string> {
    if (optionsData.unusualActivity.length === 0) {
      return 'No unusual options activity detected in past 7 days.';
    }
    
    const totalScore = optionsData.unusualActivity.reduce((sum: number, a: any) => sum + a.score, 0);
    const avgScore = totalScore / optionsData.unusualActivity.length;
    
    return `${optionsData.unusualActivity.length} unusual options events detected (avg score: ${avgScore.toFixed(0)}).`;
  }
  
  private async analyzePutCallRatio(optionsData: any): Promise<string> {
    if (optionsData.pcrHistory.length === 0) {
      return 'Put/call ratio data not available.';
    }
    
    const latestPcr = optionsData.pcrHistory[0].ratio;
    
    if (latestPcr > 1.5) {
      return `High put/call ratio (${latestPcr.toFixed(2)}) suggests bearish sentiment, potential contrarian opportunity.`;
    } else if (latestPcr < 0.5) {
      return `Low put/call ratio (${latestPcr.toFixed(2)}) suggests bullish sentiment, momentum may continue.`;
    }
    
    return `Balanced put/call ratio (${latestPcr.toFixed(2)}) indicates neutral options sentiment.`;
  }
  
  private async suggestOptionsStrategy(optionsData: any, direction?: string): Promise<string> {
    if (!optionsData) return 'Options data not available for strategy recommendation.';
    
    const ivRank = optionsData.ivRank;
    
    if (direction === 'long') {
      if (ivRank < 30) {
        return 'Bull call spread - Buy calls while IV is relatively low';
      } else {
        return 'Cash-secured puts - Sell puts to get long at lower price, high IV benefits seller';
      }
    } else if (direction === 'short') {
      if (ivRank > 70) {
        return 'Bear put spread - High IV makes selling spreads attractive';
      } else {
        return 'Long puts - Direct bearish bet while IV is reasonable';
      }
    }
    
    return 'Consider iron condor - Neutral strategy to benefit from high IV';
  }
  
  private analyzeSentimentTrend(newsData: any): string {
    if (newsData.keyArticles.length < 3) {
      return 'Insufficient data for trend analysis';
    }
    
    const recentSentiment = newsData.keyArticles.slice(0, 3)
      .reduce((sum: number, a: any) => sum + (a.sentiment === 'bullish' ? 1 : a.sentiment === 'bearish' ? -1 : 0), 0);
    
    if (recentSentiment >= 2) return 'Improving - recent articles increasingly positive';
    if (recentSentiment <= -2) return 'Deteriorating - recent articles increasingly negative';
    return 'Stable - mixed recent coverage';
  }
  
  private async analyzeSocialBuzz(newsData: any): Promise<string> {
    const totalMentions = newsData.socialMentions.reduce((sum: number, m: any) => sum + m.mentions, 0);
    
    if (totalMentions > 500) {
      return `High social activity with ${totalMentions} mentions in past 24h indicates strong retail interest.`;
    } else if (totalMentions > 100) {
      return `Moderate social buzz with ${totalMentions} mentions suggests growing attention.`;
    }
    
    return 'Limited social media discussion - institutional play rather than retail momentum.';
  }
  
  private async identifyRisks(symbol: string, marketData: any, optionsData: any, newsData: any): Promise<string[]> {
    const risks = [];
    
    // Volatility risk
    if (optionsData && optionsData.ivRank > 80) {
      risks.push('High implied volatility - volatility crush risk after events');
    }
    
    // Liquidity risk
    if (marketData.volume < marketData.avgVolume * 0.5) {
      risks.push('Below-average volume may limit liquidity');
    }
    
    // News risk
    if (newsData.articlesCount > 10) {
      risks.push('High news flow increases event risk and volatility');
    }
    
    // Technical risk
    if (marketData.currentPrice > marketData.week52High * 0.95) {
      risks.push('Trading near 52-week highs - limited upside room');
    }
    
    // Market risk
    risks.push('General market conditions could override individual stock dynamics');
    
    return risks.slice(0, 4); // Limit to top 4 risks
  }
  
  private async identifyCatalysts(symbol: string, newsData: any, optionsData: any): Promise<string[]> {
    const catalysts = [];
    
    // News catalysts
    if (newsData.averageSentiment > 0.3) {
      catalysts.push('Strong positive news sentiment could drive continued momentum');
    }
    
    // Options catalysts
    if (optionsData && optionsData.unusualActivity.length > 0) {
      catalysts.push('Unusual options activity suggests informed positioning');
    }
    
    // Volume catalysts
    catalysts.push('Increased volume could signal institutional accumulation');
    
    // Generic catalysts
    catalysts.push('Earnings announcement or guidance update');
    catalysts.push('Sector rotation or market-wide momentum');
    
    return catalysts.slice(0, 3);
  }
  
  private calculateMaxLoss(marketData: any, direction?: string): string {
    if (direction === 'short') {
      return 'Unlimited (short position) - use stop loss above resistance';
    }
    
    // For long positions, assume 5% stop loss
    const stopLoss = marketData.currentPrice * 0.95;
    const maxLossPercent = ((marketData.currentPrice - stopLoss) / marketData.currentPrice) * 100;
    
    return `${maxLossPercent.toFixed(1)}% if stop loss triggered at $${stopLoss.toFixed(2)}`;
  }
  
  private async generateRecommendation(symbol: string, marketData: any, technicalData: any, optionsData: any, direction?: string): Promise<any> {
    const currentPrice = marketData.currentPrice;
    const isLong = direction !== 'short';
    
    const entry = currentPrice;
    const stopLoss = isLong ? currentPrice * 0.95 : currentPrice * 1.05;
    const target = isLong ? currentPrice * 1.10 : currentPrice * 0.90;
    const riskReward = Math.abs(target - entry) / Math.abs(entry - stopLoss);
    
    // Calculate confidence based on multiple factors
    let confidence = 50;
    if (technicalData.rsi < 30 || technicalData.rsi > 70) confidence += 10;
    if (technicalData.macd.includes('bullish') && isLong) confidence += 10;
    if (optionsData && optionsData.unusualActivity.length > 0) confidence += 15;
    confidence = Math.min(confidence, 85); // Cap at 85%
    
    return {
      action: isLong ? 'Buy' : 'Sell Short',
      entry: entry,
      stopLoss: stopLoss,
      target: target,
      riskReward: riskReward,
      positionSize: '2-3% of portfolio',
      confidence: confidence,
    };
  }
  
  private async findHistoricalComparison(symbol: string, marketData: any, technicalData: any): Promise<any> {
    // Mock historical comparison
    return {
      similarSetups: Math.floor(5 + Math.random() * 15),
      winRate: 0.6 + Math.random() * 0.2,
      averageReturn: 5 + Math.random() * 10,
      patternId: Math.random() > 0.7 ? v4() : undefined,
    };
  }
  
  private generateTags(marketData: any, holderData: any, optionsData: any, newsData: any): string[] {
    const tags = [];
    
    if (holderData && holderData.insiderTransactions.some((t: any) => t.transaction_type === 'Purchase')) {
      tags.push('insider-buying');
    }
    
    if (optionsData && optionsData.unusualActivity.length > 0) {
      tags.push('unusual-options');
    }
    
    if (newsData.averageSentiment > 0.3) {
      tags.push('positive-sentiment');
    } else if (newsData.averageSentiment < -0.3) {
      tags.push('negative-sentiment');
    }
    
    if (marketData.volume > marketData.avgVolume * 2) {
      tags.push('volume-spike');
    }
    
    if (marketData.currentPrice > marketData.week52High * 0.9) {
      tags.push('near-highs');
    } else if (marketData.currentPrice < marketData.week52Low * 1.1) {
      tags.push('near-lows');
    }
    
    return tags;
  }
  
  private async saveReport(report: ResearchReport): Promise<void> {
    const db = getDb();
    
    db.prepare(`
      INSERT INTO research_reports
      (id, symbol, title, opportunity_id, executive_summary, thesis, price_analysis,
       holder_analysis, options_analysis, news_analysis, risk_analysis, recommendation,
       historical_comparison, tags, status, outcome, outcome_notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      report.id,
      report.symbol,
      report.title,
      report.opportunityId,
      report.executiveSummary,
      JSON.stringify(report.thesis),
      JSON.stringify(report.priceAnalysis),
      report.holderAnalysis ? JSON.stringify(report.holderAnalysis) : null,
      report.optionsAnalysis ? JSON.stringify(report.optionsAnalysis) : null,
      JSON.stringify(report.newsAnalysis),
      JSON.stringify(report.riskAnalysis),
      JSON.stringify(report.recommendation),
      report.historicalComparison ? JSON.stringify(report.historicalComparison) : null,
      JSON.stringify(report.tags),
      report.status,
      report.outcome,
      report.outcomeNotes,
      report.createdAt,
      report.updatedAt
    );
  }
  
  async getReports(filters: {
    symbol?: string;
    status?: string;
    outcome?: string;
    minConfidence?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<ResearchReport[]> {
    const db = getDb();
    
    let query = 'SELECT * FROM research_reports WHERE 1=1';
    const params: any[] = [];
    
    if (filters.symbol) {
      query += ' AND symbol = ?';
      params.push(filters.symbol);
    }
    
    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    
    if (filters.outcome) {
      query += ' AND outcome = ?';
      params.push(filters.outcome);
    }
    
    query += ' ORDER BY created_at DESC';
    
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
      
      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(filters.offset);
      }
    }
    
    const rows = db.prepare(query).all(...params) as any[];
    
    return rows.map(this.mapRowToReport);
  }
  
  async getReport(id: string): Promise<ResearchReport | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM research_reports WHERE id = ?').get(id) as any;
    
    if (!row) return null;
    
    return this.mapRowToReport(row);
  }
  
  private mapRowToReport(row: any): ResearchReport {
    return {
      id: row.id,
      symbol: row.symbol,
      title: row.title,
      createdAt: row.created_at,
      opportunityId: row.opportunity_id,
      executiveSummary: row.executive_summary,
      thesis: JSON.parse(row.thesis || '{}'),
      priceAnalysis: JSON.parse(row.price_analysis || '{}'),
      holderAnalysis: row.holder_analysis ? JSON.parse(row.holder_analysis) : undefined,
      optionsAnalysis: row.options_analysis ? JSON.parse(row.options_analysis) : undefined,
      newsAnalysis: JSON.parse(row.news_analysis || '{}'),
      riskAnalysis: JSON.parse(row.risk_analysis || '{}'),
      recommendation: JSON.parse(row.recommendation || '{}'),
      historicalComparison: row.historical_comparison ? JSON.parse(row.historical_comparison) : undefined,
      tags: JSON.parse(row.tags || '[]'),
      status: row.status,
      outcome: row.outcome,
      outcomeNotes: row.outcome_notes,
      updatedAt: row.updated_at,
    };
  }
  
  async updateReportOutcome(id: string, outcome: 'won' | 'lost', notes?: string): Promise<boolean> {
    const db = getDb();
    
    const result = db.prepare(`
      UPDATE research_reports 
      SET outcome = ?, outcome_notes = ?, updated_at = ?
      WHERE id = ?
    `).run(outcome, notes, new Date().toISOString(), id);
    
    return result.changes > 0;
  }
}

export const reportGeneratorService = new ReportGeneratorService();