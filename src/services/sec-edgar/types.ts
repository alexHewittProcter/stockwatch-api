export interface SECFiling {
  cik: string;
  accessionNumber: string;
  formType: string;
  filingDate: string;
  periodEndDate?: string;
  companyName: string;
  url: string;
}

export interface Holding13F {
  nameOfIssuer: string;
  cusip: string;
  value: number; // in dollars
  sharesOrPrincipalAmount: number;
  investmentDiscretion: string;
  votingAuthority: {
    sole: number;
    shared: number;
    none: number;
  };
}

export interface Filing13F extends SECFiling {
  holdings: Holding13F[];
  totalValue: number;
  entryCount: number;
  reportDate: string;
}

export interface Form4Transaction {
  symbol: string;
  insiderName: string;
  insiderTitle: string;
  transactionCode: string; // P=Purchase, S=Sale, etc.
  transactionShares: number;
  transactionPrice: number;
  sharesOwned: number;
  transactionDate: string;
}

export interface Filing4 extends SECFiling {
  transactions: Form4Transaction[];
  issuerSymbol: string;
}

export interface CIKEntity {
  cik: string;
  entityName: string;
  ticker?: string;
}