/**
 * Token Launch Module — Clanker-style deploy on X Layer
 *
 * Flow:  deploy ERC-20  →  create Uniswap V3 pool  →  approve  →  add full-range liquidity
 *
 * All functions return unsigned transaction objects for the frontend (OKX Wallet) to sign.
 */

// ── Addresses on X Layer ──
export const XLAYER_WOKB = "0xe538905cf8410324e03A5A23C1c177a474D59b2b";
export const UNISWAP_V3_FACTORY = "0xb76c7abd3eb4b07ec14c5d7f9b265e8d37432e11";
export const UNISWAP_V3_NFPM = "0x8f56331c494ea64e60ab4fb7d1cd38a09230fe86";
export const XLAYER_RPC = "https://rpc.xlayer.tech";
export const XLAYER_CHAIN_ID_HEX = "0xc4";

// ── Compiled ERC-20 bytecode ──
// Source: contracts/MemeToken.sol — Solidity 0.8.34, optimizer 200 runs
// constructor(string name, string symbol, uint256 totalSupply) → mints to msg.sender, 18 decimals
const MEME_TOKEN_BYTECODE =
  "608060405234801561000f575f5ffd5b506040516108f13803806108f183398101604081905261002e91610134565b5f6100398482610230565b5060016100468382610230565b506002819055335f818152600360209081526040808320859055518481527fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef910160405180910390a35050506102ee565b634e487b7160e01b5f52604160045260245ffd5b5f82601f8301126100ba575f5ffd5b81516001600160401b038111156100d3576100d3610097565b604051601f8201601f19908116603f011681016001600160401b038111828210171561010157610101610097565b604052818152838201602001851015610118575f5ffd5b8160208501602083015e5f918101602001919091529392505050565b5f5f5f60608486031215610146575f5ffd5b83516001600160401b0381111561015b575f5ffd5b610167868287016100ab565b602086015190945090506001600160401b03811115610184575f5ffd5b610190868287016100ab565b925050604084015190509250925092565b600181811c908216806101b557607f821691505b6020821081036101d357634e487b7160e01b5f52602260045260245ffd5b50919050565b601f82111561022b578282111561022b57805f5260205f20601f840160051c602085101561020457505f5b90810190601f840160051c035f5b81811015610227575f83820155600101610212565b5050505b505050565b81516001600160401b0381111561024957610249610097565b61025d8161025784546101a1565b846101d9565b6020601f82116001811461028f575f83156102785750848201515b5f19600385901b1c1916600184901b1784556102e7565b5f84815260208120601f198516915b828110156102be578785015182556020948501946001909201910161029e565b50848210156102db57868401515f19600387901b60f8161c191681555b505060018360011b0184555b5050505050565b6105f6806102fb5f395ff3fe608060405234801561000f575f5ffd5b5060043610610090575f3560e01c8063313ce56711610063578063313ce567146100ff57806370a082311461011957806395d89b4114610138578063a9059cbb14610140578063dd62ed3e14610153575f5ffd5b806306fdde0314610094578063095ea7b3146100b257806318160ddd146100d557806323b872dd146100ec575b5f5ffd5b61009c61017d565b6040516100a99190610452565b60405180910390f35b6100c56100c03660046104a2565b610208565b60405190151581526020016100a9565b6100de60025481565b6040519081526020016100a9565b6100c56100fa3660046104ca565b610274565b610107601281565b60405160ff90911681526020016100a9565b6100de610127366004610504565b60036020525f908152604090205481565b61009c610329565b6100c561014e3660046104a2565b610336565b6100de61016136600461051d565b600460209081525f928352604080842090915290825290205481565b5f80546101899061054e565b80601f01602080910402602001604051908101604052809291908181526020018280546101b59061054e565b80156102005780601f106101d757610100808354040283529160200191610200565b820191905f5260205f20905b8154815290600101906020018083116101e357829003601f168201915b505050505081565b335f8181526004602090815260408083206001600160a01b038716808552925280832085905551919290917f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925906102629086815260200190565b60405180910390a35060015b92915050565b6001600160a01b0383165f9081526004602090815260408083203384529091528120545f19811461031557828110156102e75760405162461bcd60e51b815260206004820152601060248201526f45524332303a20616c6c6f77616e636560801b60448201526064015b60405180910390fd5b6102f1838261059a565b6001600160a01b0386165f9081526004602090815260408083203384529091529020555b610320858585610349565b95945050505050565b600180546101899061054e565b5f610342338484610349565b9392505050565b6001600160a01b0383165f908152600360205260408120548211156103a15760405162461bcd60e51b815260206004820152600e60248201526d45524332303a2062616c616e636560901b60448201526064016102de565b6001600160a01b0384165f90815260036020526040812080548492906103c890849061059a565b90915550506001600160a01b0383165f90815260036020526040812080548492906103f49084906105ad565b92505081905550826001600160a01b0316846001600160a01b03167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef8460405161044091815260200190565b60405180910390a35060019392505050565b602081525f82518060208401528060208501604085015e5f604082850101526040601f19601f83011684010191505092915050565b80356001600160a01b038116811461049d575f5ffd5b919050565b5f5f604083850312156104b3575f5ffd5b6104bc83610487565b946020939093013593505050565b5f5f5f606084860312156104dc575f5ffd5b6104e584610487565b92506104f360208501610487565b929592945050506040919091013590565b5f60208284031215610514575f5ffd5b61034282610487565b5f5f6040838503121561052e575f5ffd5b61053783610487565b915061054560208401610487565b90509250929050565b600181811c9082168061056257607f821691505b60208210810361058057634e487b7160e01b5f52602260045260245ffd5b50919050565b634e487b7160e01b5f52601160045260245ffd5b8181038181111561026e5761026e610586565b8082018082111561026e5761026e61058656fea2646970667358221220e1b9214295bf7b88814ce2025c8e6f409ccea161c8cefced8252e181a62813b264736f6c63430008220033";

// ── Helpers ──

function encodeUint256(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

function encodeConstructorArgs(name: string, symbol: string, totalSupply: bigint): string {
  const nameBytes = Buffer.from(name, "utf8");
  const symbolBytes = Buffer.from(symbol, "utf8");
  const namePadded = Math.ceil(nameBytes.length / 32) * 32 || 32;
  const symbolPadded = Math.ceil(symbolBytes.length / 32) * 32 || 32;
  const offsetName = 96;
  const offsetSymbol = offsetName + 32 + namePadded;

  let enc = "";
  enc += encodeUint256(BigInt(offsetName));
  enc += encodeUint256(BigInt(offsetSymbol));
  enc += encodeUint256(totalSupply);
  enc += encodeUint256(BigInt(nameBytes.length));
  enc += nameBytes.toString("hex").padEnd(namePadded * 2, "0");
  enc += encodeUint256(BigInt(symbolBytes.length));
  enc += symbolBytes.toString("hex").padEnd(symbolPadded * 2, "0");
  return enc;
}

function encodeInt256(n: bigint): string {
  if (n >= 0n) return n.toString(16).padStart(64, "0");
  return (BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff") + n + 1n).toString(16);
}

// ── Transaction builders ──

export type TxData = { to: string | null; data: string; value: string; chainId: string };

export function buildDeployTokenTx(p: {
  name: string; symbol: string; totalSupply: string; from: string;
}): TxData {
  const supply = BigInt(p.totalSupply) * 10n ** 18n;
  return {
    to: null,
    data: "0x" + MEME_TOKEN_BYTECODE + encodeConstructorArgs(p.name, p.symbol, supply),
    value: "0x0",
    chainId: XLAYER_CHAIN_ID_HEX,
  };
}

export function buildCreatePoolTx(p: {
  tokenAddress: string; initialPriceOKB: string; from: string;
}): TxData {
  const token = p.tokenAddress.toLowerCase();
  const wokb = XLAYER_WOKB.toLowerCase();
  const [token0, token1] = token < wokb ? [token, wokb] : [wokb, token];
  const tokenIsToken0 = token < wokb;

  const priceOKB = parseFloat(p.initialPriceOKB);
  const priceRatio = tokenIsToken0 ? priceOKB : 1 / priceOKB;
  const sqrtPriceX96 = BigInt(Math.floor(Math.sqrt(priceRatio) * 2 ** 96));

  const fee = 10000n; // 1%
  // createAndInitializePoolIfNecessary(address,address,uint24,uint160)
  const data = "0x13ead562" +
    token0.replace("0x", "").padStart(64, "0") +
    token1.replace("0x", "").padStart(64, "0") +
    encodeUint256(fee) +
    encodeUint256(sqrtPriceX96);

  return { to: UNISWAP_V3_NFPM, data, value: "0x0", chainId: XLAYER_CHAIN_ID_HEX };
}

export function buildApproveNFPMTx(p: {
  tokenAddress: string; amount: bigint; from: string;
}): TxData {
  const data = "0x095ea7b3" +
    UNISWAP_V3_NFPM.replace("0x", "").toLowerCase().padStart(64, "0") +
    encodeUint256(p.amount);
  return { to: p.tokenAddress, data, value: "0x0", chainId: XLAYER_CHAIN_ID_HEX };
}

export function buildAddLiquidityTx(p: {
  tokenAddress: string; tokenAmount: string; okbAmount: string; from: string; deadline?: number;
}): TxData {
  const token = p.tokenAddress.toLowerCase();
  const wokb = XLAYER_WOKB.toLowerCase();
  const [token0, token1] = token < wokb ? [token, wokb] : [wokb, token];
  const tokenIsToken0 = token < wokb;

  const tokenWei = BigInt(p.tokenAmount) * 10n ** 18n;
  const okbWei = BigInt(Math.floor(parseFloat(p.okbAmount) * 1e18));
  const amount0 = tokenIsToken0 ? tokenWei : okbWei;
  const amount1 = tokenIsToken0 ? okbWei : tokenWei;
  const deadline = BigInt(p.deadline || Math.floor(Date.now() / 1000) + 3600);

  // mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))
  const data = "0x88316456" +
    token0.replace("0x", "").padStart(64, "0") +
    token1.replace("0x", "").padStart(64, "0") +
    encodeUint256(10000n) +              // fee 1%
    encodeInt256(-887200n) +             // tickLower (full range, aligned to tickSpacing=200)
    encodeInt256(887200n) +              // tickUpper
    encodeUint256(amount0) +
    encodeUint256(amount1) +
    encodeUint256(0n) +                  // amount0Min
    encodeUint256(0n) +                  // amount1Min
    p.from.replace("0x", "").toLowerCase().padStart(64, "0") +
    encodeUint256(deadline);

  return {
    to: UNISWAP_V3_NFPM, data,
    value: "0x" + okbWei.toString(16),   // send native OKB (auto-wraps)
    chainId: XLAYER_CHAIN_ID_HEX,
  };
}

// ── Predict contract address ──

export async function predictContractAddress(sender: string, rpc: string = XLAYER_RPC): Promise<string> {
  const resp = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionCount", params: [sender, "pending"] }),
  });
  const { result } = await resp.json() as any;
  const nonce = parseInt(result, 16);

  const { keccak256 } = await import("viem");
  const senderHex = sender.toLowerCase().replace("0x", "");
  let nonceRlp: string;
  if (nonce === 0) nonceRlp = "80";
  else if (nonce < 0x80) nonceRlp = nonce.toString(16).padStart(2, "0");
  else {
    const n = nonce.toString(16);
    const len = Math.ceil(n.length / 2);
    nonceRlp = (0x80 + len).toString(16) + n.padStart(len * 2, "0");
  }
  const hash = keccak256(("0xd694" + senderHex + nonceRlp) as `0x${string}`);
  return "0x" + hash.slice(26);
}

// ── Launch plan ──

export interface LaunchPlan {
  tokenName: string;
  tokenSymbol: string;
  totalSupply: string;
  initialPriceOKB: string;
  liquidityTokenAmount: string;
  liquidityOKBAmount: string;
  predictedAddress: string;
  transactions: { step: string; description: string; tx: TxData }[];
}

export async function generateLaunchPlan(params: {
  name: string;
  symbol: string;
  totalSupply?: string;
  initialPriceOKB?: string;
  liquidityPercent?: number;
  okbForLiquidity?: string;
  from: string;
}): Promise<LaunchPlan> {
  const totalSupply = params.totalSupply || "1000000000";
  const liquidityPercent = params.liquidityPercent ?? 100;
  const okbAmount = params.okbForLiquidity || "0.1";
  const liquidityTokens = Math.floor(parseInt(totalSupply) * liquidityPercent / 100);
  const initialPrice = params.initialPriceOKB || (parseFloat(okbAmount) / liquidityTokens).toFixed(18);
  const predictedAddress = await predictContractAddress(params.from);

  return {
    tokenName: params.name,
    tokenSymbol: params.symbol,
    totalSupply,
    initialPriceOKB: initialPrice,
    liquidityTokenAmount: liquidityTokens.toString(),
    liquidityOKBAmount: okbAmount,
    predictedAddress,
    transactions: [
      {
        step: "deploy",
        description: `Deploy ${params.symbol} (${Number(totalSupply).toLocaleString()} supply, 18 decimals)`,
        tx: buildDeployTokenTx({ name: params.name, symbol: params.symbol, totalSupply, from: params.from }),
      },
      {
        step: "createPool",
        description: `Create ${params.symbol}/WOKB pool on Uniswap V3 (1% fee)`,
        tx: buildCreatePoolTx({ tokenAddress: predictedAddress, initialPriceOKB: initialPrice, from: params.from }),
      },
      {
        step: "approve",
        description: `Approve ${params.symbol} for liquidity pool`,
        tx: buildApproveNFPMTx({ tokenAddress: predictedAddress, amount: BigInt(liquidityTokens) * 10n ** 18n, from: params.from }),
      },
      {
        step: "addLiquidity",
        description: `Add liquidity: ${Number(liquidityTokens).toLocaleString()} ${params.symbol} + ${okbAmount} OKB`,
        tx: buildAddLiquidityTx({ tokenAddress: predictedAddress, tokenAmount: liquidityTokens.toString(), okbAmount, from: params.from }),
      },
    ],
  };
}
