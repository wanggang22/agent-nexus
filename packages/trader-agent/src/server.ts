import express from "express";
import cors from "cors";
import { env, recordCall, requestLogger, setupGracefulShutdown } from "shared";
import { getQuote, executeTrade, getOrderStatus, getWalletAddress } from "./executor.js";
import { privateKeyToAccount } from "viem/accounts";

const AGENT = "Trader Agent";
const account = privateKeyToAccount(env.PRIVATE_KEY as `0x${string}`);

const app = express();
app.use(cors());
app.use(express.json());
app.use(requestLogger(AGENT));

// All Trader Agent services are FREE — powered by OnchainOS CLI, no AI cost
app.get("/health", (_req, res) => {
  res.json({
    agent: AGENT,
    status: "online",
    wallet: getWalletAddress(),
    timestamp: new Date().toISOString(),
  });
});

app.post("/trade/quote", async (req, res) => {
  try {
    const { from_token, to_token, amount, chain, slippage } = req.body;
    if (!from_token || !to_token || !amount) {
      return res.status(400).json({ error: "from_token, to_token, and amount required" });
    }
    const quote = await getQuote(from_token, to_token, amount, chain, slippage);
    recordCall(AGENT, "quote", 0);
    res.json(quote);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/trade/execute", async (req, res) => {
  try {
    const { from_token, to_token, amount, chain, slippage } = req.body;
    if (!from_token || !to_token || !amount) {
      return res.status(400).json({ error: "from_token, to_token, and amount required" });
    }
    const result = await executeTrade(from_token, to_token, amount, chain, slippage);
    recordCall(AGENT, "execute", 0);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/trade/status/:orderId", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const txHash = req.query.tx_hash as string;
    const result = await getOrderStatus(req.params.orderId, chain, txHash);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = parseInt(process.env.PORT || "4004");
const server = app.listen(PORT, () => {
  console.log(`\n💹 ${AGENT} running on http://localhost:${PORT}`);
  console.log(`   Wallet: ${getWalletAddress()}`);
  console.log(`   All services FREE (powered by OnchainOS)`);
  console.log(`   POST /trade/quote           (free)`);
  console.log(`   POST /trade/execute         (free)`);
  console.log(`   GET  /trade/status/:orderId (free)\n`);
});
setupGracefulShutdown(server, AGENT);
