// === Signal Types ===
export interface Signal {
  signal_id: string;
  type: "smart_money_buy" | "whale_alert" | "meme_new" | "trending";
  token: {
    symbol: string;
    address: string;
    chain: string;
  };
  confidence: number;
  details: Record<string, any>;
  timestamp: string;
}

// === Analysis Types ===
export interface TechnicalAnalysis {
  trend: "bullish" | "bearish" | "neutral";
  support: number;
  resistance: number;
  rsi_14: number;
  volume_trend: "increasing" | "decreasing" | "stable";
}

export interface FundamentalAnalysis {
  holder_concentration: "low_risk" | "medium_risk" | "high_risk";
  honeypot: boolean;
  buy_tax: number;
  sell_tax: number;
  liquidity_usd: number;
}

export interface SpreadAnalysis {
  cex_price: number;
  dex_price: number;
  spread_pct: number;
  arbitrage_viable: boolean;
  est_profit_after_fees: number;
}

export interface AnalysisReport {
  analysis_id: string;
  token: string;
  chain: string;
  technical?: TechnicalAnalysis;
  fundamental?: FundamentalAnalysis;
  spread?: SpreadAnalysis;
  recommendation: "BUY" | "SELL" | "HOLD" | "AVOID";
  confidence: number;
  timestamp: string;
}

// === Risk Types ===
export interface RiskAssessment {
  assessment_id: string;
  token: string;
  chain: string;
  approved: boolean;
  risk_level: "low" | "medium" | "high" | "critical";
  checks: {
    honeypot: { passed: boolean; detail: string };
    tax: { passed: boolean; buy_tax: number; sell_tax: number };
    liquidity: { passed: boolean; usd_value: number };
    holders: { passed: boolean; count: number; concentration: string };
    dev_history: { passed: boolean; detail: string };
    bundle: { passed: boolean; ratio: number };
  };
  max_position_usd: number;
  timestamp: string;
}

// === Trade Types ===
export interface TradeQuote {
  quote_id: string;
  from_token: string;
  to_token: string;
  chain: string;
  amount_in: string;
  expected_out: string;
  min_out: string;
  price_impact: number;
  slippage: string;
  route: string;
  expires_at: string;
}

// === Agent Registry ===
export interface AgentService {
  name: string;
  description: string;
  endpoint: string;
  pricing: ServicePricing[];
}

// Re-export
import type { ServicePricing } from "./x402-config.js";
