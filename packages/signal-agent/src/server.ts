import express from "express";
import cors from "cors";
import { env, recordCall, requestLogger, setupGracefulShutdown } from "shared";
import { getSmartMoneySignals, getWhaleAlerts, getMemeScan, getTrendingTokens, getHotTokens, getWalletPnL } from "./scanner.js";
import { privateKeyToAccount } from "viem/accounts";

const AGENT = "Signal Agent";
const account = privateKeyToAccount(env.PRIVATE_KEY as `0x${string}`);

const app = express();
app.use(cors());
app.use(express.json());
app.use(requestLogger(AGENT));

// All Signal Agent services are FREE — powered by OnchainOS CLI, no AI cost
app.get("/health", (_req, res) => {
  res.json({ agent: AGENT, status: "online", wallet: account.address, timestamp: new Date().toISOString() });
});

app.get("/signals/smart-money", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const signals = await getSmartMoneySignals(chain);
    recordCall(AGENT, "smart-money", 0);
    res.json({ signals, count: signals.length, chain });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/signals/whale-alert", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const signals = await getWhaleAlerts(chain);
    recordCall(AGENT, "whale-alert", 0);
    res.json({ signals, count: signals.length, chain });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/signals/meme-scan", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const stage = (req.query.stage as string) || "NEW";
    const signals = await getMemeScan(chain, stage);
    recordCall(AGENT, "meme-scan", 0);
    res.json({ signals, count: signals.length, chain, stage });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/signals/trending", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const signals = await getTrendingTokens(chain);
    recordCall(AGENT, "trending", 0);
    res.json({ signals, count: signals.length, chain });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/signals/hot-tokens", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const signals = await getHotTokens(chain);
    recordCall(AGENT, "hot-tokens", 0);
    res.json({ signals, count: signals.length, chain });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/signals/wallet-pnl", async (req, res) => {
  try {
    const wallet = req.query.wallet as string;
    const chain = (req.query.chain as string) || "xlayer";
    if (!wallet) return res.status(400).json({ error: "wallet address required" });
    const result = await getWalletPnL(wallet, chain);
    recordCall(AGENT, "wallet-pnl", 0);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = parseInt(process.env.PORT || "4001");
const server = app.listen(PORT, () => {
  console.log(`\n📡 ${AGENT} running on http://localhost:${PORT}`);
  console.log(`   Wallet: ${account.address}`);
  console.log(`   All services FREE (powered by OnchainOS)`);
  console.log(`   GET /signals/smart-money  (free)`);
  console.log(`   GET /signals/whale-alert  (free)`);
  console.log(`   GET /signals/meme-scan    (free)`);
  console.log(`   GET /signals/trending     (free)`);
  console.log(`   GET /signals/hot-tokens   (free)`);
  console.log(`   GET /signals/wallet-pnl   (free)\n`);
});
setupGracefulShutdown(server, AGENT);
