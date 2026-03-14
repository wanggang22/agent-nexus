import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WALLET_FILE = path.resolve(__dirname, "../../../.user-wallets.json");

interface StoredWallet {
  address: string;
  encryptedKey: string; // AES-256-GCM encrypted private key
  salt: string;         // unique salt per user
  iv: string;           // initialization vector
  authTag: string;      // GCM auth tag
  createdAt: string;
}

interface WalletStore {
  [userId: string]: StoredWallet;
}

// Users waiting to set password (temporary, in-memory only)
const pendingSetup = new Map<string, { privateKey: string; address: string }>();

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

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32);
}

function encryptKey(privateKey: string, password: string): { encryptedKey: string; salt: string; iv: string; authTag: string } {
  const salt = randomBytes(32);
  const key = deriveKey(password, salt);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(privateKey, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return {
    encryptedKey: encrypted,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    authTag,
  };
}

function decryptKey(stored: StoredWallet, password: string): string | null {
  try {
    const salt = Buffer.from(stored.salt, "hex");
    const key = deriveKey(password, salt);
    const iv = Buffer.from(stored.iv, "hex");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(Buffer.from(stored.authTag, "hex"));
    let decrypted = decipher.update(stored.encryptedKey, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    // Wrong password → GCM auth fails
    return null;
  }
}

// ── Public API ──

/**
 * Step 1: Generate a new wallet. Returns address.
 * Private key is held in memory until confirmWallet() is called with a password.
 */
export function createWallet(
  platform: "telegram" | "twitter" | "api",
  userId: string
): { address: string; isNew: boolean } {
  const key = `${platform}_${userId}`;

  // Already has encrypted wallet
  if (store[key]) {
    return { address: store[key].address, isNew: false };
  }

  // Already pending setup
  const pending = pendingSetup.get(key);
  if (pending) {
    return { address: pending.address, isNew: true };
  }

  // Generate new
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  pendingSetup.set(key, { privateKey, address: account.address });
  console.log(`[UserWallet] Wallet generated for ${key}: ${account.address} (awaiting password)`);

  // Auto-expire pending after 10 minutes
  setTimeout(() => pendingSetup.delete(key), 10 * 60 * 1000);

  return { address: account.address, isNew: true };
}

/**
 * Step 2: User sets their password. Encrypts and stores the private key.
 * After this, the plaintext private key is gone forever.
 */
export function confirmWallet(
  platform: "telegram" | "twitter" | "api",
  userId: string,
  password: string
): { success: boolean; error?: string } {
  const key = `${platform}_${userId}`;

  if (store[key]) {
    return { success: false, error: "Wallet already confirmed" };
  }

  const pending = pendingSetup.get(key);
  if (!pending) {
    return { success: false, error: "No pending wallet. Use /start first" };
  }

  if (password.length < 6) {
    return { success: false, error: "Password must be at least 6 characters" };
  }

  // Encrypt and store
  const encrypted = encryptKey(pending.privateKey, password);
  store[key] = {
    address: pending.address,
    ...encrypted,
    createdAt: new Date().toISOString(),
  };
  save();

  // Clear plaintext from memory
  pendingSetup.delete(key);
  console.log(`[UserWallet] Wallet confirmed for ${key}: ${pending.address}`);

  return { success: true };
}

/**
 * Decrypt private key with user's password. Returns key or null if wrong password.
 * Caller MUST clear the returned key from memory after use.
 */
export function unlockWallet(
  platform: "telegram" | "twitter" | "api",
  userId: string,
  password: string
): { privateKey: string; address: string } | null {
  const key = `${platform}_${userId}`;
  const stored = store[key];
  if (!stored) return null;

  const privateKey = decryptKey(stored, password);
  if (!privateKey) return null;

  return { privateKey, address: stored.address };
}

/**
 * Get wallet address (no password needed — address is public).
 */
export function getWalletAddress(
  platform: "telegram" | "twitter" | "api",
  userId: string
): string | null {
  const key = `${platform}_${userId}`;
  const stored = store[key];
  if (stored) return stored.address;
  const pending = pendingSetup.get(key);
  if (pending) return pending.address;
  return null;
}

/**
 * Check if wallet exists and is confirmed (has encrypted key).
 */
export function isWalletReady(
  platform: "telegram" | "twitter" | "api",
  userId: string
): boolean {
  return !!store[`${platform}_${userId}`];
}

/**
 * Check if wallet is pending password setup.
 */
export function isWalletPending(
  platform: "telegram" | "twitter" | "api",
  userId: string
): boolean {
  return pendingSetup.has(`${platform}_${userId}`);
}

// ── Cross-platform binding (Twitter ↔ Telegram) ──
interface BindCode {
  code: string;
  telegramUserId: string;
  expiry: number;
}

const bindCodes = new Map<string, BindCode>(); // code → BindCode
const bindings = new Map<string, string>(); // "twitter_123" → "telegram_456"

/**
 * Generate a one-time bind code for linking Twitter to Telegram wallet.
 * Code expires in 5 minutes.
 */
export function generateBindCode(telegramUserId: string): string {
  // Remove any existing code for this user
  for (const [code, data] of bindCodes) {
    if (data.telegramUserId === telegramUserId) bindCodes.delete(code);
  }

  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  bindCodes.set(code, {
    code,
    telegramUserId,
    expiry: Date.now() + 5 * 60 * 1000, // 5 minutes
  });

  return code;
}

/**
 * Verify a bind code and link Twitter user to Telegram wallet.
 * Code is consumed (deleted) after use.
 */
export function verifyBindCode(
  code: string,
  twitterUserId: string
): { success: boolean; address?: string; error?: string } {
  const bind = bindCodes.get(code.toUpperCase());

  if (!bind) {
    return { success: false, error: "Invalid or expired code" };
  }

  if (Date.now() > bind.expiry) {
    bindCodes.delete(code.toUpperCase());
    return { success: false, error: "Code expired" };
  }

  // Check Telegram wallet exists
  const telegramKey = `telegram_${bind.telegramUserId}`;
  if (!store[telegramKey]) {
    bindCodes.delete(code.toUpperCase());
    return { success: false, error: "Telegram wallet not found" };
  }

  // Bind: Twitter user → Telegram wallet
  bindings.set(`twitter_${twitterUserId}`, telegramKey);

  // Delete code — one-time use
  bindCodes.delete(code.toUpperCase());

  console.log(`[UserWallet] Bound twitter_${twitterUserId} → ${telegramKey}`);
  return { success: true, address: store[telegramKey].address };
}

/**
 * Get the linked Telegram wallet key for a Twitter user.
 */
export function getLinkedWallet(twitterUserId: string): string | null {
  const linked = bindings.get(`twitter_${twitterUserId}`);
  if (!linked || !store[linked]) return null;
  return store[linked].address;
}

/**
 * Unlock the linked wallet for a Twitter user (needs Telegram session).
 */
export function getLinkedTelegramId(twitterUserId: string): string | null {
  const linked = bindings.get(`twitter_${twitterUserId}`);
  if (!linked) return null;
  return linked.replace("telegram_", "");
}

// Auto-cleanup expired bind codes every minute
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of bindCodes) {
    if (now > data.expiry) bindCodes.delete(code);
  }
}, 60 * 1000);

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
