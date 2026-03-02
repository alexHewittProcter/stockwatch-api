// Legacy interfaces for Yahoo Finance data
export interface InstitutionalHolder {
  name: string;
  shares: number;
  value: number;
  percentHeld: number;
  changeShares: number;
  changePercent: number;
  filingDate: string;
}

export interface InsiderHolder {
  name: string;
  title: string;
  shares: number;
  lastTransaction: string;
  lastTransactionType: 'buy' | 'sell' | 'exercise';
  lastTransactionShares: number;
  lastTransactionValue: number;
  filingDate: string;
}

export interface HolderData {
  symbol: string;
  institutional: InstitutionalHolder[];
  insider: InsiderHolder[];
  institutionalCount: number;
  institutionalSharesHeld: number;
  insiderSharesHeld: number;
}

// New interfaces for SEC EDGAR enhanced data
export interface HolderResponse {
  symbol: string;
  institutionalOwnership: number;    // % held by institutions
  insiderOwnership: number;          // % held by insiders
  topInstitutional: {
    name: string;
    cik: string | null;
    shares: number;
    value: number;
    pctOfPortfolio: number;
    changeFromPrev: number;          // shares change from last quarter
    changeType: 'increased' | 'decreased' | 'new' | 'unchanged';
    filingDate: string;
  }[];
  topInsider: {
    name: string;
    title: string;
    lastTransaction: 'buy' | 'sell' | 'option';
    shares: number;
    value: number;
    date: string;
  }[];
  topFunds: { 
    name: string; 
    shares: number; 
    value: number; 
  }[];
  recentInsiderTransactions?: any[];
  insiderBuyingSignal?: boolean;
}

export interface InstitutionPortfolio {
  cik: string;
  name: string;
  totalValue: number;
  positionCount: number;
  filingDate: string | null;
  holdings: {
    symbol: string;
    name: string;
    shares: number;
    value: number;
    pctOfPortfolio: number;
    changeFromPrev: number;
    changeType: 'increased' | 'decreased' | 'new' | 'exited' | 'unchanged';
  }[];
  quarterOverQuarter: {
    newPositions: number;
    exitedPositions: number;
    increasedPositions: number;
    decreasedPositions: number;
  };
}

export interface TrackedHolder {
  id: string;
  name: string;
  type: 'institution' | 'insider';
  cik?: string;
  trackedSince: string;
  lastCheck?: string;
}

export interface InstitutionHolding {
  symbol: string;
  shares: number;
  value: number;
  percentOfPortfolio: number;
  changeShares: number;
  changePercent: number;
}
