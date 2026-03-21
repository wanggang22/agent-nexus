/**
 * Token Launch Module — Clanker-style deploy on X Layer
 *
 * Single transaction via MemeLaunchFactory contract:
 *   deploy ERC-20 + create pool + approve + add single-sided liquidity
 *
 * 100% tokens go into pool, user pays zero OKB.
 * Revenue comes from 1% trading fees on the Uniswap V3 pool.
 */

// ── Addresses on X Layer ──
export const XLAYER_WOKB = "0xe538905cf8410324e03A5A23C1c177a474D59b2b";
export const UNISWAP_V3_FACTORY = "0x4b2ab38dbf28d31d467aa8993f6c2585981d6804";
export const UNISWAP_V3_NFPM = "0x315e413a11ab0df498ef83873012430ca36638ae";
export const LAUNCH_FACTORY = "0x5cebe1fa24cc3517ffa5e0df3179bb6757bd8f0a";
export const XLAYER_RPC = "https://rpc.xlayer.tech";
export const XLAYER_CHAIN_ID_HEX = "0xc4";

// ── Default launch params ──
const DEFAULT_TOTAL_SUPPLY = "1000000000"; // 1 billion
const DEFAULT_INITIAL_MCAP_OKB = 50; // ~$4400 initial market cap
const TICK_SPACING = 200; // 1% fee tier
const MAX_TICK = 887200;
const MIN_TICK = -887200;

// ── Helpers ──

function encodeUint256(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

function encodeInt256(n: bigint): string {
  if (n >= 0n) return n.toString(16).padStart(64, "0");
  return (BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff") + n + 1n).toString(16);
}

/** Convert a price to the nearest tick, aligned to TICK_SPACING */
function priceToTick(price: number): number {
  const rawTick = Math.log(price) / Math.log(1.0001);
  return Math.floor(rawTick / TICK_SPACING) * TICK_SPACING;
}

/** Convert a tick to sqrtPriceX96 */
function tickToSqrtPriceX96(tick: number): bigint {
  const sqrtPrice = Math.sqrt(1.0001 ** tick);
  return BigInt(Math.floor(sqrtPrice * 2 ** 96));
}

/** Encode a string as ABI dynamic bytes */
function encodeString(s: string): string {
  const bytes = Buffer.from(s, "utf8");
  const padded = Math.ceil(bytes.length / 32) * 32 || 32;
  return encodeUint256(BigInt(bytes.length)) + bytes.toString("hex").padEnd(padded * 2, "0");
}

// ── Transaction builder ──

export type TxData = { to: string; data: string; value: string; chainId: string; gas?: string };

/**
 * Build the single launch transaction that calls MemeLaunchFactory.launch()
 *
 * function launch(string name, string symbol, uint256 totalSupply,
 *                 int24 tickLower, int24 tickUpper, uint160 sqrtPriceX96)
 */
function buildFactoryLaunchTx(p: {
  name: string;
  symbol: string;
  totalSupply: string;
  tickLower: number;
  tickUpper: number;
  sqrtPriceX96: bigint;
}): TxData {
  const supply = BigInt(p.totalSupply) * 10n ** 18n;

  // launch(string,string,uint256,int24,int24,uint160)
  // selector = keccak256("launch(string,string,uint256,int24,int24,uint160)")
  const selector = "faa8d6a7";

  // ABI encode with dynamic strings
  // Head: 6 slots (offsets for name, symbol, then static values)
  const nameEncoded = encodeString(p.name);
  const symbolEncoded = encodeString(p.symbol);

  // Offsets: name and symbol are dynamic, start after 6 * 32 bytes = 192
  const nameOffset = 6 * 32; // 192
  const symbolOffset = nameOffset + (nameEncoded.length / 2); // after name data

  let data = "0x" + selector;
  data += encodeUint256(BigInt(nameOffset)); // offset to name
  data += encodeUint256(BigInt(symbolOffset)); // offset to symbol
  data += encodeUint256(supply); // totalSupply
  data += encodeInt256(BigInt(p.tickLower)); // tickLower
  data += encodeInt256(BigInt(p.tickUpper)); // tickUpper
  data += encodeUint256(p.sqrtPriceX96); // sqrtPriceX96
  data += nameEncoded; // name data
  data += symbolEncoded; // symbol data

  return {
    to: LAUNCH_FACTORY,
    data,
    value: "0x" + (10n ** 15n).toString(16), // 0.001 OKB seed liquidity
    chainId: XLAYER_CHAIN_ID_HEX,
    gas: "0x500000", // 5M gas (deploys token + wraps OKB + creates pool + adds liquidity)
  };
}

// ── Launch plan ──

export interface LaunchPlan {
  tokenName: string;
  tokenSymbol: string;
  totalSupply: string;
  initialMarketCapOKB: number;
  initialPriceOKB: string;
  tradeUrl: string;
  factoryAddress: string;
  transactions: { step: string; description: string; tx: TxData }[];
}

/**
 * Generate a Clanker-style launch plan.
 * Single transaction via factory contract — deploy + pool + liquidity in one TX.
 */
export async function generateLaunchPlan(params: {
  name: string;
  symbol: string;
  totalSupply?: string;
  initialMarketCapOKB?: number;
  from: string;
}): Promise<LaunchPlan> {
  const totalSupply = params.totalSupply || DEFAULT_TOTAL_SUPPLY;
  const mcapOKB = params.initialMarketCapOKB ?? DEFAULT_INITIAL_MCAP_OKB;
  const supplyNum = parseInt(totalSupply);
  const pricePerToken = mcapOKB / supplyNum; // OKB per token

  // The factory deploys the token, so we can't predict the address ahead of time.
  // The token address will be in the TokenLaunched event logs after TX confirms.

  // Calculate tick parameters based on token ordering
  // Since we don't know the token address yet, we calculate for both cases.
  // The factory handles token ordering internally.
  // We need to provide ticks that work for single-sided liquidity.

  // For the factory: it sorts tokens internally and handles the logic.
  // We just need to provide tickLower, tickUpper, and sqrtPriceX96
  // that correspond to single-sided liquidity for the meme token.

  // Since the factory creates the token via CREATE, and the factory address is fixed,
  // we can predict the token address from the factory's nonce.
  const factoryNonceResp = await fetch(XLAYER_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionCount", params: [LAUNCH_FACTORY, "pending"] }),
  });
  const { result: nonceHex } = await factoryNonceResp.json() as any;
  const nonce = parseInt(nonceHex, 16);

  // Predict token address using RLP(factory, nonce)
  const { keccak256 } = await import("viem");
  const factoryHex = LAUNCH_FACTORY.toLowerCase().replace("0x", "");
  let nonceRlp: string;
  if (nonce === 0) nonceRlp = "80";
  else if (nonce < 0x80) nonceRlp = nonce.toString(16).padStart(2, "0");
  else {
    const n = nonce.toString(16);
    const len = Math.ceil(n.length / 2);
    nonceRlp = (0x80 + len).toString(16) + n.padStart(len * 2, "0");
  }
  const predictedToken = "0x" + keccak256(("0xd694" + factoryHex + nonceRlp) as `0x${string}`).slice(26);

  const token = predictedToken.toLowerCase();
  const wokb = XLAYER_WOKB.toLowerCase();
  const tokenIsToken0 = token < wokb;

  // V3 price = token1/token0
  const v3Price = tokenIsToken0 ? pricePerToken : 1 / pricePerToken;
  const priceTick = priceToTick(v3Price);

  let tickLower: number;
  let tickUpper: number;
  let poolSqrtPriceX96: bigint;

  if (tokenIsToken0) {
    // Dual-sided: price inside range, 0.001 OKB seed
    tickLower = priceTick;
    tickUpper = MAX_TICK;
    poolSqrtPriceX96 = tickToSqrtPriceX96(priceTick + 1);
  } else {
    tickLower = MIN_TICK;
    tickUpper = priceTick;
    poolSqrtPriceX96 = tickToSqrtPriceX96(priceTick - 1);
  }

  const tradeUrl = `https://web3.okx.com/dex-swap#inputChain=196&inputCurrency=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE&outputCurrency=${predictedToken}`;

  return {
    tokenName: params.name,
    tokenSymbol: params.symbol,
    totalSupply,
    initialMarketCapOKB: mcapOKB,
    initialPriceOKB: pricePerToken.toExponential(4),
    tradeUrl,
    factoryAddress: LAUNCH_FACTORY,
    transactions: [
      {
        step: "launch",
        description: `Deploy ${params.symbol} + create pool + add liquidity (single TX)`,
        tx: buildFactoryLaunchTx({
          name: params.name,
          symbol: params.symbol,
          totalSupply,
          tickLower,
          tickUpper,
          sqrtPriceX96: poolSqrtPriceX96,
        }),
      },
    ],
  };
}
