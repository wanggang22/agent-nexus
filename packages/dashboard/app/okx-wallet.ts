"use client";

/**
 * OKX Wallet Connection via @okxconnect/universal-provider
 */

import { OKXUniversalProvider } from "@okxconnect/universal-provider";

const XLAYER_CHAIN = "eip155:196";
const XLAYER_RPC = "https://rpc.xlayer.tech";

let provider: OKXUniversalProvider | null = null;
let currentSession: any = null;

/**
 * Initialize the OKX Universal Provider
 */
async function getProvider(): Promise<OKXUniversalProvider> {
  if (provider) return provider;

  provider = await OKXUniversalProvider.init({
    dappMetaData: {
      name: "AgentNexus",
      icon: "https://dashboard-production-fe35.up.railway.app/favicon.ico",
    },
  });

  provider.on("session_delete", () => {
    currentSession = null;
  });

  return provider;
}

/**
 * Connect OKX Wallet
 */
export async function connectOKXWallet(): Promise<{ address: string } | null> {
  try {
    const p = await getProvider();

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
        redirect: typeof window !== "undefined" ? window.location.href : "",
      },
    });

    currentSession = session;

    const accounts = session?.namespaces?.eip155?.accounts || [];
    const xlayerAccount = accounts.find((a: string) => a.includes(":196:")) || accounts[0];
    if (!xlayerAccount) {
      console.error("[OKX] No account returned");
      return null;
    }

    const parts = xlayerAccount.split(":");
    const address = parts[parts.length - 1];
    return { address };
  } catch (e: any) {
    console.error("[OKX Wallet] Connect error:", e);
    // Show error to user
    if (e?.message?.includes("reject") || e?.code === 300) {
      alert("Connection rejected by user");
    } else if (e?.message) {
      alert(`OKX Wallet: ${e.message}`);
    }
    return null;
  }
}

/**
 * Check if connected
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
  const account = accounts.find((a: string) => a.includes(":196:")) || accounts[0];
  if (!account) return null;
  const parts = account.split(":");
  return parts[parts.length - 1];
}

/**
 * Send transaction via OKX Wallet
 */
export async function sendOKXTransaction(tx: {
  to: string;
  data: string;
  value: string;
  gas?: string;
}): Promise<string> {
  if (!provider || !currentSession) throw new Error("OKX Wallet not connected");
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
 * Disconnect
 */
export function disconnectOKXWallet() {
  if (provider) {
    try { provider.disconnect(); } catch {}
    currentSession = null;
  }
}
