import express from "express";
import cors from "cors";
import { env, x402PaymentMiddleware, recordCall, requestLogger, setupGracefulShutdown, resolveToken } from "shared";

/** Resolve symbol to address if needed */
function resolveAddr(token: string, chain = "xlayer"): string {
  if (/^0x[a-fA-F0-9]{40}$/.test(token)) return token;
  const resolved = resolveToken(token, chain);
  return resolved?.address || token;
}
import {
  technicalAnalysis, fundamentalAnalysis, spreadAnalysis, memeAnalysis, fullAnalysis,
  basicTechnical, basicFundamental, basicSpread, basicMeme, basicFullAnalysis,
  getAiCostStats,
} from "./analysis.js";
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

// AI cost stats — free, for monitoring
app.get("/ai-stats", (_req, res) => {
  res.json(getAiCostStats());
});

// ── Basic mode (FREE): rule-based analysis from OnchainOS data ──
app.get("/basic/technical/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await basicTechnical(resolveAddr(req.params.token, chain), chain);
    recordCall(AGENT, "basic-technical", 0);
    res.json({ mode: "basic", ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/basic/fundamental/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await basicFundamental(resolveAddr(req.params.token, chain), chain);
    recordCall(AGENT, "basic-fundamental", 0);
    res.json({ mode: "basic", ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/basic/spread/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await basicSpread(resolveAddr(req.params.token, chain), chain);
    recordCall(AGENT, "basic-spread", 0);
    res.json({ mode: "basic", ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/basic/meme/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await basicMeme(resolveAddr(req.params.token, chain), chain);
    recordCall(AGENT, "basic-meme", 0);
    res.json({ mode: "basic", ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/basic/full/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await basicFullAnalysis(resolveAddr(req.params.token, chain), chain);
    recordCall(AGENT, "basic-full", 0);
    res.json({ mode: "basic", ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Basic meme with bundle/sniper detection (FREE, more OnchainOS commands)
app.get("/basic/meme-deep/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await basicMeme(resolveAddr(req.params.token, chain), chain);
    recordCall(AGENT, "basic-meme-deep", 0);
    res.json({ mode: "basic-deep", ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Deep mode (PAID): Claude AI-powered analysis ──
app.get("/analysis/technical/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await technicalAnalysis(resolveAddr(req.params.token, chain), chain);
    recordCall(AGENT, "technical", 0.02);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/analysis/fundamental/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await fundamentalAnalysis(resolveAddr(req.params.token, chain), chain);
    recordCall(AGENT, "fundamental", 0.03);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/analysis/spread/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await spreadAnalysis(resolveAddr(req.params.token, chain), chain);
    recordCall(AGENT, "spread", 0.01);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/analysis/meme/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await memeAnalysis(resolveAddr(req.params.token, chain), chain);
    recordCall(AGENT, "meme", 0.03);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/analysis/full/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await fullAnalysis(resolveAddr(req.params.token, chain), chain);
    recordCall(AGENT, "full", 0.08);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = parseInt(process.env.PORT || "4002");
const server = app.listen(PORT, () => {
  console.log(`\n📊 ${AGENT} running on http://localhost:${PORT}`);
  console.log(`   Wallet: ${account.address}`);
  console.log(`   AI engine: ${env.ANTHROPIC_API_KEY ? "Claude (active)" : "Claude (no API key)"}`);
  console.log(`   [FREE]  GET /basic/technical/:token`);
  console.log(`   [FREE]  GET /basic/fundamental/:token`);
  console.log(`   [FREE]  GET /basic/spread/:token`);
  console.log(`   [FREE]  GET /basic/meme/:token`);
  console.log(`   [FREE]  GET /basic/full/:token`);
  console.log(`   [PAID]  GET /analysis/technical/:token   ($0.02)`);
  console.log(`   [PAID]  GET /analysis/fundamental/:token ($0.03)`);
  console.log(`   [PAID]  GET /analysis/spread/:token      ($0.01)`);
  console.log(`   [PAID]  GET /analysis/meme/:token        ($0.03)`);
  console.log(`   [PAID]  GET /analysis/full/:token        ($0.08)\n`);
});
setupGracefulShutdown(server, AGENT);
