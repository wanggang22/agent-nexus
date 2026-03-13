import express from "express";
import cors from "cors";
import { env, x402PaymentMiddleware, recordCall, requestLogger, setupGracefulShutdown } from "shared";
import { getSmartMoneySignals, getWhaleAlerts, getMemeScan, getTrendingTokens } from "./scanner.js";
import { privateKeyToAccount } from "viem/accounts";

const AGENT = "Signal Agent";
const account = privateKeyToAccount(env.PRIVATE_KEY as `0x${string}`);

const app = express();
app.use(cors());
app.use(express.json());
app.use(requestLogger(AGENT));

// x402 payment gate
app.use(
  x402PaymentMiddleware({
    payTo: account.address,
    mockMode: true, // set false when OKX Facilitator is ready
    routes: {
      "GET /signals/smart-money": { price: "$0.01", description: "Smart money buy signals" },
      "GET /signals/whale-alert": { price: "$0.02", description: "Whale movement alerts" },
      "GET /signals/meme-scan": { price: "$0.005", description: "New meme token scan" },
      "GET /signals/trending": { price: "$0.005", description: "Trending tokens" },
    },
  })
);

// Health check — free (not in x402 routes)
app.get("/health", (_req, res) => {
  res.json({ agent: AGENT, status: "online", wallet: account.address, timestamp: new Date().toISOString() });
});

app.get("/signals/smart-money", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const signals = await getSmartMoneySignals(chain);
    recordCall(AGENT, "smart-money", 0.01);
    res.json({ signals, count: signals.length, chain });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/signals/whale-alert", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const signals = await getWhaleAlerts(chain);
    recordCall(AGENT, "whale-alert", 0.02);
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
    recordCall(AGENT, "meme-scan", 0.005);
    res.json({ signals, count: signals.length, chain, stage });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/signals/trending", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const signals = await getTrendingTokens(chain);
    recordCall(AGENT, "trending", 0.005);
    res.json({ signals, count: signals.length, chain });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = 4001;
const server = app.listen(PORT, () => {
  console.log(`\n📡 ${AGENT} running on http://localhost:${PORT}`);
  console.log(`   Wallet: ${account.address}`);
  console.log(`   x402 mode: mock (switch to production when Facilitator ready)`);
  console.log(`   GET /signals/smart-money  ($0.01)`);
  console.log(`   GET /signals/whale-alert  ($0.02)`);
  console.log(`   GET /signals/meme-scan    ($0.005)`);
  console.log(`   GET /signals/trending     ($0.005)\n`);
});
setupGracefulShutdown(server, AGENT);
