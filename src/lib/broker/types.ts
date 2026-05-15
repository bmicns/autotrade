export type BrokerId = "kis" | "samsung" | "kiwoom" | "nh" | "kb" | "mirae" | "ls";

export type BrokerConnectionMode = "planned" | "paper" | "live";

export interface BrokerCredentialFields {
  apiKey: string;
  apiSecret: string;
  accountNo: string;
  accountProductCode: string;
  clientId: string;
  userId: string;
}

export interface BrokerDirectoryEntry {
  brokerId: BrokerId;
  enabled: boolean;
  connectionMode: BrokerConnectionMode;
  credentials: BrokerCredentialFields;
  memo: string;
  updatedAt: string | null;
}

export interface BrokerStockPrice {
  code: string;
  name: string;
  market: string;
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  high: number;
  low: number;
  open: number;
}

export interface BrokerBalanceHolding {
  code: string;
  name: string;
  market: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlRate: number;
}

export interface BrokerBalanceResult {
  holdings: BrokerBalanceHolding[];
  totalEval: number;
  totalPnl: number;
  totalPnlRate: number;
  cashBalance: number;
}
