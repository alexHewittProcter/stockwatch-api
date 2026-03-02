import { SentimentScore } from './types';

export class SentimentScorerService {
  // Positive sentiment words
  private readonly positiveWords = new Set([
    'beat', 'beats', 'beating', 'surge', 'surged', 'surging', 'rally', 'rallied',
    'rallying', 'soar', 'soared', 'soaring', 'jump', 'jumped', 'jumping',
    'rise', 'rose', 'rising', 'gain', 'gained', 'gaining', 'gains', 'growth',
    'grow', 'growing', 'grew', 'profit', 'profits', 'profitable', 'earnings',
    'revenue', 'strong', 'stronger', 'strongest', 'outperform', 'outperformed',
    'outperforming', 'exceed', 'exceeded', 'exceeding', 'record', 'records',
    'high', 'higher', 'highest', 'up', 'bullish', 'bull', 'positive',
    'optimistic', 'confidence', 'confident', 'breakthrough', 'success',
    'successful', 'winner', 'winning', 'won', 'victory', 'excellent',
    'outstanding', 'impressive', 'solid', 'robust', 'healthy', 'boom',
    'booming', 'expansion', 'expand', 'expanding', 'launch', 'launched',
    'launching', 'innovation', 'innovative', 'upgrade', 'upgraded',
    'upgrading', 'buy', 'recommend', 'recommended', 'overweight', 'momentum',
    'breakout', 'catalyst', 'catalysts', 'opportunity', 'opportunities',
    'recover', 'recovery', 'recovering', 'rebound', 'rebounded', 'rebounding',
    'turnaround', 'improve', 'improved', 'improving', 'improvement',
    'accelerate', 'accelerated', 'accelerating', 'increase', 'increased',
    'increasing', 'boost', 'boosted', 'boosting', 'strengthen', 'strengthened',
    'strengthening', 'beat', 'top', 'topped', 'topping', 'surprise',
    'surprised', 'surprising', 'upside', 'potential', 'milestone',
  ]);

  // Negative sentiment words
  private readonly negativeWords = new Set([
    'miss', 'missed', 'missing', 'crash', 'crashed', 'crashing', 'plunge',
    'plunged', 'plunging', 'fall', 'fell', 'falling', 'drop', 'dropped',
    'dropping', 'decline', 'declined', 'declining', 'sink', 'sank', 'sinking',
    'tumble', 'tumbled', 'tumbling', 'slump', 'slumped', 'slumping',
    'collapse', 'collapsed', 'collapsing', 'tank', 'tanked', 'tanking',
    'loss', 'losses', 'lose', 'losing', 'lost', 'deficit', 'debt', 'debts',
    'bankruptcy', 'bankrupt', 'insolvent', 'insolvency', 'default',
    'defaulted', 'defaulting', 'fail', 'failed', 'failing', 'failure',
    'weak', 'weaker', 'weakest', 'poor', 'worse', 'worst', 'bad', 'terrible',
    'awful', 'horrible', 'disaster', 'disastrous', 'crisis', 'concern',
    'concerns', 'concerned', 'worry', 'worried', 'worries', 'risk', 'risks',
    'risky', 'danger', 'dangerous', 'threat', 'threaten', 'threatened',
    'threatening', 'warning', 'warn', 'warned', 'warning', 'alert', 'alarming',
    'bearish', 'bear', 'negative', 'pessimistic', 'disappointment',
    'disappointing', 'disappointed', 'underperform', 'underperformed',
    'underperforming', 'downgrade', 'downgraded', 'downgrading', 'sell',
    'selling', 'sold', 'underweight', 'avoid', 'cut', 'cuts', 'cutting',
    'reduce', 'reduced', 'reducing', 'reduction', 'layoff', 'layoffs',
    'fire', 'fired', 'firing', 'terminate', 'terminated', 'terminating',
    'close', 'closed', 'closing', 'closure', 'shutdown', 'shortfall',
    'miss', 'disappoint', 'struggle', 'struggled', 'struggling', 'challenge',
    'challenges', 'challenging', 'difficult', 'difficulty', 'problem',
    'problems', 'issue', 'issues', 'volatility', 'volatile', 'uncertainty',
    'uncertain', 'investigation', 'probe', 'lawsuit', 'litigation', 'fraud',
    'scandal', 'controversy', 'controversial',
  ]);

  // Intensifiers that amplify sentiment
  private readonly intensifiers = new Set([
    'significantly', 'massively', 'dramatically', 'substantially', 'considerably',
    'extremely', 'severely', 'heavily', 'sharply', 'rapidly', 'quickly',
    'suddenly', 'unexpectedly', 'surprisingly', 'remarkably', 'notably',
    'particularly', 'especially', 'highly', 'deeply', 'strongly', 'greatly',
    'much', 'far', 'way', 'well', 'very', 'really', 'quite', 'rather',
    'pretty', 'fairly', 'somewhat', 'slightly', 'moderately',
  ]);

  // Negators that reverse sentiment
  private readonly negators = new Set([
    'not', 'no', 'never', 'none', 'nothing', 'nobody', 'nowhere', 'neither',
    'nor', 'barely', 'hardly', 'scarcely', 'seldom', 'rarely', 'without',
    'lack', 'lacks', 'lacking', 'absence', 'absent', 'fail', 'unable',
    'cannot', 'can\'t', 'won\'t', 'wouldn\'t', 'shouldn\'t', 'couldn\'t',
    'mustn\'t', 'needn\'t', 'daren\'t', 'shan\'t', 'isn\'t', 'aren\'t',
    'wasn\'t', 'weren\'t', 'hasn\'t', 'haven\'t', 'hadn\'t', 'doesn\'t',
    'don\'t', 'didn\'t', 'despite', 'although', 'though', 'however',
    'but', 'yet', 'still', 'nevertheless', 'nonetheless',
  ]);

  /**
   * Score sentiment of text
   */
  score(text: string): SentimentScore {
    const words = this.tokenize(text.toLowerCase());
    const scores = this.analyzeWords(words);
    
    const totalScore = scores.reduce((sum, score) => sum + score, 0);
    const wordCount = words.length;
    
    // Normalize score
    const normalizedScore = Math.max(-1, Math.min(1, totalScore / Math.sqrt(wordCount)));
    
    // Calculate confidence based on signal strength
    const signalStrength = Math.abs(totalScore);
    const confidence = Math.min(1, signalStrength / (wordCount * 0.1));
    
    // Determine label
    let label: 'bullish' | 'bearish' | 'neutral';
    if (normalizedScore > 0.2) {
      label = 'bullish';
    } else if (normalizedScore < -0.2) {
      label = 'bearish';
    } else {
      label = 'neutral';
    }

    // Calculate breakdown
    const positiveCount = scores.filter(s => s > 0).length;
    const negativeCount = scores.filter(s => s < 0).length;
    const neutralCount = scores.filter(s => s === 0).length;
    const total = positiveCount + negativeCount + neutralCount;

    const breakdown = {
      positive: total > 0 ? positiveCount / total : 0,
      negative: total > 0 ? negativeCount / total : 0,
      neutral: total > 0 ? neutralCount / total : 0,
    };

    return {
      score: Number(normalizedScore.toFixed(3)),
      confidence: Number(confidence.toFixed(3)),
      label,
      breakdown,
    };
  }

  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text
      .replace(/[^\w\s'-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0);
  }

  /**
   * Analyze words and return sentiment scores
   */
  private analyzeWords(words: string[]): number[] {
    const scores: number[] = [];
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let score = this.getWordScore(word);
      
      if (score !== 0) {
        // Check for intensifiers in the 2 words before
        const intensifier = this.findIntensifier(words, i);
        if (intensifier) {
          score *= this.getIntensifierMultiplier(intensifier);
        }
        
        // Check for negators in the 3 words before
        const negator = this.findNegator(words, i);
        if (negator) {
          score *= -0.8; // Reverse and slightly reduce magnitude
        }
      }
      
      scores.push(score);
    }
    
    return scores;
  }

  /**
   * Get base sentiment score for a word
   */
  private getWordScore(word: string): number {
    if (this.positiveWords.has(word)) {
      return 1;
    }
    if (this.negativeWords.has(word)) {
      return -1;
    }
    return 0;
  }

  /**
   * Find intensifier in previous words
   */
  private findIntensifier(words: string[], currentIndex: number): string | null {
    for (let i = Math.max(0, currentIndex - 2); i < currentIndex; i++) {
      if (this.intensifiers.has(words[i])) {
        return words[i];
      }
    }
    return null;
  }

  /**
   * Find negator in previous words
   */
  private findNegator(words: string[], currentIndex: number): string | null {
    for (let i = Math.max(0, currentIndex - 3); i < currentIndex; i++) {
      if (this.negators.has(words[i])) {
        return words[i];
      }
    }
    return null;
  }

  /**
   * Get multiplier for intensifier
   */
  private getIntensifierMultiplier(intensifier: string): number {
    const strongIntensifiers = new Set([
      'extremely', 'massively', 'dramatically', 'significantly', 'severely',
      'heavily', 'substantially', 'considerably',
    ]);
    
    const moderateIntensifiers = new Set([
      'very', 'really', 'quite', 'highly', 'strongly', 'greatly',
      'sharply', 'rapidly', 'quickly', 'suddenly',
    ]);

    if (strongIntensifiers.has(intensifier)) {
      return 1.5;
    }
    if (moderateIntensifiers.has(intensifier)) {
      return 1.3;
    }
    return 1.2; // Default intensifier multiplier
  }

  /**
   * Analyze sentiment trend in a batch of texts
   */
  analyzeBatch(texts: string[]): {
    averageScore: number;
    averageConfidence: number;
    distribution: { bullish: number; bearish: number; neutral: number };
    trend: 'improving' | 'declining' | 'stable';
  } {
    if (texts.length === 0) {
      return {
        averageScore: 0,
        averageConfidence: 0,
        distribution: { bullish: 0, bearish: 0, neutral: 0 },
        trend: 'stable',
      };
    }

    const scores = texts.map(text => this.score(text));
    const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    const avgConfidence = scores.reduce((sum, s) => sum + s.confidence, 0) / scores.length;
    
    const distribution = {
      bullish: scores.filter(s => s.label === 'bullish').length / scores.length,
      bearish: scores.filter(s => s.label === 'bearish').length / scores.length,
      neutral: scores.filter(s => s.label === 'neutral').length / scores.length,
    };

    // Determine trend (compare first half vs second half)
    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (scores.length >= 6) {
      const mid = Math.floor(scores.length / 2);
      const firstHalf = scores.slice(0, mid);
      const secondHalf = scores.slice(mid);
      
      const firstAvg = firstHalf.reduce((sum, s) => sum + s.score, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, s) => sum + s.score, 0) / secondHalf.length;
      
      const diff = secondAvg - firstAvg;
      if (diff > 0.1) {
        trend = 'improving';
      } else if (diff < -0.1) {
        trend = 'declining';
      }
    }

    return {
      averageScore: Number(avgScore.toFixed(3)),
      averageConfidence: Number(avgConfidence.toFixed(3)),
      distribution,
      trend,
    };
  }

  /**
   * Get sentiment for specific ticker mentions in text
   */
  getTickerSentiment(text: string, ticker: string): SentimentScore {
    const tickerRegex = new RegExp(`\\b${ticker}\\b`, 'gi');
    const matches = [];
    let match;

    while ((match = tickerRegex.exec(text)) !== null) {
      const start = Math.max(0, match.index - 100);
      const end = Math.min(text.length, match.index + ticker.length + 100);
      const context = text.substring(start, end);
      matches.push(context);
    }

    if (matches.length === 0) {
      return this.score(text); // Fallback to full text
    }

    // Analyze context around ticker mentions
    const contextText = matches.join(' ');
    return this.score(contextText);
  }
}

export const sentimentScorer = new SentimentScorerService();