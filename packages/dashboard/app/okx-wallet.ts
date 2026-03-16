"use client";

/**
 * OKX Wallet Connection
 *
 * Strategy:
 * 1. If OKX Wallet browser extension detected → use injected provider (instant, no QR)
 * 2. Fallback: universal-provider (QR code / deep link)
 */

// X Layer config
const XLAYER_CHAIN_ID = "0xc4"; // 196 in hex
const XLAYER_CHAIN = "eip155:196";
const XLAYER_RPC = "https://rpc.xlayer.tech";
const XLAYER_CONFIG = {
  chainId: XLAYER_CHAIN_ID,
  chainName: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: [XLAYER_RPC],
  blockExplorerUrls: ["https://www.okx.com/web3/explorer/xlayer"],
};

let connectedAddress: string | null = null;

/**
 * Check if OKX Wallet extension is installed
 */
function getOKXProvider(): any {
  if (typeof window === "undefined") return null;
  return (window as any).okxwallet;
}

/**
 * Connect OKX Wallet — tries browser extension first, then universal provider
 */
export async function connectOKXWallet(): Promise<{ address: string } | null> {
  const okx = getOKXProvider();

  // ── Method 1: Browser Extension (instant) ──
  if (okx) {
    try {
      // Request account access
      const accounts = await okx.request({ method: "eth_requestAccounts" });
      if (!accounts || accounts.length === 0) {
        alert("No accounts returned from OKX Wallet");
        return null;
      }

      // Switch to X Layer
      try {
        await okx.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: XLAYER_CHAIN_ID }],
        });
      } catch (switchError: any) {
        // Chain not added yet — add it
        if (switchError.code === 4902) {
          await okx.request({
            method: "wallet_addEthereumChain",
            params: [XLAYER_CONFIG],
          });
        } else {
          console.warn("[OKX] Chain switch warning:", switchError.message);
        }
      }

      connectedAddress = accounts[0] as string;
      console.log(`[OKX Wallet] Connected via extension: ${connectedAddress}`);
      return { address: connectedAddress };
    } catch (e: any) {
      if (e.code === 4001) {
        alert("Connection rejected");
      } else {
        alert(`OKX Wallet error: ${e.message}`);
      }
      return null;
    }
  }

  // ── Method 2: Universal Provider (QR / deep link) ──
  try {
    const { OKXUniversalProvider } = await import("@okxconnect/universal-provider");
    const provider = await OKXUniversalProvider.init({
      dappMetaData: {
        name: "AgentNexus",
        icon: "https://dashboard-production-fe35.up.railway.app/favicon.ico",
      },
    });

    // Listen for URI to open OKX App
    provider.on("display_uri", (uri: string) => {
      console.log("[OKX] Connection URI:", uri);
      // On mobile: try to open OKX App via deep link
      // On desktop: open in new tab (shows QR in OKX page)
      if (/mobile|android|iphone/i.test(navigator.userAgent)) {
        window.location.href = uri;
      } else {
        window.open(uri, "_blank", "width=500,height=700");
      }
    });

    const session = await provider.connect({
      namespaces: {
        eip155: {
          chains: [XLAYER_CHAIN],
          defaultChain: "196",
          rpcMap: { "196": XLAYER_RPC },
        },
      },
      sessionConfig: {
        redirect: window.location.href,
      },
    });

    const accounts = session?.namespaces?.eip155?.accounts || [];
    if (accounts.length === 0) return null;

    const parts = accounts[0].split(":");
    connectedAddress = parts[parts.length - 1];
    return { address: connectedAddress };
  } catch (e: any) {
    console.error("[OKX Universal] Error:", e);
    alert("Install OKX Wallet extension or open in OKX App browser.\n\nhttps://www.okx.com/web3");
    return null;
  }
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
  const okx = getOKXProvider();
  if (!okx || !connectedAddress) throw new Error("OKX Wallet not connected");

  const txHash = await okx.request({
    method: "eth_sendTransaction",
    params: [{
      from: connectedAddress,
      to: tx.to,
      data: tx.data || "0x",
      value: tx.value ? `0x${BigInt(tx.value).toString(16)}` : "0x0",
      gas: tx.gas ? `0x${BigInt(tx.gas).toString(16)}` : undefined,
    }],
  });
  return txHash;
}

/**
 * Check if running inside OKX Wallet in-app browser
 */
export function isInOKXApp(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes("okx") || ua.includes("okapp") || !!(window as any).okxwallet;
}

/**
 * Auto-connect if inside OKX Wallet (no user action needed after first auth)
 */
export async function autoConnectOKX(): Promise<{ address: string } | null> {
  const okx = getOKXProvider();
  if (!okx) return null;

  try {
    // eth_accounts doesn't prompt — returns [] if not yet authorized
    const accounts = await okx.request({ method: "eth_accounts" });
    if (accounts && accounts.length > 0) {
      // Already authorized — switch to X Layer silently
      try {
        await okx.request({ method: "wallet_switchEthereumChain", params: [{ chainId: XLAYER_CHAIN_ID }] });
      } catch (e: any) {
        if (e.code === 4902) {
          await okx.request({ method: "wallet_addEthereumChain", params: [XLAYER_CONFIG] });
        }
      }
      connectedAddress = accounts[0] as string;
      console.log(`[OKX Wallet] Auto-connected: ${connectedAddress}`);
      return { address: connectedAddress };
    }
  } catch {}
  return null;
}

/**
 * Check if connected
 */
export function isOKXConnected(): boolean {
  return !!connectedAddress;
}

/**
 * Get connected address
 */
export function getOKXAddress(): string | null {
  return connectedAddress;
}

/**
 * Disconnect
 */
export function disconnectOKXWallet() {
  connectedAddress = null;
}
