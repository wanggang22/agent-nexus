import { runOnchainos, safeJsonParse } from "./onchainos.js";

// ── Built-in: major tokens on X Layer (chain ID 196) ──
const XLAYER_TOKENS: Record<string, string> = {
  // Native & wrapped
  OKB: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",    // native gas token (DEX standard)
  WOKB: "0xe538905cf8410324e03A5A23C1c177a474D59b2b",   // wrapped OKB
  // Stablecoins
  USDT: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d",
  USDC: "0x74b7f16337b8972027f6196a17a631ac6de26d22",
  DAI: "0xC5015b9d9161Dca7e18e32f6f25C4aD850731Fd4",
  // Major
  ETH: "0x5A77f1443D16ee5761d310e38b62f77f726bC71c",
  WETH: "0x5A77f1443D16ee5761d310e38b62f77f726bC71c",
  WBTC: "0xEA034fb02eB1808C2cc3adbC15f447B93CbE08e1",
  BTC: "0xEA034fb02eB1808C2cc3adbC15f447B93CbE08e1",
  BITCOIN: "0xEA034fb02eB1808C2cc3adbC15f447B93CbE08e1",
};

// ── Dynamic cache: symbol → address learned from past lookups ──
const dynamicCache = new Map<string, { address: string; chain: string; expiry: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Resolve a token symbol or address to a contract address.
 * Priority: raw address > built-in map > dynamic cache > OnchainOS search
 */
export function resolveToken(input: string, chain = "xlayer"): { address: string; source: string } | null {
  const trimmed = input.trim();

  // Already a contract address
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return { address: trimmed, source: "direct" };
  }

  const symbol = trimmed.toUpperCase();

  // Built-in map (X Layer only for now)
  if (chain === "xlayer" && XLAYER_TOKENS[symbol]) {
    return { address: XLAYER_TOKENS[symbol], source: "builtin" };
  }

  // Dynamic cache
  const cacheKey = `${symbol}_${chain}`;
  const cached = dynamicCache.get(cacheKey);
  if (cached && Date.now() < cached.expiry) {
    return { address: cached.address, source: "cache" };
  }

  // OnchainOS token search as fallback
  const raw = runOnchainos(`token search --query ${trimmed} --chain ${chain}`);
  if (raw) {
    const parsed = safeJsonParse(raw);
    const tokens = parsed?.data || parsed;
    if (Array.isArray(tokens) && tokens.length > 0) {
      // Pick the best match: exact symbol match first, then first result
      const exact = tokens.find((t: any) =>
        (t.tokenSymbol || t.symbol || "").toUpperCase() === symbol
      );
      const best = exact || tokens[0];
      const address = best.tokenContractAddress || best.address || best.contractAddress;
      if (address) {
        // Cache for next time
        dynamicCache.set(cacheKey, { address, chain, expiry: Date.now() + CACHE_TTL });
        return { address, source: "search" };
      }
    }
  }

  return null;
}

/**
 * Register a token in dynamic cache (called after successful analysis/trade).
 */
export function registerToken(symbol: string, address: string, chain = "xlayer") {
  const key = `${symbol.toUpperCase()}_${chain}`;
  dynamicCache.set(key, { address, chain, expiry: Date.now() + CACHE_TTL });
}

/**
 * Get all known tokens (built-in + cached).
 */
export function getKnownTokens(chain = "xlayer"): Array<{ symbol: string; address: string; source: string }> {
  const result: Array<{ symbol: string; address: string; source: string }> = [];

  if (chain === "xlayer") {
    for (const [symbol, address] of Object.entries(XLAYER_TOKENS)) {
      result.push({ symbol, address, source: "builtin" });
    }
  }

  for (const [key, val] of dynamicCache) {
    if (val.chain === chain && Date.now() < val.expiry) {
      const symbol = key.replace(`_${chain}`, "");
      result.push({ symbol, address: val.address, source: "cache" });
    }
  }

  return result;
}
