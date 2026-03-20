import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env, xlayer, runOnchainos, runOnchainosAsync, safeJsonParse } from "shared";
import type { TradeQuote } from "shared";

function generateId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6);
  return `quote_${date}_${rand}`;
}

const account = privateKeyToAccount(env.PRIVATE_KEY as `0x${string}`);

const publicClient = createPublicClient({
  chain: xlayer,
  transport: http(env.XLAYER_RPC),
});

const walletClient = createWalletClient({
  account,
  chain: xlayer,
  transport: http(env.XLAYER_RPC),
});

/**
 * Determine slippage: auto-detect based on price impact, capped by user's max.
 * Similar to OKX Wallet DEX behavior: "auto" with user-defined max.
 *
 * @param priceImpact - Price impact from quote (percent)
 * @param maxSlippage - User's max slippage tolerance (percent string), default "auto"
 */
function resolveSlippage(priceImpact: number, maxSlippage: string): number {
  const MAX_ALLOWED = 49; // absolute hard cap

  if (maxSlippage !== "auto") {
    const userMax = parseFloat(maxSlippage);
    if (!isNaN(userMax) && userMax > 0) return Math.min(userMax, MAX_ALLOWED);
  }

  // Auto mode: set slippage based on price impact
  // Low impact tokens (stablecoins, majors): tight slippage
  // High impact tokens (meme, low-liq): wider slippage
  if (priceImpact < 0.5) return 0.5;   // stable pairs
  if (priceImpact < 2) return 1;        // normal tokens
  if (priceImpact < 5) return 3;        // volatile tokens
  if (priceImpact < 10) return 5;       // meme coins
  if (priceImpact < 20) return 10;      // low liquidity meme
  return 15;                             // very low liquidity
}

/**
 * Get a swap quote from OKX DEX aggregator.
 * @param maxSlippage - Max slippage tolerance. "auto" (default) = auto-detect, or "5" for 5%
 */
// Convert native token zero address to 0xeee...eee format (DEX standard)
function normalizeNativeToken(address: string): string {
  if (address === "0x0000000000000000000000000000000000000000") {
    return "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  }
  return address;
}

// Convert UI amount to minimal units (wei for 18 decimals, or appropriate for token)
function toMinimalUnits(amount: string, decimals = 18): string {
  const parts = amount.split(".");
  const whole = parts[0] || "0";
  const frac = (parts[1] || "").padEnd(decimals, "0").slice(0, decimals);
  const raw = whole + frac;
  // Remove leading zeros but keep at least one digit
  return raw.replace(/^0+/, "") || "0";
}

export async function getQuote(
  fromToken: string,
  toToken: string,
  amount: string,
  chain = "xlayer",
  maxSlippage = "auto"
): Promise<TradeQuote> {
  const from = normalizeNativeToken(fromToken);
  const to = normalizeNativeToken(toToken);
  const amountWei = toMinimalUnits(amount);
  const raw = await runOnchainosAsync(
    `swap quote --from ${from} --to ${to} --amount ${amountWei} --chain ${chain === "xlayer" ? "196" : chain}`
  );

  if (raw) {
    const parsed = safeJsonParse(raw);
    if (parsed?.data || parsed) {
      const d = parsed.data?.[0] || parsed;
      const expectedOut = d.toTokenAmount || d.expectedOut || "0";
      const priceImpact = parseFloat(d.priceImpact || d.price_impact || "0");

      // Auto-detect or use user's max
      const slippagePct = resolveSlippage(priceImpact, maxSlippage);

      const minOut = BigInt(expectedOut) > 0n
        ? (BigInt(expectedOut) * BigInt(Math.round((100 - slippagePct) * 100)) / 10000n).toString()
        : "0";

      return {
        quote_id: generateId(),
        from_token: fromToken,
        to_token: toToken,
        chain,
        amount_in: amount,
        expected_out: expectedOut,
        min_out: minOut,
        price_impact: priceImpact,
        slippage: `${slippagePct}%${maxSlippage === "auto" ? " (auto)" : ""}`,
        route: d.routeSummary || d.route || JSON.stringify(d.dexRouterList || "direct"),
        expires_at: new Date(Date.now() + 60000).toISOString(),
      };
    }
  }

  return {
    quote_id: generateId(),
    from_token: fromToken,
    to_token: toToken,
    chain,
    amount_in: amount,
    expected_out: "0",
    min_out: "0",
    price_impact: 0,
    slippage: "auto",
    route: "unavailable",
    expires_at: new Date(Date.now() + 60000).toISOString(),
  };
}

/**
 * Execute a trade via OKX DEX aggregator.
 * OKX aggregator handles: optimal routing, pool selection, slippage protection.
 * We add: pre-trade simulation, gas estimation, tx receipt tracking.
 *
 * @param maxSlippage - Max slippage. "auto" = auto-detect, or "5" for 5%
 */
/**
 * Build trade transaction data WITHOUT signing.
 * Returns the raw tx params (to, data, value, gas) for the caller to sign.
 * Private keys never touch this service.
 */
export async function buildTrade(
  fromToken: string,
  toToken: string,
  amount: string,
  walletAddress: string,
  chain = "xlayer",
  maxSlippage = "auto"
) {
  // Get quote for slippage
  const quote = await getQuote(fromToken, toToken, amount, chain, maxSlippage);
  const slippageNum = parseFloat(quote.slippage) || 1;

  // OKX DEX aggregator builds the swap tx
  const swapRaw = await runOnchainosAsync(
    `swap swap --from ${fromToken} --to ${toToken} --amount ${amount} --chain ${chain === "xlayer" ? "196" : chain} --wallet ${walletAddress} --slippage ${slippageNum}`
  );

  if (!swapRaw) {
    return { success: false, error: "Failed to get swap data from OKX DEX aggregator", tx: null };
  }

  const swapData = safeJsonParse(swapRaw);
  if (!swapData?.data) {
    return { success: false, error: "Invalid swap data", tx: null };
  }

  const txData = swapData.data[0] || swapData.data;
  const to = txData.tx?.to || txData.to || txData.contractAddress;
  const data = txData.tx?.data || txData.data || txData.calldata;
  const value = txData.tx?.value || txData.value || "0";

  if (!to || !data) {
    return { success: false, error: "Missing transaction target or calldata", tx: null };
  }

  // Simulate
  const simRaw = await runOnchainosAsync(
    `gateway simulate --from ${walletAddress} --to ${to} --data ${data} --chain ${chain === "xlayer" ? "196" : chain}`
  );
  if (simRaw && simRaw.includes("fail")) {
    return { success: false, error: "Transaction simulation failed — trade would revert", tx: null };
  }

  // Estimate gas
  let gasEstimate: string | undefined;
  try {
    const gas = await publicClient.estimateGas({
      account: walletAddress as `0x${string}`,
      to: to as `0x${string}`,
      data: data as `0x${string}`,
      value: BigInt(value),
    });
    gasEstimate = (gas * 120n / 100n).toString(); // 20% buffer
  } catch (e: any) {
    return { success: false, error: `Gas estimation failed: ${e.message}`, tx: null };
  }

  return {
    success: true,
    tx: { to, data, value, gas: gasEstimate, chain_id: 196 },
    quote,
  };
}

/**
 * Legacy execute — uses platform wallet (for backward compat / testing only).
 */
export async function executeTrade(
  fromToken: string,
  toToken: string,
  amount: string,
  chain = "xlayer",
  maxSlippage = "auto"
) {
  const build = await buildTrade(fromToken, toToken, amount, account.address, chain, maxSlippage);
  if (!build.success || !build.tx) {
    return { success: false, error: build.error, order_id: null };
  }

  try {
    const txHash = await walletClient.sendTransaction({
      to: build.tx.to as `0x${string}`,
      data: build.tx.data as `0x${string}`,
      value: BigInt(build.tx.value),
      gas: build.tx.gas ? BigInt(build.tx.gas) : undefined,
    });

    return {
      success: true,
      tx_hash: txHash,
      order_id: generateId().replace("quote_", "order_"),
      chain,
      slippage: build.quote?.slippage,
      explorer: `https://www.okx.com/web3/explorer/xlayer/tx/${txHash}`,
    };
  } catch (e: any) {
    return { success: false, error: e.message, order_id: null };
  }
}

/**
 * Track order status by checking transaction receipt on-chain.
 */
export async function getOrderStatus(orderId: string, chain = "xlayer", txHash?: string) {
  if (!txHash) {
    return {
      order_id: orderId,
      status: "unknown",
      detail: "Provide tx_hash to track on-chain status",
      chain,
      timestamp: new Date().toISOString(),
    };
  }

  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    return {
      order_id: orderId,
      status: receipt.status === "success" ? "confirmed" : "failed",
      tx_hash: txHash,
      block_number: receipt.blockNumber.toString(),
      gas_used: receipt.gasUsed.toString(),
      chain,
      explorer: `https://www.okx.com/web3/explorer/xlayer/tx/${txHash}`,
      timestamp: new Date().toISOString(),
    };
  } catch {
    return {
      order_id: orderId,
      status: "pending",
      tx_hash: txHash,
      chain,
      timestamp: new Date().toISOString(),
    };
  }
}

export function getWalletAddress(): string {
  return account.address;
}

/**
 * Get ERC-20 token approval transaction data.
 * Required before swapping tokens that need allowance.
 */
export async function getApproval(
  tokenAddress: string,
  walletAddress: string,
  amount: string,
  chain = "xlayer"
) {
  const raw = await runOnchainosAsync(
    `swap approve --token ${tokenAddress} --wallet ${walletAddress} --amount ${amount} --chain ${chain === "xlayer" ? "196" : chain}`
  );

  if (!raw) {
    return { needs_approval: false, note: "Native token or approval not required" };
  }

  const parsed = safeJsonParse(raw);
  const data = parsed?.data?.[0] || parsed?.data || parsed;

  return {
    needs_approval: true,
    tx: {
      to: data?.to || tokenAddress,
      data: data?.data || data?.calldata || "",
      value: "0",
    },
  };
}

/**
 * Get current gas prices for a chain.
 */
export async function getGasPrice(chain = "xlayer") {
  const raw = await runOnchainosAsync(`gateway gas --chain ${chain === "xlayer" ? "196" : chain}`);
  const parsed = safeJsonParse(raw);
  const data = parsed?.data || parsed || {};

  return {
    chain,
    gas_prices: {
      slow: data.slow || data.safeLow || "0",
      standard: data.standard || data.average || "0",
      fast: data.fast || "0",
      instant: data.instant || data.fastest || "0",
    },
    base_fee: data.baseFee || "0",
    unit: "gwei",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get available DEX liquidity sources on a chain.
 */
export async function getLiquiditySources(chain = "xlayer") {
  const raw = await runOnchainosAsync(`swap liquidity --chain ${chain === "xlayer" ? "196" : chain}`);
  const parsed = safeJsonParse(raw);
  const sources = parsed?.data || parsed || [];

  return {
    chain,
    sources: Array.isArray(sources) ? sources.map((s: any) => ({
      name: s.name || s.dexName || "Unknown",
      id: s.id || s.dexId || "",
      logo: s.logo || "",
    })) : [],
    count: Array.isArray(sources) ? sources.length : 0,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Estimate gas limit for a transaction.
 */
export async function estimateGasLimit(
  from: string,
  to: string,
  data: string,
  value = "0",
  chain = "xlayer"
) {
  const raw = await runOnchainosAsync(
    `gateway gas-limit --from ${from} --to ${to} --data ${data} --value ${value} --chain ${chain === "xlayer" ? "196" : chain}`
  );
  const parsed = safeJsonParse(raw);
  const gasLimit = parsed?.data?.gasLimit || parsed?.gasLimit || parsed?.data || "0";

  return {
    chain,
    gas_limit: gasLimit.toString(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Broadcast a signed transaction.
 */
export async function broadcastTx(signedTx: string, chain = "xlayer") {
  const raw = await runOnchainosAsync(`gateway broadcast --signed-tx ${signedTx} --chain ${chain === "xlayer" ? "196" : chain}`);
  const parsed = safeJsonParse(raw);
  const data = parsed?.data || parsed || {};

  return {
    success: !!data.txHash || !!data.hash,
    tx_hash: data.txHash || data.hash || "",
    chain,
    explorer: data.txHash ? `https://www.okx.com/web3/explorer/xlayer/tx/${data.txHash}` : "",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Track broadcast order status.
 */
export async function trackBroadcastOrder(orderId: string, chain = "xlayer") {
  const raw = await runOnchainosAsync(`gateway orders --order-id ${orderId} --chain ${chain === "xlayer" ? "196" : chain}`);
  const parsed = safeJsonParse(raw);
  const data = parsed?.data || parsed || {};

  return {
    order_id: orderId,
    status: data.status || "unknown",
    tx_hash: data.txHash || data.hash || "",
    chain,
    timestamp: new Date().toISOString(),
  };
}
