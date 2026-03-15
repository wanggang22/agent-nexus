"use client";

/**
 * OKX Wallet Connection via @okxconnect/universal-provider
 * - Connects to OKX Wallet (browser extension or mobile app)
 * - Supports X Layer (chain ID 196 / eip155:196)
 * - Enables 0 Gas USDC/USDT transfers via x402
 * - Signs transactions through OKX Wallet (user keeps control)
 */

import { OKXUniversalProvider } from "@okxconnect/universal-provider";

const XLAYER_CHAIN = "eip155:196";
const XLAYER_RPC = "https://rpc.xlayer.tech";

let provider: OKXUniversalProvider | null = null;
let currentSession: any = null;

/**
 * Initialize the OKX Universal Provider (call once on app load)
 */
export async function initOKXProvider(): Promise<OKXUniversalProvider> {
  if (provider) return provider;

  provider = await OKXUniversalProvider.init({
    dappMetaData: {
      name: "AgentNexus",
      icon: "https://dashboard-production-fe35.up.railway.app/favicon.ico",
    },
  });

  // Listen for disconnect
  provider.on("session_delete", () => {
    currentSession = null;
    console.log("[OKX Wallet] Disconnected");
  });

  return provider;
}

/**
 * Connect OKX Wallet — opens QR code / deep link to OKX App
 * Returns connected wallet address on X Layer
 */
export async function connectOKXWallet(): Promise<{ address: string } | null> {
  try {
    const p = await initOKXProvider();

    const session = await p.connect({
      namespaces: {
        eip155: {
          chains: [XLAYER_CHAIN],
          defaultChain: "196",
          rpcMap: {
            "196": XLAYER_RPC,
          },
        },
      },
      sessionConfig: {
        redirect: "tg://resolve",
      },
    });

    currentSession = session;

    // Extract address from session
    // Format: "eip155:196:0xAbC..."
    const accounts = session?.namespaces?.eip155?.accounts || [];
    const xlayerAccount = accounts.find((a: string) => a.startsWith(XLAYER_CHAIN));
    if (!xlayerAccount) return null;

    const address = xlayerAccount.split(":")[2];
    console.log(`[OKX Wallet] Connected: ${address}`);
    return { address };
  } catch (e: any) {
    console.error("[OKX Wallet] Connect failed:", e.message);
    return null;
  }
}

/**
 * Check if OKX Wallet is connected
 */
export function isOKXConnected(): boolean {
  return !!provider && !!currentSession;
}

/**
 * Get connected address
 */
export function getOKXAddress(): string | null {
  if (!currentSession) return null;
  const accounts = currentSession?.namespaces?.eip155?.accounts || [];
  const xlayerAccount = accounts.find((a: string) => a.startsWith(XLAYER_CHAIN));
  if (!xlayerAccount) return null;
  return xlayerAccount.split(":")[2];
}

/**
 * Send transaction via OKX Wallet (user approves in wallet)
 */
export async function sendOKXTransaction(tx: {
  to: string;
  data: string;
  value: string;
  gas?: string;
}): Promise<string> {
  if (!provider || !currentSession) {
    throw new Error("OKX Wallet not connected");
  }

  const from = getOKXAddress();
  if (!from) throw new Error("No connected address");

  const txHash = await provider.request(
    {
      method: "eth_sendTransaction",
      params: [{
        from,
        to: tx.to,
        data: tx.data || "0x",
        value: tx.value ? `0x${BigInt(tx.value).toString(16)}` : "0x0",
        gas: tx.gas ? `0x${BigInt(tx.gas).toString(16)}` : undefined,
      }],
    },
    XLAYER_CHAIN
  );

  return txHash as string;
}

/**
 * Sign a message via OKX Wallet
 */
export async function signMessage(message: string): Promise<string> {
  if (!provider || !currentSession) {
    throw new Error("OKX Wallet not connected");
  }

  const from = getOKXAddress();
  if (!from) throw new Error("No connected address");

  // Convert message to hex
  const hex = "0x" + Array.from(new TextEncoder().encode(message))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  const signature = await provider.request(
    {
      method: "personal_sign",
      params: [hex, from],
    },
    XLAYER_CHAIN
  );

  return signature as string;
}

/**
 * Disconnect OKX Wallet
 */
export function disconnectOKXWallet() {
  if (provider) {
    provider.disconnect();
    currentSession = null;
  }
}
