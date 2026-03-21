"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState, useRef } from "react";
import { connectOKXWallet, sendOKXTransaction, autoConnectOKX } from "./okx-wallet";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:4000";

// ── i18n ──
const LANG: Record<string, Record<string, string>> = {
  en: {
    newChat: "New Chat", chats: "CHATS", launch: "LAUNCH", strategies: "STRATEGIES",
    wallet: "Wallet", connectOKX: "Connect OKX Wallet", disconnect: "Disconnect", emailLogin: "Login with Email", emailPlaceholder: "Enter your email", codePlaceholder: "Enter verification code", sendCode: "Send Code", verifyCode: "Verify", codeSent: "Code sent to your email",
    logout: "Logout", settings: "Settings",
    placeholder: "Ask anything about tokens, trading, analysis...",
    launchToken: "Launch Token", tokenName: "Token Name", tokenSymbol: "Token Symbol",
    totalSupply: "Total Supply",
    launchDesc: "Deploy your meme coin on X Layer — 0.001 OKB, earn 1% trading fees",
    launching: "Launching...", step: "Step", of: "of",
    launchSuccess: "Token launched!", viewExplorer: "View on Explorer", launchAnother: "Launch Another",
    needOKXWallet: "Connect OKX Wallet to launch tokens",
    newStrategy: "New Strategy", strategyName: "Strategy Name",
    strategyDesc: "Describe your filter in natural language",
    saveStrategy: "Save & Run", running: "Running", paused: "Paused", runNow: "Run Now",
    deleteStrategy: "Delete", noStrategies: "No strategies yet",
    heroTitle: "AgentNexus", heroSub: "AI-powered on-chain strategy for X Layer",
    heroDesc: "Chat with AI to analyze tokens, execute trades, launch meme coins, and build automated strategies — all with natural language.",
    connectToStart: "Connect wallet to start",
    loginX: "Login with X", freeCredits: "free today", credits: "credits",
    thinking: "Thinking...",
    paymentRequired: "Credits Depleted",
    paymentDesc: "You've used all 10 free daily actions. Purchase credits to continue.",
    buyCredits: "Buy 100 Credits ($1 USDC)",
    buying: "Processing...",
    paymentSuccess: "Credits purchased!",
    freeActions: "free actions left",
    creditsLeft: "credits",
  },
  zh: {
    newChat: "新对话", chats: "对话", launch: "发币", strategies: "策略",
    wallet: "钱包", connectOKX: "连接 OKX 钱包", disconnect: "断开", emailLogin: "邮箱登录", emailPlaceholder: "输入邮箱", codePlaceholder: "输入验证码", sendCode: "发送验证码", verifyCode: "验证", codeSent: "验证码已发送到邮箱",
    logout: "退出", settings: "设置",
    placeholder: "问任何关于代币、交易、分析的问题...",
    launchToken: "发射代币", tokenName: "代币名称", tokenSymbol: "代币符号",
    totalSupply: "总供应量",
    launchDesc: "在 X Layer 上发射 Meme 币 — 0.001 OKB，赚取 1% 交易手续费",
    launching: "发射中...", step: "第", of: "步，共",
    launchSuccess: "代币发射成功！", viewExplorer: "在浏览器中查看", launchAnother: "继续发射",
    needOKXWallet: "请连接 OKX 钱包以发射代币",
    newStrategy: "新策略", strategyName: "策略名称",
    strategyDesc: "用自然语言描述你的筛选条件",
    saveStrategy: "保存并执行", running: "运行中", paused: "已暂停", runNow: "立即执行",
    deleteStrategy: "删除", noStrategies: "暂无策略",
    heroTitle: "AgentNexus", heroSub: "X Layer AI 链上策略助手",
    heroDesc: "用自然语言和 AI 聊天，分析代币、执行交易、发射 Meme 币、构建自动化策略。",
    connectToStart: "连接钱包开始使用",
    loginX: "X 登录", freeCredits: "今日免费", credits: "额度",
    thinking: "思考中...",
    paymentRequired: "额度已用完",
    paymentDesc: "今日10次免费操作已用完，购买额度以继续使用。",
    buyCredits: "购买100次额度 ($1 USDC)",
    buying: "处理中...",
    paymentSuccess: "额度购买成功！",
    freeActions: "次免费剩余",
    creditsLeft: "额度",
  },
};

// ── Icons ──
const Icon = ({ d, cls = "w-5 h-5" }: { d: string; cls?: string }) => (
  <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

// ── Types ──
interface ChatMessage { role: "user" | "ai"; text: string }
interface ChatThread { id: string; title: string; messages: ChatMessage[]; createdAt: number }
interface LaunchRecord { id: string; name: string; symbol: string; address?: string; tokenId?: string; status: "draft" | "launching" | "live"; createdAt: number }
interface Strategy { id: string; name: string; description: string; status: "running" | "paused"; results: string[]; createdAt: number }

export default function Dashboard() {
  const { data: session } = useSession();
  const twitterId = (session as any)?.twitterId;
  const twitterUsername = (session as any)?.twitterUsername;

  // ── Core state ──
  const [wallet, setWallet] = useState<string | null>(null);
  const [walletMode, setWalletMode] = useState<"okx" | "twitter" | null>(null);
  const [lang, setLang] = useState<"en" | "zh">(() => {
    if (typeof window === "undefined") return "zh";
    return (localStorage.getItem("agentnexus_lang") as "en" | "zh") || "zh";
  });
  const t = LANG[lang];
  const toggleLang = () => { const n = lang === "en" ? "zh" : "en"; setLang(n); localStorage.setItem("agentnexus_lang", n); };

  // ── Navigation ──
  type View = "chat" | "launch" | "strategy" | "wallet";
  const [activeView, setActiveView] = useState<View>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ── Chat state ──
  const [chatThreads, setChatThreads] = useState<ChatThread[]>(() => {
    if (typeof window === "undefined") return [];
    try { const s = localStorage.getItem("nexus_chats"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const activeChat = chatThreads.find(c => c.id === activeChatId) || null;

  // Persist chats
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("nexus_chats", JSON.stringify(chatThreads));
  }, [chatThreads]);

  // Auto-scroll only when near bottom (don't override manual scroll-up)
  const chatScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); return; }
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (isNearBottom) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages.length]);

  // ── Launch state ──
  const [launches, setLaunches] = useState<LaunchRecord[]>(() => {
    if (typeof window === "undefined") return [];
    try { const s = localStorage.getItem("nexus_launches"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [activeLaunchId, setActiveLaunchId] = useState<string | null>(null);
  const [launchName, setLaunchName] = useState("");
  const [launchSymbol, setLaunchSymbol] = useState("");
  const [launchSupply, setLaunchSupply] = useState("1000000000");
  const [launchTradeUrl, setLaunchTradeUrl] = useState("");
  const [launchStep, setLaunchStep] = useState(0);
  const [launchTotal, setLaunchTotal] = useState(0);
  const [launchLoading, setLaunchLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("nexus_launches", JSON.stringify(launches));
  }, [launches]);

  const activeLaunch = launches.find(l => l.id === activeLaunchId) || null;

  // ── Strategy state ──
  const [strategies, setStrategies] = useState<Strategy[]>(() => {
    if (typeof window === "undefined") return [];
    try { const s = localStorage.getItem("nexus_strategies"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [activeStrategyId, setActiveStrategyId] = useState<string | null>(null);
  const [strategyInput, setStrategyInput] = useState("");
  const [strategyName, setStrategyName] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("nexus_strategies", JSON.stringify(strategies));
  }, [strategies]);

  // ── Credits / x402 state ──
  const [credits, setCredits] = useState(0);
  const [freeRemaining, setFreeRemaining] = useState(10);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [pendingRetry, setPendingRetry] = useState<(() => void) | null>(null);

  // Fetch credits on wallet connect + refresh every 30s
  const refreshCredits = () => {
    if (!wallet) return;
    fetch(`${GATEWAY}/credits/${wallet}`).then(r => r.json()).then(data => {
      setCredits(data.credits || 0);
      setFreeRemaining(data.freeRemaining ?? 10);
    }).catch(() => {});
  };

  useEffect(() => {
    refreshCredits();
    const interval = setInterval(refreshCredits, 30000);
    return () => clearInterval(interval);
  }, [wallet]);

  // Handle 402 Payment Required
  const handle402 = (data: any, retryFn: () => void) => {
    setFreeRemaining(0);
    setCredits(data.creditsRemaining || 0);
    setPendingRetry(() => retryFn);
    setShowPayment(true);
  };

  // Buy credits via OKX Wallet USDC transfer
  const handleBuyCredits = async () => {
    if (!wallet || walletMode !== "okx") return;
    setPaymentLoading(true);
    try {
      const provider = (window as any).okxwallet;
      if (!provider) throw new Error("OKX Wallet not found");

      // Get platform wallet address
      const infoResp = await fetch(`${GATEWAY}/credits/${wallet}`);
      const info = await infoResp.json();
      const payTo = info.payTo;

      // Build USDC transfer: $1 = 1000000 (6 decimals)
      const USDC_ADDRESS = "0x74b7f16337b8972027f6196a17a631ac6de26d22";
      const transferData = "0xa9059cbb" + // transfer(address,uint256)
        payTo.slice(2).padStart(64, "0") +
        BigInt("1000000").toString(16).padStart(64, "0"); // $1 USDC

      const txHash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: wallet,
          to: USDC_ADDRESS,
          data: transferData,
          chainId: "0xc4", // 196
        }],
      });

      // Wait for confirmation
      let confirmed = false;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const receipt = await provider.request({ method: "eth_getTransactionReceipt", params: [txHash] });
        if (receipt && receipt.status === "0x1") { confirmed = true; break; }
        if (receipt && receipt.status === "0x0") throw new Error("Transaction reverted");
      }
      if (!confirmed) throw new Error("Transaction timeout");

      // Verify on server
      const verifyResp = await fetch(`${GATEWAY}/credits/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: wallet, tx_hash: txHash }),
      });
      const result = await verifyResp.json();
      if (!result.success) throw new Error(result.error);

      setCredits(result.totalCredits);
      setFreeRemaining(0);
      setShowPayment(false);
      setPendingRetry(null);
    } catch (e: any) {
      alert(`Payment failed: ${e.message}`);
    } finally {
      setPaymentLoading(false);
    }
  };

  // ── Auth ──
  const isLoggedIn = !!session || !!wallet;
  const displayName = twitterUsername || (wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : null);

  // Auto-connect OKX Wallet if previously authorized (e.g. in OKX App browser)
  useEffect(() => {
    autoConnectOKX().then(result => {
      if (result) { setWallet(result.address); setWalletMode("okx"); }
    });
  }, []);

  const handleConnectOKX = async () => {
    const result = await connectOKXWallet();
    if (result) { setWallet(result.address); setWalletMode("okx"); }
  };

  // ── Chat handler ──
  const handleSend = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatLoading(true);

    // Create or update thread
    let threadId = activeChatId;
    if (!threadId) {
      threadId = Date.now().toString();
      const newThread: ChatThread = { id: threadId, title: msg.slice(0, 30), messages: [], createdAt: Date.now() };
      setChatThreads(prev => [newThread, ...prev]);
      setActiveChatId(threadId);
    }

    // Add user message
    setChatThreads(prev => prev.map(c =>
      c.id === threadId ? { ...c, messages: [...c.messages, { role: "user" as const, text: msg }] } : c
    ));

    try {
      const resp = await fetch(`${GATEWAY}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          wallet_address: wallet,
          history: activeChat?.messages.map(m => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text })) || [],
        }),
      });

      // x402: handle payment required
      if (resp.status === 402) {
        const data = await resp.json();
        handle402(data, () => { setChatInput(msg); handleSend(); });
        setChatLoading(false);
        return;
      }

      // Rate limit: show payment modal to upgrade
      if (resp.status === 429) {
        handle402({ creditsRemaining: 0, freeUsed: 10, freeLimit: 10 }, () => { setChatInput(msg); handleSend(); });
        setChatLoading(false);
        return;
      }

      const data = await resp.json();

      // Update credits info from response
      if (data.freeRemaining !== undefined) setFreeRemaining(data.freeRemaining);
      if (data.credits !== undefined) setCredits(data.credits);

      // Check if it's a launch intent
      const launchResult = data.results?.find((r: any) => r.data?.transactions);
      // Check if it's a trade confirmation
      const tradeResult = data.results?.find((r: any) => r.data?.needs_confirmation);

      if (tradeResult && wallet && walletMode === "okx") {
        const td = tradeResult.data;
        // Show AI reply first
        setChatThreads(prev => prev.map(c =>
          c.id === threadId ? { ...c, messages: [...c.messages, { role: "ai" as const, text: data.reply || td.summary }] } : c
        ));
        // Directly execute trade via OKX Wallet — no confirmation button
        executeTrade(threadId!, td.trade_params);
      } else {
        const replyText = launchResult
          ? (lang === "zh" ? `发币方案已准备好，请点击左侧「发币」标签完成操作。` : `Token launch plan ready. Go to the Launch tab to complete it.`)
          : tradeResult && !wallet
          ? `${data.reply || tradeResult.data.summary}\n\n${lang === "zh" ? "请先连接 OKX 钱包" : "Please connect OKX Wallet first"}`
          : (data.reply || data.error || "No response");
        setChatThreads(prev => prev.map(c =>
          c.id === threadId ? { ...c, messages: [...c.messages, { role: "ai" as const, text: replyText }] } : c
        ));
      }
    } catch (e: any) {
      setChatThreads(prev => prev.map(c =>
        c.id === threadId ? { ...c, messages: [...c.messages, { role: "ai" as const, text: `Error: ${e.message}` }] } : c
      ));
    } finally {
      setChatLoading(false);
    }
  };

  // ── Direct trade execution via OKX Wallet (no confirmation step) ──
  const executeTrade = async (threadId: string, params: any) => {
    if (!wallet) return;

    const execMsg = lang === "zh" ? "正在准备交易，请在 OKX Wallet 中签名..." : "Preparing trade, please sign in OKX Wallet...";

    setChatThreads(prev => prev.map(c =>
      c.id === threadId ? { ...c, messages: [...c.messages, { role: "ai" as const, text: execMsg }] } : c
    ));

    try {
      let resultText: string;

      {
        const provider = (window as any).okxwallet;
        if (!provider) throw new Error("OKX Wallet not found");

        const buildResp = await fetch(`${GATEWAY}/trade/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from_token: params.from_token, to_token: params.to_token, amount: params.amount, wallet_address: wallet }),
        });
        if (buildResp.status === 402) { handle402(await buildResp.json(), () => executeTrade(threadId, params)); return; }

        const quoteData = await buildResp.json();
        const tx = quoteData.tx || quoteData.data?.tx;

        if (tx) {
          const txHash = await provider.request({
            method: "eth_sendTransaction",
            params: [{ from: wallet, to: tx.to, data: tx.data, value: tx.value || "0x0", chainId: "0xc4" }],
          });

          let confirmed = false;
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const receipt = await provider.request({ method: "eth_getTransactionReceipt", params: [txHash] });
            if (receipt) { confirmed = receipt.status === "0x1"; break; }
          }

          resultText = confirmed
            ? `${lang === "zh" ? "交易成功！" : "Trade executed!"}\nTx: ${txHash}\nhttps://www.okx.com/web3/explorer/xlayer/tx/${txHash}`
            : `${lang === "zh" ? "交易已提交" : "Trade submitted"}: ${txHash}`;
        } else {
          resultText = `${lang === "zh" ? "无法构建交易" : "Could not build trade"}: ${quoteData.error || JSON.stringify(quoteData).slice(0, 200)}`;
        }
      }  // end trade execution block

      // Replace "executing" message with result
      setChatThreads(prev => prev.map(c => {
        if (c.id !== threadId) return c;
        const msgs = [...c.messages];
        msgs[msgs.length - 1] = { role: "ai", text: resultText };
        return { ...c, messages: msgs };
      }));
    } catch (e: any) {
      const errText = e.code === 4001
        ? (lang === "zh" ? "交易已取消" : "Trade cancelled")
        : `${lang === "zh" ? "交易失败" : "Trade failed"}: ${e.message}`;
      setChatThreads(prev => prev.map(c => {
        if (c.id !== threadId) return c;
        const msgs = [...c.messages];
        msgs[msgs.length - 1] = { role: "ai", text: errText };
        return { ...c, messages: msgs };
      }));
    }
  };

  const newChat = () => { setActiveChatId(null); setChatInput(""); setActiveView("chat"); };

  const deleteChat = (id: string) => {
    setChatThreads(prev => prev.filter(c => c.id !== id));
    if (activeChatId === id) setActiveChatId(null);
  };

  // ── Launch handler ──
  const handleLaunch = async () => {
    if (!launchName || !launchSymbol || !wallet) return;
    if (walletMode !== "okx") { alert(t.needOKXWallet); return; }
    setLaunchLoading(true);
    setLaunchStep(0);

    const launchId = Date.now().toString();
    const record: LaunchRecord = { id: launchId, name: launchName, symbol: launchSymbol, status: "launching", createdAt: Date.now() };
    setLaunches(prev => [record, ...prev]);
    setActiveLaunchId(launchId);

    try {
      const resp = await fetch(`${GATEWAY}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: launchName, symbol: launchSymbol, totalSupply: launchSupply, from: wallet }),
      });

      // x402 / rate limit: handle payment required
      if (resp.status === 402 || resp.status === 429) {
        const data = await resp.json();
        setLaunches(prev => prev.filter(l => l.id !== launchId));
        handle402(data, handleLaunch);
        setLaunchLoading(false);
        return;
      }

      const plan = await resp.json();
      if (plan.error) throw new Error(plan.error);

      setLaunchTotal(1); // Single transaction now
      const provider = (window as any).okxwallet;
      if (!provider) throw new Error("OKX Wallet not found");

      let deployedAddress = "";
      let lpTokenId = "";

      // Single transaction via factory contract
      setLaunchStep(1);
      const { tx } = plan.transactions[0];
      const txParams: any = { from: wallet, to: tx.to, data: tx.data, value: tx.value, chainId: tx.chainId, gas: tx.gas };
      const txHash = await provider.request({ method: "eth_sendTransaction", params: [txParams] });

      // Wait for confirmation and extract token address + LP tokenId from logs
      for (let j = 0; j < 60; j++) {
        await new Promise(r => setTimeout(r, 2000));
        const receipt = await provider.request({ method: "eth_getTransactionReceipt", params: [txHash] });
        if (receipt) {
          if (receipt.status === "0x0") throw new Error("Transaction reverted");
          // Extract from TokenLaunched event: TokenLaunched(creator, token, pool, tokenId)
          // selector = keccak256("TokenLaunched(address,address,address,uint256)")
          const launchSig = "0xaa1fd485cb601a5b85e2cd1f22e0ca8107bde33fe09c9783a4d42871a0c6d0e1";
          for (const log of (receipt.logs || [])) {
            if (log.topics?.[0] === launchSig) {
              deployedAddress = "0x" + log.topics[2].slice(26); // token address
              const tokenIdHex = log.data?.slice(66, 130) || log.data?.slice(2, 66);
              if (tokenIdHex) lpTokenId = BigInt("0x" + tokenIdHex).toString();
            }
          }
          // Fallback: extract from ERC721 Transfer logs (NFPM mint)
          if (!lpTokenId) {
            for (const log of (receipt.logs || [])) {
              if (log.topics?.[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" && log.topics?.length === 4) {
                lpTokenId = BigInt(log.topics[3]).toString();
              }
            }
          }
          break;
        }
      }

      setLaunches(prev => prev.map(l => l.id === launchId ? { ...l, address: deployedAddress, tokenId: lpTokenId, status: "live" as const } : l));
      setLaunchTradeUrl(plan.tradeUrl || "");
      setLaunchName(""); setLaunchSymbol("");
    } catch (e: any) {
      setLaunches(prev => prev.map(l => l.id === launchId ? { ...l, status: "draft" as const } : l));
      alert(`Launch failed: ${e.message}`);
    } finally {
      setLaunchLoading(false);
    }
  };

  // ── Collect LP fees via factory ──
  const FACTORY_ADDRESS = "0x5cebe1fa24cc3517ffa5e0df3179bb6757bd8f0a";
  const handleCollectFees = async (tokenId: string) => {
    if (!wallet || walletMode !== "okx") return;
    const provider = (window as any).okxwallet;
    if (!provider) return;
    try {
      // collectFees(uint256) selector = 0xb17acdcd
      const data = "0xb17acdcd" + BigInt(tokenId).toString(16).padStart(64, "0");
      const txHash = await provider.request({
        method: "eth_sendTransaction",
        params: [{ from: wallet, to: FACTORY_ADDRESS, data, value: "0x0", chainId: "0xc4", gas: "0x50000" }],
      });
      alert(lang === "zh" ? `手续费提取交易已发送: ${txHash}` : `Fees collected! TX: ${txHash}`);
    } catch (e: any) {
      alert(`Collect failed: ${e.message}`);
    }
  };

  // Load strategies from server on wallet connect + poll every 60s for cron results
  const syncStrategies = () => {
    if (!wallet) return;
    fetch(`${GATEWAY}/strategies/${wallet}`, { headers: { "x-wallet-address": wallet || "" } }).then(r => r.json()).then(data => {
      if (data.strategies?.length) {
        setStrategies(data.strategies.map((s: any) => ({
          id: s.id, name: s.name, description: s.description,
          status: s.status, results: (s.results || []).map((r: any) => r.summary),
          createdAt: new Date(s.createdAt).getTime(),
        })));
      }
    }).catch(() => {});
  };

  useEffect(() => {
    syncStrategies();
    const interval = setInterval(syncStrategies, 60000);
    return () => clearInterval(interval);
  }, [wallet]);

  // ── Strategy handler ──
  const handleCreateStrategy = async () => {
    if (!strategyName || !strategyInput || !wallet) return;

    // Save to server
    try {
      const resp = await fetch(`${GATEWAY}/strategies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: wallet, name: strategyName, description: strategyInput }),
      });
      const data = await resp.json();
      const id = data.strategy?.id || Date.now().toString();

      const strategy: Strategy = { id, name: strategyName, description: strategyInput, status: "running", results: [], createdAt: Date.now() };
      setStrategies(prev => [strategy, ...prev]);
      setActiveStrategyId(id);
      setStrategyName(""); setStrategyInput("");

      // Run immediately
      const runResp = await fetch(`${GATEWAY}/strategies/${id}/run`, { method: "POST", headers: { "Content-Type": "application/json" } });

      if (runResp.status === 402) {
        const payData = await runResp.json();
        handle402(payData, () => {});
        return;
      }

      const runData = await runResp.json();
      if (runData.success) {
        setStrategies(prev => prev.map(s => s.id === id ? { ...s, results: [runData.result.summary] } : s));
      }
    } catch {}
  };

  const toggleStrategy = async (id: string) => {
    const s = strategies.find(x => x.id === id);
    if (!s) return;
    const newStatus = s.status === "running" ? "paused" : "running";
    setStrategies(prev => prev.map(x => x.id === id ? { ...x, status: newStatus as any } : x));
    try {
      await fetch(`${GATEWAY}/strategies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {}
  };

  const deleteStrategy = async (id: string) => {
    setStrategies(prev => prev.filter(s => s.id !== id));
    if (activeStrategyId === id) setActiveStrategyId(null);
    try { await fetch(`${GATEWAY}/strategies/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json", "x-wallet-address": wallet || "" } }); } catch {}
  };

  // ── Landing page (not logged in) ──
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <h1 className="text-4xl font-bold text-gradient mb-2">{t.heroTitle}</h1>
          <p className="text-nexus-accent-light text-lg mb-2">{t.heroSub}</p>
          <p className="text-nexus-muted text-sm mb-8">{t.heroDesc}</p>

          <div className="space-y-3">
            <button onClick={handleConnectOKX} className="btn-primary w-full flex items-center justify-center gap-2">
              <span className="w-5 h-5 rounded bg-white/20 flex items-center justify-center text-[10px] font-bold">OKX</span>
              {t.connectOKX}
            </button>
            <button onClick={() => signIn("twitter")} className="btn-secondary w-full flex items-center justify-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              {t.loginX}
            </button>
          </div>

          <div className="mt-6 flex justify-center">
            <button onClick={toggleLang} className="text-xs text-nexus-muted hover:text-white transition-colors">
              {lang === "en" ? "中文" : "English"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main dashboard ──
  return (
    <div className="h-screen flex bg-nexus-bg overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className={`${sidebarOpen ? "w-64" : "w-16"} flex flex-col bg-nexus-card border-r border-nexus-border transition-all duration-200 flex-shrink-0`}>
        {/* Header */}
        <div className="p-3 flex items-center gap-2 border-b border-nexus-border">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg hover:bg-white/5 text-nexus-muted hover:text-white">
            <Icon d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </button>
          {sidebarOpen && <span className="text-sm font-bold text-gradient">AgentNexus</span>}
        </div>

        {/* New Chat */}
        <div className="p-2">
          <button onClick={newChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm border border-nexus-border hover:bg-white/5 text-nexus-muted hover:text-white transition-all">
            <Icon d="M12 4.5v15m7.5-7.5h-15" />
            {sidebarOpen && <span>{t.newChat}</span>}
          </button>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto px-2 space-y-1">
          {/* CHATS section */}
          {sidebarOpen && <div className="px-2 pt-3 pb-1 text-[9px] text-nexus-muted uppercase tracking-widest">{t.chats}</div>}
          {chatThreads.map(chat => (
            <button key={chat.id}
              onClick={() => { setActiveChatId(chat.id); setActiveView("chat"); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all group ${
                activeChatId === chat.id && activeView === "chat" ? "bg-nexus-accent/15 text-nexus-accent-light" : "text-nexus-muted hover:text-white hover:bg-white/5"
              }`}>
              <Icon d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
              {sidebarOpen && (
                <>
                  <span className="flex-1 text-left truncate">{chat.title}</span>
                  <span onClick={e => { e.stopPropagation(); deleteChat(chat.id); }}
                    className="opacity-0 group-hover:opacity-100 text-nexus-muted hover:text-red-400 text-xs">✕</span>
                </>
              )}
            </button>
          ))}

          {/* LAUNCH section */}
          {sidebarOpen && <div className="px-2 pt-4 pb-1 text-[9px] text-nexus-muted uppercase tracking-widest">{t.launch}</div>}
          <button onClick={() => { setActiveLaunchId(null); setActiveView("launch"); }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all ${
              activeView === "launch" && !activeLaunchId ? "bg-nexus-green/15 text-nexus-green" : "text-nexus-muted hover:text-white hover:bg-white/5"
            }`}>
            <Icon d="M12 19V5M5 12l7-7 7 7" />
            {sidebarOpen && <span>{t.launchToken}</span>}
          </button>
          {launches.map(l => (
            <button key={l.id}
              onClick={() => { setActiveLaunchId(l.id); setActiveView("launch"); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all group ${
                activeLaunchId === l.id && activeView === "launch" ? "bg-nexus-green/15 text-nexus-green" : "text-nexus-muted hover:text-white hover:bg-white/5"
              }`}>
              <span className={`w-2 h-2 rounded-full ${l.status === "live" ? "bg-nexus-green" : l.status === "launching" ? "bg-yellow-400 animate-pulse" : "bg-nexus-muted"}`} />
              {sidebarOpen && (
                <>
                  <span className="flex-1 text-left truncate">{l.symbol}</span>
                  <span onClick={e => { e.stopPropagation(); setLaunches(prev => prev.filter(x => x.id !== l.id)); if (activeLaunchId === l.id) setActiveLaunchId(null); }}
                    className="opacity-0 group-hover:opacity-100 text-nexus-muted hover:text-red-400 text-xs">✕</span>
                </>
              )}
            </button>
          ))}

          {/* STRATEGIES section */}
          {sidebarOpen && <div className="px-2 pt-4 pb-1 text-[9px] text-nexus-muted uppercase tracking-widest">{t.strategies}</div>}
          <button onClick={() => { setActiveStrategyId(null); setActiveView("strategy"); }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all ${
              activeView === "strategy" && !activeStrategyId ? "bg-nexus-accent/15 text-nexus-accent-light" : "text-nexus-muted hover:text-white hover:bg-white/5"
            }`}>
            <Icon d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            {sidebarOpen && <span>{t.newStrategy}</span>}
          </button>
          {strategies.map(s => (
            <button key={s.id}
              onClick={() => { setActiveStrategyId(s.id); setActiveView("strategy"); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all group ${
                activeStrategyId === s.id && activeView === "strategy" ? "bg-nexus-accent/15 text-nexus-accent-light" : "text-nexus-muted hover:text-white hover:bg-white/5"
              }`}>
              <span className={`w-2 h-2 rounded-full ${s.status === "running" ? "bg-nexus-green" : "bg-nexus-muted"}`} />
              {sidebarOpen && (
                <>
                  <span className="flex-1 text-left truncate">{s.name}</span>
                  <span onClick={e => { e.stopPropagation(); deleteStrategy(s.id); }}
                    className="opacity-0 group-hover:opacity-100 text-nexus-muted hover:text-red-400 text-xs">✕</span>
                </>
              )}
            </button>
          ))}
        </nav>

        {/* Bottom: wallet + settings */}
        <div className="p-2 border-t border-nexus-border space-y-1">
          {wallet ? (
            <div className="px-3 py-2 rounded-xl bg-white/5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-nexus-green" />
                {sidebarOpen && (
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white truncate">{displayName}</div>
                    <div className="text-[10px] text-nexus-muted">{walletMode === "okx" ? "OKX Wallet" : "X Login"}</div>
                  </div>
                )}
              </div>
              {sidebarOpen && (
                <>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-nexus-accent-light">
                      {freeRemaining > 0 ? `${freeRemaining} ${t.freeActions}` : ""}
                      {credits > 0 ? `${freeRemaining > 0 ? " + " : ""}${credits} ${t.creditsLeft}` : ""}
                      {freeRemaining === 0 && credits === 0 ? (lang === "zh" ? "额度已用完" : "No credits") : ""}
                    </span>
                    {credits < 5 && (
                      <button onClick={() => setShowPayment(true)} className="text-[10px] text-nexus-green hover:underline">
                        {lang === "zh" ? "充值" : "Buy"}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2 mt-1">
                    {walletMode === "okx" && (
                      <button onClick={() => { setWallet(null); setWalletMode(null); }} className="text-[10px] text-nexus-muted hover:text-red-400">{t.disconnect}</button>
                    )}
                    {session && (
                      <button onClick={() => signOut()} className="text-[10px] text-nexus-muted hover:text-red-400">{t.logout}</button>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <button onClick={handleConnectOKX} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-nexus-muted hover:text-white hover:bg-white/5">
              <Icon d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1 0-6h5.25A2.25 2.25 0 0 1 21 6v6zm0 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18V6a2.25 2.25 0 0 1 2.25-2.25h13.5" />
              {sidebarOpen && <span>{t.connectOKX}</span>}
            </button>
          )}
          <button onClick={toggleLang} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs text-nexus-muted hover:text-white hover:bg-white/5">
            <Icon d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802" cls="w-4 h-4" />
            {sidebarOpen && <span>{lang === "en" ? "中文" : "English"}</span>}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* ── CHAT VIEW ── */}
        {activeView === "chat" && (
          <div className="flex-1 flex flex-col">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto" ref={chatScrollRef}>
              {!activeChat || activeChat.messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-nexus-accent to-nexus-green flex items-center justify-center mb-4 shadow-lg shadow-nexus-accent/20">
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-gradient mb-2">{t.heroTitle}</h2>
                  <p className="text-nexus-muted text-sm mb-8 max-w-md">{t.heroDesc}</p>
                  <div className="grid grid-cols-2 gap-3 max-w-lg w-full">
                    {[
                      { icon: "📊", text: lang === "zh" ? "XDOG 怎么样？" : "How is XDOG doing?" },
                      { icon: "🔍", text: lang === "zh" ? "帮我找低市值潜力币" : "Find low mcap gems" },
                      { icon: "💱", text: lang === "zh" ? "用 0.1 OKB 买 SEED" : "Buy SEED with 0.1 OKB" },
                      { icon: "🚀", text: lang === "zh" ? "发一个叫 MOON 的币" : "Launch a token called MOON" },
                      { icon: "🐋", text: lang === "zh" ? "聪明钱在买什么？" : "What is smart money buying?" },
                      { icon: "🛡️", text: lang === "zh" ? "这个币安全吗 SEED" : "Is SEED safe?" },
                    ].map((q, i) => (
                      <button key={i} onClick={() => { setChatInput(q.text); }}
                        className="card text-left text-xs text-nexus-muted hover:text-white hover:border-nexus-accent/30 p-3 !rounded-xl transition-colors">
                        <span className="mr-1.5">{q.icon}</span>{q.text}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
                  {activeChat.messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={msg.role === "user" ? "chat-user" : "chat-agent"}>
                        {msg.role === "ai" ? (
                          <>
                            <div className="prose prose-invert prose-sm max-w-none prose-headings:text-white prose-strong:text-white prose-td:text-xs prose-th:text-xs prose-table:text-xs">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                            </div>
                            {/* Show "Use this strategy" button in strategy chats */}
                            {activeChat?.title?.startsWith(lang === "zh" ? "策略" : "Strategy") && msg.text.length > 30 && (() => {
                              const stratName = activeChat?.title?.replace(/^策略-|^Strategy-/, "") || "";
                              return (
                                <button onClick={() => {
                                  setStrategyName(stratName);
                                  setStrategyInput(msg.text);
                                  setActiveStrategyId(null);
                                  setActiveView("strategy");
                                }} className="mt-3 px-4 py-2 rounded-lg text-xs font-medium bg-nexus-green/20 text-nexus-green hover:bg-nexus-green/30 transition-colors">
                                  {lang === "zh" ? "📋 使用此策略" : "📋 Use this strategy"}
                                </button>
                              );
                            })()}
                          </>
                        ) : (
                          <div className="whitespace-pre-wrap">{msg.text}</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="chat-agent">
                        <div className="flex items-center gap-2 text-nexus-muted">
                          <div className="animate-spin w-4 h-4 border-2 border-nexus-accent border-t-transparent rounded-full" />
                          {t.thinking}
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-nexus-border p-4">
              <div className="max-w-3xl mx-auto flex gap-3 items-end">
                <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  rows={2} className="flex-1 input !rounded-xl resize-none" placeholder={t.placeholder} disabled={chatLoading} />
                <button onClick={handleSend} disabled={chatLoading || !chatInput.trim()}
                  className="btn-primary !px-4 !rounded-xl disabled:opacity-40 h-[52px]">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── LAUNCH VIEW ── */}
        {activeView === "launch" && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-lg mx-auto">
              {activeLaunch?.status === "live" ? (
                /* Success */
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">&#x1F680;</div>
                  <h2 className="text-xl font-bold text-nexus-green mb-2">{t.launchSuccess}</h2>
                  <p className="text-lg font-mono text-white mb-1">{activeLaunch.symbol}</p>
                  <p className="font-mono text-xs text-nexus-accent-light break-all mb-6">{activeLaunch.address}</p>
                  <div className="flex flex-col gap-3 items-center">
                    <div className="flex gap-3">
                      <a href={`https://www.okx.com/web3/explorer/xlayer/address/${activeLaunch.address}`}
                         target="_blank" rel="noreferrer" className="btn-primary text-sm">{t.viewExplorer}</a>
                      <button onClick={() => { setActiveLaunchId(null); setLaunchName(""); setLaunchSymbol(""); setLaunchTradeUrl(""); }}
                        className="btn-secondary text-sm">{t.launchAnother}</button>
                    </div>
                    {launchTradeUrl && (
                      <a href={launchTradeUrl} target="_blank" rel="noreferrer"
                         className="btn-primary text-sm bg-nexus-accent hover:bg-nexus-accent/85">
                        {lang === "zh" ? "在 Uniswap 交易" : "Trade on Uniswap"} &#x2197;
                      </a>
                    )}
                    {activeLaunch.tokenId && (
                      <button onClick={() => handleCollectFees(activeLaunch.tokenId!)}
                        className="btn-secondary text-sm">
                        {lang === "zh" ? "提取手续费" : "Collect Fees"}
                      </button>
                    )}
                  </div>
                </div>
              ) : walletMode !== "okx" || !wallet ? (
                /* Need wallet */
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">&#x1F680;</div>
                  <p className="text-nexus-muted mb-4">{t.needOKXWallet}</p>
                  <button onClick={handleConnectOKX} className="btn-primary">{t.connectOKX}</button>
                </div>
              ) : (
                /* Launch form */
                <>
                  <h1 className="text-xl font-bold text-white mb-1">{t.launchToken}</h1>
                  <p className="text-nexus-muted text-sm mb-6">{t.launchDesc}</p>

                  <div className="space-y-4">
                    <div className="card space-y-4">
                      <div>
                        <label className="block text-xs text-nexus-muted mb-1">{t.tokenName}</label>
                        <input type="text" className="input" placeholder="e.g. Moon Dog"
                          value={launchName} onChange={e => setLaunchName(e.target.value)} disabled={launchLoading} />
                      </div>
                      <div>
                        <label className="block text-xs text-nexus-muted mb-1">{t.tokenSymbol}</label>
                        <input type="text" className="input" placeholder="e.g. MDOG"
                          value={launchSymbol} onChange={e => setLaunchSymbol(e.target.value.toUpperCase())} disabled={launchLoading} />
                      </div>
                      <div>
                        <label className="block text-xs text-nexus-muted mb-1">{t.totalSupply}</label>
                        <input type="text" className="input" value={launchSupply} onChange={e => setLaunchSupply(e.target.value)} disabled={launchLoading} />
                      </div>
                    </div>

                    <div className="card text-xs text-nexus-muted space-y-1">
                      <div className="flex justify-between"><span>Network</span><span className="text-white">X Layer</span></div>
                      <div className="flex justify-between"><span>DEX</span><span className="text-white">Uniswap V3 (1% fee)</span></div>
                      <div className="flex justify-between"><span>Pair</span><span className="text-white">{launchSymbol || "TOKEN"}/WOKB</span></div>
                      <div className="flex justify-between"><span>{lang === "zh" ? "费用" : "Cost"}</span><span className="text-nexus-green">0.001 OKB (~$0.09)</span></div>
                      <div className="flex justify-between"><span>{lang === "zh" ? "初始市值" : "Initial MCap"}</span><span className="text-white">~50 OKB (~$4,400)</span></div>
                      <div className="flex justify-between"><span>{lang === "zh" ? "收入" : "Revenue"}</span><span className="text-white">{lang === "zh" ? "1% 交易手续费" : "1% trading fees"}</span></div>
                    </div>

                    {launchLoading ? (
                      <div className="card text-center py-4">
                        <div className="animate-spin w-6 h-6 border-2 border-nexus-green border-t-transparent rounded-full mx-auto mb-2" />
                        <p className="text-sm text-nexus-green">{t.step} {launchStep} {t.of} {launchTotal}</p>
                      </div>
                    ) : (
                      <button onClick={handleLaunch} disabled={!launchName || !launchSymbol}
                        className="w-full py-3 rounded-xl font-semibold text-sm transition-all bg-nexus-green hover:bg-nexus-green/85 text-white disabled:opacity-40"
                        style={{ boxShadow: "0 4px 14px rgba(16,185,129,0.3)" }}>
                        {t.launchToken} &#x1F680;
                      </button>
                    )}
                  </div>

                  {/* ── My Tokens list ── */}
                  {launches.filter(l => l.status === "live").length > 0 && (
                    <div className="mt-8">
                      <h3 className="text-sm font-semibold text-nexus-muted mb-3">{lang === "zh" ? "我的代币" : "My Tokens"}</h3>
                      <div className="space-y-2">
                        {launches.filter(l => l.status === "live").map(l => (
                          <div key={l.id} className="card flex items-center gap-3">
                            <span className="w-2 h-2 rounded-full bg-nexus-green flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white">{l.symbol}</p>
                              <p className="text-[10px] font-mono text-nexus-muted truncate">{l.address}</p>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                              <a href={`https://app.uniswap.org/swap?chain=xlayer&outputCurrency=${l.address}`}
                                 target="_blank" rel="noreferrer"
                                 className="text-[10px] px-2 py-1 rounded-lg bg-nexus-accent/20 text-nexus-accent-light hover:bg-nexus-accent/30">
                                {lang === "zh" ? "交易" : "Trade"}
                              </a>
                              {l.tokenId && (
                                <button onClick={() => handleCollectFees(l.tokenId!)}
                                  className="text-[10px] px-2 py-1 rounded-lg bg-nexus-green/20 text-nexus-green hover:bg-nexus-green/30">
                                  {lang === "zh" ? "提取手续费" : "Collect"}
                                </button>
                              )}
                              <a href={`https://www.okx.com/web3/explorer/xlayer/address/${l.address}`}
                                 target="_blank" rel="noreferrer"
                                 className="text-[10px] px-2 py-1 rounded-lg bg-white/5 text-nexus-muted hover:bg-white/10">
                                {lang === "zh" ? "浏览器" : "Explorer"}
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── STRATEGY VIEW ── */}
        {activeView === "strategy" && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto">
              {activeStrategyId ? (
                /* Strategy detail */
                (() => {
                  const s = strategies.find(x => x.id === activeStrategyId);
                  if (!s) return null;
                  return (
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <h1 className="text-xl font-bold text-white flex-1">{s.name}</h1>
                        <button onClick={() => toggleStrategy(s.id)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium ${s.status === "running" ? "bg-nexus-green/15 text-nexus-green" : "bg-white/5 text-nexus-muted"}`}>
                          {s.status === "running" ? t.running : t.paused}
                        </button>
                        <button onClick={async () => {
                          try {
                            const resp = await fetch(`${GATEWAY}/strategies/${s.id}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: wallet }) });
                            if (resp.status === 402) { handle402(await resp.json(), () => {}); return; }
                            const data = await resp.json();
                            if (data.success) setStrategies(prev => prev.map(x => x.id === s.id ? { ...x, results: [data.result.summary, ...x.results] } : x));
                          } catch {}
                        }} className="px-3 py-1 rounded-lg text-xs font-medium bg-nexus-accent/15 text-nexus-accent-light hover:bg-nexus-accent/25">{t.runNow}</button>
                        <button onClick={() => {
                          const chatId = Date.now().toString();
                          const initMsg: ChatMessage = { role: "ai", text: lang === "zh"
                            ? `当前策略「${s.name}」的条件是：\n\n${s.description}\n\n你想怎么修改？告诉我你的需求，聊完后说「给我策略条件」，我会生成新的条件。`
                            : `Current strategy "${s.name}" conditions:\n\n${s.description}\n\nWhat would you like to change? When done, say 'give me the strategy' and I'll generate updated conditions.`
                          };
                          const newThread: ChatThread = { id: chatId, title: `${lang === "zh" ? "策略" : "Strategy"}-${s.name}`, messages: [initMsg], createdAt: Date.now() };
                          setChatThreads(prev => [newThread, ...prev]);
                          setActiveChatId(chatId);
                          setActiveView("chat");
                        }} className="px-3 py-1 rounded-lg text-xs font-medium bg-nexus-accent/15 text-nexus-accent-light hover:bg-nexus-accent/25">
                          {lang === "zh" ? "修改" : "Edit"}
                        </button>
                        <button onClick={() => deleteStrategy(s.id)} className="text-xs text-nexus-muted hover:text-red-400">{t.deleteStrategy}</button>
                      </div>
                      <div className="card mb-4">
                        <div className="text-xs text-nexus-muted mb-1">{t.strategyDesc}</div>
                        <p className="text-sm text-white">{s.description}</p>
                      </div>
                      {s.results.length > 0 && (
                        <div className="space-y-3">
                          {s.results.map((r, i) => (
                            <div key={i} className="card">
                              <div className="text-xs text-nexus-muted mb-1">Result #{i + 1}</div>
                              <div className="prose prose-invert prose-sm max-w-none prose-headings:text-white prose-strong:text-white">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{r}</ReactMarkdown>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                /* New strategy form */
                <>
                  <h1 className="text-xl font-bold text-white mb-1">{t.newStrategy}</h1>
                  <p className="text-nexus-muted text-sm mb-6">{t.strategyDesc}</p>

                  <div className="space-y-4">
                    <div className="card space-y-4">
                      <div>
                        <label className="block text-xs text-nexus-muted mb-1">{t.strategyName}</label>
                        <input type="text" className="input" placeholder={lang === "zh" ? "例如：低市值高潜力筛选" : "e.g. Low mcap gems"}
                          value={strategyName} onChange={e => setStrategyName(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs text-nexus-muted mb-1">{t.strategyDesc}</label>
                        <textarea className="input min-h-[100px]"
                          placeholder={lang === "zh" ? "例如：帮我找 X Layer 上市值低于 10 万、持仓人数大于 100 的代币" : "e.g. Find tokens on X Layer with mcap under $100k and more than 100 holders"}
                          value={strategyInput} onChange={e => setStrategyInput(e.target.value)} />
                      </div>
                    </div>
                    <button onClick={handleCreateStrategy} disabled={!strategyName || !strategyInput}
                      className="btn-primary w-full text-sm disabled:opacity-40">{t.saveStrategy}</button>
                  </div>

                  {/* AI Strategy Builder */}
                  <div className="mt-6 mb-4">
                    <button onClick={() => {
                      const name = strategyName || (lang === "zh" ? "新策略" : "New");
                      const chatId = Date.now().toString();
                      const initMsg: ChatMessage = { role: "ai", text: lang === "zh"
                        ? `你好！我来帮你制定「${name}」策略。\n\n请告诉我：\n1. 你想监控什么类型的代币？（meme币、蓝筹、新币等）\n2. 你关注哪些指标？（市值、交易量、持仓人数等）\n3. 有什么具体的筛选条件？\n\n聊完后说「给我策略条件」，我会生成可以直接使用的策略。`
                        : `Hi! I'll help you build the "${name}" strategy.\n\nTell me:\n1. What type of tokens? (meme, blue chip, new listings, etc.)\n2. What metrics matter? (mcap, volume, holders, etc.)\n3. Any specific filters?\n\nWhen ready, say 'give me the strategy' and I'll generate it.`
                      };
                      const newThread: ChatThread = { id: chatId, title: `${lang === "zh" ? "策略" : "Strategy"}-${name}`, messages: [initMsg], createdAt: Date.now() };
                      setChatThreads(prev => [newThread, ...prev]);
                      setActiveChatId(chatId);
                      setActiveView("chat");
                    }} className="w-full card !p-4 text-left hover:border-nexus-green/30 transition-colors border-dashed">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🤖</span>
                        <div>
                          <div className="text-sm text-white font-medium">{lang === "zh" ? "用 AgentNexus 制定策略" : "Build Strategy with AgentNexus"}</div>
                          <div className="text-[10px] text-nexus-muted">{lang === "zh" ? "通过对话让 AI 帮你生成策略条件" : "Chat with AI to generate strategy conditions"}</div>
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Strategy Templates */}
                  <div className="mt-2">
                    <div className="text-[10px] text-nexus-muted uppercase tracking-widest mb-3">
                      {lang === "zh" ? "快速模板" : "Quick Templates"}
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { name: lang === "zh" ? "低市值新币" : "Low Mcap Gems", desc: lang === "zh" ? "找X Layer上市值低于10万美元、持有人数大于50的代币" : "Find tokens on X Layer with mcap under $100k and more than 50 holders" },
                        { name: lang === "zh" ? "聪明钱跟踪" : "Smart Money Tracker", desc: lang === "zh" ? "监控聪明钱最近买入的代币，筛选买入金额大于500美元的" : "Track smart money buys over $500 on X Layer" },
                        { name: lang === "zh" ? "鲸鱼异动" : "Whale Alerts", desc: lang === "zh" ? "监控X Layer上大额转账和鲸鱼钱包异动" : "Monitor large transfers and whale wallet movements on X Layer" },
                        { name: lang === "zh" ? "Meme 热度监控" : "Meme Hype Monitor", desc: lang === "zh" ? "找X Layer上24小时交易量增长最快的meme代币" : "Find meme tokens with fastest 24h volume growth on X Layer" },
                      ].map((tpl, i) => (
                        <button key={i} onClick={() => { setStrategyName(tpl.name); setStrategyInput(tpl.desc); }}
                          className="card !p-3 text-left hover:border-nexus-accent/30 transition-colors">
                          <div className="text-xs text-white font-medium">{tpl.name}</div>
                          <div className="text-[10px] text-nexus-muted mt-0.5">{tpl.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── x402 Payment Modal ── */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card max-w-sm w-full !p-6 space-y-4">
            <div className="text-center">
              <div className="text-3xl mb-2">&#x26A1;</div>
              <h3 className="text-lg font-bold text-white">{t.paymentRequired}</h3>
              <p className="text-sm text-nexus-muted mt-1">{t.paymentDesc}</p>
            </div>

            <div className="bg-white/5 rounded-xl p-3 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-nexus-muted">Network</span><span className="text-white">X Layer</span></div>
              <div className="flex justify-between"><span className="text-nexus-muted">Payment</span><span className="text-white">1 USDC</span></div>
              <div className="flex justify-between"><span className="text-nexus-muted">{t.creditsLeft}</span><span className="text-nexus-green">+100</span></div>
              <div className="flex justify-between"><span className="text-nexus-muted">Protocol</span><span className="text-nexus-accent-light">x402</span></div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setShowPayment(false); setPendingRetry(null); }}
                className="btn-secondary flex-1 text-sm">{lang === "zh" ? "取消" : "Cancel"}</button>
              <button onClick={handleBuyCredits} disabled={paymentLoading || walletMode !== "okx"}
                className="btn-primary flex-1 text-sm disabled:opacity-40">
                {paymentLoading ? t.buying : t.buyCredits}
              </button>
            </div>

            {walletMode !== "okx" && (
              <p className="text-[10px] text-red-400 text-center">{t.needOKXWallet}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
