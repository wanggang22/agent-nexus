"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState, useRef } from "react";
import {
  createLocalWallet, saveWallet, getLocalWallet,
  unlockLocalWallet, signTransaction, hasLocalWallet, importWallet,
  syncToServer, syncFromServer,
} from "./wallet";

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:4000";

// ── Icons (inline SVG to avoid deps) ──
const IconWallet = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1 0-6h5.25A2.25 2.25 0 0 1 21 6v6zm0 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18V6a2.25 2.25 0 0 1 2.25-2.25h13.5" />
  </svg>
);
const IconShield = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
  </svg>
);
const IconChat = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
  </svg>
);
const IconBolt = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
  </svg>
);
const IconLink = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
  </svg>
);
const IconChart = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
  </svg>
);
const IconSend = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
  </svg>
);
const IconLock = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
  </svg>
);
const IconUnlock = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
  </svg>
);
const IconX = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

export default function Dashboard() {
  const { data: session, status } = useSession();
  const twitterId = (session as any)?.twitterId;
  const twitterUsername = (session as any)?.twitterUsername;

  const [wallet, setWallet] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordMode, setPasswordMode] = useState<"set" | "unlock" | "import" | null>(null);
  const [backupKey, setBackupKey] = useState<string | null>(null);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [importKey, setImportKey] = useState("");
  const [bindCode, setBindCode] = useState<string | null>(null);

  const privateKeyRef = useRef<string | null>(null);

  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: string; text: string }>>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [pendingTrade, setPendingTrade] = useState<any>(null);
  const [walletPnL, setWalletPnL] = useState<any>(null);
  const [hotTokens, setHotTokens] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"chat" | "hot" | "pnl">("chat");

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, chatLoading]);

  // Load wallet
  useEffect(() => {
    if (!twitterId) return;
    const local = getLocalWallet();
    if (local) {
      setWallet(local.address);
    } else {
      syncFromServer(GATEWAY, "twitter", twitterId).then((result) => {
        if (result) setWallet(result.address);
      });
    }
    fetch(`${GATEWAY}/stats`).then(r => r.json()).then(setStats).catch(() => {});
    // Fetch hot tokens
    fetch(`${GATEWAY}/signals/hot-tokens`).then(r => r.json()).then(d => {
      if (d.signals) setHotTokens(d.signals.slice(0, 10));
    }).catch(() => {});
  }, [twitterId]);

  // Fetch wallet PnL when wallet is available
  useEffect(() => {
    if (!wallet) return;
    fetch(`${GATEWAY}/signals/wallet-pnl?wallet=${wallet}`).then(r => r.json()).then(setWalletPnL).catch(() => {});
  }, [wallet]);

  const handleCreateWallet = () => {
    const { address, privateKey } = createLocalWallet();
    setWallet(address);
    setBackupKey(privateKey);
    privateKeyRef.current = privateKey;
    setPasswordMode("set");
  };

  const handleSetPassword = async () => {
    if (password.length < 6) { alert("Password must be at least 6 characters"); return; }
    if (!privateKeyRef.current || !wallet) return;
    const saved = await saveWallet(wallet, privateKeyRef.current, password);
    if (saved) {
      await syncToServer(GATEWAY, "twitter", twitterId);
      setPasswordMode(null);
      setPassword("");
      setUnlocked(true);
    } else {
      alert("Failed to save wallet");
    }
  };

  const handleUnlock = async () => {
    if (password.length < 6) { alert("Password must be at least 6 characters"); return; }
    const result = await unlockLocalWallet(password);
    if (result) {
      privateKeyRef.current = result.privateKey;
      setUnlocked(true);
      setPasswordMode(null);
      setPassword("");
    } else {
      alert("Wrong password");
    }
  };

  const handleLock = () => {
    privateKeyRef.current = null;
    setUnlocked(false);
  };

  const handleImport = async () => {
    if (password.length < 6) { alert("Password must be at least 6 characters"); return; }
    if (!importKey.startsWith("0x")) { alert("Private key must start with 0x"); return; }
    const result = await importWallet(importKey, password);
    if (result) {
      await syncToServer(GATEWAY, "twitter", twitterId);
      setWallet(result.address);
      privateKeyRef.current = importKey;
      setUnlocked(true);
      setPasswordMode(null);
      setPassword("");
      setImportKey("");
    } else {
      alert("Invalid private key");
    }
  };

  const handleBindTelegram = async () => {
    const resp = await fetch(`${GATEWAY}/bind/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "twitter", user_id: twitterId }),
    });
    const data = await resp.json();
    setBindCode(data.code || null);
  };

  const executeTradeLocally = async (tradeParams: any) => {
    if (!privateKeyRef.current || !wallet) {
      setChatHistory(h => [...h, { role: "agent", text: "Wallet locked. Please unlock first." }]);
      return;
    }
    setChatLoading(true);
    try {
      const buildResp = await fetch(`${GATEWAY}/trade/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...tradeParams, wallet_address: wallet }),
      });
      const buildResult = await buildResp.json();
      if (!buildResult.success || !buildResult.tx) {
        setChatHistory(h => [...h, { role: "agent", text: `Trade failed: ${buildResult.error}` }]);
        return;
      }
      const txHash = await signTransaction(privateKeyRef.current, buildResult.tx);
      setChatHistory(h => [...h, {
        role: "agent",
        text: `Trade executed!\n\nTX: ${txHash}\nWallet: ${wallet}\n\nhttps://www.okx.com/web3/explorer/xlayer/tx/${txHash}`,
      }]);
    } catch (e: any) {
      setChatHistory(h => [...h, { role: "agent", text: `Trade error: ${e.message}` }]);
    } finally {
      setChatLoading(false);
      setPendingTrade(null);
    }
  };

  const handleChat = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatHistory(h => [...h, { role: "user", text: msg }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const resp = await fetch(`${GATEWAY}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, platform: "twitter", user_id: twitterId }),
      });
      const data = await resp.json();
      const tradeResult = data.results?.find((r: any) => r.data?.needs_confirmation);
      if (tradeResult) {
        if (unlocked && privateKeyRef.current) {
          setChatHistory(h => [...h, { role: "agent", text: `Executing: ${tradeResult.data.summary}...` }]);
          await executeTradeLocally(tradeResult.data.trade_params);
        } else {
          setPendingTrade(tradeResult.data.trade_params);
          setChatHistory(h => [...h, {
            role: "agent",
            text: `${tradeResult.data.summary}\n\nWallet is locked. Please unlock to execute this trade.`,
          }]);
        }
        return;
      }
      setChatHistory(h => [...h, { role: "agent", text: data.reply || data.error || "No response" }]);
    } catch (e: any) {
      setChatHistory(h => [...h, { role: "agent", text: `Error: ${e.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  // ── Loading ──
  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-nexus-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-nexus-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-nexus-muted text-sm">Loading...</span>
        </div>
      </main>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // ██  LOGIN / LANDING PAGE
  // ══════════════════════════════════════════════════════════════
  if (!session) {
    return (
      <main className="min-h-screen bg-nexus-bg relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-nexus-accent/5 rounded-full blur-[120px] pointer-events-none" />

        {/* Nav */}
        <nav className="relative z-10 flex items-center justify-between max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-nexus-accent flex items-center justify-center">
              <span className="text-white font-bold text-sm">AN</span>
            </div>
            <span className="text-white font-semibold text-lg tracking-tight">AgentNexus</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="https://github.com/user/agent-nexus" target="_blank" rel="noopener" className="text-nexus-muted hover:text-white text-sm transition-colors">Docs</a>
            <button onClick={() => signIn("twitter")} className="text-sm bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-lg border border-white/10 transition-all">
              Sign In
            </button>
          </div>
        </nav>

        {/* Hero */}
        <div className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-20">
          <div className="text-center max-w-3xl mx-auto animate-fade-in">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-nexus-accent/10 border border-nexus-accent/20 text-nexus-accent-light text-xs font-medium mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-nexus-green animate-pulse" />
              Built on X Layer · OKX Hackathon
            </div>

            <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-white leading-[1.1] tracking-tight mb-6">
              Trade with AI.
              <br />
              <span className="text-gradient">Your keys, your rules.</span>
            </h1>

            <p className="text-lg md:text-xl text-nexus-muted max-w-2xl mx-auto mb-10 leading-relaxed">
              Natural language trading on X Layer. Your private key never leaves your browser.
              Chat, analyze, and swap — powered by AI agents.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button onClick={() => signIn("twitter")} className="btn-primary inline-flex items-center justify-center gap-2.5 text-base px-8 py-4">
                <IconX />
                Login with X
              </button>
              <a href="https://github.com/user/agent-nexus" target="_blank" rel="noopener" className="btn-secondary inline-flex items-center justify-center gap-2 text-base px-8 py-4">
                Read Docs
              </a>
            </div>
          </div>

          {/* Terminal Preview */}
          <div className="max-w-2xl mx-auto mt-16 animate-slide-up">
            <div className="rounded-2xl overflow-hidden border border-nexus-border bg-nexus-card shadow-2xl shadow-nexus-accent/5">
              <div className="flex items-center gap-2 px-4 py-3 bg-nexus-bg/80 border-b border-nexus-border">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-nexus-red/70" />
                  <div className="w-3 h-3 rounded-full bg-nexus-yellow/70" />
                  <div className="w-3 h-3 rounded-full bg-nexus-green/70" />
                </div>
                <span className="text-xs text-nexus-muted ml-2 font-mono">AgentNexus Terminal</span>
              </div>
              <div className="p-5 font-mono text-sm space-y-3">
                <div className="flex gap-2">
                  <span className="text-nexus-green">you</span>
                  <span className="text-gray-300">帮我换 1 OKB 到 USDT</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-nexus-accent-light">agent</span>
                  <span className="text-gray-400">Analyzing OKB/USDT pair on X Layer DEX...</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-nexus-accent-light">agent</span>
                  <span className="text-gray-400">Best route: OKB → USDT via OKXSwap</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-nexus-accent-light">agent</span>
                  <span className="text-gray-400">Price: 1 OKB = $52.38 · Slippage: 0.3%</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-nexus-green">✓</span>
                  <span className="text-nexus-green">Trade executed · TX: 0xa3f1...8c2d</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="relative z-10 max-w-6xl mx-auto px-6 pb-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                icon: <IconShield />,
                title: "Client-Side Keys",
                desc: "Private keys are encrypted with AES-256-GCM in your browser. Our servers never see them.",
              },
              {
                icon: <IconBolt />,
                title: "Natural Language Trading",
                desc: "Say \"swap 1 OKB to USDT\" and the AI agent handles routing, pricing, and execution.",
              },
              {
                icon: <IconLink />,
                title: "Multi-Platform",
                desc: "One wallet across Dashboard, Telegram bot, and Twitter. Bind once, trade anywhere.",
              },
            ].map((f, i) => (
              <div key={i} className="card group cursor-default" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="w-10 h-10 rounded-xl bg-nexus-accent/10 flex items-center justify-center text-nexus-accent-light mb-4 group-hover:bg-nexus-accent/20 transition-colors">
                  {f.icon}
                </div>
                <h3 className="text-white font-semibold text-base mb-2">{f.title}</h3>
                <p className="text-nexus-muted text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div className="relative z-10 max-w-6xl mx-auto px-6 pb-20">
          <h2 className="text-2xl font-bold text-white text-center mb-10">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { step: "01", title: "Login", desc: "Sign in with your X account. One click, no signup forms." },
              { step: "02", title: "Create Wallet", desc: "Generate an X Layer wallet in your browser. Set a trading password to encrypt it." },
              { step: "03", title: "Chat & Trade", desc: "Tell the AI what you want. It analyzes, routes, and executes — you just confirm." },
            ].map((s, i) => (
              <div key={i} className="flex gap-4 items-start">
                <div className="text-3xl font-extrabold text-nexus-accent/30 shrink-0">{s.step}</div>
                <div>
                  <h3 className="text-white font-semibold mb-1">{s.title}</h3>
                  <p className="text-nexus-muted text-sm leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="relative z-10 border-t border-nexus-border py-8">
          <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-nexus-muted text-sm">
              <div className="w-6 h-6 rounded bg-nexus-accent/80 flex items-center justify-center">
                <span className="text-white font-bold text-[10px]">AN</span>
              </div>
              AgentNexus · X Layer AI Agent Hackathon
            </div>
            <div className="flex items-center gap-4 text-xs text-nexus-muted">
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-nexus-green" /> X Layer (196)</span>
              <span>OKB Native</span>
            </div>
          </div>
        </footer>
      </main>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // ██  PRODUCT DASHBOARD (Logged In)
  // ══════════════════════════════════════════════════════════════
  return (
    <main className="min-h-screen bg-nexus-bg">
      {/* ── Private Key Backup Modal ── */}
      {backupKey && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="card max-w-lg w-full border-nexus-yellow/20 animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-nexus-yellow/10 flex items-center justify-center text-nexus-yellow">
                <IconShield />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Save Your Private Key</h2>
                <p className="text-xs text-nexus-muted">This is the only time it will be shown</p>
              </div>
            </div>

            <p className="text-sm text-gray-400 mb-4">
              Your key is stored <strong className="text-white">encrypted in this browser only</strong> — our servers never see it.
              Save it to import into OKX Wallet, MetaMask, or another device.
            </p>

            <div className="bg-nexus-bg p-4 rounded-xl font-mono text-sm text-nexus-accent-light break-all mb-4 select-all border border-nexus-border">
              {backupKey}
            </div>

            <label className="flex items-center gap-2.5 text-sm text-gray-300 mb-5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={backupConfirmed}
                onChange={e => setBackupConfirmed(e.target.checked)}
                className="w-4 h-4 rounded border-nexus-border bg-nexus-bg text-nexus-accent focus:ring-nexus-accent/50"
              />
              I have saved my private key in a safe place
            </label>

            <button
              onClick={() => { setBackupKey(null); setBackupConfirmed(false); }}
              disabled={!backupConfirmed}
              className="btn-primary w-full disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="border-b border-nexus-border bg-nexus-card/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-nexus-accent flex items-center justify-center">
              <span className="text-white font-bold text-xs">AN</span>
            </div>
            <span className="text-white font-semibold tracking-tight">AgentNexus</span>
            <span className="text-nexus-muted text-xs hidden sm:block ml-1">X Layer</span>
          </div>
          <div className="flex items-center gap-4">
            {wallet && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs">
                {unlocked ? (
                  <span className="flex items-center gap-1 text-nexus-green"><span className="w-1.5 h-1.5 rounded-full bg-nexus-green" /> Unlocked</span>
                ) : (
                  <span className="flex items-center gap-1 text-nexus-muted"><IconLock /> Locked</span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <div className="w-6 h-6 rounded-full bg-nexus-accent/20 flex items-center justify-center text-nexus-accent-light text-xs">
                @
              </div>
              <span className="hidden sm:block">{twitterUsername}</span>
            </div>
            <button onClick={() => signOut()} className="btn-ghost text-xs">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
        {/* ── Top Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Wallet Card */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-nexus-accent/10 flex items-center justify-center text-nexus-accent-light">
                <IconWallet />
              </div>
              <h2 className="text-white font-semibold">Wallet</h2>
            </div>

            {!wallet ? (
              <div className="space-y-2.5">
                <button onClick={handleCreateWallet} className="btn-primary w-full text-sm py-2.5">
                  Create Wallet
                </button>
                <button onClick={() => setPasswordMode("import")} className="btn-secondary w-full text-sm py-2.5">
                  Import Private Key
                </button>

                {passwordMode === "import" && (
                  <div className="pt-2 space-y-2">
                    <input type="password" value={importKey} onChange={e => setImportKey(e.target.value)}
                      className="input" placeholder="Private key (0x...)" />
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      className="input" placeholder="Set trading password" onKeyDown={e => e.key === "Enter" && handleImport()} />
                    <button onClick={handleImport} className="btn-primary w-full text-sm py-2.5">Import & Encrypt</button>
                    <button onClick={() => { setPasswordMode(null); setImportKey(""); setPassword(""); }}
                      className="btn-ghost w-full text-xs py-1">Cancel</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] text-nexus-muted uppercase tracking-wider mb-1">X Layer Address</div>
                  <div className="text-xs font-mono text-nexus-accent-light bg-nexus-bg p-2.5 rounded-lg break-all border border-nexus-border">
                    {wallet}
                  </div>
                </div>

                {passwordMode === "set" ? (
                  <div className="space-y-2">
                    <div className="text-xs text-nexus-yellow">Set trading password (min 6 chars):</div>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      className="input" placeholder="Trading password" onKeyDown={e => e.key === "Enter" && handleSetPassword()} />
                    <button onClick={handleSetPassword} className="btn-primary w-full text-sm py-2.5">Set Password</button>
                  </div>
                ) : passwordMode === "unlock" ? (
                  <div className="space-y-2">
                    <div className="text-xs text-nexus-muted">Enter password to unlock:</div>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      className="input" placeholder="Trading password" onKeyDown={e => e.key === "Enter" && handleUnlock()} />
                    <div className="flex gap-2">
                      <button onClick={handleUnlock} className="btn-primary flex-1 text-sm py-2.5">Unlock</button>
                      <button onClick={() => { setPasswordMode(null); setPassword(""); }} className="btn-secondary text-sm py-2.5 px-4">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    {unlocked ? (
                      <>
                        <span className="flex items-center gap-1.5 text-xs text-nexus-green">
                          <IconUnlock />
                          Unlocked (local)
                        </span>
                        <button onClick={handleLock} className="btn-ghost text-xs flex items-center gap-1">
                          <IconLock /> Lock
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setPasswordMode("unlock")} className="btn-secondary w-full text-sm py-2.5 flex items-center justify-center gap-2">
                        <IconUnlock />
                        Unlock Wallet
                      </button>
                    )}
                  </div>
                )}

                <div className="text-[10px] text-nexus-muted flex items-center gap-1">
                  <IconShield /> Key encrypted in browser · server never sees it
                </div>
              </div>
            )}
          </div>

          {/* Telegram Card */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                <IconLink />
              </div>
              <h2 className="text-white font-semibold">Telegram</h2>
            </div>
            <p className="text-sm text-nexus-muted mb-4">Link your Telegram to trade via @AgentNexusBot.</p>

            {bindCode ? (
              <div className="space-y-3">
                <div className="text-xs text-nexus-muted">Send this to the bot:</div>
                <div className="font-mono text-nexus-accent-light bg-nexus-bg p-3 rounded-xl text-center text-lg border border-nexus-accent/20">
                  /verify {bindCode}
                </div>
                <div className="text-[10px] text-nexus-muted text-center">Expires in 5 minutes</div>
              </div>
            ) : (
              <button onClick={handleBindTelegram} className="btn-secondary w-full text-sm py-2.5">
                Generate Bind Code
              </button>
            )}
          </div>

          {/* Stats Card */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-nexus-green/10 flex items-center justify-center text-nexus-green">
                <IconChart />
              </div>
              <h2 className="text-white font-semibold">Platform</h2>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="stat-label">Total Calls</span>
                <span className="text-white font-semibold">{stats?.total_calls || 0}</span>
              </div>
              <div className="divider !my-2" />
              <div className="flex justify-between items-center">
                <span className="stat-label">Revenue</span>
                <span className="text-nexus-green font-semibold">${stats?.total_revenue_usd || "0"}</span>
              </div>
              <div className="divider !my-2" />
              <div className="flex justify-between items-center">
                <span className="stat-label">Network</span>
                <span className="price-tag">X Layer (196)</span>
              </div>
              <div className="divider !my-2" />
              <div className="flex justify-between items-center">
                <span className="stat-label">Security</span>
                <span className="flex items-center gap-1 text-nexus-green text-xs"><IconShield /> Client-side</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tab Navigation ── */}
        <div className="flex gap-1 bg-nexus-card rounded-xl p-1 border border-nexus-border">
          {([
            { id: "chat" as const, label: "Chat", icon: <IconChat /> },
            { id: "hot" as const, label: "Hot Tokens", icon: <IconBolt /> },
            { id: "pnl" as const, label: "PnL", icon: <IconChart /> },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-nexus-accent text-white shadow-md"
                  : "text-nexus-muted hover:text-white"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* ── Hot Tokens Panel ── */}
        {activeTab === "hot" && (
          <div className="card !p-0 overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-nexus-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
                  <IconBolt />
                </div>
                <div>
                  <h2 className="text-white font-semibold text-sm">Hot Tokens</h2>
                  <p className="text-[10px] text-nexus-muted">Ranked by trending score & X mentions</p>
                </div>
              </div>
              <button
                onClick={() => fetch(`${GATEWAY}/signals/hot-tokens`).then(r => r.json()).then(d => { if (d.signals) setHotTokens(d.signals.slice(0, 10)); })}
                className="btn-ghost text-xs"
              >Refresh</button>
            </div>
            <div className="divide-y divide-nexus-border">
              {hotTokens.length === 0 ? (
                <div className="p-8 text-center text-nexus-muted text-sm">No hot tokens data</div>
              ) : (
                hotTokens.map((t: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-nexus-card-hover transition-colors">
                    <span className="text-nexus-muted text-xs w-5 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium text-sm truncate">{t.token?.symbol || "?"}</span>
                        {t.details?.name && <span className="text-nexus-muted text-xs truncate">{t.details.name}</span>}
                      </div>
                      <div className="flex gap-3 mt-0.5">
                        {t.details?.market_cap && <span className="text-[10px] text-nexus-muted">MCap: ${Number(t.details.market_cap).toLocaleString()}</span>}
                        {t.details?.volume_24h && <span className="text-[10px] text-nexus-muted">Vol: ${Number(t.details.volume_24h).toLocaleString()}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      {t.details?.change_24h && (
                        <span className={`text-xs font-medium ${parseFloat(t.details.change_24h) >= 0 ? "text-nexus-green" : "text-nexus-red"}`}>
                          {parseFloat(t.details.change_24h) >= 0 ? "+" : ""}{parseFloat(t.details.change_24h).toFixed(1)}%
                        </span>
                      )}
                      {t.details?.hot_score && <div className="text-[10px] text-nexus-muted">Score: {t.details.hot_score}</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── PnL Panel ── */}
        {activeTab === "pnl" && (
          <div className="card !p-0 overflow-hidden animate-fade-in">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-nexus-border">
              <div className="w-8 h-8 rounded-lg bg-nexus-green/10 flex items-center justify-center text-nexus-green">
                <IconChart />
              </div>
              <div>
                <h2 className="text-white font-semibold text-sm">Wallet PnL</h2>
                <p className="text-[10px] text-nexus-muted">{wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "No wallet"}</p>
              </div>
            </div>
            {!wallet ? (
              <div className="p-8 text-center text-nexus-muted text-sm">Create or import a wallet to see PnL</div>
            ) : !walletPnL ? (
              <div className="p-8 text-center text-nexus-muted text-sm">Loading PnL data...</div>
            ) : (
              <div className="p-5 space-y-5">
                {/* Overview Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Total PnL", value: `$${walletPnL.overview?.total_pnl_usd || "0"}`, color: parseFloat(walletPnL.overview?.total_pnl_usd || "0") >= 0 ? "text-nexus-green" : "text-nexus-red" },
                    { label: "Unrealized", value: `$${walletPnL.overview?.unrealized_pnl_usd || "0"}`, color: "text-nexus-accent-light" },
                    { label: "Win Rate", value: `${walletPnL.overview?.win_rate || "0"}%`, color: "text-white" },
                    { label: "Total Trades", value: walletPnL.overview?.total_trades || "0", color: "text-white" },
                  ].map((s, i) => (
                    <div key={i} className="bg-nexus-bg rounded-xl p-3 border border-nexus-border">
                      <div className="stat-label">{s.label}</div>
                      <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Recent Token PnL */}
                {walletPnL.recent_pnl?.length > 0 && (
                  <div>
                    <h3 className="text-xs text-nexus-muted uppercase tracking-wider mb-2">Recent Token PnL</h3>
                    <div className="space-y-1">
                      {walletPnL.recent_pnl.map((p: any, i: number) => (
                        <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-nexus-bg transition-colors">
                          <span className="text-sm text-white">{p.token}</span>
                          <div className="flex items-center gap-3">
                            <span className={`text-sm font-medium ${parseFloat(p.pnl_usd) >= 0 ? "text-nexus-green" : "text-nexus-red"}`}>
                              {parseFloat(p.pnl_usd) >= 0 ? "+" : ""}${p.pnl_usd}
                            </span>
                            <span className={`text-xs ${parseFloat(p.roi_pct) >= 0 ? "text-nexus-green" : "text-nexus-red"}`}>
                              {parseFloat(p.roi_pct) >= 0 ? "+" : ""}{p.roi_pct}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Trades */}
                {walletPnL.recent_trades?.length > 0 && (
                  <div>
                    <h3 className="text-xs text-nexus-muted uppercase tracking-wider mb-2">Recent Trades</h3>
                    <div className="space-y-1">
                      {walletPnL.recent_trades.map((tx: any, i: number) => (
                        <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-nexus-bg transition-colors text-sm">
                          <div className="flex items-center gap-2">
                            <span className="price-tag">{tx.type}</span>
                            <span className="text-white">{tx.token_in} → {tx.token_out}</span>
                          </div>
                          <span className="text-nexus-muted">${tx.amount_usd}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Pending Trade Alert ── */}
        {pendingTrade && unlocked && (
          <div className="card border-nexus-yellow/30 bg-nexus-yellow/5 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconBolt />
                <span className="text-sm text-nexus-yellow font-medium">Pending trade ready to execute</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => executeTradeLocally(pendingTrade)}
                  className="btn-primary text-sm py-1.5 px-5">Execute</button>
                <button onClick={() => setPendingTrade(null)}
                  className="btn-ghost text-sm">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Chat ── */}
        {activeTab === "chat" && <div className="card !p-0 overflow-hidden animate-fade-in">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-nexus-border">
            <div className="w-8 h-8 rounded-lg bg-nexus-accent/10 flex items-center justify-center text-nexus-accent-light">
              <IconChat />
            </div>
            <div>
              <h2 className="text-white font-semibold text-sm">Chat with AgentNexus</h2>
              <p className="text-[10px] text-nexus-muted">Natural language trading · Chinese & English</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-[10px]">
              {unlocked ? (
                <span className="flex items-center gap-1 text-nexus-green"><span className="w-1.5 h-1.5 rounded-full bg-nexus-green" />Ready to trade</span>
              ) : (
                <span className="flex items-center gap-1 text-nexus-muted"><IconLock />Wallet locked</span>
              )}
            </div>
          </div>

          <div className="h-[420px] overflow-y-auto p-5 space-y-4 bg-nexus-bg/50">
            {chatHistory.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-6">
                <div className="w-14 h-14 rounded-2xl bg-nexus-accent/10 flex items-center justify-center text-nexus-accent-light">
                  <IconChat />
                </div>
                <div className="text-center">
                  <p className="text-nexus-muted text-sm mb-4">Ask anything about crypto markets or execute trades</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {["分析下ETH", "what's trending?", "帮我换1 OKB到USDT", "查看我的持仓"].map((cmd, i) => (
                      <button
                        key={i}
                        onClick={() => { setChatInput(cmd); }}
                        className="text-xs px-3 py-1.5 rounded-lg bg-nexus-card border border-nexus-border text-nexus-muted hover:text-white hover:border-nexus-accent/40 transition-all"
                      >
                        {cmd}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              chatHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}>
                  {msg.role === "agent" && (
                    <div className="w-6 h-6 rounded-lg bg-nexus-accent/15 flex items-center justify-center text-nexus-accent-light text-[10px] font-bold mr-2 mt-1 shrink-0">
                      AI
                    </div>
                  )}
                  <div className={msg.role === "user" ? "chat-user" : "chat-agent"}>
                    <div className="whitespace-pre-wrap">{msg.text}</div>
                  </div>
                </div>
              ))
            )}
            {chatLoading && (
              <div className="flex justify-start animate-fade-in">
                <div className="w-6 h-6 rounded-lg bg-nexus-accent/15 flex items-center justify-center text-nexus-accent-light text-[10px] font-bold mr-2 mt-1 shrink-0">
                  AI
                </div>
                <div className="chat-agent">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-nexus-accent animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-nexus-accent animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-nexus-accent animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="px-5 py-4 border-t border-nexus-border bg-nexus-card/50">
            <div className="flex gap-3">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !chatLoading && handleChat()}
                className="flex-1 input !rounded-xl"
                placeholder="Ask anything... (Chinese or English)"
                disabled={chatLoading}
              />
              <button
                onClick={handleChat}
                disabled={chatLoading || !chatInput.trim()}
                className="btn-primary !px-4 !py-3 !rounded-xl disabled:opacity-40 disabled:shadow-none disabled:transform-none"
              >
                <IconSend />
              </button>
            </div>
          </div>
        </div>}

        {/* Footer */}
        <div className="text-center text-[10px] text-nexus-muted py-4">
          AgentNexus v1.0.0 · X Layer AI Agent Hackathon ·{" "}
          <a href="https://github.com/wanggang22/agent-nexus" className="text-nexus-accent-light hover:underline">GitHub</a>
        </div>
      </div>
    </main>
  );
}
