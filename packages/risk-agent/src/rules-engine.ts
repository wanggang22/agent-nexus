import { runOnchainos, runOnchainosAsync, safeJsonParse } from "shared";
import type { RiskAssessment } from "shared";

const RISK_RULES = {
  max_position_pct: 0.05,
  min_liquidity_usd: 50000,
  max_buy_tax_pct: 5,
  max_sell_tax_pct: 5,
  min_holders: 100,
  bundle_ratio_max: 0.30,
};

function generateId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6);
  return `risk_${date}_${rand}`;
}

export async function assessRisk(
  tokenAddress: string,
  chain = "xlayer",
  portfolioValue = 10000
): Promise<RiskAssessment> {
  // Gather data from Onchain OS — fetch all data sources in parallel
  const [advancedRaw, holdersRaw, priceRaw, liquidityRaw, tokenInfoRaw, priceInfoRaw] = await Promise.all([
    runOnchainosAsync(`token advanced-info --address ${tokenAddress} --chain ${chain}`),
    runOnchainosAsync(`token holders --address ${tokenAddress} --chain ${chain}`),
    runOnchainosAsync(`market price --address ${tokenAddress} --chain ${chain}`),
    runOnchainosAsync(`token liquidity --address ${tokenAddress} --chain ${chain}`),
    runOnchainosAsync(`token info --address ${tokenAddress} --chain ${chain}`),
    runOnchainosAsync(`token price-info --address ${tokenAddress} --chain ${chain}`),
  ]);

  const advanced = safeJsonParse(advancedRaw)?.data || {};
  const holdersData = safeJsonParse(holdersRaw)?.data;
  const priceData = safeJsonParse(priceRaw)?.data?.[0];
  const liqData = safeJsonParse(liquidityRaw)?.data || safeJsonParse(liquidityRaw) || {};
  const tokenInfo = safeJsonParse(tokenInfoRaw)?.data?.[0] || safeJsonParse(tokenInfoRaw)?.data || {};
  const priceInfo = safeJsonParse(priceInfoRaw)?.data?.[0] || safeJsonParse(priceInfoRaw)?.data || {};

  // Risk level from API: 1=low, 2=medium, 3=high
  const riskControlLevel = parseInt(advanced.riskControlLevel || "0");

  // Honeypot check — riskControlLevel 3 = critical
  const isHoneypot = riskControlLevel >= 3;
  const honeypotCheck = {
    passed: !isHoneypot,
    detail: isHoneypot ? "HIGH RISK TOKEN (level 3)" : `Risk level: ${riskControlLevel || "unknown"}`,
  };

  // Tax check
  const totalFee = parseFloat(advanced.totalFee || "0");
  const buyTax = totalFee / 2; // approximate split
  const sellTax = totalFee / 2;
  const taxCheck = {
    passed: totalFee <= RISK_RULES.max_buy_tax_pct + RISK_RULES.max_sell_tax_pct,
    buy_tax: buyTax,
    sell_tax: sellTax,
  };

  // Liquidity check — use multiple data sources for accuracy
  const liquidityFromLiq = parseFloat(liqData.totalLiquidity || liqData.liquidityUsd || "0");
  const liquidityFromAdvanced = parseFloat(advanced.marketCapUsd || "0");
  const liquidityFromInfo = parseFloat(tokenInfo.liquidityUsd || tokenInfo.liquidity || "0");
  const liquidityFromPriceInfo = parseFloat(priceInfo.liquidity || priceInfo.liquidityUsd || "0");
  const liquidityUsd = liquidityFromLiq || liquidityFromPriceInfo || liquidityFromInfo || liquidityFromAdvanced || 0;
  const liquidityCheck = {
    passed: liquidityUsd >= RISK_RULES.min_liquidity_usd,
    usd_value: liquidityUsd,
  };

  // Holders check — use holderCount from multiple sources for accuracy
  const holdersFromPriceInfo = parseInt(priceInfo.holders || priceInfo.holderCount || "0");
  const holdersFromInfo = parseInt(tokenInfo.holders || tokenInfo.holderCount || "0");
  const holdersFromAdvanced = parseInt(advanced.holders || "0");
  const holdersFromArray = Array.isArray(holdersData) ? holdersData.length : 0;
  const holderCount = holdersFromPriceInfo || holdersFromInfo || holdersFromAdvanced || holdersFromArray;
  const top10Pct = parseFloat(advanced.top10HoldPercent || "0");
  const holdersCheck = {
    passed: holderCount >= RISK_RULES.min_holders || top10Pct < 50,
    count: holderCount,
    concentration: top10Pct > 60 ? "high_risk" : top10Pct > 30 ? "medium_risk" : "low_risk",
  };

  // Dev history check
  const rugCount = parseInt(advanced.devRugPullTokenCount || "0");
  const hasRugHistory = rugCount > 0;
  const devCheck = {
    passed: !hasRugHistory,
    detail: hasRugHistory
      ? `Dev has ${rugCount} rug-pull(s)`
      : `Dev launched ${advanced.devLaunchedTokenCount || "?"} tokens, 0 rugs`,
  };

  // Bundle/sniper check
  const bundleHolding = parseFloat(advanced.bundleHoldingPercent || "0") / 100;
  const sniperCount = parseInt(advanced.snipersTotal || "0");
  const bundleCheck = {
    passed: bundleHolding <= RISK_RULES.bundle_ratio_max,
    ratio: bundleHolding,
  };

  const checks = { honeypot: honeypotCheck, tax: taxCheck, liquidity: liquidityCheck, holders: holdersCheck, dev_history: devCheck, bundle: bundleCheck };

  const failedChecks = Object.values(checks).filter((c) => !c.passed).length;
  let risk_level: "low" | "medium" | "high" | "critical";
  let approved: boolean;

  if (isHoneypot || hasRugHistory) {
    risk_level = "critical";
    approved = false;
  } else if (failedChecks >= 3) {
    risk_level = "high";
    approved = false;
  } else if (failedChecks >= 1) {
    risk_level = "medium";
    approved = true;
  } else {
    risk_level = "low";
    approved = true;
  }

  // Price info from market data
  const price = parseFloat(priceData?.lastPrice || priceData?.price || priceInfo.price || tokenInfo.price || "0");
  const marketCap = parseFloat(priceInfo.marketCap || priceInfo.marketCapUsd || tokenInfo.marketCap || tokenInfo.marketCapUsd || advanced.marketCapUsd || "0");

  return {
    assessment_id: generateId(),
    token: tokenAddress,
    chain,
    approved,
    risk_level,
    checks,
    price,
    market_cap: marketCap,
    max_position_usd: approved ? portfolioValue * RISK_RULES.max_position_pct : 0,
    timestamp: new Date().toISOString(),
  };
}

export async function tokenSafety(tokenAddress: string, chain = "xlayer"): Promise<RiskAssessment> {
  return assessRisk(tokenAddress, chain);
}

export async function portfolioRisk(walletAddress: string, chain = "xlayer") {
  const totalValueRaw = await runOnchainosAsync(`portfolio total-value --address ${walletAddress} --chains ${chain}`);
  const balancesRaw = await runOnchainosAsync(`portfolio all-balances --address ${walletAddress} --chains ${chain}`);

  const totalValue = safeJsonParse(totalValueRaw)?.data?.[0]?.totalValue || "0";
  const balances = safeJsonParse(balancesRaw)?.data || [];

  return {
    wallet: walletAddress,
    chain,
    total_value_usd: parseFloat(totalValue).toFixed(2),
    balances,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get specific token balances for a wallet.
 */
export async function tokenBalances(walletAddress: string, tokenAddresses: string[], chain = "xlayer") {
  const tokens = tokenAddresses.join(",");
  const raw = await runOnchainosAsync(`portfolio token-balances --address ${walletAddress} --tokens ${tokens} --chains ${chain}`);
  const parsed = safeJsonParse(raw);
  const data = parsed?.data || parsed || [];

  return {
    wallet: walletAddress,
    chain,
    balances: Array.isArray(data) ? data.map((b: any) => ({
      token: b.symbol || b.tokenSymbol || "",
      address: b.tokenAddress || b.address || "",
      balance: b.balance || b.amount || "0",
      value_usd: b.valueUsd || b.value || "0",
    })) : [],
    timestamp: new Date().toISOString(),
  };
}
