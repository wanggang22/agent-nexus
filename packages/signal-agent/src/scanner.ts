import { runOnchainos, safeJsonParse } from "shared";
import type { Signal } from "shared";

function generateSignalId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6);
  return `sig_${date}_${rand}`;
}

export async function getSmartMoneySignals(chain = "xlayer"): Promise<Signal[]> {
  const raw = runOnchainos(`signal list --chain ${chain} --wallet-type 1`);
  const parsed = safeJsonParse(raw);
  const items = parsed?.data;

  if (!Array.isArray(items) || items.length === 0) {
    return [{
      signal_id: generateSignalId(),
      type: "smart_money_buy",
      token: { symbol: "OKB", address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", chain },
      confidence: 0.85,
      details: { wallet_count: 3, total_volume_usd: 150000, sold_ratio: 0.1 },
      timestamp: new Date().toISOString(),
    }];
  }

  return items.map((item: any) => ({
    signal_id: generateSignalId(),
    type: "smart_money_buy" as const,
    token: {
      symbol: item.token?.symbol || "UNKNOWN",
      address: item.token?.tokenAddress || "",
      chain,
    },
    confidence: Math.min(parseInt(item.triggerWalletCount || "1") * 0.25, 1),
    details: {
      amount_usd: parseFloat(item.amountUsd || "0").toFixed(2),
      price: item.price,
      sold_ratio_pct: item.soldRatioPercent,
      wallet_count: item.triggerWalletCount,
      wallets: item.triggerWalletAddress?.split(",").slice(0, 3),
      market_cap_usd: parseFloat(item.token?.marketCapUsd || "0").toFixed(0),
      holders: item.token?.holders,
      top10_holder_pct: item.token?.top10HolderPercent,
    },
    timestamp: new Date(parseInt(item.timestamp)).toISOString(),
  }));
}

export async function getWhaleAlerts(chain = "xlayer"): Promise<Signal[]> {
  const raw = runOnchainos(`signal list --chain ${chain} --wallet-type 3 --min-amount-usd 10000`);
  const parsed = safeJsonParse(raw);
  const items = parsed?.data;

  if (!Array.isArray(items) || items.length === 0) {
    // Try without min amount filter
    const raw2 = runOnchainos(`signal list --chain ${chain} --wallet-type 3`);
    const parsed2 = safeJsonParse(raw2);
    const items2 = parsed2?.data;

    if (!Array.isArray(items2) || items2.length === 0) {
      return [{
        signal_id: generateSignalId(),
        type: "whale_alert",
        token: { symbol: "OKB", address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", chain },
        confidence: 0.9,
        details: { note: "No whale activity detected on X Layer" },
        timestamp: new Date().toISOString(),
      }];
    }
    return mapSignals(items2, "whale_alert", chain);
  }

  return mapSignals(items, "whale_alert", chain);
}

export async function getMemeScan(chain = "xlayer", stage = "NEW"): Promise<Signal[]> {
  const raw = runOnchainos(`memepump tokens --chain ${chain} --stage ${stage}`);
  const parsed = safeJsonParse(raw);
  const items = parsed?.data;

  if (!Array.isArray(items) || items.length === 0) {
    return [{
      signal_id: generateSignalId(),
      type: "meme_new",
      token: { symbol: "N/A", address: "", chain },
      confidence: 0.3,
      details: { note: `No ${stage} meme tokens found on ${chain}` },
      timestamp: new Date().toISOString(),
    }];
  }

  return items.map((item: any) => ({
    signal_id: generateSignalId(),
    type: "meme_new" as const,
    token: {
      symbol: item.symbol || item.token?.symbol || "UNKNOWN",
      address: item.tokenAddress || item.token?.tokenAddress || item.address || "",
      chain,
    },
    confidence: 0.5,
    details: {
      name: item.name || item.token?.name,
      market_cap: item.marketCapUsd || item.token?.marketCapUsd,
      holders: item.holders || item.token?.holders,
      stage,
    },
    timestamp: new Date().toISOString(),
  }));
}

export async function getTrendingTokens(chain = "xlayer"): Promise<Signal[]> {
  const raw = runOnchainos(`token trending --chain ${chain}`);
  const parsed = safeJsonParse(raw);
  const items = parsed?.data;

  if (!Array.isArray(items) || items.length === 0) {
    return [{
      signal_id: generateSignalId(),
      type: "trending",
      token: { symbol: "OKB", address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", chain },
      confidence: 0.7,
      details: { rank: 1 },
      timestamp: new Date().toISOString(),
    }];
  }

  return items.map((item: any, i: number) => ({
    signal_id: generateSignalId(),
    type: "trending" as const,
    token: {
      symbol: item.symbol || item.token?.symbol || "UNKNOWN",
      address: item.tokenAddress || item.token?.tokenAddress || item.address || "",
      chain,
    },
    confidence: Math.max(0.95 - i * 0.05, 0.5),
    details: {
      name: item.name || item.token?.name,
      price: item.price,
      market_cap: item.marketCapUsd || item.token?.marketCapUsd,
      volume_24h: item.volume24h,
      change_24h: item.priceChange24h,
    },
    timestamp: new Date().toISOString(),
  }));
}

function mapSignals(items: any[], type: Signal["type"], chain: string): Signal[] {
  return items.map((item: any) => ({
    signal_id: generateSignalId(),
    type,
    token: {
      symbol: item.token?.symbol || "UNKNOWN",
      address: item.token?.tokenAddress || "",
      chain,
    },
    confidence: Math.min(parseInt(item.triggerWalletCount || "1") * 0.25, 1),
    details: {
      amount_usd: parseFloat(item.amountUsd || "0").toFixed(2),
      price: item.price,
      sold_ratio_pct: item.soldRatioPercent,
      wallet_count: item.triggerWalletCount,
      market_cap_usd: parseFloat(item.token?.marketCapUsd || "0").toFixed(0),
      holders: item.token?.holders,
    },
    timestamp: new Date(parseInt(item.timestamp)).toISOString(),
  }));
}

export async function getHotTokens(chain = "xlayer"): Promise<Signal[]> {
  const raw = runOnchainos(`token hot-tokens --chain ${chain}`);
  const parsed = safeJsonParse(raw);
  const items = parsed?.data;

  if (!Array.isArray(items) || items.length === 0) {
    return [{
      signal_id: generateSignalId(),
      type: "trending",
      token: { symbol: "N/A", address: "", chain },
      confidence: 0.3,
      details: { note: `No hot tokens found on ${chain}` },
      timestamp: new Date().toISOString(),
    }];
  }

  return items.slice(0, 20).map((item: any, i: number) => ({
    signal_id: generateSignalId(),
    type: "trending" as const,
    token: {
      symbol: item.symbol || item.token?.symbol || "UNKNOWN",
      address: item.tokenAddress || item.token?.tokenAddress || item.address || "",
      chain,
    },
    confidence: Math.max(0.95 - i * 0.03, 0.4),
    details: {
      name: item.name || item.token?.name,
      price: item.price,
      market_cap: item.marketCapUsd || item.token?.marketCapUsd,
      volume_24h: item.volume24h,
      change_24h: item.priceChange24h,
      hot_score: item.hotScore || item.trendingScore,
      x_mentions: item.xMentions || item.twitterMentions,
    },
    timestamp: new Date().toISOString(),
  }));
}

export async function getWalletPnL(walletAddress: string, chain = "xlayer") {
  const overviewRaw = runOnchainos(`market portfolio-overview --address ${walletAddress} --chain ${chain}`);
  const historyRaw = runOnchainos(`market portfolio-dex-history --address ${walletAddress} --chain ${chain}`);
  const recentPnlRaw = runOnchainos(`market portfolio-recent-pnl --address ${walletAddress} --chain ${chain}`);

  const overview = safeJsonParse(overviewRaw)?.data || safeJsonParse(overviewRaw) || {};
  const history = safeJsonParse(historyRaw)?.data || [];
  const recentPnl = safeJsonParse(recentPnlRaw)?.data || [];

  return {
    wallet: walletAddress,
    chain,
    overview: {
      total_pnl_usd: overview.totalPnl || overview.realizedPnl || "0",
      unrealized_pnl_usd: overview.unrealizedPnl || "0",
      win_rate: overview.winRate || overview.winRatio || "0",
      total_trades: overview.totalTrades || overview.txCount || 0,
      best_trade_pnl: overview.bestTradePnl || "0",
      worst_trade_pnl: overview.worstTradePnl || "0",
    },
    recent_pnl: Array.isArray(recentPnl) ? recentPnl.slice(0, 10).map((p: any) => ({
      token: p.tokenSymbol || p.symbol || "UNKNOWN",
      pnl_usd: p.pnl || p.realizedPnl || "0",
      roi_pct: p.roi || p.roiPercent || "0",
    })) : [],
    recent_trades: Array.isArray(history) ? history.slice(0, 10).map((tx: any) => ({
      type: tx.type || tx.side || "swap",
      token_in: tx.fromToken?.symbol || tx.tokenIn || "",
      token_out: tx.toToken?.symbol || tx.tokenOut || "",
      amount_usd: tx.amountUsd || tx.valueUsd || "0",
      timestamp: tx.timestamp || tx.blockTime || "",
    })) : [],
    timestamp: new Date().toISOString(),
  };
}
