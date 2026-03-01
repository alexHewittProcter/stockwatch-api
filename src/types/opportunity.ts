export interface Condition {
  id: string;
  name: string;
  description: string;
  type: 'price' | 'volume' | 'holder' | 'technical' | 'custom';
  parameters: Record<string, unknown>;
  symbols: string[];
  enabled: boolean;
  createdAt: string;
  lastTriggered: string | null;
}

export interface Opportunity {
  id: string;
  title: string;
  description: string;
  symbols: string[];
  conditionId: string | null;
  signals: Signal[];
  score: number;
  createdAt: string;
}

export interface Signal {
  type: string;
  source: string;
  description: string;
  strength: number; // 0-1
  timestamp: string;
}
