import express from "express";
import cors from "cors";

const AGENT = "Gateway";
const app = express();
app.use(cors());
app.use(express.json());

// Request logger (skip /health and /stats/record to reduce noise)
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path === "/health" || req.path === "/stats/record") return;
    console.log(`[${AGENT}] ${req.method} ${req.path} → ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

const AGENTS = [
  {
    name: "Signal Agent",
    description: "Real-time on-chain signal detection: smart money, whale alerts, meme scans",
    endpoint: "http://localhost:4001",
    services: [
      { method: "GET", route: "/signals/smart-money", price: "$0.01", description: "Smart money buy signals" },
      { method: "GET", route: "/signals/whale-alert", price: "$0.02", description: "Whale movement alerts" },
      { method: "GET", route: "/signals/meme-scan", price: "$0.005", description: "New meme token scan" },
      { method: "GET", route: "/signals/trending", price: "$0.005", description: "Trending tokens" },
    ],
  },
  {
    name: "Analyst Agent",
    description: "Deep technical and fundamental market analysis powered by Claude AI",
    endpoint: "http://localhost:4002",
    services: [
      { method: "GET", route: "/analysis/technical/:token", price: "$0.02", description: "Technical analysis report" },
      { method: "GET", route: "/analysis/fundamental/:token", price: "$0.03", description: "Fundamental analysis" },
      { method: "GET", route: "/analysis/spread/:token", price: "$0.01", description: "CEX-DEX spread analysis" },
      { method: "GET", route: "/analysis/meme/:token", price: "$0.03", description: "Meme virality & community analysis" },
      { method: "GET", route: "/analysis/full/:token", price: "$0.08", description: "Full analysis (technical + fundamental + meme)" },
    ],
  },
  {
    name: "Risk Agent",
    description: "Pre-trade risk assessment, honeypot detection, portfolio risk",
    endpoint: "http://localhost:4003",
    services: [
      { method: "POST", route: "/risk/assess", price: "$0.01", description: "Pre-trade risk assessment" },
      { method: "GET", route: "/risk/token-safety/:token", price: "$0.01", description: "Token safety check" },
      { method: "GET", route: "/risk/portfolio", price: "$0.005", description: "Portfolio risk overview" },
    ],
  },
  {
    name: "Trader Agent",
    description: "Trade execution, quote routing, order tracking via OnchainOS",
    endpoint: "http://localhost:4004",
    services: [
      { method: "POST", route: "/trade/quote", price: "$0.005", description: "Get optimal trade quote" },
      { method: "POST", route: "/trade/execute", price: "$0.05", description: "Execute trade" },
      { method: "GET", route: "/trade/status/:orderId", price: "free", description: "Track order status" },
    ],
  },
];

// Service discovery — free, no x402
app.get("/services", (_req, res) => {
  res.json({
    platform: "AgentNexus",
    version: "1.0.0",
    description: "AI Agent Service Marketplace on X Layer — pay-per-call via x402",
    network: "eip155:196",
    payment: "x402 (USDC on X Layer)",
    contracts: {
      AgentRegistry: "0x294f885031544d7Af38D79fe1E9a5c87f3880DEA",
      PaymentLedger: "0x00e0C1C17E9c3899A0bD362560Ea0Ab8112A4E05",
    },
    agents: AGENTS,
  });
});

// Health check
app.get("/health", async (_req, res) => {
  const statuses = await Promise.all(
    AGENTS.map(async (agent) => {
      try {
        const resp = await fetch(`${agent.endpoint}/health`, { signal: AbortSignal.timeout(2000) });
        const data = await resp.json() as any;
        return { name: agent.name, status: resp.ok ? "online" : "degraded", wallet: data.wallet };
      } catch {
        return { name: agent.name, status: "offline" };
      }
    })
  );
  const online = statuses.filter((s) => s.status === "online").length;
  res.json({ gateway: "online", agents_online: `${online}/${statuses.length}`, agents: statuses });
});

// Stats
let totalCalls = 0;
let totalRevenue = 0;
const callLog: Array<{ agent: string; service: string; price: number; timestamp: string }> = [];

app.post("/stats/record", (req, res) => {
  const { agent, service, price } = req.body;
  if (!agent || !service || typeof price !== "number") {
    return res.status(400).json({ error: "agent, service (string) and price (number) required" });
  }
  totalCalls++;
  totalRevenue += price;
  callLog.push({ agent, service, price, timestamp: new Date().toISOString() });
  // Keep log bounded
  if (callLog.length > 1000) callLog.splice(0, callLog.length - 500);
  res.json({ ok: true });
});

app.get("/stats", (_req, res) => {
  res.json({
    total_calls: totalCalls,
    total_revenue_usd: totalRevenue.toFixed(4),
    recent_calls: callLog.slice(-20),
    uptime_seconds: Math.floor(process.uptime()),
  });
});

const PORT = 4000;
const server = app.listen(PORT, () => {
  console.log(`\n🌐 AgentNexus Gateway running on http://localhost:${PORT}`);
  console.log(`📋 Service discovery: http://localhost:${PORT}/services`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Stats: http://localhost:${PORT}/stats\n`);
});

// Graceful shutdown
const shutdown = () => {
  console.log(`\n[${AGENT}] Shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
