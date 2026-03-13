"use client";

import { useEffect, useState } from "react";

const GATEWAY = "http://localhost:4000";

interface AgentStatus {
  name: string;
  status: string;
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
  description: string;
  network: string;
  payment: string;
  agents: Agent[];
}

export default function Dashboard() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [stats, setStats] = useState<Stats>({ total_calls: 0, total_revenue_usd: "0", recent_calls: [] });
  const [services, setServices] = useState<ServicesResponse | null>(null);
  const [loading, setLoading] = useState(true);

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
    } catch (e) {
      console.error("Failed to fetch data:", e);
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
          <h1 className="text-3xl font-bold text-white">AgentNexus</h1>
          <p className="text-gray-400 mt-1">AI Agent Service Marketplace on X Layer</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 font-mono">eip155:196</span>
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${onlineCount > 0 ? "bg-nexus-green/20 text-nexus-green" : "bg-nexus-red/20 text-nexus-red"}`}>
            {onlineCount}/{agents.length} Online
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 mt-20">Loading...</div>
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
              <div className="stat-value">{services?.agents.length || 0}</div>
              <div className="stat-label">Active Agents</div>
            </div>
            <div className="card">
              <div className="stat-value">
                {services?.agents.reduce((sum, a) => sum + a.services.length, 0) || 0}
              </div>
              <div className="stat-label">Paid Endpoints</div>
            </div>
          </div>

          {/* Agents Grid */}
          <h2 className="text-xl font-semibold text-white mb-4">Agent Services</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {services?.agents.map((agent) => {
              const status = agents.find((a) => a.name === agent.name);
              return (
                <div key={agent.name} className="card">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center">
                      <span className={status?.status === "online" ? "agent-online" : "agent-offline"} />
                      <h3 className="font-semibold text-white">{agent.name}</h3>
                    </div>
                    <span className="text-xs text-gray-500">{agent.endpoint}</span>
                  </div>
                  <p className="text-sm text-gray-400 mb-3">{agent.description}</p>
                  <div className="space-y-2">
                    {agent.services.map((svc) => (
                      <div key={svc.route} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-gray-500 w-10">{svc.method}</span>
                          <span className="text-gray-300 font-mono text-xs">{svc.route}</span>
                        </div>
                        <span className="price-tag">{svc.price}</span>
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
              <p className="text-gray-500 text-sm">No calls yet. Waiting for x402 payments...</p>
            ) : (
              <div className="space-y-2">
                {stats.recent_calls
                  .slice()
                  .reverse()
                  .map((call, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-nexus-border last:border-0">
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500 font-mono">
                          {new Date(call.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="text-gray-300">{call.agent}</span>
                        <span className="text-gray-500 font-mono text-xs">{call.service}</span>
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
                  href="https://www.okx.com/web3/explorer/xlayer/address/0x294f885031544d7Af38D79fe1E9a5c87f3880DEA"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-nexus-accent font-mono text-xs hover:underline"
                >
                  0x294f...0DEA
                </a>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">PaymentLedger</span>
                <a
                  href="https://www.okx.com/web3/explorer/xlayer/address/0x00e0C1C17E9c3899A0bD362560Ea0Ab8112A4E05"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-nexus-accent font-mono text-xs hover:underline"
                >
                  0x00e0...4E05
                </a>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Network</span>
                <span className="text-gray-300 font-mono text-xs">X Layer (Chain ID: 196)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Payment</span>
                <span className="text-gray-300 font-mono text-xs">x402 / USDC</span>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
