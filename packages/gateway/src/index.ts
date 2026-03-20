import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";
import {
  env, resolveToken, registerToken, xlayer,
  createWallet, confirmWallet, unlockWallet,
  getWalletAddress as getWalletAddr, getWalletStats,
  generateBindCode, verifyBindCode,
  generateLaunchPlan,
} from "shared";
import { createWalletClient, createPublicClient, http, encodeFunctionData, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const AGENT = "Gateway";
const PORT = parseInt(process.env.PORT || "4000");

// ── Platform wallet + USDC config ──
const XLAYER_USDC = "0x74b7f16337b8972027f6196a17a631ac6de26d22" as const;

const platformAccount = privateKeyToAccount(env.PRIVATE_KEY as `0x${string}`);
const paymentPublicClient = createPublicClient({ chain: xlayer, transport: http(env.XLAYER_RPC) });

// Service URLs — configurable for Railway internal networking
const SIGNAL_URL = process.env.SIGNAL_URL || "http://localhost:4001";
const ANALYST_URL = process.env.ANALYST_URL || "http://localhost:4002";
const RISK_URL = process.env.RISK_URL || "http://localhost:4003";
const TRADER_URL = process.env.TRADER_URL || "http://localhost:4004";

const app = express();
app.use(cors({
  origin: [
    "https://dashboard-production-fe35.up.railway.app",
    "http://localhost:3000",
    "http://localhost:3001",
  ],
  credentials: true,
}));
app.use(express.json());

// Rate limiting — 1 request per minute per IP for all AI endpoints
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1,
  message: { error: "Rate limit exceeded. Max 1 request per minute.", retry_after: 60 },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.headers["x-forwarded-for"] as string || "unknown",
});
// Apply to all endpoints that call Claude AI or onchainos
app.use("/chat", aiLimiter);
app.use("/signals", aiLimiter);
app.use("/basic", aiLimiter);
app.use("/analysis", aiLimiter);
app.use("/risk", aiLimiter);
app.use("/trade", aiLimiter);
app.use("/launch", aiLimiter);
app.use("/strategies", aiLimiter);

// ── Shared session store: unlocked wallets with TTL ──
const SESSION_TTL = 365 * 24 * 60 * 60 * 1000; // permanent (until /lock or server restart)
const sessions = new Map<string, { privateKey: string; address: string; expiry: number }>();

function getSession(sessionKey: string): { privateKey: string; address: string } | null {
  const s = sessions.get(sessionKey);
  if (!s) return null;
  if (Date.now() > s.expiry) { sessions.delete(sessionKey); return null; }
  s.expiry = Date.now() + SESSION_TTL; // refresh on use
  return { privateKey: s.privateKey, address: s.address };
}

// Auto-cleanup expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) { if (now > v.expiry) sessions.delete(k); }
}, 5 * 60 * 1000);

// Session API — called by Telegram/Twitter bots
app.post("/session/unlock", (req, res) => {
  const { platform, user_id, private_key, address } = req.body;
  if (!platform || !user_id || !private_key || !address) {
    return res.status(400).json({ error: "platform, user_id, private_key, address required" });
  }
  const key = `${platform}_${user_id}`;
  sessions.set(key, { privateKey: private_key, address, expiry: Date.now() + SESSION_TTL });
  res.json({ success: true, expires_in: "permanent (until /lock)" });
});

app.post("/session/lock", (req, res) => {
  const { platform, user_id } = req.body;
  if (!platform || !user_id) return res.status(400).json({ error: "platform, user_id required" });
  sessions.delete(`${platform}_${user_id}`);
  res.json({ success: true });
});

app.get("/session/check/:platform/:userId", (req, res) => {
  const s = getSession(`${req.params.platform}_${req.params.userId}`);
  res.json({ active: !!s, address: s?.address || null });
});

// Request logger (skip /health and /stats/record to reduce noise)
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path === "/health" || req.path === "/stats/record") return;
    console.log(`[${AGENT}] ${req.method} ${req.path} → ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

// ── Agentic Wallet (OnchainOS TEE wallet) ──
// Setup keyring on headless server (run once at startup)
let keyringReady = false;
function setupKeyring() {
  if (keyringReady) return;
  try {
    // Install gnome-keyring + dbus if missing
    execSync("which gnome-keyring-daemon 2>/dev/null || (apt-get update -qq && apt-get install -y -qq gnome-keyring dbus-x11 libsecret-1-0 2>/dev/null) || true", {
      timeout: 120000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
    });
    // Start dbus session
    try {
      const dbusOut = execSync("dbus-launch --sh-syntax", { timeout: 5000, encoding: "utf-8" });
      const busAddr = dbusOut.match(/DBUS_SESSION_BUS_ADDRESS='([^']+)'/)?.[1] || dbusOut.match(/DBUS_SESSION_BUS_ADDRESS=([^\s;]+)/)?.[1];
      if (busAddr) {
        process.env.DBUS_SESSION_BUS_ADDRESS = busAddr;
        console.log("[Agentic] D-Bus started:", busAddr);
      }
      const busPid = dbusOut.match(/DBUS_SESSION_BUS_PID=(\d+)/)?.[1];
      if (busPid) process.env.DBUS_SESSION_BUS_PID = busPid;
    } catch (e: any) {
      console.warn("[Agentic] D-Bus launch failed:", e.message);
    }
    // Start and unlock gnome-keyring-daemon
    try {
      const krOut = execSync('echo -n "" | gnome-keyring-daemon --start --unlock --components=secrets 2>&1 || true', {
        timeout: 10000, encoding: "utf-8",
        env: process.env,
      });
      const krSocket = krOut.match(/GNOME_KEYRING_CONTROL=(.+)/)?.[1];
      if (krSocket) process.env.GNOME_KEYRING_CONTROL = krSocket;
      console.log("[Agentic] Keyring daemon started");
    } catch (e: any) {
      console.warn("[Agentic] Keyring daemon failed:", e.message);
    }
    keyringReady = true;
    console.log("[Agentic] Keyring setup complete");
  } catch (e: any) {
    console.warn("[Agentic] Keyring setup failed:", e.message);
    keyringReady = true; // Don't retry
  }
}

/** Sanitize shell arguments */
function sanitizeArg(arg: string): string {
  return arg.replace(/[^a-zA-Z0-9._\-@:\/0x ]/g, "");
}

/** Sanitize error messages — don't leak server internals */
function safeError(e: any): string {
  const msg = e.message || "Internal error";
  // Remove file paths and stack traces
  return msg.replace(/\/[^\s]+/g, "[path]").replace(/at\s+.+/g, "").slice(0, 200);
}

function runOnchainos(args: string, timeoutMs = 30000): string {
  try {
    const result = execSync(`onchainos ${args}`, {
      timeout: timeoutMs, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        OKX_API_KEY: env.OKX_API_KEY || process.env.OKX_API_KEY || "",
        OKX_SECRET_KEY: env.OKX_SECRET_KEY || process.env.OKX_SECRET_KEY || "",
        OKX_PASSPHRASE: env.OKX_PASSPHRASE || process.env.OKX_PASSPHRASE || "",
        HOME: process.env.HOME || "/root",
        XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || "/tmp",
        DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS || "",
        GNOME_KEYRING_CONTROL: process.env.GNOME_KEYRING_CONTROL || "",
        // Try file-based keyring fallbacks
        KEYRING_BACKEND: "file",
        PYTHON_KEYRING_BACKEND: "keyrings.alt.file.PlaintextKeyring",
      },
    });
    return result.trim();
  } catch (e: any) {
    const stderr = e.stderr?.toString().trim() || "";
    const stdout = e.stdout?.toString().trim() || "";
    console.error(`[Agentic] onchainos ${args.split(" ")[0]} failed:`, stderr || stdout);
    throw new Error(stderr || stdout || e.message);
  }
}

function parseOnchainosJson(output: string): any {
  try {
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return { raw: output };
  } catch {
    return { raw: output };
  }
}

// Agentic Wallet session store: email → { accountId, addresses }
const agenticSessions = new Map<string, { email: string; accountId?: string; addresses?: any; loggedIn: boolean }>();

// Login with API Key (headless server compatible, no keyring needed)
app.post("/agentic/apikey-login", async (_req, res) => {
  setupKeyring();
  try {
    // onchainos wallet login with API key uses env vars automatically
    const output = runOnchainos("wallet login");
    res.json({ success: true, raw: output });
  } catch (e: any) {
    // If already logged in via API key
    if (e.message.includes("already") || e.message.includes("logged")) {
      res.json({ success: true, message: "Already logged in via API key" });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

// Login with email — sends OTP
app.post("/agentic/login", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email required" });
  setupKeyring();

  try {
    const safeEmail = sanitizeArg(email);
    const output = runOnchainos(`wallet login ${safeEmail} --locale zh-CN`);
    agenticSessions.set(email, { email, loggedIn: false });
    res.json({ success: true, message: "Verification code sent to email", email });
  } catch (e: any) {
    // If already logged in
    if (e.message.includes("already") || e.message.includes("logged")) {
      agenticSessions.set(email, { email, loggedIn: true });
      res.json({ success: true, message: "Already logged in", email, alreadyLoggedIn: true });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

// Verify OTP code
app.post("/agentic/verify", async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: "email and code required" });
  setupKeyring();

  try {
    const safeCode = sanitizeArg(code);
    const output = runOnchainos(`wallet verify ${safeCode}`);
    const session = agenticSessions.get(email) || { email, loggedIn: false, addresses: undefined as any };
    session.loggedIn = true;
    agenticSessions.set(email, session);

    // Get wallet addresses
    try {
      const addrOutput = runOnchainos("wallet addresses --chain 196");
      (session as any).addresses = parseOnchainosJson(addrOutput);
    } catch {}

    // Get balance
    try {
      const balOutput = runOnchainos("wallet balance --chain 196");
      const balData = parseOnchainosJson(balOutput);
      res.json({ success: true, email, addresses: (session as any).addresses, balance: balData });
    } catch {
      res.json({ success: true, email, addresses: (session as any).addresses });
    }
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Get wallet status
app.get("/agentic/status", (_req, res) => {
  try {
    const output = runOnchainos("wallet status");
    const data = parseOnchainosJson(output);
    res.json({ loggedIn: true, ...data, raw: output });
  } catch (e: any) {
    res.json({ loggedIn: false, error: e.message });
  }
});

// Get wallet addresses
app.get("/agentic/addresses", (_req, res) => {
  try {
    const output = runOnchainos("wallet addresses --chain 196");
    res.json({ success: true, raw: output });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get wallet balance
app.get("/agentic/balance", (_req, res) => {
  try {
    const output = runOnchainos("wallet balance --chain 196");
    res.json({ success: true, raw: output });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Send tokens via Agentic Wallet (TEE signed, zero popup)
app.post("/agentic/send", async (req, res) => {
  const { chain, to, amount, token_address } = req.body;
  if (!to || !amount) return res.status(400).json({ error: "to and amount required" });
  // Validate inputs
  if (to && !/^0x[a-fA-F0-9]{40}$/.test(to)) return res.status(400).json({ error: "invalid to address" });
  if (token_address && !/^0x[a-fA-F0-9]{40}$/.test(token_address)) return res.status(400).json({ error: "invalid token address" });
  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) return res.status(400).json({ error: "invalid amount" });

  const chainId = sanitizeArg(chain || "196");
  let cmd = `wallet send --chain ${chainId} --amount "${sanitizeArg(amount)}"`;
  if (token_address) cmd += ` --contract-token ${sanitizeArg(token_address)}`;

  // Note: onchainos wallet send may need --force to skip confirmation
  try {
    const output = runOnchainos(`${cmd} --force`, 60000);
    res.json({ success: true, raw: output, data: parseOnchainosJson(output) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// x402 payment via Agentic Wallet TEE signing
app.post("/agentic/x402-pay", async (req, res) => {
  const { network, amount, pay_to, asset, from } = req.body;
  if (!amount || !pay_to || !asset) {
    return res.status(400).json({ error: "amount, pay_to, asset required" });
  }

  if (pay_to && !/^0x[a-fA-F0-9]{40}$/.test(pay_to)) return res.status(400).json({ error: "invalid pay_to address" });
  if (asset && !/^0x[a-fA-F0-9]{40}$/.test(asset)) return res.status(400).json({ error: "invalid asset address" });
  let cmd = `payment x402-pay --network ${sanitizeArg(network || "eip155:196")} --amount ${sanitizeArg(amount)} --pay-to ${sanitizeArg(pay_to)} --asset ${sanitizeArg(asset)}`;
  if (from) cmd += ` --from ${sanitizeArg(from)}`;

  try {
    const output = runOnchainos(cmd, 30000);
    const data = parseOnchainosJson(output);
    res.json({ success: true, ...data, raw: output });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Logout
app.post("/agentic/logout", (_req, res) => {
  try {
    runOnchainos("wallet logout");
    agenticSessions.clear();
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const AGENTS = [
  {
    name: "Signal Agent",
    description: "Real-time on-chain signal detection via OnchainOS — FREE",
    endpoint: SIGNAL_URL,
    services: [
      { method: "GET", route: "/signals/smart-money", price: "free", description: "Smart money buy signals" },
      { method: "GET", route: "/signals/whale-alert", price: "free", description: "Whale movement alerts" },
      { method: "GET", route: "/signals/meme-scan", price: "free", description: "New meme token scan" },
      { method: "GET", route: "/signals/trending", price: "free", description: "Trending tokens" },
      { method: "GET", route: "/signals/hot-tokens", price: "free", description: "Hot tokens by trending score / X mentions" },
      { method: "GET", route: "/signals/wallet-pnl", price: "free", description: "Wallet PnL overview + trade history" },
      { method: "GET", route: "/signals/aped-wallets", price: "free", description: "Co-invested wallet analysis for a token" },
      { method: "GET", route: "/signals/token-pnl", price: "free", description: "PnL for specific token in wallet" },
      { method: "POST", route: "/signals/batch-prices", price: "free", description: "Batch price query for multiple tokens" },
    ],
  },
  {
    name: "Analyst Agent — Basic (FREE)",
    description: "Rule-based analysis from OnchainOS data — no AI, instant results",
    endpoint: ANALYST_URL,
    services: [
      { method: "GET", route: "/basic/technical/:token", price: "free", description: "Basic technical analysis (rule-based)" },
      { method: "GET", route: "/basic/fundamental/:token", price: "free", description: "Basic fundamental analysis (rule-based)" },
      { method: "GET", route: "/basic/spread/:token", price: "free", description: "Basic DEX price info" },
      { method: "GET", route: "/basic/meme/:token", price: "free", description: "Basic meme data (smart money, KOL, risks)" },
      { method: "GET", route: "/basic/full/:token", price: "free", description: "Basic full analysis (all dimensions, rule-based)" },
      { method: "GET", route: "/basic/meme-deep/:token", price: "free", description: "Meme deep data: bundle/sniper detection + dev info" },
    ],
  },
  {
    name: "Analyst Agent — Deep (PAID)",
    description: "AI-powered deep analysis by Claude — cultural insight, predictions, recommendations",
    endpoint: ANALYST_URL,
    services: [
      { method: "GET", route: "/analysis/technical/:token", price: "$0.02", description: "Deep technical analysis (AI)" },
      { method: "GET", route: "/analysis/fundamental/:token", price: "$0.03", description: "Deep fundamental analysis (AI)" },
      { method: "GET", route: "/analysis/spread/:token", price: "$0.01", description: "Deep CEX-DEX arbitrage analysis (AI)" },
      { method: "GET", route: "/analysis/meme/:token", price: "$0.03", description: "Deep meme virality + cultural analysis (AI)" },
      { method: "GET", route: "/analysis/full/:token", price: "$0.08", description: "Deep full analysis — all dimensions (AI)" },
    ],
  },
  {
    name: "Risk Agent",
    description: "Pre-trade risk assessment via OnchainOS — FREE",
    endpoint: RISK_URL,
    services: [
      { method: "POST", route: "/risk/assess", price: "free", description: "Pre-trade risk assessment" },
      { method: "GET", route: "/risk/token-safety/:token", price: "free", description: "Token safety check" },
      { method: "GET", route: "/risk/portfolio", price: "free", description: "Portfolio risk overview" },
      { method: "POST", route: "/risk/token-balances", price: "free", description: "Specific token balances for wallet" },
    ],
  },
  {
    name: "Trader Agent",
    description: "Trade execution via OnchainOS + OKX DEX aggregator — FREE",
    endpoint: TRADER_URL,
    services: [
      { method: "POST", route: "/trade/quote", price: "free", description: "Get optimal trade quote" },
      { method: "POST", route: "/trade/execute", price: "free", description: "Execute trade" },
      { method: "GET", route: "/trade/status/:orderId", price: "free", description: "Track order status" },
      { method: "POST", route: "/trade/approve", price: "free", description: "ERC-20 token approval" },
      { method: "GET", route: "/trade/gas", price: "free", description: "Current gas prices" },
      { method: "GET", route: "/trade/liquidity-sources", price: "free", description: "Available DEX liquidity sources" },
      { method: "POST", route: "/trade/gas-limit", price: "free", description: "Estimate gas limit for transaction" },
      { method: "POST", route: "/trade/broadcast", price: "free", description: "Broadcast signed transaction" },
      { method: "GET", route: "/trade/broadcast-status/:orderId", price: "free", description: "Track broadcast order" },
    ],
  },
];

// Service discovery — free, no x402
app.get("/services", (_req, res) => {
  res.json({
    platform: "AgentNexus",
    version: "1.0.0",
    description: "AI Agent Service Marketplace on X Layer — pay-per-call via x402",
    network: "eip155:196",
    payment: "x402 (USDC on X Layer)",
    contracts: {
      AgentRegistry: "0x294f885031544d7Af38D79fe1E9a5c87f3880DEA",
      PaymentLedger: "0x00e0C1C17E9c3899A0bD362560Ea0Ab8112A4E05",
    },
    agents: AGENTS,
  });
});

// Health check
app.get("/health", async (_req, res) => {
  const statuses = await Promise.all(
    AGENTS.map(async (agent) => {
      try {
        const resp = await fetch(`${agent.endpoint}/health`, { signal: AbortSignal.timeout(2000) });
        const data = await resp.json() as any;
        return { name: agent.name, status: resp.ok ? "online" : "degraded", wallet: data.wallet };
      } catch {
        return { name: agent.name, status: "offline" };
      }
    })
  );
  const online = statuses.filter((s) => s.status === "online").length;
  res.json({ gateway: "online", agents_online: `${online}/${statuses.length}`, agents: statuses });
});

// ── Natural language chat → auto-route to agents ──
const INTENT_PROMPT = `You are the AgentNexus router. Given a user message, determine which agent service(s) to call.

Available services:
SIGNAL (free):
- GET /signals/smart-money — smart money buy signals
- GET /signals/whale-alert — whale movement alerts
- GET /signals/meme-scan — new meme token scan
- GET /signals/trending — trending tokens
- GET /signals/hot-tokens — hot tokens ranked by trending score / X mentions
- GET /signals/wallet-pnl?wallet={wallet} — wallet PnL, win rate, trade history
- GET /signals/aped-wallets?token={token} — who else invested in this token (co-investors)
- GET /signals/token-pnl?wallet={wallet}&token={token} — PnL for specific token
- POST /signals/batch-prices (body: {addresses: [...]}) — batch price query

ANALYST BASIC (free, rule-based):
- GET /basic/technical/{token} — basic technical analysis
- GET /basic/fundamental/{token} — basic fundamental analysis
- GET /basic/spread/{token} — basic price data
- GET /basic/meme/{token} — basic meme data (smart money, KOL, risks)
- GET /basic/meme-deep/{token} — meme deep data: bundle/sniper detection + dev info
- GET /basic/full/{token} — basic full analysis

ANALYST DEEP (paid, Claude AI):
- GET /analysis/technical/{token} — deep technical analysis ($0.02)
- GET /analysis/fundamental/{token} — deep fundamental analysis ($0.03)
- GET /analysis/spread/{token} — deep CEX-DEX spread ($0.01)
- GET /analysis/meme/{token} — deep meme virality + cultural ($0.03)
- GET /analysis/full/{token} — deep full analysis ($0.08)

RISK (free):
- POST /risk/assess (body: {token, chain}) — pre-trade risk
- GET /risk/token-safety/{token} — token safety check
- GET /risk/portfolio?wallet={wallet} — portfolio risk
- POST /risk/token-balances (body: {wallet, tokens: [...]}) — specific token balances

TRADER (free):
- POST /trade/quote (body: {from_token, to_token, amount}) — get quote
- POST /trade/execute (body: {from_token, to_token, amount}) — execute trade
- POST /trade/approve (body: {token, wallet_address, amount}) — ERC-20 approval
- GET /trade/gas — current gas prices
- GET /trade/liquidity-sources — available DEX sources
- POST /trade/gas-limit (body: {from, to, data}) — estimate gas limit
- POST /trade/broadcast (body: {signed_tx}) — broadcast signed tx

Rules:
- Extract token symbols (ETH, OKB, USDT...) or addresses (0x...) from the message.
- Use the symbol or address as-is in {token} — the system will resolve symbols to addresses automatically.
- For trade body fields (from_token, to_token), also use symbol or address as-is.
- For "safe?", "rug?", "honeypot?" → risk/token-safety
- For "analyze", "technical", "fundamental" without "deep"/"深度" → basic (free)
- For "deep", "深度", "AI分析", "详细" → analyst deep (paid)
- For "meme", "virality", "community" without "deep" → basic/meme (free)
- For "full analysis", "全面分析" without "deep" → basic/full (free)
- For "深度分析", "deep analysis", "AI analysis" → analysis/full (paid)
- For "smart money", "聪明钱", "whale", "鲸鱼" → signals/smart-money or whale-alert
- For "trending", "热门", "hot", "火" → signals/hot-tokens (preferred) or signals/trending
- For "PnL", "盈亏", "win rate", "胜率", "我的交易", "trade history" → signals/wallet-pnl (use user's wallet)
- For "bundle", "sniper", "捆绑", "狙击" → basic/meme-deep (more data than basic/meme)
- For "谁买了", "who bought", "co-investor", "aped" → signals/aped-wallets
- For "我有多少", "balance", "余额" + token → risk/token-balances
- For specific token PnL like "我的ETH盈亏" → signals/token-pnl
- For "swap", "buy", "sell", "trade", "换", "买", "卖" → trader/quote
- For "gas", "手续费" → trade/gas
- For "portfolio risk", "持仓风险" → risk/portfolio
- For "launch", "deploy", "create token", "发币", "发射", "创建代币", "上线代币", "发一个币", "发个币", "做一个币", "造币", "铸币", "mint token" → use agent "launch", method POST, path "/launch", body {name, symbol, totalSupply, okbForLiquidity}. Extract token name/symbol/supply from user message. Default: 1B supply, 0.1 OKB liquidity. IMPORTANT: if user says "发一个叫X的币" or "create a token called X", this is a LAUNCH intent, not a query.
- For "strategy", "策略", "monitor", "监控", "watch", "盯", "filter", "筛选", "alert", "提醒", "notify", "通知", "开个策略", "建个策略", "自动" → use agent "strategy", method POST, path "/strategies", body {name, description}. Extract strategy name and filter description from user message. The description should be the user's natural language filter criteria.
- Default chain: xlayer.
- Max 3 calls. If user wants comprehensive view, combine risk + analyst.

Return ONLY valid JSON:
{"calls":[{"agent":"signal"|"analyst"|"risk"|"trader"|"launch"|"strategy","method":"GET"|"POST","path":"/the/path/{token}","tokens":["symbol or address mentioned"],"body":null|{...},"description":"what this call does"}],"reply":"brief explanation of what you're doing"}`;

const GATEWAY_SELF = `http://localhost:${PORT}`;
const AGENT_ENDPOINTS: Record<string, string> = {
  signal: SIGNAL_URL,
  analyst: ANALYST_URL,
  risk: RISK_URL,
  trader: TRADER_URL,
  launch: GATEWAY_SELF,
  strategy: GATEWAY_SELF,
};

// User wallet address — also creates if doesn't exist
app.get("/wallet/:platform/:userId", (req, res) => {
  const { platform, userId } = req.params;
  if (!["telegram", "twitter", "api"].includes(platform)) {
    return res.status(400).json({ error: "platform must be telegram, twitter, or api" });
  }
  // Create wallet if not exists
  const wallet = createWallet(platform as any, userId);
  res.json({
    address: wallet.address,
    is_new: wallet.isNew,
    platform,
    user_id: userId,
  });
});

// Confirm wallet with password (encrypt private key)
app.post("/wallet/confirm", (req, res) => {
  const { platform, user_id, password } = req.body;
  if (!platform || !user_id || !password) {
    return res.status(400).json({ error: "platform, user_id, password required" });
  }
  const result = confirmWallet(platform, user_id, password);
  res.json(result);
});

// Unlock wallet → create session
app.post("/wallet/unlock", (req, res) => {
  const { platform, user_id, password } = req.body;
  if (!platform || !user_id || !password) {
    return res.status(400).json({ error: "platform, user_id, password required" });
  }
  const unlocked = unlockWallet(platform, user_id, password);
  if (!unlocked) {
    return res.json({ success: false, error: "Wrong password" });
  }
  // Store in session
  const key = `${platform}_${user_id}`;
  sessions.set(key, { privateKey: unlocked.privateKey, address: unlocked.address, expiry: Date.now() + SESSION_TTL });
  res.json({ success: true, address: unlocked.address, expires_in: "permanent (until /lock)" });
});

// Generate bind code (for linking any platform ↔ any platform)
app.post("/bind/generate", (req, res) => {
  const { platform, user_id } = req.body;
  if (!platform || !user_id) {
    return res.status(400).json({ error: "platform, user_id required" });
  }
  const code = generateBindCode(user_id, platform);
  res.json({ code, expires_in: "5 minutes" });
});

// Sign and send trade — called by Bot only, private key passed in-memory from bot process
// In production, this should be replaced by signing inside the bot itself
app.post("/trade/sign-and-send", async (req, res) => {
  const { from_token, to_token, amount, chain, slippage, wallet_address, private_key, platform, user_id } = req.body;

  // Get private key: explicitly provided OR from active session
  let pk = private_key;
  let wa = wallet_address;
  if (!pk && platform && user_id) {
    const session = getSession(`${platform}_${user_id}`);
    if (session) { pk = session.privateKey; wa = session.address; }
  }

  if (!from_token || !to_token || !amount || !wa || !pk) {
    return res.status(400).json({ error: "Missing trade params or no active session. Unlock wallet first." });
  }

  // x402 quota check for trade execution
  if (wa) {
    const quota = checkAndDeductQuota(wa);
    if (!quota.allowed) {
      return res.status(402).json(build402Response(wa));
    }
  }

  try {
    // Step 1: Ask Trader Agent to BUILD unsigned tx (no private key sent to Trader)
    const buildResp = await fetch(`${TRADER_URL}/trade/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_token, to_token, amount, wallet_address: wa, chain, slippage }),
      signal: AbortSignal.timeout(15000),
    });
    const buildResult = await buildResp.json() as any;

    if (!buildResult.success || !buildResult.tx) {
      return res.json({ success: false, error: buildResult.error || "Failed to build transaction", wallet: wa });
    }

    // Step 2: Sign and send — key used only here, then discarded
    const userAccount = privateKeyToAccount(pk as `0x${string}`);
    const userWalletClient = createWalletClient({
      account: userAccount,
      chain: xlayer,
      transport: http(env.XLAYER_RPC),
    });

    const tx = buildResult.tx;
    const txHash = await userWalletClient.sendTransaction({
      to: tx.to as `0x${string}`,
      data: tx.data as `0x${string}`,
      value: BigInt(tx.value || "0"),
      gas: tx.gas ? BigInt(tx.gas) : undefined,
    });

    res.json({
      success: true,
      tx_hash: txHash,
      wallet: wa,
      chain: chain || "xlayer",
      slippage: buildResult.quote?.slippage,
      explorer: `https://www.okx.com/web3/explorer/xlayer/tx/${txHash}`,
    });
  } catch (e: any) {
    res.json({ success: false, error: e.message, wallet: wa });
  }
});

// ── Chat history persistence (Railway Volume at /data) ──
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

// ── x402 Quota & Credits System ──
// Free 10 actions/day (launch + strategy + trading combined), then $0.01/action
const FREE_DAILY_LIMIT = 10;
const CREDIT_PRICE_USD = 0.01; // per action after free tier
const CREDITS_PER_DOLLAR = 100; // $1 USDC = 100 credits
const CREDITS_FILE = `${process.env.RAILWAY_VOLUME_MOUNT_PATH || "/data"}/credits.json`;

interface UserCredits {
  credits: number;
  dailyUsage: number;
  dailyDate: string; // YYYY-MM-DD
  totalPaid: number;
  lastPaymentTx?: string;
}

let creditsStore: Record<string, UserCredits> = {};
try {
  if (existsSync(CREDITS_FILE)) creditsStore = JSON.parse(readFileSync(CREDITS_FILE, "utf-8"));
} catch { creditsStore = {}; }

function saveCreditsStore() {
  try { writeFileSync(CREDITS_FILE, JSON.stringify(creditsStore)); } catch (e: any) {
    console.error("[Credits] Save failed:", e.message);
  }
}

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

function getUserCredits(walletAddress: string): UserCredits {
  const key = walletAddress.toLowerCase();
  if (!creditsStore[key]) {
    creditsStore[key] = { credits: 0, dailyUsage: 0, dailyDate: getToday(), totalPaid: 0 };
  }
  const user = creditsStore[key];
  // Reset daily usage if new day
  if (user.dailyDate !== getToday()) {
    user.dailyUsage = 0;
    user.dailyDate = getToday();
  }
  return user;
}

/**
 * Check if user can perform a paid action. Returns { allowed, remaining, needsPayment }.
 * If within free tier, increments usage. If has credits, decrements.
 */
function checkAndDeductQuota(walletAddress: string): { allowed: boolean; freeRemaining: number; credits: number; needsPayment: boolean } {
  const user = getUserCredits(walletAddress);

  if (user.dailyUsage < FREE_DAILY_LIMIT) {
    user.dailyUsage++;
    saveCreditsStore();
    return { allowed: true, freeRemaining: FREE_DAILY_LIMIT - user.dailyUsage, credits: user.credits, needsPayment: false };
  }

  if (user.credits > 0) {
    user.credits--;
    saveCreditsStore();
    return { allowed: true, freeRemaining: 0, credits: user.credits, needsPayment: false };
  }

  return { allowed: false, freeRemaining: 0, credits: 0, needsPayment: true };
}

/**
 * Add credits after payment verification. $1 USDC = 100 credits.
 */
function addCredits(walletAddress: string, amountUsd: number, txHash: string): { credits: number } {
  const user = getUserCredits(walletAddress);
  const newCredits = Math.round(amountUsd * CREDITS_PER_DOLLAR);
  user.credits += newCredits;
  user.totalPaid += amountUsd;
  user.lastPaymentTx = txHash;
  saveCreditsStore();
  console.log(`[Credits] Added ${newCredits} credits to ${walletAddress.slice(0, 8)}... (tx: ${txHash})`);
  return { credits: user.credits };
}

/**
 * Build x402 payment required response
 */
function build402Response(walletAddress: string) {
  const user = getUserCredits(walletAddress);
  return {
    error: "Payment Required",
    x402Version: 2,
    freeUsed: user.dailyUsage,
    freeLimit: FREE_DAILY_LIMIT,
    creditsRemaining: user.credits,
    payment: {
      scheme: "exact",
      network: "eip155:196",
      asset: XLAYER_USDC,
      price: "$1.00",
      amountRequired: "1000000", // 1 USDC (6 decimals)
      payTo: platformAccount.address,
      creditsGranted: CREDITS_PER_DOLLAR,
      description: `Purchase ${CREDITS_PER_DOLLAR} AgentNexus credits ($1 USDC = ${CREDITS_PER_DOLLAR} actions)`,
    },
  };
}

const STORAGE_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || "/data";
const CHATS_FILE = `${STORAGE_DIR}/chat-histories.json`;
const WALLETS_FILE = `${STORAGE_DIR}/encrypted-wallets.json`;

// Ensure storage dir exists
try { mkdirSync(STORAGE_DIR, { recursive: true }); } catch {}

// Load persisted chat histories
let chatStore: Record<string, any> = {};
try {
  if (existsSync(CHATS_FILE)) chatStore = JSON.parse(readFileSync(CHATS_FILE, "utf-8"));
} catch { chatStore = {}; }

function saveChatStore() {
  try { writeFileSync(CHATS_FILE, JSON.stringify(chatStore)); } catch (e: any) {
    console.error("[ChatStore] Save failed:", e.message);
  }
}

// Save chat history
app.post("/chats/save", (req, res) => {
  const { user_id, chats } = req.body;
  if (!user_id || !chats) return res.status(400).json({ error: "user_id and chats required" });
  chatStore[user_id] = { chats, updated: new Date().toISOString() };
  saveChatStore();
  res.json({ success: true });
});

// Load chat history (require matching wallet header)
app.get("/chats/load/:userId", (req, res) => {
  const caller = req.headers["x-wallet-address"] as string;
  if (caller?.toLowerCase() !== req.params.userId.toLowerCase()) {
    return res.status(403).json({ error: "forbidden" });
  }
  const data = chatStore[req.params.userId];
  res.json({ chats: data?.chats || null, updated: data?.updated || null });
});

// Delete chat history
app.delete("/chats/:userId", (req, res) => {
  delete chatStore[req.params.userId];
  saveChatStore();
  res.json({ success: true });
});

// ── Cloud wallet sync: store encrypted blobs (server never has password/key) ──
// Load persisted wallets
let encryptedWallets = new Map<string, string>();
try {
  if (existsSync(WALLETS_FILE)) {
    const data = JSON.parse(readFileSync(WALLETS_FILE, "utf-8"));
    encryptedWallets = new Map(Object.entries(data));
  }
} catch {}

app.post("/wallet/sync", (req, res) => {
  const { platform, user_id, encrypted_wallet } = req.body;
  if (!platform || !user_id || !encrypted_wallet) {
    return res.status(400).json({ error: "platform, user_id, encrypted_wallet required" });
  }
  encryptedWallets.set(`${platform}_${user_id}`, encrypted_wallet);
  // Persist to volume
  try { writeFileSync(WALLETS_FILE, JSON.stringify(Object.fromEntries(encryptedWallets))); } catch {}
  res.json({ success: true });
});

app.get("/wallet/sync/:platform/:userId", (req, res) => {
  const key = `${req.params.platform}_${req.params.userId}`;
  const blob = encryptedWallets.get(key);
  res.json({ encrypted_wallet: blob || null });
});

// ── Payment info: platform wallet + allowance check ──
// Payment info — x402 credits system
app.get("/payment/info", (_req, res) => {
  res.json({
    platform_wallet: platformAccount.address,
    usdc_address: XLAYER_USDC,
    network: "eip155:196",
    model: "x402 credits — $1 USDC = 100 actions, 10 free/day",
  });
});

app.get("/wallet-stats", (_req, res) => {
  res.json(getWalletStats());
});

// ── x402 Credits API ──

// Admin: reset daily usage (protected by admin key)
app.post("/credits/reset/:walletAddress", (req, res) => {
  const adminKey = req.headers["x-admin-key"] as string;
  if (adminKey !== (process.env.ADMIN_KEY || "nexus-admin-2026")) {
    return res.status(403).json({ error: "forbidden" });
  }
  const user = getUserCredits(req.params.walletAddress);
  user.dailyUsage = 0;
  user.dailyDate = getToday();
  saveCreditsStore();
  res.json({ success: true, freeRemaining: FREE_DAILY_LIMIT });
});

// Get user's credit balance and daily usage
app.get("/credits/:walletAddress", (req, res) => {
  const user = getUserCredits(req.params.walletAddress);
  res.json({
    credits: user.credits,
    dailyUsage: user.dailyUsage,
    dailyLimit: FREE_DAILY_LIMIT,
    freeRemaining: Math.max(0, FREE_DAILY_LIMIT - user.dailyUsage),
    totalPaid: user.totalPaid,
    pricePerCredit: `$${CREDIT_PRICE_USD}`,
    buyPrice: "$1.00 USDC = 100 credits",
    payTo: platformAccount.address,
  });
});

// Verify payment and add credits
app.post("/credits/purchase", async (req, res) => {
  const { wallet_address, tx_hash } = req.body;
  if (!wallet_address || !tx_hash) {
    return res.status(400).json({ error: "wallet_address and tx_hash required" });
  }

  try {
    // Verify the transaction on-chain
    const receipt = await paymentPublicClient.getTransactionReceipt({ hash: tx_hash as `0x${string}` });
    if (!receipt || receipt.status !== "success") {
      return res.status(400).json({ error: "Transaction failed or not found" });
    }

    // Check it's a USDC transfer to our platform wallet
    // Look for Transfer event in logs
    const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // Transfer(address,address,uint256)
    const usdcTransfer = receipt.logs.find(log =>
      log.address.toLowerCase() === XLAYER_USDC.toLowerCase() &&
      log.topics[0] === transferTopic &&
      log.topics[2] && log.topics[2].toLowerCase().includes(platformAccount.address.slice(2).toLowerCase())
    );

    if (!usdcTransfer) {
      return res.status(400).json({ error: "No USDC transfer to platform wallet found in transaction" });
    }

    // Extract amount from log data (uint256)
    const amountRaw = BigInt(usdcTransfer.data);
    const amountUsd = Number(amountRaw) / 1e6; // USDC has 6 decimals

    if (amountUsd < 0.01) {
      return res.status(400).json({ error: "Payment amount too small" });
    }

    // Check for duplicate payment
    const user = getUserCredits(wallet_address);
    if (user.lastPaymentTx === tx_hash) {
      return res.status(400).json({ error: "Payment already processed" });
    }

    const result = addCredits(wallet_address, amountUsd, tx_hash);
    res.json({
      success: true,
      creditsAdded: Math.round(amountUsd * CREDITS_PER_DOLLAR),
      totalCredits: result.credits,
      amountPaid: `$${amountUsd.toFixed(2)}`,
      txHash: tx_hash,
    });
  } catch (e: any) {
    res.status(500).json({ error: `Payment verification failed: ${e.message}` });
  }
});

// ── Strategy System: save + cron execution ──
const STRATEGIES_FILE = `${STORAGE_DIR}/strategies.json`;

interface SavedStrategy {
  id: string;
  walletAddress: string;
  name: string;
  description: string; // natural language filter
  status: "running" | "paused";
  intervalMinutes: number;
  results: Array<{ timestamp: string; summary: string }>;
  createdAt: string;
  lastRun?: string;
}

let strategiesStore: SavedStrategy[] = [];
try {
  if (existsSync(STRATEGIES_FILE)) strategiesStore = JSON.parse(readFileSync(STRATEGIES_FILE, "utf-8"));
} catch { strategiesStore = []; }

function saveStrategiesStore() {
  try { writeFileSync(STRATEGIES_FILE, JSON.stringify(strategiesStore)); } catch (e: any) {
    console.error("[Strategy] Save failed:", e.message);
  }
}

// Create strategy
app.post("/strategies", (req, res) => {
  const { wallet_address, name, description, interval_minutes } = req.body;
  if (!wallet_address || !name || !description) {
    return res.status(400).json({ error: "wallet_address, name, description required" });
  }
  const strategy: SavedStrategy = {
    id: Date.now().toString(),
    walletAddress: wallet_address,
    name,
    description,
    status: "running",
    intervalMinutes: interval_minutes || 60,
    results: [],
    createdAt: new Date().toISOString(),
  };
  strategiesStore.push(strategy);
  saveStrategiesStore();
  res.json({ success: true, strategy });
});

// List strategies for a wallet
app.get("/strategies/:walletAddress", (req, res) => {
  const addr = req.params.walletAddress.toLowerCase();
  const userStrategies = strategiesStore.filter(s => s.walletAddress.toLowerCase() === addr);
  res.json({ strategies: userStrategies });
});

// Update strategy status
app.patch("/strategies/:id", (req, res) => {
  const { status } = req.body;
  const strategy = strategiesStore.find(s => s.id === req.params.id);
  if (!strategy) return res.status(404).json({ error: "Strategy not found" });
  if (status) strategy.status = status;
  saveStrategiesStore();
  res.json({ success: true, strategy });
});

// Delete strategy
app.delete("/strategies/:id", (req, res) => {
  strategiesStore = strategiesStore.filter(s => s.id !== req.params.id);
  saveStrategiesStore();
  res.json({ success: true });
});

// Run a strategy manually (also called by cron)
app.post("/strategies/:id/run", async (req, res) => {
  const strategy = strategiesStore.find(s => s.id === req.params.id);
  if (!strategy) return res.status(404).json({ error: "Strategy not found" });

  // x402 quota check (strategy execution costs a credit)
  const quota = checkAndDeductQuota(strategy.walletAddress);
  if (!quota.allowed) {
    return res.status(402).json(build402Response(strategy.walletAddress));
  }

  try {
    // Execute strategy by sending the description to /chat internally
    const chatResp = await fetch(`http://localhost:${PORT}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: strategy.description, wallet_address: strategy.walletAddress }),
      signal: AbortSignal.timeout(30000),
    });
    const chatData = await chatResp.json() as any;

    const result = {
      timestamp: new Date().toISOString(),
      summary: chatData.reply || chatData.error || "No results",
    };

    strategy.results.unshift(result);
    if (strategy.results.length > 20) strategy.results = strategy.results.slice(0, 20);
    strategy.lastRun = result.timestamp;
    saveStrategiesStore();

    res.json({ success: true, result });
  } catch (e: any) {
    res.json({ success: false, error: e.message });
  }
});

// Cron: run all active strategies that are due
async function runDueStrategies() {
  const now = Date.now();
  for (const strategy of strategiesStore) {
    if (strategy.status !== "running") continue;

    const lastRun = strategy.lastRun ? new Date(strategy.lastRun).getTime() : 0;
    const interval = strategy.intervalMinutes * 60 * 1000;

    if (now - lastRun < interval) continue;

    console.log(`[Strategy] Running "${strategy.name}" for ${strategy.walletAddress.slice(0, 8)}...`);
    try {
      await fetch(`http://localhost:${PORT}/strategies/${strategy.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30000),
      });
    } catch (e: any) {
      console.error(`[Strategy] Failed "${strategy.name}": ${e.message}`);
    }
  }
}

// Run cron every 5 minutes
setInterval(runDueStrategies, 5 * 60 * 1000);

// ── Token Launch: generate deploy + pool creation transactions ──
app.post("/launch", async (req, res) => {
  const { name, symbol, totalSupply, okbForLiquidity, from } = req.body;
  if (!name || !symbol || !from) {
    return res.status(400).json({ error: "name, symbol, from required" });
  }

  // x402 quota check
  const quota = checkAndDeductQuota(from);
  if (!quota.allowed) {
    return res.status(402).json(build402Response(from));
  }

  try {
    const plan = await generateLaunchPlan({
      name,
      symbol,
      totalSupply: totalSupply || "1000000000",
      okbForLiquidity: okbForLiquidity || "0.1",
      from,
    });
    res.json(plan);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/chat", async (req, res) => {
  const { message, chain, platform, user_id, wallet_address } = req.body;
  const targetChain = chain || "xlayer";

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message (string) required" });
  }

  if (!env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "AI not configured — set ANTHROPIC_API_KEY" });
  }

  try {
    // Step 1: Parse intent with Claude
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const intentMsg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{ role: "user", content: `${INTENT_PROMPT}\n\nUser message: "${message}"\n\nReturn ONLY compact JSON, no whitespace.` }],
    });

    const intentText = intentMsg.content[0].type === "text" ? intentMsg.content[0].text : "{}";
    const jsonMatch = intentText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(400).json({ error: "Could not understand your request", raw: intentText });
    }

    let intent: any;
    try {
      intent = JSON.parse(jsonMatch[0]);
    } catch {
      // Claude's JSON was truncated — try to salvage what we can
      console.warn("[Gateway] Intent JSON parse failed, using fallback");
      intent = { calls: [], reply: "Let me try a simpler approach." };
    }
    const calls: Array<{ agent: string; method: string; path: string; tokens?: string[]; body?: any; description: string }> = intent.calls || [];

    if (calls.length === 0) {
      return res.json({ reply: intent.reply || "I'm not sure what you'd like to do. Try asking about a token or signal.", results: [] });
    }

    // x402 quota check: trading, launch, strategy actions cost credits; pure data queries are free
    const paidAgents = ["trader", "launch", "strategy"];
    const hasPaidAction = calls.some(c => paidAgents.includes(c.agent));
    if (hasPaidAction && wallet_address) {
      const quota = checkAndDeductQuota(wallet_address);
      if (!quota.allowed) {
        return res.status(402).json(build402Response(wallet_address));
      }
    }

    // Step 2: Get user wallet address (no private key access here)
    let userWalletAddress: string | null = null;
    if (platform && user_id) {
      userWalletAddress = getWalletAddr(platform, user_id);
    }

    // Step 3: Resolve token symbols → addresses
    const resolvedTokens: Record<string, string> = {};
    for (const call of calls) {
      for (const token of call.tokens || []) {
        if (resolvedTokens[token]) continue;
        const resolved = resolveToken(token, targetChain);
        if (resolved) {
          resolvedTokens[token] = resolved.address;
          // Cache symbol → address for future use
          if (resolved.source !== "direct" && !/^0x/i.test(token)) {
            registerToken(token, resolved.address, targetChain);
          }
        }
      }
    }

    // Step 3: Build URLs and execute agent calls in parallel
    const results = await Promise.all(
      calls.slice(0, 3).map(async (call) => {
        try {
          const baseUrl = AGENT_ENDPOINTS[call.agent];
          if (!baseUrl) return { service: call.description, status: 404, error: `Unknown agent: ${call.agent}` };

          // Replace {token} in path with resolved address
          let path = call.path;
          for (const token of call.tokens || []) {
            const address = resolvedTokens[token];
            if (address) {
              path = path.replace(`{${token}}`, address).replace(/{token}/gi, address);
            } else {
              // Token not resolved — use raw value as fallback
              path = path.replace(/{token}/gi, token);
            }
          }

          // Also resolve tokens in POST body
          let body = call.body;
          if (body && typeof body === "object") {
            body = { ...body };
            for (const [k, v] of Object.entries(body)) {
              if (typeof v === "string" && resolvedTokens[v]) {
                (body as any)[k] = resolvedTokens[v];
              }
            }
          }

          // Launch: inject user wallet address into body
          if (call.agent === "launch") {
            body = { ...(body || {}), from: (req.body as any).wallet_address || userWalletAddress || "0x0000000000000000000000000000000000000000" };
          }

          // Strategy: inject wallet_address into body
          if (call.agent === "strategy") {
            body = { ...(body || {}), wallet_address: (req.body as any).wallet_address || userWalletAddress };
          }

          // Trade execution requires password — return preview instead
          if (userWalletAddress && call.agent === "trader" && path.includes("/execute")) {
            return {
              service: call.description,
              status: 200,
              data: {
                needs_confirmation: true,
                summary: `Swap ${(body as any)?.amount || "?"} ${(body as any)?.from_token || "?"} → ${(body as any)?.to_token || "?"}`,
                trade_params: body,
                wallet: userWalletAddress,
              },
            };
          }

          const url = `${baseUrl}${path}`;
          const opts: RequestInit = {
            method: call.method,
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(15000),
          };
          if (call.method === "POST" && body) {
            opts.body = JSON.stringify(body);
          }
          const resp = await fetch(url, opts);
          const data = await resp.json();
          return { service: call.description, status: resp.status, data };
        } catch (e: any) {
          return { service: call.description, status: 500, error: e.message };
        }
      })
    );

    // Step 4: Summarize results with Claude
    const tokenInfo = Object.keys(resolvedTokens).length > 0
      ? `\nResolved tokens: ${Object.entries(resolvedTokens).map(([s, a]) => `${s} → ${a}`).join(", ")}`
      : "";

    const summaryMsg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `User asked: "${message}"${tokenInfo}\n\nAgent results:\n${JSON.stringify(results, null, 2).slice(0, 2000)}\n\nGive a concise, helpful summary. IMPORTANT rules:\n1. Reply in the SAME language as the user's message.\n2. Use markdown tables and formatting. Focus on actionable insights.\n3. NEVER fabricate or estimate numbers that are not in the data. If market cap, price, or volume is missing or 0, say "data unavailable" instead of guessing.\n4. Keep it under 200 words.`,
      }],
    });

    const summary = summaryMsg.content[0].type === "text" ? summaryMsg.content[0].text : "";

    res.json({
      reply: summary,
      intent: intent.reply,
      tokens_resolved: resolvedTokens,
      calls_made: calls.map((c) => c.description),
      results,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Reverse proxy: all agent routes through Gateway ──
// Maps path prefix → backend agent endpoint
const ROUTE_MAP: Array<{ prefix: string; target: string }> = [
  { prefix: "/signals", target: SIGNAL_URL },
  { prefix: "/basic", target: ANALYST_URL },
  { prefix: "/analysis", target: ANALYST_URL },
  { prefix: "/ai-stats", target: ANALYST_URL },
  { prefix: "/risk", target: RISK_URL },
  { prefix: "/trade", target: TRADER_URL },
];

app.use(async (req, res, next) => {
  const route = ROUTE_MAP.find((r) => req.path.startsWith(r.prefix));
  if (!route) return next();

  // Forward request to the target agent
  const targetUrl = `${route.target}${req.originalUrl}`;
  const opts: RequestInit = {
    method: req.method,
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
  };
  if (req.method !== "GET" && req.method !== "HEAD" && req.body && Object.keys(req.body).length > 0) {
    opts.body = JSON.stringify(req.body);
  }

  fetch(targetUrl, opts)
    .then(async (agentRes) => {
      const data = await agentRes.json();
      res.status(agentRes.status).json(data);
    })
    .catch((e: any) => {
      res.status(502).json({ error: `Agent unavailable: ${e.message}`, target: route.target });
    });
});

// Stats
let totalCalls = 0;
let totalRevenue = 0;
const callLog: Array<{ agent: string; service: string; price: number; timestamp: string }> = [];

app.post("/stats/record", (req, res) => {
  const { agent, service, price } = req.body;
  if (!agent || !service || typeof price !== "number") {
    return res.status(400).json({ error: "agent, service (string) and price (number) required" });
  }
  totalCalls++;
  totalRevenue += price;
  callLog.push({ agent, service, price, timestamp: new Date().toISOString() });
  // Keep log bounded
  if (callLog.length > 1000) callLog.splice(0, callLog.length - 500);
  res.json({ ok: true });
});

app.get("/stats", (_req, res) => {
  res.json({
    total_calls: totalCalls,
    total_revenue_usd: totalRevenue.toFixed(4),
    recent_calls: callLog.slice(-20),
    uptime_seconds: Math.floor(process.uptime()),
  });
});

const server = app.listen(PORT, () => {
  console.log(`\n🌐 AgentNexus Gateway running on http://localhost:${PORT}`);
  console.log(`💬 Natural language: POST http://localhost:${PORT}/chat`);
  console.log(`📋 Service discovery: http://localhost:${PORT}/services`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Stats: http://localhost:${PORT}/stats\n`);
});

// Graceful shutdown
const shutdown = () => {
  console.log(`\n[${AGENT}] Shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
