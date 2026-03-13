"use client";

import { useEffect, useState } from "react";

const GATEWAY = "http://localhost:4000";

interface AgentStatus {
  name: string;
  status: string;
  wallet?: string;
}

interface CallRecord {
  agent: string;
  service: string;
  price: number;
  timestamp: string;
}

interface Stats {
  total_calls: number;
  total_revenue_usd: string;
  recent_calls: CallRecord[];
  uptime_seconds?: number;
}

interface AgentService {
  method: string;
  route: string;
  price: string;
  description: string;
}

interface Agent {
  name: string;
  description: string;
  endpoint: string;
  services: AgentService[];
}

interface ServicesResponse {
  platform: string;
  version: string;
  description: string;
  network: string;
  payment: string;
  contracts: { AgentRegistry: string; PaymentLedger: string };
  agents: Agent[];
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const AGENT_ICONS: Record<string, string> = {
  "Signal Agent": "📡",
  "Analyst Agent": "📊",
  "Risk Agent": "🛡️",
  "Trader Agent": "💹",
};

// ── Demo data for static GitHub Pages deployment ──
const DEMO_WALLET = "0x418E21F39411f513E29bFfCa1742868271Eb8a24";

const DEMO_SERVICES: ServicesResponse = {
  platform: "AgentNexus",
  version: "1.0.0",
  description: "AI Agent Service Marketplace on X Layer — pay-per-call via x402",
  network: "eip155:196",
  payment: "x402 (USDC on X Layer)",
  contracts: {
    AgentRegistry: "0x294f885031544d7Af38D79fe1E9a5c87f3880DEA",
    PaymentLedger: "0x00e0C1C17E9c3899A0bD362560Ea0Ab8112A4E05",
  },
  agents: [
    {
      name: "Signal Agent",
      description: "Real-time on-chain signal detection via OnchainOS — FREE",
      endpoint: "http://localhost:4001",
      services: [
        { method: "GET", route: "/signals/smart-money", price: "free", description: "Smart money buy signals" },
        { method: "GET", route: "/signals/whale-alert", price: "free", description: "Whale movement alerts" },
        { method: "GET", route: "/signals/meme-scan", price: "free", description: "New meme token scan" },
        { method: "GET", route: "/signals/trending", price: "free", description: "Trending tokens" },
      ],
    },
    {
      name: "Analyst Agent",
      description: "Deep market analysis powered by Claude AI — paid (covers AI cost)",
      endpoint: "http://localhost:4002",
      services: [
        { method: "GET", route: "/analysis/technical/:token", price: "$0.02", description: "Technical analysis (AI)" },
        { method: "GET", route: "/analysis/fundamental/:token", price: "$0.03", description: "Fundamental analysis (AI)" },
        { method: "GET", route: "/analysis/spread/:token", price: "$0.01", description: "CEX-DEX spread analysis (AI)" },
        { method: "GET", route: "/analysis/meme/:token", price: "$0.03", description: "Meme virality & community (AI)" },
        { method: "GET", route: "/analysis/full/:token", price: "$0.08", description: "Full analysis — all dimensions (AI)" },
      ],
    },
    {
      name: "Risk Agent",
      description: "Pre-trade risk assessment via OnchainOS — FREE",
      endpoint: "http://localhost:4003",
      services: [
        { method: "POST", route: "/risk/assess", price: "free", description: "Pre-trade risk assessment" },
        { method: "GET", route: "/risk/token-safety/:token", price: "free", description: "Token safety check" },
        { method: "GET", route: "/risk/portfolio", price: "free", description: "Portfolio risk overview" },
      ],
    },
    {
      name: "Trader Agent",
      description: "Trade execution via OnchainOS + OKX DEX — FREE",
      endpoint: "http://localhost:4004",
      services: [
        { method: "POST", route: "/trade/quote", price: "free", description: "Optimal quote with auto slippage" },
        { method: "POST", route: "/trade/execute", price: "free", description: "Execute trade" },
        { method: "GET", route: "/trade/status/:orderId", price: "free", description: "Track order status" },
      ],
    },
  ],
};

const DEMO_AGENTS: AgentStatus[] = [
  { name: "Signal Agent", status: "online", wallet: DEMO_WALLET },
  { name: "Analyst Agent", status: "online", wallet: DEMO_WALLET },
  { name: "Risk Agent", status: "online", wallet: DEMO_WALLET },
  { name: "Trader Agent", status: "online", wallet: DEMO_WALLET },
];

const DEMO_STATS: Stats = {
  total_calls: 52,
  total_revenue_usd: "0.3500",
  uptime_seconds: 3621,
  recent_calls: [
    { agent: "Signal Agent", service: "smart-money", price: 0, timestamp: "2026-03-14T10:01:10.000Z" },
    { agent: "Signal Agent", service: "whale-alert", price: 0, timestamp: "2026-03-14T10:01:15.000Z" },
    { agent: "Risk Agent", service: "token-safety", price: 0, timestamp: "2026-03-14T10:02:01.000Z" },
    { agent: "Analyst Agent", service: "technical", price: 0.02, timestamp: "2026-03-14T10:02:30.000Z" },
    { agent: "Analyst Agent", service: "meme", price: 0.03, timestamp: "2026-03-14T10:03:05.000Z" },
    { agent: "Analyst Agent", service: "full", price: 0.08, timestamp: "2026-03-14T10:04:00.000Z" },
    { agent: "Trader Agent", service: "quote", price: 0, timestamp: "2026-03-14T10:05:12.000Z" },
    { agent: "Trader Agent", service: "execute", price: 0, timestamp: "2026-03-14T10:05:20.000Z" },
    { agent: "Signal Agent", service: "trending", price: 0, timestamp: "2026-03-14T10:06:00.000Z" },
    { agent: "Risk Agent", service: "assess", price: 0, timestamp: "2026-03-14T10:06:30.000Z" },
    { agent: "Analyst Agent", service: "fundamental", price: 0.03, timestamp: "2026-03-14T10:07:15.000Z" },
    { agent: "Signal Agent", service: "meme-scan", price: 0, timestamp: "2026-03-14T10:08:00.000Z" },
  ],
};

export default function Dashboard() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [stats, setStats] = useState<Stats>({ total_calls: 0, total_revenue_usd: "0", recent_calls: [] });
  const [services, setServices] = useState<ServicesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [connected, setConnected] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  const fetchData = async () => {
    try {
      const [healthRes, statsRes, servicesRes] = await Promise.all([
        fetch(`${GATEWAY}/health`).then((r) => r.json()),
        fetch(`${GATEWAY}/stats`).then((r) => r.json()),
        fetch(`${GATEWAY}/services`).then((r) => r.json()),
      ]);
      setAgents(healthRes.agents || []);
      setStats(statsRes);
      setServices(servicesRes);
      setConnected(true);
      setDemoMode(false);
      setLastUpdate(new Date());
    } catch {
      // Gateway unreachable — use demo data
      setAgents(DEMO_AGENTS);
      setStats(DEMO_STATS);
      setServices(DEMO_SERVICES);
      setConnected(false);
      setDemoMode(true);
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, connected ? 5000 : 30000);
    return () => clearInterval(interval);
  }, [connected]);

  const onlineCount = agents.filter((a) => a.status === "online").length;

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">AgentNexus</h1>
          <p className="text-gray-400 mt-1">AI Agent Service Marketplace on X Layer</p>
        </div>
        <div className="flex items-center gap-3">
          {demoMode && (
            <span className="text-xs bg-nexus-yellow/20 text-nexus-yellow px-2 py-0.5 rounded">
              DEMO
            </span>
          )}
          {lastUpdate && !demoMode && (
            <span className="text-xs text-gray-600">
              live · {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <span className="text-xs text-gray-500 font-mono border border-nexus-border px-2 py-0.5 rounded">
            eip155:196
          </span>
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${
            demoMode ? "bg-nexus-yellow/20 text-nexus-yellow" :
            onlineCount > 0 ? "bg-nexus-green/20 text-nexus-green" : "bg-nexus-red/20 text-nexus-red"
          }`}>
            {demoMode ? "Demo Mode" : `${onlineCount}/${agents.length} Online`}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 mt-20">Connecting to gateway...</div>
      ) : (
        <>
          {demoMode && (
            <div className="card mb-6 border-nexus-yellow/30">
              <p className="text-sm text-nexus-yellow">
                Showing demo data — gateway is not running locally.
                To see live data, clone the repo and run <code className="bg-nexus-bg px-1 rounded">bash start.sh</code>
              </p>
            </div>
          )}

          {/* Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="card">
              <div className="stat-value">{stats.total_calls}</div>
              <div className="stat-label">Total API Calls</div>
            </div>
            <div className="card">
              <div className="stat-value text-nexus-green">${stats.total_revenue_usd}</div>
              <div className="stat-label">x402 Revenue (USDC)</div>
            </div>
            <div className="card">
              <div className="stat-value">{onlineCount}/{agents.length}</div>
              <div className="stat-label">Agents Online</div>
            </div>
            <div className="card">
              <div className="stat-value text-nexus-accent">
                {services?.agents.reduce((sum, a) => sum + a.services.filter(s => s.price !== "free").length, 0) || 0}
              </div>
              <div className="stat-label">Paid Endpoints</div>
              {stats.uptime_seconds !== undefined && (
                <div className="text-xs text-gray-600 mt-1">uptime: {formatUptime(stats.uptime_seconds)}</div>
              )}
            </div>
          </div>

          {/* How to Use */}
          <div className="card mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">How to Use AgentNexus</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="bg-nexus-bg rounded-lg p-4">
                <div className="text-2xl mb-2">💬</div>
                <div className="text-white font-medium mb-1">Natural Language</div>
                <div className="text-gray-400 text-xs mb-2">Just talk — Chinese or English</div>
                <code className="text-nexus-accent text-xs block bg-nexus-card p-2 rounded">
                  POST /chat<br/>
                  {`{"message": "分析下ETH"}`}
                </code>
              </div>
              <div className="bg-nexus-bg rounded-lg p-4">
                <div className="text-2xl mb-2">🐦</div>
                <div className="text-white font-medium mb-1">Twitter</div>
                <div className="text-gray-400 text-xs mb-2">Tweet @AgentNexus to interact</div>
                <code className="text-gray-500 text-xs block bg-nexus-card p-2 rounded">
                  @AgentNexus analyze ETH
                </code>
              </div>
              <div className="bg-nexus-bg rounded-lg p-4">
                <div className="text-2xl mb-2">🤖</div>
                <div className="text-white font-medium mb-1">Telegram Bot</div>
                <div className="text-gray-400 text-xs mb-2">Direct message the bot</div>
                <code className="text-gray-500 text-xs block bg-nexus-card p-2 rounded">
                  Send any message to start
                </code>
              </div>
            </div>
          </div>

          {/* Pricing Model */}
          <div className="card mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">Pricing Model</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="bg-nexus-bg rounded-lg p-4">
                <div className="text-nexus-green font-medium mb-2">FREE — OnchainOS Services</div>
                <div className="text-gray-400 text-xs space-y-1">
                  <div>Signal Agent — smart money, whale alerts, meme scan, trending</div>
                  <div>Risk Agent — honeypot detection, token safety, portfolio risk</div>
                  <div>Trader Agent — swap quotes, trade execution, order tracking</div>
                </div>
                <div className="text-gray-500 text-xs mt-2 italic">Powered by OnchainOS CLI — no AI cost</div>
              </div>
              <div className="bg-nexus-bg rounded-lg p-4">
                <div className="text-nexus-yellow font-medium mb-2">PAID — Claude AI Analysis</div>
                <div className="text-gray-400 text-xs space-y-1">
                  <div>Technical analysis — $0.02</div>
                  <div>Fundamental analysis — $0.03</div>
                  <div>Meme virality & community — $0.03</div>
                  <div>CEX-DEX spread — $0.01</div>
                  <div>Full analysis (all 4) — $0.08</div>
                </div>
                <div className="text-gray-500 text-xs mt-2 italic">x402 micropayment via USDC on X Layer</div>
              </div>
            </div>
          </div>

          {/* Agents Grid */}
          <h2 className="text-xl font-semibold text-white mb-4">Agent Services</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {services?.agents.map((agent) => {
              const status = agents.find((a) => a.name === agent.name);
              const icon = AGENT_ICONS[agent.name] || "🤖";
              return (
                <div key={agent.name} className="card">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center">
                      <span className={status?.status === "online" ? "agent-online" : "agent-offline"} />
                      <h3 className="font-semibold text-white">{icon} {agent.name}</h3>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      status?.status === "online" ? "bg-nexus-green/10 text-nexus-green" : "bg-nexus-red/10 text-nexus-red"
                    }`}>
                      {status?.status || "unknown"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 mb-3">{agent.description}</p>
                  {status?.wallet && (
                    <div className="text-xs text-gray-600 font-mono mb-3">
                      {status.wallet.slice(0, 6)}...{status.wallet.slice(-4)}
                    </div>
                  )}
                  <div className="space-y-2">
                    {agent.services.map((svc) => (
                      <div key={svc.route} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-mono w-10 ${
                            svc.method === "POST" ? "text-nexus-yellow" : "text-gray-500"
                          }`}>{svc.method}</span>
                          <span className="text-gray-300 font-mono text-xs">{svc.route}</span>
                        </div>
                        <span className={svc.price === "free" ? "text-xs text-gray-500" : "price-tag"}>
                          {svc.price}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recent Calls */}
          <h2 className="text-xl font-semibold text-white mb-4">Recent API Calls</h2>
          <div className="card">
            {stats.recent_calls.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm">No calls yet.</p>
                <p className="text-gray-600 text-xs mt-1">Run the demo: <code className="text-gray-400">npx tsx packages/demo-client/src/demo.ts</code></p>
              </div>
            ) : (
              <div className="space-y-1">
                {stats.recent_calls
                  .slice()
                  .reverse()
                  .map((call, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-nexus-border last:border-0">
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-600 font-mono w-20">
                          {new Date(call.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="text-gray-300">{AGENT_ICONS[call.agent] || "🤖"} {call.agent}</span>
                        <span className="text-gray-500 font-mono text-xs bg-nexus-bg px-2 py-0.5 rounded">{call.service}</span>
                      </div>
                      <span className={`font-mono ${call.price > 0 ? "text-nexus-green" : "text-gray-600"}`}>
                        {call.price > 0 ? `$${call.price.toFixed(3)}` : "free"}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Contract Info */}
          <div className="mt-6 card">
            <h2 className="text-lg font-semibold text-white mb-3">On-Chain Contracts (X Layer Mainnet)</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">AgentRegistry</span>
                <a
                  href={`https://www.okx.com/web3/explorer/xlayer/address/${services?.contracts.AgentRegistry}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-nexus-accent font-mono text-xs hover:underline"
                >
                  {services?.contracts.AgentRegistry ? `${services.contracts.AgentRegistry.slice(0, 6)}...${services.contracts.AgentRegistry.slice(-4)}` : "—"}
                </a>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">PaymentLedger</span>
                <a
                  href={`https://www.okx.com/web3/explorer/xlayer/address/${services?.contracts.PaymentLedger}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-nexus-accent font-mono text-xs hover:underline"
                >
                  {services?.contracts.PaymentLedger ? `${services.contracts.PaymentLedger.slice(0, 6)}...${services.contracts.PaymentLedger.slice(-4)}` : "—"}
                </a>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Network</span>
                <span className="text-gray-300 font-mono text-xs">X Layer Mainnet (Chain ID: 196)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Payment Protocol</span>
                <span className="text-gray-300 font-mono text-xs">x402 / USDC</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-xs text-gray-600">
            AgentNexus v{services?.version || "1.0.0"} · X Layer AI Agent Hackathon
            {demoMode && (
              <span className="block mt-1">
                <a href="https://github.com/wanggang22/agent-nexus" target="_blank" rel="noopener noreferrer" className="text-nexus-accent hover:underline">
                  View source on GitHub
                </a>
              </span>
            )}
          </div>
        </>
      )}
    </main>
  );
}
