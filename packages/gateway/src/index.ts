import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import {
  env, resolveToken, registerToken, xlayer,
  createWallet, confirmWallet, unlockWallet,
  getWalletAddress as getWalletAddr, getWalletStats,
  generateBindCode, verifyBindCode,
} from "shared";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const AGENT = "Gateway";
const PORT = parseInt(process.env.PORT || "4000");

// Service URLs — configurable for Railway internal networking
const SIGNAL_URL = process.env.SIGNAL_URL || "http://localhost:4001";
const ANALYST_URL = process.env.ANALYST_URL || "http://localhost:4002";
const RISK_URL = process.env.RISK_URL || "http://localhost:4003";
const TRADER_URL = process.env.TRADER_URL || "http://localhost:4004";

const app = express();
app.use(cors());
app.use(express.json());

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
- Default chain: xlayer.
- Max 3 calls. If user wants comprehensive view, combine risk + analyst.

Return ONLY valid JSON:
{"calls":[{"agent":"signal"|"analyst"|"risk"|"trader","method":"GET"|"POST","path":"/the/path/{token}","tokens":["symbol or address mentioned"],"body":null|{...},"description":"what this call does"}],"reply":"brief explanation of what you're doing"}`;

const AGENT_ENDPOINTS: Record<string, string> = {
  signal: SIGNAL_URL,
  analyst: ANALYST_URL,
  risk: RISK_URL,
  trader: TRADER_URL,
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

// ── Cloud wallet sync: store encrypted blobs (server never has password/key) ──
const encryptedWallets = new Map<string, string>(); // "twitter_123" → encrypted JSON blob

app.post("/wallet/sync", (req, res) => {
  const { platform, user_id, encrypted_wallet } = req.body;
  if (!platform || !user_id || !encrypted_wallet) {
    return res.status(400).json({ error: "platform, user_id, encrypted_wallet required" });
  }
  encryptedWallets.set(`${platform}_${user_id}`, encrypted_wallet);
  res.json({ success: true });
});

app.get("/wallet/sync/:platform/:userId", (req, res) => {
  const key = `${req.params.platform}_${req.params.userId}`;
  const blob = encryptedWallets.get(key);
  res.json({ encrypted_wallet: blob || null });
});

app.get("/wallet-stats", (_req, res) => {
  res.json(getWalletStats());
});

app.post("/chat", async (req, res) => {
  const { message, chain, platform, user_id } = req.body;
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
      max_tokens: 300,
      messages: [{ role: "user", content: `${INTENT_PROMPT}\n\nUser message: "${message}"\n\nReturn ONLY JSON.` }],
    });

    const intentText = intentMsg.content[0].type === "text" ? intentMsg.content[0].text : "{}";
    const jsonMatch = intentText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(400).json({ error: "Could not understand your request", raw: intentText });
    }

    const intent = JSON.parse(jsonMatch[0]);
    const calls: Array<{ agent: string; method: string; path: string; tokens?: string[]; body?: any; description: string }> = intent.calls || [];

    if (calls.length === 0) {
      return res.json({ reply: intent.reply || "I'm not sure what you'd like to do. Try asking about a token or signal.", results: [] });
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
        content: `User asked: "${message}"${tokenInfo}\n\nAgent results:\n${JSON.stringify(results, null, 2).slice(0, 2000)}\n\nGive a concise, helpful summary in the user's language (Chinese if they wrote Chinese, English otherwise). Focus on actionable insights. Keep it under 200 words.`,
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

app.use((req, res, next) => {
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

  // Forward x402 payment headers
  const paymentHeader = req.headers["x-payment-signature"] || req.headers["payment-signature"];
  if (paymentHeader) {
    (opts.headers as Record<string, string>)["X-PAYMENT-SIGNATURE"] = paymentHeader as string;
  }

  fetch(targetUrl, opts)
    .then(async (agentRes) => {
      // Forward response headers from agent
      const paymentResponse = agentRes.headers.get("payment-response") || agentRes.headers.get("x-payment");
      if (paymentResponse) res.setHeader("X-PAYMENT", paymentResponse);

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
