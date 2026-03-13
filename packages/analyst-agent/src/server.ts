import express from "express";
import cors from "cors";
import { env, x402PaymentMiddleware, recordCall, requestLogger, setupGracefulShutdown } from "shared";
import { technicalAnalysis, fundamentalAnalysis, spreadAnalysis, memeAnalysis, fullAnalysis } from "./analysis.js";
import { privateKeyToAccount } from "viem/accounts";

const AGENT = "Analyst Agent";
const account = privateKeyToAccount(env.PRIVATE_KEY as `0x${string}`);

const app = express();
app.use(cors());
app.use(express.json());
app.use(requestLogger(AGENT));

app.use(
  x402PaymentMiddleware({
    payTo: account.address,
    mockMode: true,
    routes: {
      "GET /analysis/technical/:token": { price: "$0.02", description: "Technical analysis report" },
      "GET /analysis/fundamental/:token": { price: "$0.03", description: "Fundamental analysis" },
      "GET /analysis/spread/:token": { price: "$0.01", description: "CEX-DEX spread analysis" },
      "GET /analysis/meme/:token": { price: "$0.03", description: "Meme virality & community analysis" },
      "GET /analysis/full/:token": { price: "$0.08", description: "Full analysis (technical + fundamental + meme + spread)" },
    },
  })
);

app.get("/health", (_req, res) => {
  res.json({ agent: AGENT, status: "online", wallet: account.address, timestamp: new Date().toISOString() });
});

app.get("/analysis/technical/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await technicalAnalysis(req.params.token, chain);
    recordCall(AGENT, "technical", 0.02);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/analysis/fundamental/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await fundamentalAnalysis(req.params.token, chain);
    recordCall(AGENT, "fundamental", 0.03);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/analysis/spread/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await spreadAnalysis(req.params.token, chain);
    recordCall(AGENT, "spread", 0.01);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/analysis/meme/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await memeAnalysis(req.params.token, chain);
    recordCall(AGENT, "meme", 0.03);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/analysis/full/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await fullAnalysis(req.params.token, chain);
    recordCall(AGENT, "full", 0.08);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = 4002;
const server = app.listen(PORT, () => {
  console.log(`\n📊 ${AGENT} running on http://localhost:${PORT}`);
  console.log(`   Wallet: ${account.address}`);
  console.log(`   AI engine: ${env.ANTHROPIC_API_KEY ? "Claude (active)" : "Claude (no API key)"}`);
  console.log(`   GET /analysis/technical/:token   ($0.02)`);
  console.log(`   GET /analysis/fundamental/:token  ($0.03)`);
  console.log(`   GET /analysis/spread/:token       ($0.01)`);
  console.log(`   GET /analysis/meme/:token          ($0.03)`);
  console.log(`   GET /analysis/full/:token          ($0.08)\n`);
});
setupGracefulShutdown(server, AGENT);
