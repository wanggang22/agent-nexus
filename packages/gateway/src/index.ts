import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

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
    description: "Deep technical and fundamental market analysis",
    endpoint: "http://localhost:4002",
    services: [
      { method: "GET", route: "/analysis/technical/:token", price: "$0.02", description: "Technical analysis report" },
      { method: "GET", route: "/analysis/fundamental/:token", price: "$0.03", description: "Fundamental analysis" },
      { method: "GET", route: "/analysis/spread/:token", price: "$0.01", description: "CEX-DEX spread analysis" },
      { method: "GET", route: "/analysis/full/:token", price: "$0.05", description: "Full analysis report" },
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
    description: "Trade execution, quote routing, order tracking",
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
    description: "AI Agent Service Marketplace on X Layer — pay-per-call via x402",
    network: "eip155:196",
    payment: "x402 (USDC on X Layer)",
    agents: AGENTS,
  });
});

// Health check
app.get("/health", async (_req, res) => {
  const statuses = await Promise.all(
    AGENTS.map(async (agent) => {
      try {
        const resp = await fetch(`${agent.endpoint}/health`, { signal: AbortSignal.timeout(2000) });
        return { name: agent.name, status: resp.ok ? "online" : "degraded" };
      } catch {
        return { name: agent.name, status: "offline" };
      }
    })
  );
  res.json({ gateway: "online", agents: statuses });
});

// Stats
let totalCalls = 0;
let totalRevenue = 0;
const callLog: Array<{ agent: string; service: string; price: number; timestamp: string }> = [];

app.post("/stats/record", (req, res) => {
  const { agent, service, price } = req.body;
  totalCalls++;
  totalRevenue += price;
  callLog.push({ agent, service, price, timestamp: new Date().toISOString() });
  res.json({ ok: true });
});

app.get("/stats", (_req, res) => {
  res.json({
    total_calls: totalCalls,
    total_revenue_usd: totalRevenue.toFixed(4),
    recent_calls: callLog.slice(-20),
  });
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`\n🌐 AgentNexus Gateway running on http://localhost:${PORT}`);
  console.log(`📋 Service discovery: http://localhost:${PORT}/services`);
  console.log(`💚 Health check: http://localhost:${PORT}/health\n`);
});
