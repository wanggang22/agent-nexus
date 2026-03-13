import express from "express";
import cors from "cors";
import { env, x402PaymentMiddleware, recordCall, requestLogger, setupGracefulShutdown } from "shared";
import { assessRisk, tokenSafety, portfolioRisk } from "./rules-engine.js";
import { privateKeyToAccount } from "viem/accounts";

const AGENT = "Risk Agent";
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
      "POST /risk/assess": { price: "$0.01", description: "Pre-trade risk assessment" },
      "GET /risk/token-safety/:token": { price: "$0.01", description: "Token safety check" },
      "GET /risk/portfolio": { price: "$0.005", description: "Portfolio risk overview" },
    },
  })
);

app.get("/health", (_req, res) => {
  res.json({ agent: AGENT, status: "online", wallet: account.address, timestamp: new Date().toISOString() });
});

app.post("/risk/assess", async (req, res) => {
  try {
    const { token, chain, portfolio_value } = req.body;
    if (!token) return res.status(400).json({ error: "token address required" });
    const result = await assessRisk(token, chain || "xlayer", portfolio_value);
    recordCall(AGENT, "assess", 0.01);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/risk/token-safety/:token", async (req, res) => {
  try {
    const chain = (req.query.chain as string) || "xlayer";
    const result = await tokenSafety(req.params.token, chain);
    recordCall(AGENT, "token-safety", 0.01);
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
    recordCall(AGENT, "portfolio", 0.005);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = 4003;
const server = app.listen(PORT, () => {
  console.log(`\n🛡️  ${AGENT} running on http://localhost:${PORT}`);
  console.log(`   Wallet: ${account.address}`);
  console.log(`   POST /risk/assess            ($0.01)`);
  console.log(`   GET  /risk/token-safety/:token ($0.01)`);
  console.log(`   GET  /risk/portfolio          ($0.005)\n`);
});
setupGracefulShutdown(server, AGENT);
