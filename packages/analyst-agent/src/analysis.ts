import Anthropic from "@anthropic-ai/sdk";
import { env, runOnchainos, safeJsonParse } from "shared";
import type { TechnicalAnalysis, FundamentalAnalysis, SpreadAnalysis, MemeAnalysis, AnalysisReport } from "shared";

function generateId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6);
  return `ana_${date}_${rand}`;
}

// ── Cache: same token + same analysis type within TTL → return cached ──
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, { result: string; expiry: number }>();

function getCached(key: string): string | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiry) return entry.result;
  if (entry) cache.delete(key);
  return null;
}

function setCache(key: string, result: string) {
  cache.set(key, { result, expiry: Date.now() + CACHE_TTL_MS });
  // Prune old entries if cache gets too big
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now >= v.expiry) cache.delete(k);
    }
  }
}

// ── Cost tracking ──
let totalInputTokens = 0;
let totalOutputTokens = 0;
let totalCalls = 0;
const DAILY_CALL_LIMIT = 500;
let dailyCallCount = 0;
let lastResetDate = new Date().toDateString();

export function getAiCostStats() {
  return {
    total_ai_calls: totalCalls,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    est_cost_usd: ((totalInputTokens * 3 + totalOutputTokens * 15) / 1_000_000).toFixed(4),
    daily_calls_remaining: DAILY_CALL_LIMIT - dailyCallCount,
    cache_size: cache.size,
  };
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

/**
 * Gather social, community, and smart money data for meme analysis.
 */
function gatherMemeData(tokenAddress: string, chain: string): Record<string, string> {
  return {
    // Basic token info (name, symbol — for cultural analysis)
    tokenInfo: runOnchainos(`token info --address ${tokenAddress} --chain ${chain}`),
    // Advanced info (holders, risk, dev history)
    advancedInfo: runOnchainos(`token advanced-info --address ${tokenAddress} --chain ${chain}`),
    // Price + volume + market cap + 24h change
    priceInfo: runOnchainos(`token price-info --address ${tokenAddress} --chain ${chain}`),
    // Top traders — who's buying? Smart money? KOLs? Insiders?
    smartMoneyTraders: runOnchainos(`token top-trader --address ${tokenAddress} --chain ${chain} --tag-filter 3`),
    kolTraders: runOnchainos(`token top-trader --address ${tokenAddress} --chain ${chain} --tag-filter 1`),
    insiderTraders: runOnchainos(`token top-trader --address ${tokenAddress} --chain ${chain} --tag-filter 6`),
    sniperTraders: runOnchainos(`token top-trader --address ${tokenAddress} --chain ${chain} --tag-filter 7`),
    // Recent trade history (last 50 trades)
    recentTrades: runOnchainos(`token trades --address ${tokenAddress} --chain ${chain} --limit 50`),
    // Holder distribution
    holders: runOnchainos(`token holders --address ${tokenAddress} --chain ${chain}`),
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
4. ARBITRAGE_VIABLE: Only viable if spread > 1%, sufficient liquidity, and token is transferable.
5. EST_PROFIT_AFTER_FEES: Spread minus costs (0.3% DEX fee + 0.1% CEX fee + ~$0.01 gas).

Important: Most X Layer native tokens are NOT listed on CEX, so arbitrage is usually not viable. Be honest about this.

Return ONLY valid JSON:
{"cex_price":number,"dex_price":number,"spread_pct":number,"arbitrage_viable":boolean,"est_profit_after_fees":number}`,

  meme: `You are a meme coin analyst and crypto-culture expert specializing in viral token analysis on X Layer (OKX L2).

Your task: Evaluate this token's MEME POTENTIAL — not just financials, but cultural resonance, virality, community strength, and narrative power.

Analysis dimensions:

1. VIRALITY_SCORE (0-100): Overall meme potential. Consider:
   - Name/symbol memorability and shareability
   - Cultural reference strength (animals, internet memes, current events, regional culture)
   - Easy to make memes/jokes about?
   - Ticker is catchy and works as a hashtag?

2. NARRATIVE_STRENGTH: "strong" | "moderate" | "weak" | "none"
   - Strong: clear story or cultural hook (e.g. dog coins, political memes, viral events)
   - Moderate: has a concept but not immediately viral
   - Weak: generic name, no clear narrative
   - None: looks like a random/scam token

3. CULTURAL_APPEAL: Brief assessment of WHY this token name/concept could spread.
   Consider Chinese internet culture, Western meme culture, crypto-native culture, animal coins, food coins, etc.

4. COMMUNITY_METRICS: Extract from the data:
   - twitter_mentions: X/Twitter mention count (from social data, 0 if unavailable)
   - social_score: social engagement score (0 if unavailable)
   - unique_traders_24h: number of unique addresses trading in 24h
   - holder_growth_trend: "explosive" (>50% growth) | "growing" (>10%) | "stable" | "declining"

5. SMART_MONEY_SENTIMENT: Based on smart money trader data:
   - "accumulating": smart money is buying and holding
   - "holding": smart money bought earlier, not selling
   - "dumping": smart money is selling
   - "absent": no smart money involvement

6. KOL_ACTIVITY: Assessment of KOL (Key Opinion Leader) involvement.
   Are KOLs trading this? How many? Are they buying or selling?

7. RISK_FACTORS: Array of risk strings. Possible values:
   - "insider_heavy": insiders/snipers hold large %
   - "low_liquidity": liquidity too thin
   - "whale_concentrated": top holders can dump
   - "no_community": no social presence
   - "pump_and_dump_pattern": price action suggests P&D
   - "dev_dumping": developer is selling
   - "bundle_suspicious": bundled buying pattern

8. CATALYST: What could make this token pump next? Be specific.
   Examples: "OKX listing potential", "viral TikTok trend", "upcoming airdrop", "community event"

Return ONLY valid JSON:
{"virality_score":number,"narrative_strength":"strong"|"moderate"|"weak"|"none","cultural_appeal":"string","community_metrics":{"twitter_mentions":number,"social_score":number,"unique_traders_24h":number,"holder_growth_trend":"explosive"|"growing"|"stable"|"declining"},"smart_money_sentiment":"accumulating"|"holding"|"dumping"|"absent","kol_activity":"string","risk_factors":["string"],"catalyst":"string"}`,
};

async function aiAnalyze(data: Record<string, string>, analysisType: string, cacheKey?: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) return "{}";

  // Daily limit reset
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    dailyCallCount = 0;
    lastResetDate = today;
  }

  // Check daily limit
  if (dailyCallCount >= DAILY_CALL_LIMIT) {
    console.warn("[Analyst] Daily AI call limit reached");
    return "{}";
  }

  // Check cache
  if (cacheKey) {
    const cached = getCached(cacheKey);
    if (cached) {
      console.log(`[Analyst] Cache hit: ${cacheKey}`);
      return cached;
    }
  }

  const prompt = PROMPTS[analysisType];
  if (!prompt) return "{}";

  // Truncate data to control input tokens
  // Each data field: max 400 chars (down from 600), max 6 fields shown
  const dataSection = Object.entries(data)
    .filter(([_, v]) => v)
    .slice(0, 8)
    .map(([k, v]) => `[${k}]: ${v.slice(0, 400)}`)
    .join("\n\n");

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: analysisType === "meme" ? 600 : 400,
    messages: [
      {
        role: "user",
        content: `${prompt}\n\n--- ON-CHAIN DATA ---\n${dataSection}\n\nReturn ONLY the JSON object, no other text.`,
      },
    ],
  });

  // Track costs
  totalCalls++;
  dailyCallCount++;
  totalInputTokens += msg.usage.input_tokens;
  totalOutputTokens += msg.usage.output_tokens;

  const content = msg.content[0];
  const result = content.type === "text" ? extractJson(content.text) : "{}";

  // Cache result
  if (cacheKey) setCache(cacheKey, result);

  return result;
}

export async function technicalAnalysis(tokenAddress: string, chain = "xlayer"): Promise<TechnicalAnalysis> {
  const data = gatherMarketData(tokenAddress, chain);
  const hasData = Object.values(data).some((v) => v);

  if (!hasData) {
    return { trend: "neutral", support: 0, resistance: 0, rsi_14: 50, volume_trend: "stable" };
  }

  try {
    const result = await aiAnalyze(data, "technical", `tech_${tokenAddress}_${chain}`);
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
    const result = await aiAnalyze(data, "fundamental", `fund_${tokenAddress}_${chain}`);
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
    const result = await aiAnalyze(data, "spread", `spread_${tokenAddress}_${chain}`);
    return JSON.parse(result);
  } catch {
    return { cex_price: 0, dex_price: 0, spread_pct: 0, arbitrage_viable: false, est_profit_after_fees: 0 };
  }
}

const DEFAULT_MEME: MemeAnalysis = {
  virality_score: 0,
  narrative_strength: "none",
  cultural_appeal: "Insufficient data for cultural analysis",
  community_metrics: { twitter_mentions: 0, social_score: 0, unique_traders_24h: 0, holder_growth_trend: "stable" },
  smart_money_sentiment: "absent",
  kol_activity: "No KOL data available",
  risk_factors: [],
  catalyst: "None identified",
};

export async function memeAnalysis(tokenAddress: string, chain = "xlayer"): Promise<MemeAnalysis> {
  const data = gatherMemeData(tokenAddress, chain);
  const hasData = Object.values(data).some((v) => v);

  if (!hasData) return DEFAULT_MEME;

  try {
    const result = await aiAnalyze(data, "meme", `meme_${tokenAddress}_${chain}`);
    return JSON.parse(result);
  } catch {
    return DEFAULT_MEME;
  }
}

export async function fullAnalysis(tokenAddress: string, chain = "xlayer"): Promise<AnalysisReport> {
  const [technical, fundamental, spread, meme] = await Promise.all([
    technicalAnalysis(tokenAddress, chain),
    fundamentalAnalysis(tokenAddress, chain),
    spreadAnalysis(tokenAddress, chain),
    memeAnalysis(tokenAddress, chain),
  ]);

  // Multi-dimensional recommendation: technical + fundamental + meme
  let recommendation: "BUY" | "SELL" | "HOLD" | "AVOID" = "HOLD";
  let confidence = 0.5;
  let reasoning = "";

  if (fundamental.honeypot || fundamental.sell_tax > 20) {
    recommendation = "AVOID";
    confidence = 0.95;
    reasoning = "Honeypot or extremely high sell tax detected";
  } else if (fundamental.holder_concentration === "high_risk" && fundamental.liquidity_usd < 10000) {
    recommendation = "AVOID";
    confidence = 0.8;
    reasoning = "High holder concentration with very low liquidity — rug pull risk";
  } else if (meme.risk_factors.includes("pump_and_dump_pattern")) {
    recommendation = "AVOID";
    confidence = 0.8;
    reasoning = "Price action suggests pump-and-dump scheme";
  } else if (
    meme.virality_score >= 70 &&
    meme.smart_money_sentiment === "accumulating" &&
    technical.trend !== "bearish"
  ) {
    // High meme potential + smart money buying = strong buy signal
    recommendation = "BUY";
    confidence = 0.85;
    reasoning = `Strong meme narrative (${meme.virality_score}/100) with smart money accumulating`;
  } else if (
    technical.trend === "bullish" &&
    fundamental.liquidity_usd > 50000 &&
    fundamental.holder_concentration !== "high_risk"
  ) {
    recommendation = "BUY";
    confidence = 0.75;
    reasoning = "Bullish trend with solid liquidity and healthy holder distribution";
  } else if (
    meme.virality_score >= 50 &&
    meme.community_metrics.holder_growth_trend === "explosive" &&
    meme.smart_money_sentiment !== "dumping"
  ) {
    // Decent meme + explosive growth = buy signal
    recommendation = "BUY";
    confidence = 0.7;
    reasoning = `Explosive holder growth with decent meme potential (${meme.virality_score}/100)`;
  } else if (technical.trend === "bullish" && technical.volume_trend === "increasing") {
    recommendation = "BUY";
    confidence = 0.6;
    reasoning = "Bullish trend with increasing volume";
  } else if (meme.smart_money_sentiment === "dumping" && technical.trend === "bearish") {
    recommendation = "SELL";
    confidence = 0.85;
    reasoning = "Smart money dumping with bearish price action";
  } else if (technical.trend === "bearish" && technical.volume_trend === "increasing") {
    recommendation = "SELL";
    confidence = 0.75;
    reasoning = "Bearish trend with increasing sell volume";
  } else if (technical.trend === "bearish") {
    recommendation = "SELL";
    confidence = 0.6;
    reasoning = "Bearish price trend";
  } else if (spread.arbitrage_viable && spread.est_profit_after_fees > 0) {
    recommendation = "BUY";
    confidence = 0.7;
    reasoning = `Arbitrage opportunity: ${spread.spread_pct}% spread`;
  } else {
    reasoning = "No strong signal in either direction";
  }

  return {
    analysis_id: generateId(),
    token: tokenAddress,
    chain,
    technical,
    fundamental,
    spread,
    meme,
    recommendation,
    confidence,
    reasoning,
    timestamp: new Date().toISOString(),
  };
}
