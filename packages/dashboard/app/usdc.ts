"use client";

/**
 * USDC approval + balance utilities for X Layer
 * Handles ERC-20 approve so x402 payments auto-deduct without user confirmation.
 */

import { createPublicClient, http, encodeFunctionData, formatUnits, parseUnits } from "viem";

const XLAYER_USDC = "0x74b7f16337b8972027f6196a17a631ac6de26d22" as `0x${string}`;
const XLAYER_RPC = "https://rpc.xlayer.tech";
const XLAYER_CHAIN_ID = 196;

// Minimal ERC-20 ABI for approve, allowance, balanceOf
const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const publicClient = createPublicClient({
  chain: {
    id: XLAYER_CHAIN_ID,
    name: "X Layer",
    nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
    rpcUrls: { default: { http: [XLAYER_RPC] } },
  },
  transport: http(XLAYER_RPC),
});

/**
 * Get USDC balance for an address (human-readable, e.g. "5.23")
 */
export async function getUSDCBalance(address: string): Promise<string> {
  try {
    const balance = await publicClient.readContract({
      address: XLAYER_USDC,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    });
    return formatUnits(balance as bigint, 6);
  } catch {
    return "0";
  }
}

/**
 * Get current USDC allowance from owner to spender (human-readable)
 */
export async function getUSDCAllowance(owner: string, spender: string): Promise<string> {
  try {
    const allowance = await publicClient.readContract({
      address: XLAYER_USDC,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner as `0x${string}`, spender as `0x${string}`],
    });
    return formatUnits(allowance as bigint, 6);
  } catch {
    return "0";
  }
}

/**
 * Build USDC approve transaction data.
 * Returns { to, data, value } ready for signing.
 * @param spender - Platform wallet that will call transferFrom
 * @param amount - USDC amount to approve (human readable, e.g. "10")
 */
export function buildApproveTransaction(spender: string, amount: string): {
  to: string;
  data: string;
  value: string;
} {
  const amountWei = parseUnits(amount, 6); // USDC has 6 decimals

  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender as `0x${string}`, amountWei],
  });

  return {
    to: XLAYER_USDC,
    data,
    value: "0",
  };
}

/**
 * Default approve amount — generous enough for many calls
 * $10 USDC = ~125 deep analysis calls at $0.08 each
 */
export const DEFAULT_APPROVE_AMOUNT = "10";

/**
 * USDC contract address (for display)
 */
export const USDC_ADDRESS = XLAYER_USDC;
