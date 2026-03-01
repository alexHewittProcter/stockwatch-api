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

export interface TrackedHolder {
  id: string;
  name: string;
  type: 'institution' | 'insider';
  trackedSince: string;
}

export interface InstitutionHolding {
  symbol: string;
  shares: number;
  value: number;
  percentOfPortfolio: number;
  changeShares: number;
  changePercent: number;
}
