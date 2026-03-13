import express from "express";
import cors from "cors";
import { env, x402PaymentMiddleware } from "shared";
import { getQuote, executeTrade, getOrderStatus, getWalletAddress } from "./executor.js";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(env.PRIVATE_KEY as `0x${string}`);

const app = express();
app.use(cors());
app.use(express.json());

app.use(
  x402PaymentMiddleware({
    payTo: account.address,
    mockMode: true,
    routes: {
      "POST /trade/quote": { price: "$0.005", description: "Get optimal trade quote" },
      "POST /trade/execute": { price: "$0.05", description: "Execute trade" },
      // GET /trade/status is free — not listed here
    },
  })
);

app.get("/health", (_req, res) => {
  res.json({
    agent: "Trader Agent",
    status: "online",
    wallet: getWalletAddress(),
    timestamp: new Date().toISOString(),
  });
});

app.post("/trade/quote", async (req, res) => {
  try {
    const { from_token, to_token, amount, chain } = req.body;
    if (!from_token || !to_token || !amount) {
      return res.status(400).json({ error: "from_token, to_token, and amount required" });
    }
    const quote = await getQuote(from_token, to_token, amount, chain);
    recordCall("quote", 0.005);
    res.json(quote);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/trade/execute", async (req, res) => {
  try {
    const { from_token, to_token, amount, chain } = req.body;
    if (!from_token || !to_token || !amount) {
      return res.status(400).json({ error: "from_token, to_token, and amount required" });
    }
    const result = await executeTrade(from_token, to_token, amount, chain);
    recordCall("execute", 0.05);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/trade/status/:orderId", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await getOrderStatus(req.params.orderId, chain);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

function recordCall(service: string, price: number) {
  fetch("http://localhost:4000/stats/record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent: "Trader Agent", service, price }),
  }).catch(() => {});
}

const PORT = 4004;
app.listen(PORT, () => {
  console.log(`\n💹 Trader Agent running on http://localhost:${PORT}`);
  console.log(`   Wallet: ${getWalletAddress()}`);
  console.log(`   POST /trade/quote    ($0.005)`);
  console.log(`   POST /trade/execute  ($0.05)`);
  console.log(`   GET  /trade/status/:orderId (free)\n`);
});
