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

export async function getQuote(
  fromToken: string,
  toToken: string,
  amount: string,
  chain = "xlayer"
): Promise<TradeQuote> {
  const raw = runOnchainos(
    `swap quote --from ${fromToken} --to ${toToken} --amount ${amount} --chain ${chain}`
  );

  if (raw) {
    const parsed = safeJsonParse(raw);
    if (parsed?.data || parsed) {
      const d = parsed.data?.[0] || parsed;
      return {
        quote_id: generateId(),
        from_token: fromToken,
        to_token: toToken,
        chain,
        amount_in: amount,
        expected_out: d.toTokenAmount || d.expectedOut || "0",
        price_impact: d.priceImpact || d.price_impact || 0,
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
    price_impact: 0,
    route: "unavailable",
    expires_at: new Date(Date.now() + 60000).toISOString(),
  };
}

export async function executeTrade(
  fromToken: string,
  toToken: string,
  amount: string,
  chain = "xlayer"
) {
  const swapRaw = runOnchainos(
    `swap swap --from ${fromToken} --to ${toToken} --amount ${amount} --chain ${chain} --wallet ${account.address}`
  );

  if (!swapRaw) {
    return { success: false, error: "Failed to get swap data from Onchain OS", order_id: null };
  }

  const swapData = safeJsonParse(swapRaw);
  if (!swapData?.data) {
    return { success: false, error: "Invalid swap data", order_id: null };
  }

  const txData = swapData.data[0] || swapData.data;
  const to = txData.tx?.to || txData.to || txData.contractAddress;
  const data = txData.tx?.data || txData.data || txData.calldata;
  const value = txData.tx?.value || txData.value || "0";

  // Simulate first
  const simRaw = runOnchainos(
    `gateway simulate --from ${account.address} --to ${to} --data ${data} --chain ${chain}`
  );
  if (simRaw && simRaw.includes("fail")) {
    return { success: false, error: "Transaction simulation failed", order_id: null };
  }

  try {
    const txHash = await walletClient.sendTransaction({
      to: to as `0x${string}`,
      data: data as `0x${string}`,
      value: BigInt(value),
    });

    return {
      success: true,
      tx_hash: txHash,
      order_id: generateId().replace("quote_", "order_"),
      chain,
      explorer: `https://www.okx.com/web3/explorer/xlayer/tx/${txHash}`,
    };
  } catch (e: any) {
    return { success: false, error: e.message, order_id: null };
  }
}

export async function getOrderStatus(orderId: string, chain = "xlayer") {
  return {
    order_id: orderId,
    status: "tracking not yet implemented",
    chain,
    timestamp: new Date().toISOString(),
  };
}

export function getWalletAddress(): string {
  return account.address;
}
