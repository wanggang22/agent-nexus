import Anthropic from "@anthropic-ai/sdk";
import { env, runOnchainos } from "shared";
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

async function aiAnalyze(data: Record<string, string>, analysisType: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) return "{}";

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: `Crypto analyst. Analyze and return JSON for ${analysisType}.

Data:
${Object.entries(data)
  .filter(([_, v]) => v)
  .map(([k, v]) => `${k}: ${v.slice(0, 500)}`)
  .join("\n\n")}

Return ONLY valid JSON. technical: {trend,support,resistance,rsi_14,volume_trend}. fundamental: {holder_concentration,honeypot,buy_tax,sell_tax,liquidity_usd}. spread: {cex_price,dex_price,spread_pct,arbitrage_viable,est_profit_after_fees}.`,
      },
    ],
  });

  const content = msg.content[0];
  return content.type === "text" ? content.text : "{}";
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
    note: "CEX price from Agent Trade Kit MCP",
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

  let recommendation: "BUY" | "SELL" | "HOLD" | "AVOID" = "HOLD";
  let confidence = 0.5;

  if (fundamental.honeypot) {
    recommendation = "AVOID";
    confidence = 0.95;
  } else if (technical.trend === "bullish" && fundamental.liquidity_usd > 50000) {
    recommendation = "BUY";
    confidence = 0.75;
  } else if (technical.trend === "bearish") {
    recommendation = "SELL";
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
