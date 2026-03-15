import express from "express";
import cors from "cors";
import { env, recordCall, requestLogger, setupGracefulShutdown } from "shared";
import { getQuote, buildTrade, executeTrade, getOrderStatus, getWalletAddress, getApproval, getGasPrice, getLiquiditySources, estimateGasLimit, broadcastTx, trackBroadcastOrder } from "./executor.js";
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

// Build unsigned transaction — no private keys needed
app.post("/trade/build", async (req, res) => {
  try {
    const { from_token, to_token, amount, wallet_address, chain, slippage } = req.body;
    if (!from_token || !to_token || !amount || !wallet_address) {
      return res.status(400).json({ error: "from_token, to_token, amount, and wallet_address required" });
    }
    const result = await buildTrade(from_token, to_token, amount, wallet_address, chain, slippage);
    recordCall(AGENT, "build", 0);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Legacy execute — uses platform wallet only (for testing)
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

app.post("/trade/approve", async (req, res) => {
  try {
    const { token, wallet_address, amount, chain } = req.body;
    if (!token || !wallet_address) {
      return res.status(400).json({ error: "token and wallet_address required" });
    }
    const result = await getApproval(token, wallet_address, amount || "0", chain);
    recordCall(AGENT, "approve", 0);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/trade/gas", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await getGasPrice(chain);
    recordCall(AGENT, "gas", 0);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/trade/liquidity-sources", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await getLiquiditySources(chain);
    recordCall(AGENT, "liquidity-sources", 0);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/trade/gas-limit", async (req, res) => {
  try {
    const { from, to, data, value, chain } = req.body;
    if (!from || !to || !data) return res.status(400).json({ error: "from, to, data required" });
    const result = await estimateGasLimit(from, to, data, value, chain);
    recordCall(AGENT, "gas-limit", 0);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/trade/broadcast", async (req, res) => {
  try {
    const { signed_tx, chain } = req.body;
    if (!signed_tx) return res.status(400).json({ error: "signed_tx required" });
    const result = await broadcastTx(signed_tx, chain);
    recordCall(AGENT, "broadcast", 0);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/trade/broadcast-status/:orderId", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await trackBroadcastOrder(req.params.orderId, chain);
    recordCall(AGENT, "broadcast-status", 0);
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
  console.log(`   GET  /trade/status/:orderId (free)`);
  console.log(`   POST /trade/approve          (free)`);
  console.log(`   GET  /trade/gas              (free)`);
  console.log(`   GET  /trade/liquidity-sources (free)\n`);
});
setupGracefulShutdown(server, AGENT);
