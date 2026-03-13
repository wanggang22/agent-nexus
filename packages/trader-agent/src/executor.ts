import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env, xlayer, runOnchainos, safeJsonParse } from "shared";
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
 * Get a swap quote from OKX DEX aggregator.
 * @param slippage - Slippage tolerance in percent, default "1" (1%)
 */
export async function getQuote(
  fromToken: string,
  toToken: string,
  amount: string,
  chain = "xlayer",
  slippage = "1"
): Promise<TradeQuote> {
  const raw = runOnchainos(
    `swap quote --from ${fromToken} --to ${toToken} --amount ${amount} --chain ${chain}`
  );

  if (raw) {
    const parsed = safeJsonParse(raw);
    if (parsed?.data || parsed) {
      const d = parsed.data?.[0] || parsed;
      const expectedOut = d.toTokenAmount || d.expectedOut || "0";
      // Calculate minimum output based on slippage
      const slippagePct = parseFloat(slippage) || 1;
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
        price_impact: parseFloat(d.priceImpact || d.price_impact || "0"),
        slippage: `${slippagePct}%`,
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
    slippage: `${slippage}%`,
    route: "unavailable",
    expires_at: new Date(Date.now() + 60000).toISOString(),
  };
}

/**
 * Execute a trade via OKX DEX aggregator.
 * OKX aggregator handles: optimal routing, pool selection, slippage protection.
 * We add: pre-trade simulation, gas estimation, tx receipt tracking.
 *
 * @param slippage - Slippage tolerance in percent, default "1" (1%)
 */
export async function executeTrade(
  fromToken: string,
  toToken: string,
  amount: string,
  chain = "xlayer",
  slippage = "1"
) {
  // OKX DEX aggregator builds the swap tx with slippage protection
  const swapRaw = runOnchainos(
    `swap swap --from ${fromToken} --to ${toToken} --amount ${amount} --chain ${chain} --wallet ${account.address} --slippage ${slippage}`
  );

  if (!swapRaw) {
    return { success: false, error: "Failed to get swap data from OKX DEX aggregator", order_id: null };
  }

  const swapData = safeJsonParse(swapRaw);
  if (!swapData?.data) {
    return { success: false, error: "Invalid swap data", order_id: null };
  }

  const txData = swapData.data[0] || swapData.data;
  const to = txData.tx?.to || txData.to || txData.contractAddress;
  const data = txData.tx?.data || txData.data || txData.calldata;
  const value = txData.tx?.value || txData.value || "0";

  if (!to || !data) {
    return { success: false, error: "Missing transaction target or calldata", order_id: null };
  }

  // Step 1: Simulate transaction before sending
  const simRaw = runOnchainos(
    `gateway simulate --from ${account.address} --to ${to} --data ${data} --chain ${chain}`
  );
  if (simRaw && simRaw.includes("fail")) {
    return { success: false, error: "Transaction simulation failed — trade would revert", order_id: null };
  }

  // Step 2: Estimate gas
  let gasEstimate: bigint | undefined;
  try {
    gasEstimate = await publicClient.estimateGas({
      account: account.address,
      to: to as `0x${string}`,
      data: data as `0x${string}`,
      value: BigInt(value),
    });
  } catch (e: any) {
    return { success: false, error: `Gas estimation failed: ${e.message}`, order_id: null };
  }

  // Step 3: Send transaction
  try {
    const txHash = await walletClient.sendTransaction({
      to: to as `0x${string}`,
      data: data as `0x${string}`,
      value: BigInt(value),
      gas: gasEstimate ? gasEstimate * 120n / 100n : undefined, // 20% buffer
    });

    const orderId = generateId().replace("quote_", "order_");

    return {
      success: true,
      tx_hash: txHash,
      order_id: orderId,
      chain,
      slippage: `${slippage}%`,
      gas_estimate: gasEstimate?.toString(),
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
