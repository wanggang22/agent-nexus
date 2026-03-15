"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:4000";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const twitterId = (session as any)?.twitterId;
  const twitterUsername = (session as any)?.twitterUsername;

  const [wallet, setWallet] = useState<string | null>(null);
  const [bindCode, setBindCode] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordMode, setPasswordMode] = useState<"set" | "unlock" | null>(null);
  const [walletPending, setWalletPending] = useState(false);
  const [backupKey, setBackupKey] = useState<string | null>(null); // shown once after creation
  const [backupConfirmed, setBackupConfirmed] = useState(false);

  // Chat
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: string; text: string }>>([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Stats
  const [stats, setStats] = useState<any>(null);

  // Fetch wallet status on login
  useEffect(() => {
    if (!twitterId) return;

    // Check if wallet exists via Gateway
    fetch(`${GATEWAY}/wallet/twitter/${twitterId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.address) {
          setWallet(data.address);
          // Check session
          fetch(`${GATEWAY}/session/check/twitter/${twitterId}`)
            .then((r) => r.json())
            .then((s) => setSessionActive(!!s.active))
            .catch(() => {});
        }
      })
      .catch(() => {});

    // Fetch stats
    fetch(`${GATEWAY}/stats`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, [twitterId]);

  // Create wallet
  const handleCreateWallet = async () => {
    const resp = await fetch(`${GATEWAY}/wallet/twitter/${twitterId}`);
    const data = await resp.json();
    if (data.address) {
      setWallet(data.address);
      setWalletPending(true);
      setPasswordMode("set");
    }
  };

  // Set password / unlock
  const handlePasswordSubmit = async () => {
    if (!password || password.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }

    if (passwordMode === "set") {
      // Confirm wallet with password
      const resp = await fetch(`${GATEWAY}/wallet/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "twitter", user_id: twitterId, password }),
      });
      const data = await resp.json();
      if (data.success) {
        setWalletPending(false);
        setPasswordMode(null);
        setPassword("");
        // Show private key for backup — this is the ONLY time it's shown
        if (data.privateKey) {
          setBackupKey(data.privateKey);
        }
      } else {
        alert(data.error || "Failed to set password");
      }
    } else if (passwordMode === "unlock") {
      // Unlock session
      const resp = await fetch(`${GATEWAY}/wallet/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "twitter", user_id: twitterId, password }),
      });
      const data = await resp.json();
      if (data.success) {
        setSessionActive(true);
        setPasswordMode(null);
        setPassword("");
      } else {
        alert(data.error || "Wrong password");
      }
    }
  };

  // Lock wallet
  const handleLock = async () => {
    await fetch(`${GATEWAY}/session/lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "twitter", user_id: twitterId }),
    });
    setSessionActive(false);
  };

  // Generate Telegram bind code
  const handleBindTelegram = async () => {
    const resp = await fetch(`${GATEWAY}/bind/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "twitter", user_id: twitterId }),
    });
    const data = await resp.json();
    setBindCode(data.code || null);
  };

  // Chat
  const handleChat = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatHistory((h) => [...h, { role: "user", text: msg }]);
    setChatInput("");
    setChatLoading(true);

    try {
      const resp = await fetch(`${GATEWAY}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          platform: "twitter",
          user_id: twitterId,
        }),
      });
      const data = await resp.json();
      setChatHistory((h) => [...h, { role: "agent", text: data.reply || data.error || "No response" }]);
    } catch (e: any) {
      setChatHistory((h) => [...h, { role: "agent", text: `Error: ${e.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  // ── Not logged in ──
  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="card max-w-md w-full text-center">
          <h1 className="text-3xl font-bold text-white mb-2">AgentNexus</h1>
          <p className="text-gray-400 mb-6">AI Agent Trading on X Layer</p>

          <button
            onClick={() => signIn("twitter")}
            className="w-full bg-nexus-accent hover:bg-nexus-accent/80 text-black font-semibold py-3 px-6 rounded-lg transition"
          >
            Login with Twitter / X
          </button>

          <div className="mt-6 text-sm text-gray-500 space-y-2">
            <div>One-click login with your Twitter account</div>
            <div>Auto-generate encrypted X Layer wallet</div>
            <div>Trade, analyze, and track — all from here</div>
          </div>

          <div className="mt-6 pt-4 border-t border-nexus-border text-xs text-gray-600">
            Or use <span className="text-nexus-accent">Telegram Bot</span> / <span className="text-nexus-accent">Twitter @mention</span> / <span className="text-nexus-accent">HTTP API</span>
          </div>
        </div>
      </main>
    );
  }

  // ── Logged in ──
  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto">
      {/* Private Key Backup Modal */}
      {backupKey && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="card max-w-lg w-full">
            <h2 className="text-xl font-bold text-nexus-yellow mb-3">Save Your Private Key!</h2>
            <p className="text-sm text-gray-400 mb-4">
              This is the <strong>ONLY</strong> time your private key will be shown.
              Copy it and store it safely. If you lose it and forget your password, your funds are gone forever.
            </p>
            <div className="bg-nexus-bg p-3 rounded font-mono text-sm text-nexus-accent break-all mb-4 select-all">
              {backupKey}
            </div>
            <p className="text-xs text-gray-500 mb-4">
              You can import this key into OKX Wallet or MetaMask to access your wallet directly.
            </p>
            <label className="flex items-center gap-2 text-sm text-gray-300 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={backupConfirmed}
                onChange={(e) => setBackupConfirmed(e.target.checked)}
                className="rounded"
              />
              I have saved my private key in a safe place
            </label>
            <button
              onClick={() => { setBackupKey(null); setBackupConfirmed(false); }}
              disabled={!backupConfirmed}
              className="w-full bg-nexus-accent text-black py-2 rounded-lg font-medium disabled:opacity-30 disabled:cursor-not-allowed"
            >
              I've Saved It — Continue
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">AgentNexus</h1>
          <p className="text-gray-400 text-sm">AI Agent Trading on X Layer</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-300">@{twitterUsername}</span>
          <button onClick={() => signOut()} className="text-xs text-gray-500 hover:text-gray-300">
            Logout
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Wallet Card */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-3">Wallet</h2>
          {!wallet ? (
            <button onClick={handleCreateWallet} className="w-full bg-nexus-accent text-black py-2 rounded-lg font-medium">
              Create Wallet
            </button>
          ) : (
            <>
              <div className="text-xs text-gray-400 mb-1">X Layer Address</div>
              <div className="text-sm font-mono text-nexus-accent bg-nexus-bg p-2 rounded mb-3 break-all">
                {wallet}
              </div>

              {walletPending || passwordMode === "set" ? (
                <div>
                  <div className="text-sm text-nexus-yellow mb-2">Set trading password (min 6 chars):</div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-nexus-bg border border-nexus-border text-white p-2 rounded mb-2 text-sm"
                    placeholder="Trading password"
                    onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
                  />
                  <button onClick={handlePasswordSubmit} className="w-full bg-nexus-accent text-black py-2 rounded-lg text-sm font-medium">
                    Set Password
                  </button>
                </div>
              ) : passwordMode === "unlock" ? (
                <div>
                  <div className="text-sm text-gray-400 mb-2">Enter password to unlock (1 hour):</div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-nexus-bg border border-nexus-border text-white p-2 rounded mb-2 text-sm"
                    placeholder="Trading password"
                    onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
                  />
                  <button onClick={handlePasswordSubmit} className="w-full bg-nexus-accent text-black py-2 rounded-lg text-sm font-medium">
                    Unlock
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  {sessionActive ? (
                    <>
                      <span className="text-xs text-nexus-green flex items-center gap-1">
                        <span className="w-2 h-2 bg-nexus-green rounded-full inline-block" /> Unlocked
                      </span>
                      <button onClick={handleLock} className="text-xs text-gray-500 hover:text-gray-300 ml-auto">
                        Lock
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setPasswordMode("unlock")}
                      className="w-full bg-nexus-bg border border-nexus-border text-white py-2 rounded-lg text-sm hover:border-nexus-accent transition"
                    >
                      Unlock Wallet
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Bind Telegram */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-3">Telegram</h2>
          <p className="text-sm text-gray-400 mb-3">
            Link Telegram to trade via bot & share session.
          </p>
          {bindCode ? (
            <div>
              <div className="text-sm text-gray-400 mb-1">Send to @AgentNexusBot:</div>
              <div className="font-mono text-nexus-accent bg-nexus-bg p-2 rounded text-center text-lg">
                /verify {bindCode}
              </div>
              <div className="text-xs text-gray-500 mt-2">Expires in 5 minutes. One-time use.</div>
            </div>
          ) : (
            <button onClick={handleBindTelegram} className="w-full bg-nexus-bg border border-nexus-border text-white py-2 rounded-lg text-sm hover:border-nexus-accent transition">
              Generate Bind Code
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-3">Platform</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Total Calls</span>
              <span className="text-white">{stats?.total_calls || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Revenue</span>
              <span className="text-nexus-green">${stats?.total_revenue_usd || "0"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Network</span>
              <span className="text-gray-300 font-mono text-xs">X Layer (196)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Wallet Status</span>
              <span className={sessionActive ? "text-nexus-green" : "text-gray-500"}>
                {sessionActive ? "Unlocked" : wallet ? "Locked" : "No wallet"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Interface */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-3">Chat with AgentNexus</h2>
        <div className="bg-nexus-bg rounded-lg p-4 h-80 overflow-y-auto mb-3 space-y-3">
          {chatHistory.length === 0 ? (
            <div className="text-gray-500 text-sm text-center mt-20">
              Try: "分析下ETH" or "what's trending?" or "帮我换1 OKB到USDT"
            </div>
          ) : (
            chatHistory.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] p-3 rounded-lg text-sm ${
                    msg.role === "user"
                      ? "bg-nexus-accent text-black"
                      : "bg-nexus-card text-gray-200 border border-nexus-border"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))
          )}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="bg-nexus-card text-gray-400 p-3 rounded-lg text-sm border border-nexus-border">
                Thinking...
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !chatLoading && handleChat()}
            className="flex-1 bg-nexus-bg border border-nexus-border text-white p-3 rounded-lg text-sm focus:outline-none focus:border-nexus-accent"
            placeholder="Ask anything... (Chinese or English)"
            disabled={chatLoading}
          />
          <button
            onClick={handleChat}
            disabled={chatLoading || !chatInput.trim()}
            className="bg-nexus-accent text-black px-6 py-3 rounded-lg font-medium disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 text-center text-xs text-gray-600">
        AgentNexus v1.0.0 · X Layer AI Agent Hackathon ·{" "}
        <a href="https://github.com/wanggang22/agent-nexus" className="text-nexus-accent hover:underline">
          GitHub
        </a>
      </div>
    </main>
  );
}
