"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  createLocalWallet, saveWallet, getLocalWallet,
  unlockLocalWallet, signTransaction, importWallet,
  syncToServer, syncFromServer,
} from "./wallet";
import {
  connectOKXWallet, disconnectOKXWallet, sendOKXTransaction,
} from "./okx-wallet";
import {
  getUSDCBalance, getUSDCAllowance, buildApproveTransaction, DEFAULT_APPROVE_AMOUNT,
} from "./usdc";

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:4000";

// ── Types ──
interface TokenChat {
  symbol: string;
  address: string;
  history: Array<{ role: string; text: string }>;
}

// ── Icons ──
const Icon = ({ d, className = "w-5 h-5" }: { d: string; className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);
const IconFire = () => <Icon d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />;
const IconChat = () => <Icon d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />;
const IconWallet = () => <Icon d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1 0-6h5.25A2.25 2.25 0 0 1 21 6v6zm0 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18V6a2.25 2.25 0 0 1 2.25-2.25h13.5" />;
const IconChart = () => <Icon d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />;
const IconPlus = () => <Icon d="M12 4.5v15m7.5-7.5h-15" />;
const IconSend = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
  </svg>
);
const IconShield = () => <Icon d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />;
const IconX = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

export default function Dashboard() {
  const { data: session, status } = useSession();
  const twitterId = (session as any)?.twitterId;
  const twitterUsername = (session as any)?.twitterUsername;

  // ── Wallet State ──
  const [wallet, setWallet] = useState<string | null>(null);
  const [walletMode, setWalletMode] = useState<"local" | "okx" | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordMode, setPasswordMode] = useState<"set" | "unlock" | "import" | null>(null);
  const [backupKey, setBackupKey] = useState<string | null>(null);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [importKey, setImportKey] = useState("");
  const privateKeyRef = useRef<string | null>(null);

  // ── USDC Approval State ──
  const [usdcBalance, setUsdcBalance] = useState<string>("0");
  const [usdcAllowance, setUsdcAllowance] = useState<string>("0");
  const [platformWallet, setPlatformWallet] = useState<string>("");
  const [approving, setApproving] = useState(false);

  // ── Navigation State ──
  const [activeView, setActiveView] = useState<string>("hot"); // "hot", "smart", "whale", "meme", "wallet", "overview", "search", or "token:SYMBOL"
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedChain, setSelectedChain] = useState("base"); // multi-chain: base has most meme activity

  // ── Market Data ──
  const [hotTokens, setHotTokens] = useState<any[]>([]);
  const [smartMoneyData, setSmartMoneyData] = useState<any[]>([]);
  const [whaleData, setWhaleData] = useState<any[]>([]);
  const [memeData, setMemeData] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // ── Token Chats (per-token conversation context) ──
  const [tokenChats, setTokenChats] = useState<Map<string, TokenChat>>(new Map());
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // ── Token Data (on-chain data for current token) ──
  const [tokenData, setTokenData] = useState<any>(null);
  const [tokenDataLoading, setTokenDataLoading] = useState(false);

  // ── Stats ──
  const [stats, setStats] = useState<any>(null);
  const [walletPnL, setWalletPnL] = useState<any>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [tokenChats, chatLoading]);

  // ── Get current token from activeView ──
  const currentTokenSymbol = activeView.startsWith("token:") ? activeView.split(":")[1] : null;
  const currentChat = currentTokenSymbol ? tokenChats.get(currentTokenSymbol) : null;

  // ── Load wallet + data ──
  useEffect(() => {
    if (!twitterId) return;
    const local = getLocalWallet();
    if (local) {
      setWallet(local.address);
      setWalletMode("local");
    } else {
      syncFromServer(GATEWAY, "twitter", twitterId).then((result) => {
        if (result) { setWallet(result.address); setWalletMode("local"); }
      });
    }
    fetch(`${GATEWAY}/stats`).then(r => r.json()).then(setStats).catch(() => {});
    fetchHotTokens();
  }, [twitterId]);

  // Fetch wallet PnL + USDC info
  useEffect(() => {
    if (!wallet) return;
    fetch(`${GATEWAY}/signals/wallet-pnl?wallet=${wallet}`).then(r => r.json()).then(setWalletPnL).catch(() => {});
    // Fetch USDC balance via multiple methods (fallback chain)
    fetch(`${GATEWAY}/payment/info`).then(r => r.json()).then(info => {
      setPlatformWallet(info.platform_wallet || "");
    }).catch(() => {});

    // Method 1: Gateway API
    fetch(`${GATEWAY}/payment/allowance/${wallet}`).then(r => r.json()).then(data => {
      if (data.balance_usdc) setUsdcBalance(data.balance_usdc);
      if (data.allowance_usdc) setUsdcAllowance(data.allowance_usdc);
      if (data.platform_wallet) setPlatformWallet(data.platform_wallet);
    }).catch(() => {
      // Method 2: OKX Wallet provider (if extension connected)
      const okx = (window as any).okxwallet;
      if (okx) {
        const usdcContract = "0x74b7f16337b8972027f6196a17a631ac6de26d22";
        // balanceOf(address) selector = 0x70a08231
        const data = "0x70a08231000000000000000000000000" + wallet.slice(2).toLowerCase();
        okx.request({
          method: "eth_call",
          params: [{ to: usdcContract, data }, "latest"],
        }).then((result: string) => {
          if (result && result !== "0x") {
            const balance = parseInt(result, 16) / 1e6;
            setUsdcBalance(balance.toFixed(2));
          }
        }).catch(() => {});
      }
    });
  }, [wallet]);

  // ── Data fetching (multi-chain) ──
  const fetchHotTokens = async (chain = selectedChain) => {
    setDataLoading(true);
    try {
      const [hotResp, trendResp] = await Promise.all([
        fetch(`${GATEWAY}/signals/hot-tokens?chain=${chain}`).then(r => r.json()).catch(() => ({ signals: [] })),
        fetch(`${GATEWAY}/signals/trending?chain=${chain}`).then(r => r.json()).catch(() => ({ signals: [] })),
      ]);
      const all = [...(hotResp.signals || []), ...(trendResp.signals || [])];
      const filtered = dedup(all).filter(t => t.token?.symbol && t.token.symbol !== "N/A");
      setHotTokens(filtered.slice(0, 30));
    } catch {} finally { setDataLoading(false); }
  };

  const fetchSmartMoney = async (chain = selectedChain) => {
    setDataLoading(true);
    try {
      const resp = await fetch(`${GATEWAY}/signals/smart-money?chain=${chain}`).then(r => r.json()).catch(() => ({ signals: [] }));
      const filtered = (resp.signals || []).filter((s: any) => s.token?.symbol && s.token.symbol !== "UNKNOWN" && s.token.symbol !== "N/A");
      setSmartMoneyData(filtered.slice(0, 30));
    } catch {} finally { setDataLoading(false); }
  };

  const fetchWhaleAlerts = async (chain = selectedChain) => {
    setDataLoading(true);
    try {
      const resp = await fetch(`${GATEWAY}/signals/whale-alert?chain=${chain}`).then(r => r.json()).catch(() => ({ signals: [] }));
      const filtered = (resp.signals || []).filter((s: any) => s.token?.symbol && s.token.symbol !== "N/A");
      setWhaleData(filtered.slice(0, 30));
    } catch {} finally { setDataLoading(false); }
  };

  const fetchMemeScanner = async (chain = selectedChain) => {
    setDataLoading(true);
    try {
      const resp = await fetch(`${GATEWAY}/signals/meme-scan?chain=${chain}`).then(r => r.json()).catch(() => ({ signals: [] }));
      const filtered = (resp.signals || []).filter((s: any) => s.token?.symbol && s.token.symbol !== "N/A");
      setMemeData(filtered.slice(0, 30));
    } catch {} finally { setDataLoading(false); }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setDataLoading(true);
    try {
      // Use chat endpoint to search for token
      const resp = await fetch(`${GATEWAY}/signals/trending?chain=${selectedChain}`).then(r => r.json()).catch(() => ({ signals: [] }));
      const all = (resp.signals || []).filter((s: any) =>
        (s.token?.symbol || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.details?.name || "").toLowerCase().includes(searchQuery.toLowerCase())
      );
      setSearchResults(all);
    } catch {} finally { setDataLoading(false); }
  };

  function dedup(tokens: any[]): any[] {
    const seen = new Set<string>();
    return tokens.filter(t => {
      const key = t.token?.symbol || t.token?.address;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Refetch when chain changes
  useEffect(() => {
    if (!isLoggedIn) return;
    if (activeView === "hot") fetchHotTokens(selectedChain);
    else if (activeView === "smart") fetchSmartMoney(selectedChain);
    else if (activeView === "whale") fetchWhaleAlerts(selectedChain);
    else if (activeView === "meme") fetchMemeScanner(selectedChain);
  }, [selectedChain]);

  // ── Fetch token on-chain data ──
  const fetchTokenData = useCallback(async (symbol: string, address?: string) => {
    setTokenDataLoading(true);
    try {
      const tokenId = address || symbol;
      const [basic, risk] = await Promise.all([
        fetch(`${GATEWAY}/basic/full/${tokenId}`).then(r => r.json()).catch(() => null),
        fetch(`${GATEWAY}/risk/token-safety/${tokenId}`).then(r => r.json()).catch(() => null),
      ]);
      setTokenData({ basic, risk, symbol, address: tokenId });
    } catch {
      setTokenData(null);
    } finally {
      setTokenDataLoading(false);
    }
  }, []);

  // Load token data when switching to a token view
  useEffect(() => {
    if (!currentTokenSymbol) return;
    const chat = tokenChats.get(currentTokenSymbol);
    if (chat?.address) {
      fetchTokenData(currentTokenSymbol, chat.address);
    }
  }, [currentTokenSymbol, fetchTokenData, tokenChats]);

  // ── Open token chat ──
  const openTokenChat = (symbol: string, address: string) => {
    if (!tokenChats.has(symbol)) {
      setTokenChats(prev => {
        const next = new Map(prev);
        next.set(symbol, { symbol, address, history: [] });
        return next;
      });
    }
    setActiveView(`token:${symbol}`);
  };

  // ── Chat with AI about specific token ──
  const handleTokenChat = async () => {
    if (!chatInput.trim() || !currentTokenSymbol || !currentChat) return;
    const msg = chatInput.trim();

    // Add user message
    setTokenChats(prev => {
      const next = new Map(prev);
      const chat = { ...next.get(currentTokenSymbol)! };
      chat.history = [...chat.history, { role: "user", text: msg }];
      next.set(currentTokenSymbol, chat);
      return next;
    });
    setChatInput("");
    setChatLoading(true);

    try {
      // Prepend token context to the message
      const contextMsg = `[Context: User is analyzing ${currentTokenSymbol} (${currentChat.address}) on X Layer] ${msg}`;
      const resp = await fetch(`${GATEWAY}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: contextMsg, platform: walletMode === "okx" ? "api" : "twitter", user_id: userId }),
      });
      const data = await resp.json();

      // Check for trade
      const tradeResult = data.results?.find((r: any) => r.data?.needs_confirmation);
      const replyText = tradeResult
        ? `${tradeResult.data.summary}\n\n${unlocked ? "Wallet unlocked — ready to execute." : "Unlock wallet to execute."}`
        : (data.reply || data.error || "No response");

      setTokenChats(prev => {
        const next = new Map(prev);
        const chat = { ...next.get(currentTokenSymbol)! };
        chat.history = [...chat.history, { role: "agent", text: replyText }];
        next.set(currentTokenSymbol, chat);
        return next;
      });
    } catch (e: any) {
      setTokenChats(prev => {
        const next = new Map(prev);
        const chat = { ...next.get(currentTokenSymbol)! };
        chat.history = [...chat.history, { role: "agent", text: `Error: ${e.message}` }];
        next.set(currentTokenSymbol, chat);
        return next;
      });
    } finally {
      setChatLoading(false);
    }
  };

  // ── USDC Approve ──
  const handleApproveUSDC = async () => {
    if (!wallet || !platformWallet) return;
    setApproving(true);
    try {
      const tx = buildApproveTransaction(platformWallet, DEFAULT_APPROVE_AMOUNT);
      if (walletMode === "okx") {
        await sendOKXTransaction(tx);
      } else if (privateKeyRef.current) {
        await signTransaction(privateKeyRef.current, tx);
      } else {
        alert("Unlock wallet first");
        setApproving(false);
        return;
      }
      // Refresh allowance
      const newAllowance = await getUSDCAllowance(wallet, platformWallet);
      setUsdcAllowance(newAllowance);
    } catch (e: any) {
      alert(`Approve failed: ${e.message}`);
    } finally {
      setApproving(false);
    }
  };

  // ── Wallet handlers ──
  const handleConnectOKX = async () => {
    const result = await connectOKXWallet();
    if (result) { setWallet(result.address); setWalletMode("okx"); setUnlocked(true); }
  };
  const handleCreateWallet = () => {
    const { address, privateKey } = createLocalWallet();
    setWallet(address); setWalletMode("local"); setBackupKey(privateKey);
    privateKeyRef.current = privateKey; setPasswordMode("set");
  };
  const handleSetPassword = async () => {
    if (password.length < 6) { alert("Min 6 chars"); return; }
    if (!privateKeyRef.current || !wallet) return;
    const saved = await saveWallet(wallet, privateKeyRef.current, password);
    if (saved) {
      await syncToServer(GATEWAY, "twitter", twitterId);
      setPasswordMode(null); setPassword(""); setUnlocked(true);
    }
  };
  const handleUnlock = async () => {
    if (password.length < 6) { alert("Min 6 chars"); return; }
    const result = await unlockLocalWallet(password);
    if (result) {
      privateKeyRef.current = result.privateKey;
      setUnlocked(true); setPasswordMode(null); setPassword("");
    } else { alert("Wrong password"); }
  };
  const handleLock = () => { privateKeyRef.current = null; setUnlocked(false); };
  const handleImport = async () => {
    if (password.length < 6 || !importKey.startsWith("0x")) { alert("Invalid input"); return; }
    const result = await importWallet(importKey, password);
    if (result) {
      await syncToServer(GATEWAY, "twitter", twitterId);
      setWallet(result.address); setWalletMode("local"); privateKeyRef.current = importKey;
      setUnlocked(true); setPasswordMode(null); setPassword(""); setImportKey("");
    }
  };

  const [connectingOKX, setConnectingOKX] = useState(false);

  // ── Determine if user is "logged in" (Twitter OR OKX Wallet) ──
  const isLoggedIn = !!session || !!wallet;
  const userId = twitterId || (wallet ? `wallet_${wallet.slice(0, 8)}` : null);
  const displayName = twitterUsername || (wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : null);

  // OKX Wallet login from landing page (no Twitter needed)
  const handleOKXLogin = async () => {
    setConnectingOKX(true);
    try {
      const result = await connectOKXWallet();
      if (result) {
        setWallet(result.address);
        setWalletMode("okx");
        setUnlocked(true);
        fetch(`${GATEWAY}/stats`).then(r => r.json()).then(setStats).catch(() => {});
        fetchHotTokens();
        fetch(`${GATEWAY}/signals/wallet-pnl?wallet=${result.address}`).then(r => r.json()).then(setWalletPnL).catch(() => {});
      }
    } finally {
      setConnectingOKX(false);
    }
  };

  // ── Loading ──
  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-nexus-bg">
        <div className="w-8 h-8 border-2 border-nexus-accent border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // ██  LOGIN PAGE
  // ══════════════════════════════════════════════════════════════
  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-nexus-bg relative overflow-hidden">
        <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-nexus-accent/5 rounded-full blur-[120px] pointer-events-none" />

        <nav className="relative z-10 flex items-center justify-between max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-nexus-accent flex items-center justify-center">
              <span className="text-white font-bold text-sm">AN</span>
            </div>
            <span className="text-white font-semibold text-lg tracking-tight">AgentNexus</span>
          </div>
          <button onClick={() => signIn("twitter")} className="text-sm bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-lg border border-white/10 transition-all">
            Sign In
          </button>
        </nav>

        <div className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-20">
          <div className="text-center max-w-3xl mx-auto animate-fade-in">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-nexus-accent/10 border border-nexus-accent/20 text-nexus-accent-light text-xs font-medium mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-nexus-green animate-pulse" />
              OnchainOS + Claude AI · X Layer
            </div>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-white leading-[1.1] tracking-tight mb-6">
              AI-Powered
              <br />
              <span className="text-gradient">On-Chain Strategy.</span>
            </h1>
            <p className="text-lg md:text-xl text-nexus-muted max-w-2xl mx-auto mb-10 leading-relaxed">
              Real-time on-chain data meets AI analysis. Build trading strategies per token,
              track smart money, and execute — all with natural language.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={handleOKXLogin} disabled={connectingOKX} className="btn-primary inline-flex items-center justify-center gap-2.5 text-base px-8 py-4 disabled:opacity-60">
                {connectingOKX ? (
                  <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Connecting...</>
                ) : (
                  <><span className="w-6 h-6 rounded bg-white/20 flex items-center justify-center text-xs font-bold">OKX</span> Connect OKX Wallet</>
                )}
              </button>
              <button onClick={() => signIn("twitter")} className="btn-secondary inline-flex items-center justify-center gap-2.5 text-base px-8 py-4">
                <IconX /> Login with X
              </button>
            </div>
            <p className="text-xs text-nexus-muted mt-3">OKX Wallet: 0 Gas USDC transfers + x402 payments</p>
          </div>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-16 max-w-4xl mx-auto">
            {[
              { icon: <IconFire />, title: "Hot Meme Feed", desc: "Real-time trending tokens, smart money signals, and meme scanner powered by OnchainOS." },
              { icon: <IconChat />, title: "Per-Token AI Chat", desc: "Each token gets its own AI context. Build analysis logic and buy/sell strategies through conversation." },
              { icon: <IconShield />, title: "Full On-Chain Intel", desc: "39 OnchainOS commands: holder analysis, whale tracking, bundle detection, PnL, and more." },
            ].map((f, i) => (
              <div key={i} className="card group cursor-default">
                <div className="w-10 h-10 rounded-xl bg-nexus-accent/10 flex items-center justify-center text-nexus-accent-light mb-4">{f.icon}</div>
                <h3 className="text-white font-semibold mb-2">{f.title}</h3>
                <p className="text-nexus-muted text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <footer className="relative z-10 border-t border-nexus-border py-6 text-center text-xs text-nexus-muted">
          AgentNexus · X Layer AI Agent Hackathon · OnchainOS + Claude AI
        </footer>
      </main>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // ██  MAIN APP (Sidebar + Content)
  // ══════════════════════════════════════════════════════════════

  const tokenChatList = Array.from(tokenChats.values());

  return (
    <div className="h-screen flex bg-nexus-bg overflow-hidden">
      {/* ── Private Key Backup Modal ── */}
      {backupKey && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="card max-w-lg w-full border-nexus-yellow/20">
            <h2 className="text-lg font-bold text-white mb-3">Save Your Private Key</h2>
            <p className="text-sm text-gray-400 mb-4">This is the only time it will be shown. Store it safely.</p>
            <div className="bg-nexus-bg p-3 rounded-xl font-mono text-sm text-nexus-accent-light break-all mb-4 select-all border border-nexus-border">{backupKey}</div>
            <label className="flex items-center gap-2 text-sm text-gray-300 mb-4 cursor-pointer select-none">
              <input type="checkbox" checked={backupConfirmed} onChange={e => setBackupConfirmed(e.target.checked)} className="rounded" />
              I have saved my private key
            </label>
            <button onClick={() => { setBackupKey(null); setBackupConfirmed(false); }}
              disabled={!backupConfirmed} className="btn-primary w-full disabled:opacity-30">Continue</button>
          </div>
        </div>
      )}

      {/* ══════════ SIDEBAR ══════════ */}
      <aside className={`${sidebarOpen ? "w-64" : "w-16"} shrink-0 bg-nexus-card border-r border-nexus-border flex flex-col transition-all duration-300 overflow-hidden`}>
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-nexus-border gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-nexus-accent flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-xs">AN</span>
          </div>
          {sidebarOpen && <span className="text-white font-semibold tracking-tight text-sm">AgentNexus</span>}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-1 px-2">
          {/* MARKET section */}
          {sidebarOpen && <div className="px-3 text-[9px] text-nexus-muted uppercase tracking-widest mb-1 mt-1">Market</div>}

          {[
            { id: "hot", icon: <IconFire />, label: "Hot Tokens", action: () => fetchHotTokens() },
            { id: "smart", icon: <Icon d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />, label: "Smart Money", action: () => fetchSmartMoney() },
            { id: "whale", icon: <Icon d="M20.893 13.393l-1.135-1.135a2.252 2.252 0 0 1-.421-.585l-1.08-2.16a.414.414 0 0 0-.663-.107.827.827 0 0 1-.812.21l-1.273-.363a.89.89 0 0 0-.738 1.595l.587.39c.59.395.674 1.23.172 1.732l-.2.2c-.212.212-.33.498-.33.796v.41c0 .409-.11.809-.32 1.158l-1.315 2.191a2.11 2.11 0 0 1-1.81 1.025 1.055 1.055 0 0 1-1.055-1.055v-1.172c0-.92-.56-1.747-1.414-2.089l-.655-.261a2.25 2.25 0 0 1-1.383-2.46l.007-.042a2.25 2.25 0 0 1 .29-.787l.082-.147a2.25 2.25 0 0 1 3.577-.459M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />, label: "Whale Alerts", action: () => fetchWhaleAlerts() },
            { id: "meme", icon: <Icon d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />, label: "Meme Scanner", action: () => fetchMemeScanner() },
            { id: "search", icon: <Icon d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />, label: "Search", action: () => {} },
          ].map(nav => (
            <button key={nav.id}
              onClick={() => { setActiveView(nav.id); nav.action(); }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${
                activeView === nav.id ? "bg-nexus-accent/15 text-nexus-accent-light" : "text-nexus-muted hover:text-white hover:bg-white/5"
              }`}
            >
              {nav.icon}
              {sidebarOpen && <span>{nav.label}</span>}
            </button>
          ))}

          {/* TOOLS section */}
          {sidebarOpen && <div className="px-3 text-[9px] text-nexus-muted uppercase tracking-widest mb-1 mt-4">Tools</div>}

          <button
            onClick={() => setActiveView("overview")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${
              activeView === "overview" ? "bg-nexus-accent/15 text-nexus-accent-light" : "text-nexus-muted hover:text-white hover:bg-white/5"
            }`}
          >
            <IconChart />
            {sidebarOpen && <span>Overview</span>}
          </button>

          <button
            onClick={() => setActiveView("wallet")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${
              activeView === "wallet" ? "bg-nexus-accent/15 text-nexus-accent-light" : "text-nexus-muted hover:text-white hover:bg-white/5"
            }`}
          >
            <IconWallet />
            {sidebarOpen && (
              <div className="flex-1 flex items-center justify-between">
                <span>Wallet</span>
                {wallet && (
                  <span className={`w-2 h-2 rounded-full ${unlocked ? "bg-nexus-green" : "bg-nexus-muted"}`} />
                )}
              </div>
            )}
          </button>

          {/* Divider + Token Chats */}
          {sidebarOpen && tokenChatList.length > 0 && (
            <>
              <div className="border-t border-nexus-border my-3" />
              <div className="px-3 text-[10px] text-nexus-muted uppercase tracking-wider mb-1">Token Chats</div>
            </>
          )}

          {tokenChatList.map(chat => (
            <button
              key={chat.symbol}
              onClick={() => setActiveView(`token:${chat.symbol}`)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${
                activeView === `token:${chat.symbol}` ? "bg-nexus-accent/15 text-nexus-accent-light" : "text-nexus-muted hover:text-white hover:bg-white/5"
              }`}
            >
              <IconChat />
              {sidebarOpen && (
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <span className="truncate">{chat.symbol}</span>
                  <span className="text-[10px] text-nexus-muted">{chat.history.length}</span>
                </div>
              )}
            </button>
          ))}
        </nav>

        {/* User */}
        <div className="border-t border-nexus-border p-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-nexus-accent/20 flex items-center justify-center text-nexus-accent-light text-xs shrink-0">
              {walletMode === "okx" ? "W" : "@"}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white truncate">{walletMode === "okx" ? displayName : `@${twitterUsername}`}</div>
                <button onClick={() => {
                  if (walletMode === "okx") { disconnectOKXWallet(); setWallet(null); setWalletMode(null); setUnlocked(false); }
                  else { signOut(); }
                }} className="text-[10px] text-nexus-muted hover:text-white">
                  {walletMode === "okx" ? "Disconnect" : "Logout"}
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ══════════ MAIN CONTENT ══════════ */}
      <main className="flex-1 overflow-hidden flex flex-col">

        {/* ── Chain Selector + Token List (shared by hot/smart/whale/meme) ── */}
        {["hot", "smart", "whale", "meme", "search"].includes(activeView) && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-6">
              {/* Header with chain selector */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-xl font-bold text-white">
                    {activeView === "hot" ? "Hot Tokens" : activeView === "smart" ? "Smart Money" : activeView === "whale" ? "Whale Alerts" : activeView === "meme" ? "Meme Scanner" : "Search"}
                  </h1>
                  <p className="text-xs text-nexus-muted mt-0.5">
                    {activeView === "hot" ? "Trending tokens by volume & mentions" : activeView === "smart" ? "What smart money wallets are buying" : activeView === "whale" ? "Large transactions (>$10k)" : activeView === "meme" ? "New meme tokens launching" : "Find any token"}
                  </p>
                </div>
                <button onClick={() => {
                  if (activeView === "hot") fetchHotTokens();
                  else if (activeView === "smart") fetchSmartMoney();
                  else if (activeView === "whale") fetchWhaleAlerts();
                  else if (activeView === "meme") fetchMemeScanner();
                }} className="btn-secondary text-xs py-2 px-4">Refresh</button>
              </div>

              {/* Chain Tabs */}
              <div className="flex gap-1 mb-4 bg-nexus-card rounded-xl p-1 border border-nexus-border w-fit">
                {[
                  { id: "base", label: "Base" },
                  { id: "ethereum", label: "ETH" },
                  { id: "solana", label: "SOL" },
                  { id: "bsc", label: "BSC" },
                  { id: "xlayer", label: "X Layer" },
                ].map(chain => (
                  <button key={chain.id}
                    onClick={() => setSelectedChain(chain.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedChain === chain.id ? "bg-nexus-accent text-white" : "text-nexus-muted hover:text-white"
                    }`}
                  >{chain.label}</button>
                ))}
              </div>

              {/* Search Bar (for search view) */}
              {activeView === "search" && (
                <div className="flex gap-2 mb-4">
                  <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSearch()}
                    className="input flex-1" placeholder="Token name, symbol, or address..." />
                  <button onClick={handleSearch} className="btn-primary text-sm px-5">Search</button>
                </div>
              )}

              {/* Loading */}
              {dataLoading && (
                <div className="text-center py-12">
                  <div className="w-8 h-8 border-2 border-nexus-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-nexus-muted text-sm">Loading {selectedChain} data...</p>
                </div>
              )}

              {/* Token Grid */}
              {!dataLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(activeView === "hot" ? hotTokens : activeView === "smart" ? smartMoneyData : activeView === "whale" ? whaleData : activeView === "meme" ? memeData : searchResults).map((t, i) => (
                    <div key={i}
                      onClick={() => openTokenChat(t.token?.symbol || "UNKNOWN", t.token?.address || "")}
                      className="card cursor-pointer hover:border-nexus-accent/40 group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] text-nexus-muted w-5 shrink-0">#{i + 1}</span>
                          <span className="text-white font-semibold truncate">{t.token?.symbol || "?"}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-nexus-border text-nexus-muted shrink-0">{t.token?.chain || selectedChain}</span>
                        </div>
                        {t.details?.change_24h && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-lg shrink-0 ${
                            parseFloat(t.details.change_24h) >= 0 ? "text-nexus-green bg-nexus-green/10" : "text-nexus-red bg-nexus-red/10"
                          }`}>
                            {parseFloat(t.details.change_24h) >= 0 ? "+" : ""}{parseFloat(t.details.change_24h).toFixed(1)}%
                          </span>
                        )}
                      </div>

                      {t.details?.name && <div className="text-xs text-nexus-muted mb-2 truncate">{t.details.name}</div>}

                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                        {t.details?.price && <div><span className="text-nexus-muted">Price </span><span className="text-white">${t.details.price}</span></div>}
                        {t.details?.market_cap && <div><span className="text-nexus-muted">MCap </span><span className="text-white">${Number(t.details.market_cap).toLocaleString()}</span></div>}
                        {t.details?.volume_24h && <div><span className="text-nexus-muted">Vol </span><span className="text-white">${Number(t.details.volume_24h).toLocaleString()}</span></div>}
                        {t.details?.wallet_count && <div><span className="text-nexus-muted">Wallets </span><span className="text-white">{t.details.wallet_count}</span></div>}
                        {t.details?.amount_usd && <div><span className="text-nexus-muted">Amount </span><span className="text-white">${Number(t.details.amount_usd).toLocaleString()}</span></div>}
                        {t.details?.holders && <div><span className="text-nexus-muted">Holders </span><span className="text-white">{t.details.holders}</span></div>}
                        {t.details?.hot_score && <div><span className="text-nexus-muted">Score </span><span className="text-nexus-accent-light">{t.details.hot_score}</span></div>}
                        {t.details?.sold_ratio_pct && <div><span className="text-nexus-muted">Sold </span><span className="text-white">{t.details.sold_ratio_pct}%</span></div>}
                      </div>

                      {/* Smart money specific */}
                      {t.type === "smart_money_buy" && t.details?.wallets && (
                        <div className="mt-2 text-[9px] text-nexus-muted truncate">
                          Wallets: {(t.details.wallets as string[]).join(", ")}
                        </div>
                      )}

                      <div className="mt-3 flex items-center gap-1 text-[10px] text-nexus-accent-light opacity-0 group-hover:opacity-100 transition-opacity">
                        <IconChat /> Analyze with AI
                      </div>
                    </div>
                  ))}

                  {/* Empty state */}
                  {(activeView === "hot" ? hotTokens : activeView === "smart" ? smartMoneyData : activeView === "whale" ? whaleData : activeView === "meme" ? memeData : searchResults).length === 0 && !dataLoading && (
                    <div className="col-span-full text-center py-16 text-nexus-muted">
                      <p className="text-sm">No data for <span className="text-white font-medium">{selectedChain}</span>. Try another chain.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TOKEN CHAT VIEW ── */}
        {currentTokenSymbol && currentChat && (
          <div className="flex-1 flex overflow-hidden">
            {/* Token Data Panel */}
            <div className="w-80 border-r border-nexus-border overflow-y-auto shrink-0 hidden lg:block">
              <div className="p-4 border-b border-nexus-border">
                <h2 className="text-lg font-bold text-white">{currentTokenSymbol}</h2>
                <p className="text-[10px] text-nexus-muted font-mono truncate">{currentChat.address}</p>
              </div>

              {tokenDataLoading ? (
                <div className="p-4 text-center text-nexus-muted text-sm">Loading on-chain data...</div>
              ) : tokenData?.basic ? (
                <div className="p-4 space-y-4">
                  {/* Technical */}
                  <div>
                    <h3 className="text-[10px] text-nexus-muted uppercase tracking-wider mb-2">Technical</h3>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-nexus-muted">Trend</span>
                        <span className={
                          tokenData.basic.technical?.trend === "bullish" ? "text-nexus-green" :
                          tokenData.basic.technical?.trend === "bearish" ? "text-nexus-red" : "text-white"
                        }>{tokenData.basic.technical?.trend || "—"}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-nexus-muted">RSI</span>
                        <span className="text-white">{tokenData.basic.technical?.rsi_14 || "—"}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-nexus-muted">Volume</span>
                        <span className="text-white">{tokenData.basic.technical?.volume_trend || "—"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Fundamental */}
                  <div>
                    <h3 className="text-[10px] text-nexus-muted uppercase tracking-wider mb-2">Fundamental</h3>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-nexus-muted">Honeypot</span>
                        <span className={tokenData.basic.fundamental?.honeypot ? "text-nexus-red" : "text-nexus-green"}>
                          {tokenData.basic.fundamental?.honeypot ? "YES" : "No"}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-nexus-muted">Holders</span>
                        <span className="text-white">{tokenData.basic.fundamental?.holder_concentration || "—"}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-nexus-muted">Liquidity</span>
                        <span className="text-white">${Number(tokenData.basic.fundamental?.liquidity_usd || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-nexus-muted">Tax</span>
                        <span className="text-white">B:{tokenData.basic.fundamental?.buy_tax || 0}% S:{tokenData.basic.fundamental?.sell_tax || 0}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Risk */}
                  {tokenData.risk && (
                    <div>
                      <h3 className="text-[10px] text-nexus-muted uppercase tracking-wider mb-2">Risk Assessment</h3>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-nexus-muted">Level</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            tokenData.risk.risk_level === "low" ? "bg-nexus-green/10 text-nexus-green" :
                            tokenData.risk.risk_level === "medium" ? "bg-nexus-yellow/10 text-nexus-yellow" :
                            "bg-nexus-red/10 text-nexus-red"
                          }`}>{tokenData.risk.risk_level || "—"}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-nexus-muted">Approved</span>
                          <span className={tokenData.risk.approved ? "text-nexus-green" : "text-nexus-red"}>
                            {tokenData.risk.approved ? "Yes" : "No"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Meme */}
                  {tokenData.basic.meme && (
                    <div>
                      <h3 className="text-[10px] text-nexus-muted uppercase tracking-wider mb-2">Meme Intel</h3>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-nexus-muted">Smart Money</span>
                          <span className="text-white">{tokenData.basic.meme.smart_money_sentiment || "—"}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-nexus-muted">KOL</span>
                          <span className="text-white text-[10px]">{tokenData.basic.meme.kol_activity || "—"}</span>
                        </div>
                        {tokenData.basic.meme.risk_factors?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {tokenData.basic.meme.risk_factors.map((r: string, i: number) => (
                              <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-nexus-red/10 text-nexus-red">{r}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Recommendation */}
                  {tokenData.basic.recommendation && (
                    <div className={`p-3 rounded-xl border ${
                      tokenData.basic.recommendation === "BUY" ? "border-nexus-green/30 bg-nexus-green/5" :
                      tokenData.basic.recommendation === "SELL" ? "border-nexus-red/30 bg-nexus-red/5" :
                      tokenData.basic.recommendation === "AVOID" ? "border-nexus-red/30 bg-nexus-red/5" :
                      "border-nexus-border"
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-nexus-muted">Signal</span>
                        <span className={`text-sm font-bold ${
                          tokenData.basic.recommendation === "BUY" ? "text-nexus-green" :
                          tokenData.basic.recommendation === "SELL" || tokenData.basic.recommendation === "AVOID" ? "text-nexus-red" :
                          "text-white"
                        }`}>{tokenData.basic.recommendation}</span>
                      </div>
                      <p className="text-[10px] text-nexus-muted mt-1">{tokenData.basic.reasoning}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 text-center text-nexus-muted text-sm">No data available</div>
              )}
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col">
              <div className="h-12 px-5 flex items-center justify-between border-b border-nexus-border shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold text-sm">{currentTokenSymbol}</span>
                  <span className="text-[10px] text-nexus-muted">AI Strategy Chat</span>
                </div>
                <button onClick={() => fetchTokenData(currentTokenSymbol, currentChat.address)} className="text-[10px] text-nexus-muted hover:text-white">Refresh Data</button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {currentChat.history.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-nexus-accent/10 flex items-center justify-center text-nexus-accent-light"><IconChat /></div>
                    <div className="text-center">
                      <p className="text-white font-medium mb-1">Analyze {currentTokenSymbol}</p>
                      <p className="text-nexus-muted text-xs mb-4">Ask AI about this token — analysis, strategies, buy/sell signals</p>
                      <div className="flex flex-wrap gap-2 justify-center max-w-md">
                        {[
                          `分析${currentTokenSymbol}的买入时机`,
                          `${currentTokenSymbol} safe to buy?`,
                          `深度分析${currentTokenSymbol}`,
                          "聪明钱在买吗？",
                          "设置止损策略",
                          "和同类币对比",
                        ].map((cmd, i) => (
                          <button key={i} onClick={() => setChatInput(cmd)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-nexus-card border border-nexus-border text-nexus-muted hover:text-white hover:border-nexus-accent/40 transition-all">
                            {cmd}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  currentChat.history.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}>
                      {msg.role === "agent" && (
                        <div className="w-6 h-6 rounded-lg bg-nexus-accent/15 flex items-center justify-center text-nexus-accent-light text-[10px] font-bold mr-2 mt-1 shrink-0">AI</div>
                      )}
                      <div className={msg.role === "user" ? "chat-user" : "chat-agent"}>
                        <div className="whitespace-pre-wrap">{msg.text}</div>
                      </div>
                    </div>
                  ))
                )}
                {chatLoading && (
                  <div className="flex justify-start animate-fade-in">
                    <div className="w-6 h-6 rounded-lg bg-nexus-accent/15 flex items-center justify-center text-nexus-accent-light text-[10px] font-bold mr-2 mt-1 shrink-0">AI</div>
                    <div className="chat-agent">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-nexus-accent animate-bounce" />
                        <div className="w-1.5 h-1.5 rounded-full bg-nexus-accent animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-nexus-accent animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="px-5 py-4 border-t border-nexus-border shrink-0">
                <div className="flex gap-3">
                  <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !chatLoading && handleTokenChat()}
                    className="flex-1 input !rounded-xl" placeholder={`Ask about ${currentTokenSymbol}...`} disabled={chatLoading} />
                  <button onClick={handleTokenChat} disabled={chatLoading || !chatInput.trim()}
                    className="btn-primary !px-4 !py-3 !rounded-xl disabled:opacity-40"><IconSend /></button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── WALLET VIEW ── */}
        {activeView === "wallet" && (
          <div className="flex-1 overflow-y-auto p-6">
            <h1 className="text-xl font-bold text-white mb-6">Wallet</h1>
            <div className="max-w-md">
              <div className="card">
                {!wallet ? (
                  <div className="space-y-3">
                    <button onClick={handleConnectOKX} className="btn-primary w-full text-sm py-3 flex items-center justify-center gap-2">
                      <span className="w-5 h-5 rounded bg-white/20 flex items-center justify-center text-[10px] font-bold">OKX</span>
                      Connect OKX Wallet
                    </button>
                    <div className="text-[10px] text-nexus-muted text-center">0 Gas USDC · x402 Payments</div>
                    <div className="border-t border-nexus-border my-2" />
                    <button onClick={handleCreateWallet} className="btn-secondary w-full text-sm py-2.5">Create Local Wallet</button>
                    <button onClick={() => setPasswordMode("import")} className="btn-secondary w-full text-sm py-2.5">Import Private Key</button>
                    {passwordMode === "import" && (
                      <div className="space-y-2 pt-2">
                        <input type="password" value={importKey} onChange={e => setImportKey(e.target.value)} className="input" placeholder="Private key (0x...)" />
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input" placeholder="Trading password" onKeyDown={e => e.key === "Enter" && handleImport()} />
                        <button onClick={handleImport} className="btn-primary w-full text-sm py-2.5">Import & Encrypt</button>
                        <button onClick={() => { setPasswordMode(null); setImportKey(""); setPassword(""); }} className="btn-ghost w-full text-xs">Cancel</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-[10px] text-nexus-muted uppercase tracking-wider">X Layer Address</div>
                    <div className="text-xs font-mono text-nexus-accent-light bg-nexus-bg p-3 rounded-xl break-all border border-nexus-border">{wallet}</div>
                    <div className="flex items-center justify-between">
                      <span className={`flex items-center gap-1.5 text-xs ${unlocked ? "text-nexus-green" : "text-nexus-muted"}`}>
                        <span className={`w-2 h-2 rounded-full ${unlocked ? "bg-nexus-green" : "bg-nexus-muted"}`} />
                        {walletMode === "okx" ? "OKX Wallet Connected" : unlocked ? "Unlocked" : "Locked"}
                      </span>
                      {walletMode === "local" && unlocked && (
                        <button onClick={handleLock} className="btn-ghost text-xs">Lock</button>
                      )}
                    </div>
                    {walletMode === "local" && !unlocked && passwordMode !== "set" && (
                      <div className="space-y-2">
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                          className="input" placeholder="Trading password" onKeyDown={e => e.key === "Enter" && handleUnlock()} />
                        <button onClick={handleUnlock} className="btn-primary w-full text-sm py-2.5">Unlock</button>
                      </div>
                    )}
                    {passwordMode === "set" && (
                      <div className="space-y-2">
                        <div className="text-xs text-nexus-yellow">Set trading password:</div>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                          className="input" placeholder="Min 6 characters" onKeyDown={e => e.key === "Enter" && handleSetPassword()} />
                        <button onClick={handleSetPassword} className="btn-primary w-full text-sm py-2.5">Set Password</button>
                      </div>
                    )}
                    {walletMode === "okx" && (
                      <button onClick={() => { disconnectOKXWallet(); setWallet(null); setWalletMode(null); setUnlocked(false); }}
                        className="btn-ghost text-xs text-nexus-red w-full">Disconnect OKX Wallet</button>
                    )}
                    <div className="text-[10px] text-nexus-muted flex items-center gap-1 mt-2">
                      <IconShield /> {walletMode === "okx" ? "0 Gas x402 · OKX Wallet" : "Key encrypted in browser"}
                    </div>
                  </div>
                )}
              </div>

              {/* USDC Approval Card */}
              {wallet && (
              <div className="card mt-4">
                <h2 className="text-sm font-semibold text-white mb-3">AI Analysis Payment (USDC)</h2>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-nexus-muted">USDC Balance</span>
                    <span className="text-white">${usdcBalance}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-nexus-muted">Approved</span>
                    <span className={parseFloat(usdcAllowance) > 0 ? "text-nexus-green" : "text-nexus-muted"}>
                      ${usdcAllowance}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-nexus-muted">Cost per call</span>
                    <span className="text-white">$0.01 ~ $0.08</span>
                  </div>
                </div>

                {parseFloat(usdcAllowance) > 0 ? (
                  <div className="mt-3 p-2 rounded-lg bg-nexus-green/5 border border-nexus-green/20 text-[10px] text-nexus-green flex items-center gap-1.5">
                    <IconShield /> Auto-payment enabled · No per-call confirmation needed
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <p className="text-[10px] text-nexus-muted">
                      Approve once → all AI analysis calls auto-deduct, no pop-ups.
                    </p>
                    <button
                      onClick={handleApproveUSDC}
                      disabled={approving || !unlocked}
                      className="btn-primary w-full text-sm py-2.5 disabled:opacity-40"
                    >
                      {approving ? "Approving..." : `Approve $${DEFAULT_APPROVE_AMOUNT} USDC`}
                    </button>
                    {!unlocked && walletMode === "local" && (
                      <p className="text-[10px] text-nexus-yellow">Unlock wallet first to approve</p>
                    )}
                  </div>
                )}
              </div>
              )}
            </div>
          </div>
        )}

        {/* ── OVERVIEW VIEW ── */}
        {activeView === "overview" && (
          <div className="flex-1 overflow-y-auto p-6">
            <h1 className="text-xl font-bold text-white mb-6">Overview</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="card">
                <div className="stat-label">Total API Calls</div>
                <div className="text-2xl font-bold text-white mt-1">{stats?.total_calls || 0}</div>
              </div>
              <div className="card">
                <div className="stat-label">Revenue</div>
                <div className="text-2xl font-bold text-nexus-green mt-1">${stats?.total_revenue_usd || "0"}</div>
              </div>
              <div className="card">
                <div className="stat-label">Token Chats</div>
                <div className="text-2xl font-bold text-nexus-accent-light mt-1">{tokenChatList.length}</div>
              </div>
            </div>

            {/* PnL Section */}
            {walletPnL && (
              <div className="card">
                <h2 className="text-sm font-semibold text-white mb-4">Wallet PnL</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Total PnL", value: `$${walletPnL.overview?.total_pnl_usd || "0"}`, color: parseFloat(walletPnL.overview?.total_pnl_usd || "0") >= 0 ? "text-nexus-green" : "text-nexus-red" },
                    { label: "Unrealized", value: `$${walletPnL.overview?.unrealized_pnl_usd || "0"}`, color: "text-nexus-accent-light" },
                    { label: "Win Rate", value: `${walletPnL.overview?.win_rate || "0"}%`, color: "text-white" },
                    { label: "Trades", value: walletPnL.overview?.total_trades || "0", color: "text-white" },
                  ].map((s, i) => (
                    <div key={i} className="bg-nexus-bg rounded-xl p-3 border border-nexus-border">
                      <div className="stat-label">{s.label}</div>
                      <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
