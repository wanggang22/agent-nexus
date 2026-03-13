import { defineChain } from "viem";

export const xlayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.xlayer.tech"] },
    flashblocks: { http: ["https://rpc.xlayer.tech/flashblocks"] },
  },
  blockExplorers: {
    default: { name: "OKX Explorer", url: "https://www.okx.com/web3/explorer/xlayer" },
  },
});

export const XLAYER_USDC = "0x74b7f16337b8972027f6196a17a631ac6de26d22" as const;
export const XLAYER_CHAIN_ID = 196;
export const XLAYER_CAIP2 = "eip155:196" as const;
