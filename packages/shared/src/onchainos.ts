import { execSync } from "child_process";
import path from "path";
import os from "os";
import crypto from "crypto";

// Try multiple possible paths for onchainos binary
const HOME = os.homedir();
const ONCHAINOS_PATHS = [
  path.join(HOME, ".local", "bin"),
  "/root/.local/bin",
  "/home/.local/bin",
  "/usr/local/bin",
  "/app/.local/bin",
].join(":");

// OKX API credentials (for HTTP fallback)
const OKX_API_KEY = process.env.OKX_API_KEY || "";
const OKX_SECRET_KEY = process.env.OKX_SECRET_KEY || "";
const OKX_PASSPHRASE = process.env.OKX_PASSPHRASE || "";
const OKX_BASE_URL = "https://web3.okx.com";

// Chain name → OKX chain index mapping
const CHAIN_INDEX: Record<string, string> = {
  ethereum: "1", eth: "1",
  bsc: "56",
  polygon: "137",
  arbitrum: "42161",
  base: "8453",
  solana: "501",
  xlayer: "196",
  sui: "784",
};

function getChainIndex(chain: string): string {
  return CHAIN_INDEX[chain.toLowerCase()] || chain;
}

// OKX API signature
function okxSign(timestamp: string, method: string, path: string, body: string): string {
  const prehash = timestamp + method + path + body;
  return crypto.createHmac("sha256", OKX_SECRET_KEY).update(prehash).digest("base64");
}

async function okxFetch(apiPath: string, method: string = "GET", body?: any): Promise<any> {
  const timestamp = new Date().toISOString();
  const bodyStr = body ? JSON.stringify(body) : "";
  const sign = okxSign(timestamp, method, apiPath, bodyStr);

  const resp = await fetch(`${OKX_BASE_URL}${apiPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "OK-ACCESS-KEY": OKX_API_KEY,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-PASSPHRASE": OKX_PASSPHRASE,
      "OK-ACCESS-TIMESTAMP": timestamp,
    },
    body: method !== "GET" ? bodyStr : undefined,
    signal: AbortSignal.timeout(15000),
  });

  return resp.json();
}

/**
 * Run onchainos command — tries CLI first, falls back to OKX HTTP API.
 * This ensures it works both locally (with CLI) and on Railway (without CLI).
 */
export function runOnchainos(command: string): string {
  // Try CLI first
  try {
    const envPath = process.env.PATH || "";
    const fullPath = `${ONCHAINOS_PATHS}:${envPath}`;

    const result = execSync(`onchainos ${command}`, {
      encoding: "utf-8",
      timeout: 30000,
      env: { ...process.env, PATH: fullPath },
    }).trim();

    if (result) return result;
  } catch {
    // CLI not available — will use HTTP fallback
  }

  // No CLI — return empty, let async version handle it
  return "";
}

/**
 * Async version that falls back to OKX HTTP API when CLI is not available.
 * Use this in new code; existing code using runOnchainos will still work with CLI.
 */
export async function runOnchainosAsync(command: string): Promise<string> {
  // Try CLI first
  const cliResult = runOnchainos(command);
  if (cliResult) return cliResult;

  // Fallback to HTTP API
  if (!OKX_API_KEY) return "";

  try {
    const result = await parseCommandToApi(command);
    return JSON.stringify(result);
  } catch (e: any) {
    console.error(`[OnchainOS HTTP] Failed: ${command}`, e.message?.slice(0, 100));
    return "";
  }
}

/**
 * Parse onchainos CLI command → OKX HTTP API call
 */
async function parseCommandToApi(command: string): Promise<any> {
  const parts = command.trim().split(/\s+/);
  const module = parts[0]; // token, market, signal, swap, etc.
  const action = parts[1]; // hot-tokens, price, list, etc.

  // Parse flags
  const flags: Record<string, string> = {};
  for (let i = 2; i < parts.length; i++) {
    if (parts[i].startsWith("--") && i + 1 < parts.length) {
      flags[parts[i].slice(2)] = parts[i + 1];
      i++;
    }
  }

  const chainIndex = getChainIndex(flags.chain || "xlayer");

  // ── Token endpoints ──
  if (module === "token") {
    if (action === "hot-tokens") {
      return okxFetch(`/api/v6/dex/market/token/hot-tokens?chainIndex=${chainIndex}`);
    }
    if (action === "trending") {
      return okxFetch(`/api/v6/dex/market/token/trending?chainIndex=${chainIndex}`);
    }
    if (action === "info") {
      return okxFetch("/api/v6/dex/market/token/basic-info", "POST",
        [{ chainIndex, tokenContractAddress: flags.address }]);
    }
    if (action === "advanced-info") {
      return okxFetch(`/api/v6/dex/market/token/advanced-info?chainIndex=${chainIndex}&tokenContractAddress=${flags.address}`);
    }
    if (action === "holders") {
      return okxFetch(`/api/v6/dex/market/token/holders?chainIndex=${chainIndex}&tokenContractAddress=${flags.address}`);
    }
    if (action === "price-info") {
      return okxFetch(`/api/v6/dex/market/token/price-info?chainIndex=${chainIndex}&tokenContractAddress=${flags.address}`);
    }
    if (action === "liquidity") {
      return okxFetch(`/api/v6/dex/market/token/liquidity?chainIndex=${chainIndex}&tokenContractAddress=${flags.address}`);
    }
    if (action === "top-trader") {
      const tagFilter = flags["tag-filter"] || "";
      return okxFetch(`/api/v6/dex/market/token/top-trader?chainIndex=${chainIndex}&tokenContractAddress=${flags.address}${tagFilter ? `&tagFilter=${tagFilter}` : ""}`);
    }
    if (action === "trades") {
      const limit = flags.limit || "50";
      return okxFetch(`/api/v6/dex/market/token/trades?chainIndex=${chainIndex}&tokenContractAddress=${flags.address}&limit=${limit}`);
    }
    if (action === "search") {
      return okxFetch(`/api/v6/dex/market/token/search?chainIndex=${chainIndex}&keyword=${flags.keyword}`);
    }
  }

  // ── Signal endpoints ──
  if (module === "signal") {
    if (action === "list") {
      const walletType = flags["wallet-type"] || "1";
      const minAmount = flags["min-amount-usd"] || "";
      let url = `/api/v6/dex/market/signal/list?chainIndex=${chainIndex}&walletType=${walletType}`;
      if (minAmount) url += `&minAmountUsd=${minAmount}`;
      return okxFetch(url);
    }
  }

  // ── Market endpoints ──
  if (module === "market") {
    if (action === "price") {
      return okxFetch(`/api/v6/dex/market/price?chainIndex=${chainIndex}&tokenContractAddress=${flags.address}`);
    }
    if (action === "kline") {
      const bar = flags.bar || "1H";
      const limit = flags.limit || "24";
      return okxFetch(`/api/v6/dex/market/kline?chainIndex=${chainIndex}&tokenContractAddress=${flags.address}&bar=${bar}&limit=${limit}`);
    }
    if (action === "prices") {
      return okxFetch("/api/v6/dex/market/prices", "POST",
        { chainIndex, tokenContractAddresses: flags.addresses });
    }
    if (action === "portfolio-overview") {
      return okxFetch(`/api/v6/dex/market/portfolio/overview?chainIndex=${chainIndex}&address=${flags.address}`);
    }
    if (action === "portfolio-dex-history") {
      return okxFetch(`/api/v6/dex/market/portfolio/dex-history?chainIndex=${chainIndex}&address=${flags.address}`);
    }
    if (action === "portfolio-recent-pnl") {
      return okxFetch(`/api/v6/dex/market/portfolio/recent-pnl?chainIndex=${chainIndex}&address=${flags.address}`);
    }
    if (action === "portfolio-token-pnl") {
      return okxFetch(`/api/v6/dex/market/portfolio/token-pnl?chainIndex=${chainIndex}&address=${flags.address}&tokenContractAddress=${flags.token}`);
    }
  }

  // ── Memepump endpoints ──
  if (module === "memepump") {
    if (action === "tokens") {
      const stage = flags.stage || "NEW";
      return okxFetch(`/api/v6/dex/market/memepump/tokens?chainIndex=${chainIndex}&stage=${stage}`);
    }
    if (action === "token-details") {
      return okxFetch(`/api/v6/dex/market/memepump/token-details?chainIndex=${chainIndex}&tokenContractAddress=${flags.address}`);
    }
    if (action === "token-dev-info") {
      return okxFetch(`/api/v6/dex/market/memepump/token-dev-info?chainIndex=${chainIndex}&tokenContractAddress=${flags.address}`);
    }
    if (action === "token-bundle-info") {
      return okxFetch(`/api/v6/dex/market/memepump/token-bundle-info?chainIndex=${chainIndex}&tokenContractAddress=${flags.address}`);
    }
    if (action === "similar-tokens") {
      return okxFetch(`/api/v6/dex/market/memepump/similar-tokens?chainIndex=${chainIndex}&tokenContractAddress=${flags.address}`);
    }
    if (action === "aped-wallet") {
      return okxFetch(`/api/v6/dex/market/memepump/aped-wallet?chainIndex=${chainIndex}&tokenContractAddress=${flags.address}`);
    }
  }

  // ── Swap endpoints ──
  if (module === "swap") {
    if (action === "quote") {
      return okxFetch(`/api/v6/dex/swap/quote?chainIndex=${chainIndex}&fromTokenAddress=${flags.from}&toTokenAddress=${flags.to}&amount=${flags.amount}`);
    }
    if (action === "swap") {
      return okxFetch(`/api/v6/dex/swap/swap?chainIndex=${chainIndex}&fromTokenAddress=${flags.from}&toTokenAddress=${flags.to}&amount=${flags.amount}&userWalletAddress=${flags.wallet}&slippage=${flags.slippage}`);
    }
    if (action === "approve") {
      return okxFetch(`/api/v6/dex/swap/approve?chainIndex=${chainIndex}&tokenContractAddress=${flags.token}&approveAmount=${flags.amount}`);
    }
    if (action === "liquidity") {
      return okxFetch(`/api/v6/dex/swap/liquidity?chainIndex=${chainIndex}`);
    }
  }

  // ── Portfolio endpoints ──
  if (module === "portfolio") {
    if (action === "total-value") {
      return okxFetch(`/api/v6/dex/balance/total-value?address=${flags.address}&chains=${chainIndex}`);
    }
    if (action === "all-balances") {
      return okxFetch(`/api/v6/dex/balance/all-balances?address=${flags.address}&chains=${chainIndex}`);
    }
    if (action === "token-balances") {
      return okxFetch(`/api/v6/dex/balance/token-balances?address=${flags.address}&chains=${chainIndex}&tokenContractAddresses=${flags.tokens}`);
    }
  }

  // ── Gateway endpoints ──
  if (module === "gateway") {
    if (action === "gas") {
      return okxFetch(`/api/v6/dex/gateway/gas?chainIndex=${chainIndex}`);
    }
    if (action === "gas-limit") {
      return okxFetch("/api/v6/dex/gateway/gas-limit", "POST",
        { chainIndex, fromAddress: flags.from, toAddress: flags.to, txData: flags.data, value: flags.value || "0" });
    }
    if (action === "simulate") {
      return okxFetch("/api/v6/dex/gateway/simulate", "POST",
        { chainIndex, fromAddress: flags.from, toAddress: flags.to, txData: flags.data });
    }
    if (action === "broadcast") {
      return okxFetch("/api/v6/dex/gateway/broadcast", "POST",
        { chainIndex, signedTx: flags["signed-tx"] });
    }
  }

  console.warn(`[OnchainOS HTTP] Unmapped command: ${command}`);
  return { ok: false, error: "Unmapped command" };
}

export function safeJsonParse(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
