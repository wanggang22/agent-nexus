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

export default function Dashboard() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [stats, setStats] = useState<Stats>({ total_calls: 0, total_revenue_usd: "0", recent_calls: [] });
  const [services, setServices] = useState<ServicesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [connected, setConnected] = useState(true);

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
      setLastUpdate(new Date());
    } catch (e) {
      console.error("Failed to fetch data:", e);
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const onlineCount = agents.filter((a) => a.status === "online").length;

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">
            AgentNexus
          </h1>
          <p className="text-gray-400 mt-1">AI Agent Service Marketplace on X Layer</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-xs text-gray-600">
              {connected ? "live" : "disconnected"} · {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <span className="text-xs text-gray-500 font-mono border border-nexus-border px-2 py-0.5 rounded">
            eip155:196
          </span>
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${
            !connected ? "bg-nexus-red/20 text-nexus-red" :
            onlineCount > 0 ? "bg-nexus-green/20 text-nexus-green" : "bg-nexus-yellow/20 text-nexus-yellow"
          }`}>
            {connected ? `${onlineCount}/${agents.length} Online` : "Gateway Offline"}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 mt-20">Connecting to gateway...</div>
      ) : !connected ? (
        <div className="text-center mt-20">
          <div className="text-nexus-red text-lg mb-2">Gateway Unreachable</div>
          <p className="text-gray-500 text-sm">Make sure all services are running: <code className="text-gray-400">bash start.sh</code></p>
        </div>
      ) : (
        <>
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

          {/* x402 Protocol Info */}
          <div className="card mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">x402 Payment Protocol</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-center">
              <div className="bg-nexus-bg rounded-lg p-3">
                <div className="text-nexus-accent font-mono text-xs mb-1">Step 1</div>
                <div className="text-gray-300">Agent calls endpoint</div>
                <div className="text-gray-500 text-xs mt-1">GET /signals/smart-money</div>
              </div>
              <div className="bg-nexus-bg rounded-lg p-3">
                <div className="text-nexus-yellow font-mono text-xs mb-1">Step 2</div>
                <div className="text-gray-300">402 Payment Required</div>
                <div className="text-gray-500 text-xs mt-1">Returns price + payment details</div>
              </div>
              <div className="bg-nexus-bg rounded-lg p-3">
                <div className="text-nexus-accent font-mono text-xs mb-1">Step 3</div>
                <div className="text-gray-300">Agent sends USDC</div>
                <div className="text-gray-500 text-xs mt-1">PAYMENT-SIGNATURE header</div>
              </div>
              <div className="bg-nexus-bg rounded-lg p-3">
                <div className="text-nexus-green font-mono text-xs mb-1">Step 4</div>
                <div className="text-gray-300">Service delivered</div>
                <div className="text-gray-500 text-xs mt-1">Data + settlement receipt</div>
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
          <h2 className="text-xl font-semibold text-white mb-4">Recent x402 Payments</h2>
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
                      <span className="text-nexus-green font-mono">${call.price.toFixed(3)}</span>
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
          </div>
        </>
      )}
    </main>
  );
}
