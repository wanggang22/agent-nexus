import express from "express";
import cors from "cors";
import { env, x402PaymentMiddleware } from "shared";
import { technicalAnalysis, fundamentalAnalysis, spreadAnalysis, fullAnalysis } from "./analysis.js";
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
      "GET /analysis/technical/:token": { price: "$0.02", description: "Technical analysis report" },
      "GET /analysis/fundamental/:token": { price: "$0.03", description: "Fundamental analysis" },
      "GET /analysis/spread/:token": { price: "$0.01", description: "CEX-DEX spread analysis" },
      "GET /analysis/full/:token": { price: "$0.05", description: "Full analysis report" },
    },
  })
);

app.get("/health", (_req, res) => {
  res.json({ agent: "Analyst Agent", status: "online", wallet: account.address, timestamp: new Date().toISOString() });
});

app.get("/analysis/technical/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await technicalAnalysis(req.params.token, chain);
    recordCall("technical", 0.02);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/analysis/fundamental/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await fundamentalAnalysis(req.params.token, chain);
    recordCall("fundamental", 0.03);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/analysis/spread/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await spreadAnalysis(req.params.token, chain);
    recordCall("spread", 0.01);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/analysis/full/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await fullAnalysis(req.params.token, chain);
    recordCall("full", 0.05);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

function recordCall(service: string, price: number) {
  fetch("http://localhost:4000/stats/record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent: "Analyst Agent", service, price }),
  }).catch(() => {});
}

const PORT = 4002;
app.listen(PORT, () => {
  console.log(`\n📊 Analyst Agent running on http://localhost:${PORT}`);
  console.log(`   Wallet: ${account.address}`);
  console.log(`   GET /analysis/technical/:token   ($0.02)`);
  console.log(`   GET /analysis/fundamental/:token  ($0.03)`);
  console.log(`   GET /analysis/spread/:token       ($0.01)`);
  console.log(`   GET /analysis/full/:token         ($0.05)\n`);
});
