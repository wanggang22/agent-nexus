import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { writeFileSync, readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WALLET_FILE = path.resolve(__dirname, "../../../.user-wallets.json");

interface UserWallet {
  address: string;
  privateKey: string;
  createdAt: string;
}

interface WalletStore {
  // key format: "telegram_123456" or "twitter_789012"
  [userId: string]: UserWallet;
}

// Load from file on startup
let store: WalletStore = {};
if (existsSync(WALLET_FILE)) {
  try {
    store = JSON.parse(readFileSync(WALLET_FILE, "utf-8"));
  } catch {
    store = {};
  }
}

function save() {
  try {
    writeFileSync(WALLET_FILE, JSON.stringify(store, null, 2));
  } catch (e: any) {
    console.error(`[UserWallet] Failed to save: ${e.message}`);
  }
}

/**
 * Get or create a wallet for a user.
 * Returns { address, privateKey, isNew }
 */
export function getOrCreateWallet(
  platform: "telegram" | "twitter" | "api",
  userId: string
): { address: string; privateKey: string; isNew: boolean } {
  const key = `${platform}_${userId}`;

  if (store[key]) {
    return { ...store[key], isNew: false };
  }

  // Generate new wallet
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  store[key] = {
    address: account.address,
    privateKey,
    createdAt: new Date().toISOString(),
  };
  save();

  console.log(`[UserWallet] Created wallet for ${key}: ${account.address}`);
  return { address: account.address, privateKey, isNew: true };
}

/**
 * Get wallet by user key. Returns null if not found.
 */
export function getWallet(
  platform: "telegram" | "twitter" | "api",
  userId: string
): UserWallet | null {
  return store[`${platform}_${userId}`] || null;
}

/**
 * Get wallet stats.
 */
export function getWalletStats() {
  const entries = Object.entries(store);
  return {
    total_users: entries.length,
    by_platform: {
      telegram: entries.filter(([k]) => k.startsWith("telegram_")).length,
      twitter: entries.filter(([k]) => k.startsWith("twitter_")).length,
      api: entries.filter(([k]) => k.startsWith("api_")).length,
    },
  };
}
