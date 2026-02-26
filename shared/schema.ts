import { z } from "zod";

export interface PineInput {
  name: string;
  type: "int" | "float" | "bool" | "string" | "time";
  default: any;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  group?: string;
  groupLabel?: string;
  options?: string[];
  optimizable: boolean;
}

export interface PineParseResult {
  inputs: PineInput[];
  groups: Record<string, string>;
  strategySettings: {
    initialCapital?: number;
    defaultQtyValue?: number;
    commission?: number;
  };
}

export interface OptimizationConfig {
  pineScript: string;
  parsedInputs: PineInput[];
  tickers: string[];
  timeframes: string[];
  startDate: string;
  endDate: string;
  randomSamples: number;
  topK: number;
  refinementsPerSeed: number;
  minTrades: number;
  maxDrawdownCap: number;
  mode: "smoke" | "sweep";
}

export interface TradeRecord {
  entryTime: string;
  exitTime: string;
  direction: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  pnlPercent: number;
  pnlDollar: number;
  exitReason: string;
  barsHeld: number;
}

export interface BacktestResult {
  ticker: string;
  timeframe: string;
  netProfitPercent: number;
  winRatePercent: number;
  maxDrawdownPercent: number;
  profitFactor: number;
  totalTrades: number;
  params: Record<string, any>;
  trades: TradeRecord[];
  equityCurve: { time: string; equity: number }[];
}

export interface JobProgress {
  jobId: string;
  status: "fetching" | "baseline" | "random_search" | "refinement" | "complete" | "error";
  stage: string;
  current: number;
  total: number;
  percent: number;
  bestSoFar?: {
    netProfitPercent: number;
    winRatePercent: number;
    maxDrawdownPercent: number;
    profitFactor: number;
  };
  eta?: number;
  elapsed: number;
  error?: string;
  tickerProgress?: Record<string, {
    status: "pending" | "running" | "complete";
    best?: number;
  }>;
}

export interface OptimizationResult {
  jobId: string;
  configs: BacktestResult[];
  totalConfigsTested: number;
  bestByCombo: Record<string, BacktestResult[]>;
}

export const AVAILABLE_TICKERS = [
  { symbol: "SOL/USDT:USDT", name: "SOL" },
  { symbol: "BTC/USDT:USDT", name: "BTC" },
  { symbol: "ETH/USDT:USDT", name: "ETH" },
  { symbol: "HYPE/USDT:USDT", name: "HYPE" },
  { symbol: "XRP/USDT:USDT", name: "XRP" },
  { symbol: "SUI/USDT:USDT", name: "SUI" },
  { symbol: "ZEC/USDT:USDT", name: "ZEC" },
  { symbol: "PAXG/USDT:USDT", name: "PAXG" },
  { symbol: "JUP/USDT:USDT", name: "JUP" },
  { symbol: "DRIFT/USDT:USDT", name: "DRIFT" },
  { symbol: "DOGE/USDT:USDT", name: "DOGE" },
  { symbol: "TAO/USDT:USDT", name: "TAO" },
] as const;

export const AVAILABLE_TIMEFRAMES = ["5m", "15m", "30m", "1h", "2h", "4h", "12h"] as const;

export const optimizationConfigSchema = z.object({
  pineScript: z.string().min(1),
  parsedInputs: z.array(z.any()),
  tickers: z.array(z.string()).min(1),
  timeframes: z.array(z.string()).min(1),
  startDate: z.string(),
  endDate: z.string(),
  randomSamples: z.number().default(900),
  topK: z.number().default(20),
  refinementsPerSeed: z.number().default(60),
  minTrades: z.number().default(10),
  maxDrawdownCap: z.number().default(85),
  mode: z.enum(["smoke", "sweep"]),
});

export type InsertUser = { username: string; password: string };
export type User = { id: string; username: string; password: string };
