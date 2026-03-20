import express from "express";
import cors from "cors";
import { env, recordCall, requestLogger, setupGracefulShutdown, resolveToken } from "shared";
import { assessRisk, tokenSafety, portfolioRisk, tokenBalances } from "./rules-engine.js";
import { privateKeyToAccount } from "viem/accounts";

/** Resolve symbol to address if needed */
function resolveAddr(token: string, chain = "xlayer"): string {
  if (/^0x[a-fA-F0-9]{40}$/.test(token)) return token;
  const resolved = resolveToken(token, chain);
  return resolved?.address || token;
}

const AGENT = "Risk Agent";
const account = privateKeyToAccount(env.PRIVATE_KEY as `0x${string}`);

const app = express();
app.use(cors());
app.use(express.json());
app.use(requestLogger(AGENT));

// All Risk Agent services are FREE — powered by OnchainOS CLI, no AI cost
app.get("/health", (_req, res) => {
  res.json({ agent: AGENT, status: "online", wallet: account.address, timestamp: new Date().toISOString() });
});

app.post("/risk/assess", async (req, res) => {
  try {
    const { token, chain, portfolio_value } = req.body;
    if (!token) return res.status(400).json({ error: "token address required" });
    const result = await assessRisk(resolveAddr(token, chain), chain || "xlayer", portfolio_value);
    recordCall(AGENT, "assess", 0);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/risk/token-safety/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await tokenSafety(resolveAddr(req.params.token, chain), chain);
    recordCall(AGENT, "token-safety", 0);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/risk/portfolio", async (req, res) => {
  try {
    const wallet = req.query.wallet as string;
    const chain = (req.query.chain as string) || "xlayer";
    if (!wallet) return res.status(400).json({ error: "wallet address required" });
    const result = await portfolioRisk(wallet, chain);
    recordCall(AGENT, "portfolio", 0);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/risk/token-balances", async (req, res) => {
  try {
    const { wallet, tokens, chain } = req.body;
    if (!wallet || !tokens) return res.status(400).json({ error: "wallet and tokens array required" });
    const result = await tokenBalances(wallet, Array.isArray(tokens) ? tokens : [tokens], chain);
    recordCall(AGENT, "token-balances", 0);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = parseInt(process.env.PORT || "4003");
const server = app.listen(PORT, () => {
  console.log(`\n🛡️  ${AGENT} running on http://localhost:${PORT}`);
  console.log(`   Wallet: ${account.address}`);
  console.log(`   All services FREE (powered by OnchainOS)`);
  console.log(`   POST /risk/assess             (free)`);
  console.log(`   GET  /risk/token-safety/:token (free)`);
  console.log(`   GET  /risk/portfolio           (free)\n`);
});
setupGracefulShutdown(server, AGENT);
