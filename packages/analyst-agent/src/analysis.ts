import Anthropic from "@anthropic-ai/sdk";
import { env, runOnchainos, safeJsonParse } from "shared";
import type { TechnicalAnalysis, FundamentalAnalysis, SpreadAnalysis, AnalysisReport } from "shared";

function generateId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6);
  return `ana_${date}_${rand}`;
}

function gatherMarketData(tokenAddress: string, chain: string): Record<string, string> {
  return {
    price: runOnchainos(`market price --address ${tokenAddress} --chain ${chain}`),
    kline: runOnchainos(`market kline --address ${tokenAddress} --chain ${chain} --bar 1H --limit 24`),
    tokenInfo: runOnchainos(`token advanced-info --address ${tokenAddress} --chain ${chain}`),
    holders: runOnchainos(`token holders --address ${tokenAddress} --chain ${chain}`),
    liquidity: runOnchainos(`token liquidity --address ${tokenAddress} --chain ${chain}`),
  };
}

function extractJson(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  return text;
}

// ── Optimized prompts for each analysis type ──

const PROMPTS: Record<string, string> = {
  technical: `You are a senior quantitative analyst specializing in on-chain DEX tokens on X Layer (OKX L2).

Your task: Analyze the K-line and price data to produce a short-term technical analysis (1-4 hour horizon).

Analysis methodology:
1. TREND: Look at the last 24 hourly candles. If 3+ consecutive green candles with rising volume → bullish. 3+ red candles with rising volume → bearish. Mixed or low volume → neutral.
2. SUPPORT: Find the lowest price level where the price bounced at least twice in the last 24h.
3. RESISTANCE: Find the highest price level where the price was rejected at least twice.
4. RSI_14: Estimate RSI based on available price movements. >70 = overbought, <30 = oversold, 40-60 = neutral zone.
5. VOLUME_TREND: Compare the last 6h average volume to the previous 18h. >20% higher → increasing, >20% lower → decreasing, otherwise → stable.

Important: For meme tokens and low-cap tokens on X Layer, be extra cautious — high volatility is normal, weight volume signals more heavily than price patterns.

Return ONLY valid JSON:
{"trend":"bullish"|"bearish"|"neutral","support":number,"resistance":number,"rsi_14":number,"volume_trend":"increasing"|"decreasing"|"stable"}`,

  fundamental: `You are a DeFi risk researcher specializing in token safety analysis on X Layer (OKX L2).

Your task: Evaluate the fundamental health and safety of this token.

Analysis methodology:
1. HOLDER_CONCENTRATION: Check top 10 holder percentage.
   - top10 < 30% → "low_risk"
   - top10 30-60% → "medium_risk" (common for new tokens, not necessarily bad)
   - top10 > 60% → "high_risk" (whale dump risk)
2. HONEYPOT: Check riskControlLevel from token info. Level 3 = likely honeypot. Also check if sell tax > 50% or if there's evidence of blocked selling.
3. BUY_TAX / SELL_TAX: Extract from totalFee in token info. If not available, estimate 0.
4. LIQUIDITY_USD: Use marketCapUsd or actual liquidity pool data. Below $50,000 is risky for any meaningful trade size.

Important: On X Layer many tokens are new meme coins — low holder count alone doesn't mean scam. Cross-reference with dev history and liquidity depth.

Return ONLY valid JSON:
{"holder_concentration":"low_risk"|"medium_risk"|"high_risk","honeypot":boolean,"buy_tax":number,"sell_tax":number,"liquidity_usd":number}`,

  spread: `You are a cross-exchange arbitrage specialist analyzing price differences between CEX (centralized) and DEX (decentralized) markets.

Your task: Analyze the DEX price data provided and estimate arbitrage opportunity.

Analysis methodology:
1. DEX_PRICE: Extract the current price from the provided DEX data.
2. CEX_PRICE: If CEX data is available, use it directly. If not, note that the CEX price is unavailable and set to 0.
3. SPREAD_PCT: Calculate (CEX - DEX) / DEX * 100. Positive = DEX is cheaper.
4. ARBITRAGE_VIABLE: Only viable if:
   - Spread > 1% (to cover gas + slippage)
   - Sufficient liquidity on both sides
   - Token is transferable between CEX and DEX
5. EST_PROFIT_AFTER_FEES: Spread minus estimated costs (0.3% DEX fee + 0.1% CEX fee + ~$0.01 gas on X Layer).

Important: Most X Layer native tokens are NOT listed on CEX, so arbitrage is usually not viable. Be honest about this.

Return ONLY valid JSON:
{"cex_price":number,"dex_price":number,"spread_pct":number,"arbitrage_viable":boolean,"est_profit_after_fees":number}`,
};

async function aiAnalyze(data: Record<string, string>, analysisType: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) return "{}";

  const prompt = PROMPTS[analysisType];
  if (!prompt) return "{}";

  const dataSection = Object.entries(data)
    .filter(([_, v]) => v)
    .map(([k, v]) => `[${k}]: ${v.slice(0, 600)}`)
    .join("\n\n");

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `${prompt}\n\n--- ON-CHAIN DATA ---\n${dataSection}\n\nReturn ONLY the JSON object, no other text.`,
      },
    ],
  });

  const content = msg.content[0];
  return content.type === "text" ? extractJson(content.text) : "{}";
}

export async function technicalAnalysis(tokenAddress: string, chain = "xlayer"): Promise<TechnicalAnalysis> {
  const data = gatherMarketData(tokenAddress, chain);
  const hasData = Object.values(data).some((v) => v);

  if (!hasData) {
    return { trend: "neutral", support: 0, resistance: 0, rsi_14: 50, volume_trend: "stable" };
  }

  try {
    const result = await aiAnalyze(data, "technical");
    return JSON.parse(result);
  } catch {
    return { trend: "neutral", support: 0, resistance: 0, rsi_14: 50, volume_trend: "stable" };
  }
}

export async function fundamentalAnalysis(tokenAddress: string, chain = "xlayer"): Promise<FundamentalAnalysis> {
  const data = gatherMarketData(tokenAddress, chain);
  const hasData = Object.values(data).some((v) => v);

  if (!hasData) {
    return { holder_concentration: "medium_risk", honeypot: false, buy_tax: 0, sell_tax: 0, liquidity_usd: 0 };
  }

  try {
    const result = await aiAnalyze(data, "fundamental");
    return JSON.parse(result);
  } catch {
    return { holder_concentration: "medium_risk", honeypot: false, buy_tax: 0, sell_tax: 0, liquidity_usd: 0 };
  }
}

export async function spreadAnalysis(tokenAddress: string, chain = "xlayer"): Promise<SpreadAnalysis> {
  const data: Record<string, string> = {
    dexPrice: runOnchainos(`market price --address ${tokenAddress} --chain ${chain}`),
    tokenInfo: runOnchainos(`token advanced-info --address ${tokenAddress} --chain ${chain}`),
  };

  if (!data.dexPrice) {
    return { cex_price: 0, dex_price: 0, spread_pct: 0, arbitrage_viable: false, est_profit_after_fees: 0 };
  }

  try {
    const result = await aiAnalyze(data, "spread");
    return JSON.parse(result);
  } catch {
    return { cex_price: 0, dex_price: 0, spread_pct: 0, arbitrage_viable: false, est_profit_after_fees: 0 };
  }
}

export async function fullAnalysis(tokenAddress: string, chain = "xlayer"): Promise<AnalysisReport> {
  const [technical, fundamental, spread] = await Promise.all([
    technicalAnalysis(tokenAddress, chain),
    fundamentalAnalysis(tokenAddress, chain),
    spreadAnalysis(tokenAddress, chain),
  ]);

  // AI-informed recommendation logic
  let recommendation: "BUY" | "SELL" | "HOLD" | "AVOID" = "HOLD";
  let confidence = 0.5;

  if (fundamental.honeypot || fundamental.sell_tax > 20) {
    recommendation = "AVOID";
    confidence = 0.95;
  } else if (fundamental.holder_concentration === "high_risk" && fundamental.liquidity_usd < 10000) {
    recommendation = "AVOID";
    confidence = 0.8;
  } else if (technical.trend === "bullish" && fundamental.liquidity_usd > 50000 && fundamental.holder_concentration !== "high_risk") {
    recommendation = "BUY";
    confidence = 0.75;
  } else if (technical.trend === "bullish" && technical.volume_trend === "increasing") {
    recommendation = "BUY";
    confidence = 0.6;
  } else if (technical.trend === "bearish" && technical.volume_trend === "increasing") {
    recommendation = "SELL";
    confidence = 0.75;
  } else if (technical.trend === "bearish") {
    recommendation = "SELL";
    confidence = 0.6;
  } else if (spread.arbitrage_viable && spread.est_profit_after_fees > 0) {
    recommendation = "BUY";
    confidence = 0.7;
  }

  return {
    analysis_id: generateId(),
    token: tokenAddress,
    chain,
    technical,
    fundamental,
    spread,
    recommendation,
    confidence,
    timestamp: new Date().toISOString(),
  };
}
