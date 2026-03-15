import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";

// ── Client-side wallet: private key NEVER leaves the browser ──

const STORAGE_KEY = "agentnexus_wallet";

interface StoredWallet {
  address: string;
  encryptedKey: string; // encrypted with Web Crypto API
  salt: string;
  iv: string;
}

// Web Crypto API for browser-native encryption
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as any, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptPrivateKey(privateKey: string, password: string): Promise<{ encryptedKey: string; salt: string; iv: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as any },
    key,
    encoder.encode(privateKey)
  );
  return {
    encryptedKey: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

async function decryptPrivateKey(stored: StoredWallet, password: string): Promise<string | null> {
  try {
    const salt = Uint8Array.from(atob(stored.salt), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(stored.iv), c => c.charCodeAt(0));
    const encrypted = Uint8Array.from(atob(stored.encryptedKey), c => c.charCodeAt(0));
    const key = await deriveKey(password, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as any },
      key,
      encrypted as any
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null; // wrong password
  }
}

// ── Public API ──

/**
 * Generate a new wallet in the browser. Returns address + raw private key.
 * Private key is NOT stored yet — call saveWallet() after user sets password.
 */
export function createLocalWallet(): { address: string; privateKey: string } {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return { address: account.address, privateKey };
}

/**
 * Encrypt and save wallet to localStorage.
 */
export async function saveWallet(address: string, privateKey: string, password: string): Promise<boolean> {
  if (password.length < 6) return false;
  const encrypted = await encryptPrivateKey(privateKey, password);
  const stored: StoredWallet = { address, ...encrypted };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  return true;
}

/**
 * Load wallet address from localStorage (no password needed).
 */
export function getLocalWallet(): { address: string } | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const stored: StoredWallet = JSON.parse(raw);
    return { address: stored.address };
  } catch {
    return null;
  }
}

/**
 * Unlock wallet — decrypt private key with password.
 * Returns private key in memory. Caller should clear after use.
 */
export async function unlockLocalWallet(password: string): Promise<{ privateKey: string; address: string } | null> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const stored: StoredWallet = JSON.parse(raw);
    const privateKey = await decryptPrivateKey(stored, password);
    if (!privateKey) return null;
    return { privateKey, address: stored.address };
  } catch {
    return null;
  }
}

/**
 * Sign a raw transaction in the browser. Private key never leaves.
 */
export async function signTransaction(
  privateKey: string,
  tx: { to: string; data: string; value: string; gas?: string; chainId?: number }
): Promise<string> {
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const xlayer = {
    id: tx.chainId || 196,
    name: "X Layer",
    nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.xlayer.tech"] } },
  } as const;

  const walletClient = createWalletClient({
    account,
    chain: xlayer,
    transport: http("https://rpc.xlayer.tech"),
  });

  const txHash = await walletClient.sendTransaction({
    to: tx.to as `0x${string}`,
    data: tx.data as `0x${string}`,
    value: BigInt(tx.value || "0"),
    gas: tx.gas ? BigInt(tx.gas) : undefined,
  });

  return txHash;
}

/**
 * Check if wallet exists in localStorage.
 */
export function hasLocalWallet(): boolean {
  return !!localStorage.getItem(STORAGE_KEY);
}

/**
 * Import wallet from private key.
 */
export async function importWallet(privateKey: string, password: string): Promise<{ address: string } | null> {
  try {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const saved = await saveWallet(account.address, privateKey, password);
    if (!saved) return null;
    return { address: account.address };
  } catch {
    return null;
  }
}
