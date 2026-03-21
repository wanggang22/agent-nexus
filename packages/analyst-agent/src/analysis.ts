import Anthropic from "@anthropic-ai/sdk";
import { env, runOnchainos, runOnchainosAsync, safeJsonParse } from "shared";
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

async function gatherMarketData(tokenAddress: string, chain: string): Promise<Record<string, string>> {
  return {
    price: await runOnchainosAsync(`market price --address ${tokenAddress} --chain ${chain}`),
    kline: await runOnchainosAsync(`market kline --address ${tokenAddress} --chain ${chain} --bar 1H --limit 24`),
    tokenInfo: await runOnchainosAsync(`token advanced-info --address ${tokenAddress} --chain ${chain}`),
    holders: await runOnchainosAsync(`token holders --address ${tokenAddress} --chain ${chain}`),
    liquidity: await runOnchainosAsync(`token liquidity --address ${tokenAddress} --chain ${chain}`),
    priceInfo: await runOnchainosAsync(`token price-info --address ${tokenAddress} --chain ${chain}`),
  };
}

/**
 * Gather social, community, and smart money data for meme analysis.
 */
async function gatherMemeData(tokenAddress: string, chain: string): Promise<Record<string, string>> {
  return {
    // Basic token info (name, symbol — for cultural analysis)
    tokenInfo: await runOnchainosAsync(`token info --address ${tokenAddress} --chain ${chain}`),
    // Advanced info (holders, risk, dev history)
    advancedInfo: await runOnchainosAsync(`token advanced-info --address ${tokenAddress} --chain ${chain}`),
    // Price + volume + market cap + 24h change
    priceInfo: await runOnchainosAsync(`token price-info --address ${tokenAddress} --chain ${chain}`),
    // Top traders — who's buying? Smart money? KOLs? Insiders?
    smartMoneyTraders: await runOnchainosAsync(`token top-trader --address ${tokenAddress} --chain ${chain} --tag-filter 3`),
    kolTraders: await runOnchainosAsync(`token top-trader --address ${tokenAddress} --chain ${chain} --tag-filter 1`),
    insiderTraders: await runOnchainosAsync(`token top-trader --address ${tokenAddress} --chain ${chain} --tag-filter 6`),
    sniperTraders: await runOnchainosAsync(`token top-trader --address ${tokenAddress} --chain ${chain} --tag-filter 7`),
    // Recent trade history (last 50 trades)
    recentTrades: await runOnchainosAsync(`token trades --address ${tokenAddress} --chain ${chain} --limit 50`),
    // Holder distribution
    holders: await runOnchainosAsync(`token holders --address ${tokenAddress} --chain ${chain}`),
  };
}

/**
 * Gather deep meme data including bundle info, dev info, and similar tokens.
 */
async function gatherMemeDeepData(tokenAddress: string, chain: string): Promise<Record<string, string>> {
  const base = await gatherMemeData(tokenAddress, chain);
  return {
    ...base,
    // NEW: Bundle/sniper detection
    bundleInfo: await runOnchainosAsync(`memepump token-bundle-info --address ${tokenAddress} --chain ${chain}`),
    // NEW: Developer wallet analysis
    devInfo: await runOnchainosAsync(`memepump token-dev-info --address ${tokenAddress} --chain ${chain}`),
    // NEW: Similar tokens (find copycats or related memes)
    similarTokens: await runOnchainosAsync(`memepump similar-tokens --address ${tokenAddress} --chain ${chain}`),
    // NEW: Detailed memepump token info
    memepumpDetails: await runOnchainosAsync(`memepump token-details --address ${tokenAddress} --chain ${chain}`),
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
    model: "claude-sonnet-4-6",
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

// ══════════════════════════════════════════════════════════════
// BASIC MODE — Free, rule-based analysis from OnchainOS data
// ══════════════════════════════════════════════════════════════

export async function basicTechnical(tokenAddress: string, chain = "xlayer"): Promise<TechnicalAnalysis> {
  const data = await gatherMarketData(tokenAddress, chain);
  const kline = safeJsonParse(data.kline);
  const priceRaw = safeJsonParse(data.price);

  let trend: "bullish" | "bearish" | "neutral" = "neutral";
  let rsi = 50;
  let support = 0;
  let resistance = 0;
  let volumeTrend: "increasing" | "decreasing" | "stable" = "stable";

  // Parse K-line candles for trend
  const candles = Array.isArray(kline?.data) ? kline.data : Array.isArray(kline) ? kline : [];
  if (candles.length >= 6) {
    const recent = candles.slice(-6);
    let greenCount = 0;
    let redCount = 0;
    const prices: number[] = [];
    const volumes: number[] = [];

    for (const c of recent) {
      const open = parseFloat(c.open || c.o || "0");
      const close = parseFloat(c.close || c.c || "0");
      const high = parseFloat(c.high || c.h || "0");
      const low = parseFloat(c.low || c.l || "0");
      const vol = parseFloat(c.volume || c.vol || c.v || "0");
      if (close > open) greenCount++;
      if (close < open) redCount++;
      prices.push(close, high, low);
      volumes.push(vol);
    }

    if (greenCount >= 4) trend = "bullish";
    else if (redCount >= 4) trend = "bearish";

    if (prices.length > 0) {
      support = Math.min(...prices.filter((p) => p > 0));
      resistance = Math.max(...prices);
    }

    // Simple volume trend: compare last 3 vs first 3
    if (volumes.length >= 6) {
      const recentVol = volumes.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const oldVol = volumes.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      if (oldVol > 0) {
        const ratio = recentVol / oldVol;
        if (ratio > 1.2) volumeTrend = "increasing";
        else if (ratio < 0.8) volumeTrend = "decreasing";
      }
    }

    // Simple RSI estimate from price changes
    let gains = 0, losses = 0, periods = 0;
    for (let i = 1; i < candles.length && i <= 14; i++) {
      const prev = parseFloat(candles[i - 1].close || candles[i - 1].c || "0");
      const curr = parseFloat(candles[i].close || candles[i].c || "0");
      if (prev > 0) {
        const change = curr - prev;
        if (change > 0) gains += change;
        else losses += Math.abs(change);
        periods++;
      }
    }
    if (periods > 0 && (gains + losses) > 0) {
      const avgGain = gains / periods;
      const avgLoss = losses / periods;
      rsi = avgLoss === 0 ? 100 : Math.round(100 - 100 / (1 + avgGain / avgLoss));
    }
  }

  return { trend, support, resistance, rsi_14: rsi, volume_trend: volumeTrend };
}

export async function basicFundamental(tokenAddress: string, chain = "xlayer"): Promise<FundamentalAnalysis> {
  const data = await gatherMarketData(tokenAddress, chain);
  const info = safeJsonParse(data.tokenInfo);
  const holdersRaw = safeJsonParse(data.holders);
  const liqRaw = safeJsonParse(data.liquidity);
  const priceInfoRaw = safeJsonParse(data.priceInfo);
  const priceInfo = priceInfoRaw?.data?.[0] || priceInfoRaw?.data || {};

  let concentration: "low_risk" | "medium_risk" | "high_risk" = "medium_risk";
  let honeypot = false;
  let buyTax = 0;
  let sellTax = 0;
  let liquidity = 0;

  // Extract from token info
  const tokenData = info?.data || info || {};
  const riskLevel = parseInt(tokenData.riskControlLevel || "0");
  if (riskLevel >= 3) honeypot = true;

  buyTax = parseFloat(tokenData.buyTax || tokenData.totalBuyFee || "0");
  sellTax = parseFloat(tokenData.sellTax || tokenData.totalSellFee || "0");
  if (sellTax > 50) honeypot = true;

  // Liquidity — use multiple data sources
  const liqFromPriceInfo = parseFloat(priceInfo.liquidity || priceInfo.liquidityUsd || "0");
  const liqFromLiq = liqRaw ? parseFloat(liqRaw.data?.totalLiquidity || liqRaw.totalLiquidity || "0") : 0;
  const liqFromInfo = parseFloat(tokenData.liquidityUsd || tokenData.marketCapUsd || "0");
  liquidity = liqFromPriceInfo || liqFromLiq || liqFromInfo;

  // Holder concentration
  const holders = holdersRaw?.data || holdersRaw || [];
  if (Array.isArray(holders) && holders.length > 0) {
    const top10Pct = holders.slice(0, 10).reduce((sum: number, h: any) => {
      return sum + parseFloat(h.percentage || h.pct || "0");
    }, 0);
    if (top10Pct > 60) concentration = "high_risk";
    else if (top10Pct < 30) concentration = "low_risk";
  }

  return { holder_concentration: concentration, honeypot, buy_tax: buyTax, sell_tax: sellTax, liquidity_usd: liquidity };
}

export async function basicSpread(tokenAddress: string, chain = "xlayer"): Promise<SpreadAnalysis> {
  const priceRaw = await runOnchainosAsync(`market price --address ${tokenAddress} --chain ${chain}`);
  const parsed = safeJsonParse(priceRaw);
  const dexPrice = parseFloat(parsed?.data?.price || parsed?.price || "0");

  return {
    cex_price: 0,
    dex_price: dexPrice,
    spread_pct: 0,
    arbitrage_viable: false,
    est_profit_after_fees: 0,
  };
}

export async function basicMeme(tokenAddress: string, chain = "xlayer"): Promise<MemeAnalysis> {
  const data = await gatherMemeData(tokenAddress, chain);

  const info = safeJsonParse(data.tokenInfo) || {};
  const priceInfo = safeJsonParse(data.priceInfo) || {};
  const holders = safeJsonParse(data.holders) || {};
  const smartMoney = safeJsonParse(data.smartMoneyTraders) || {};
  const kols = safeJsonParse(data.kolTraders) || {};
  const insiders = safeJsonParse(data.insiderTraders) || {};
  const trades = safeJsonParse(data.recentTrades) || {};

  const tokenData = info.data || info;
  const priceData = priceInfo.data || priceInfo;

  // Unique traders from recent trades
  const tradeList = Array.isArray(trades.data) ? trades.data : Array.isArray(trades) ? trades : [];
  const uniqueTraders = new Set(tradeList.map((t: any) => t.maker || t.from || t.address)).size;

  // Smart money count
  const smList = Array.isArray(smartMoney.data) ? smartMoney.data : [];
  const kolList = Array.isArray(kols.data) ? kols.data : [];
  const insiderList = Array.isArray(insiders.data) ? insiders.data : [];

  let sentiment: "accumulating" | "holding" | "dumping" | "absent" = "absent";
  if (smList.length > 0) {
    const buying = smList.filter((t: any) => (t.type || t.side || "").toLowerCase().includes("buy")).length;
    const selling = smList.filter((t: any) => (t.type || t.side || "").toLowerCase().includes("sell")).length;
    if (buying > selling) sentiment = "accumulating";
    else if (selling > buying) sentiment = "dumping";
    else sentiment = "holding";
  }

  // NEW: Check bundle/sniper info
  const bundleRaw = await runOnchainosAsync(`memepump token-bundle-info --address ${tokenAddress} --chain ${chain}`);
  const bundleData = safeJsonParse(bundleRaw)?.data || {};
  const bundleHoldingPct = parseFloat(bundleData.bundleHoldingPercent || bundleData.bundlePercent || "0");
  const sniperCount = parseInt(bundleData.snipersTotal || bundleData.sniperCount || "0");

  const riskFactors: string[] = [];
  if (insiderList.length > 3) riskFactors.push("insider_heavy");
  if (smList.length === 0 && kolList.length === 0) riskFactors.push("no_community");
  if (bundleHoldingPct > 30) riskFactors.push("bundle_suspicious");
  if (sniperCount > 10) riskFactors.push("insider_heavy");

  // Holder distribution check
  const holderList = Array.isArray(holders.data) ? holders.data : [];
  if (holderList.length > 0) {
    const top10Pct = holderList.slice(0, 10).reduce((s: number, h: any) => s + parseFloat(h.percentage || h.pct || "0"), 0);
    if (top10Pct > 60) riskFactors.push("whale_concentrated");
  }

  return {
    virality_score: 0,
    narrative_strength: "none",
    cultural_appeal: "Basic mode — upgrade to deep analysis for cultural assessment",
    community_metrics: {
      twitter_mentions: 0,
      social_score: 0,
      unique_traders_24h: uniqueTraders,
      holder_growth_trend: "stable",
    },
    smart_money_sentiment: sentiment,
    kol_activity: kolList.length > 0 ? `${kolList.length} KOLs trading` : "No KOL data",
    risk_factors: riskFactors,
    catalyst: "Basic mode — upgrade to deep analysis for catalyst prediction",
  };
}

export async function basicFullAnalysis(tokenAddress: string, chain = "xlayer"): Promise<AnalysisReport> {
  const technical = await basicTechnical(tokenAddress, chain);
  const fundamental = await basicFundamental(tokenAddress, chain);
  const spread = await basicSpread(tokenAddress, chain);
  const meme = await basicMeme(tokenAddress, chain);

  // Simple rule-based recommendation
  let recommendation: "BUY" | "SELL" | "HOLD" | "AVOID" = "HOLD";
  let confidence = 0.4;
  let reasoning = "";

  if (fundamental.honeypot || fundamental.sell_tax > 20) {
    recommendation = "AVOID";
    confidence = 0.9;
    reasoning = "Honeypot or high sell tax detected";
  } else if (fundamental.holder_concentration === "high_risk" && fundamental.liquidity_usd < 10000) {
    recommendation = "AVOID";
    confidence = 0.75;
    reasoning = "High concentration + low liquidity";
  } else if (technical.trend === "bullish" && technical.volume_trend === "increasing") {
    recommendation = "BUY";
    confidence = 0.55;
    reasoning = "Bullish trend with increasing volume (basic analysis)";
  } else if (technical.trend === "bearish" && technical.volume_trend === "increasing") {
    recommendation = "SELL";
    confidence = 0.55;
    reasoning = "Bearish trend with increasing sell volume (basic analysis)";
  } else {
    reasoning = "No strong signal — consider deep analysis for better insight";
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

// ══════════════════════════════════════════════════════════════
// DEEP MODE — Paid, Claude AI-powered analysis
// ══════════════════════════════════════════════════════════════

export async function technicalAnalysis(tokenAddress: string, chain = "xlayer"): Promise<TechnicalAnalysis> {
  const data = await gatherMarketData(tokenAddress, chain);
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
  const data = await gatherMarketData(tokenAddress, chain);
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
    dexPrice: await runOnchainosAsync(`market price --address ${tokenAddress} --chain ${chain}`),
    tokenInfo: await runOnchainosAsync(`token advanced-info --address ${tokenAddress} --chain ${chain}`),
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
  const data = await gatherMemeDeepData(tokenAddress, chain);
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
