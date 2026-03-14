import { Bot } from "grammy";
import {
  env, createWallet, confirmWallet, unlockWallet,
  getWalletAddress, isWalletReady, isWalletPending,
  generateBindCode,
} from "shared";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_TOKEN) {
  console.error("[TelegramBot] Missing TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

const GATEWAY_URL = env.GATEWAY_URL;
const SESSION_TTL = 60 * 60 * 1000; // 1 hour
const bot = new Bot(TELEGRAM_TOKEN);

// Track users waiting for password input
const waitingFor = new Map<string, {
  state: "set_password" | "confirm_trade" | "export";
  tradeData?: any;
}>();

// Unlocked sessions — decrypted key in memory with expiry
const sessions = new Map<string, {
  privateKey: string;
  address: string;
  expiry: number;
}>();

function getSession(userId: string): { privateKey: string; address: string } | null {
  const s = sessions.get(userId);
  if (!s) return null;
  if (Date.now() > s.expiry) {
    sessions.delete(userId);
    return null;
  }
  // Refresh TTL on each use
  s.expiry = Date.now() + SESSION_TTL;
  return { privateKey: s.privateKey, address: s.address };
}

function setSession(userId: string, privateKey: string, address: string) {
  sessions.set(userId, { privateKey, address, expiry: Date.now() + SESSION_TTL });
}

function clearSession(userId: string) {
  sessions.delete(userId);
}

// Auto-cleanup expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) {
    if (now > v.expiry) sessions.delete(k);
  }
}, 5 * 60 * 1000);

// ── Trade execution helper ──
async function executeTradeFn(ctx: any, tradeData: any, session: { privateKey: string; address: string }) {
  await ctx.replyWithChatAction("typing");
  try {
    const { from_token, to_token, amount, chain, slippage } = tradeData;
    const resp = await fetch(`${GATEWAY_URL}/trade/sign-and-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from_token, to_token, amount, chain, slippage,
        wallet_address: session.address,
        private_key: session.privateKey,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const result = await resp.json() as any;

    if (result.success) {
      await ctx.reply(
        `✅ Trade executed!\n\n` +
        `TX: \`${result.tx_hash}\`\n` +
        `Wallet: \`${result.wallet}\`\n` +
        (result.slippage ? `Slippage: ${result.slippage}\n` : "") +
        `\n🔗 ${result.explorer}`,
        { parse_mode: "Markdown" }
      );
    } else {
      await ctx.reply(`❌ Trade failed: ${result.error}`);
    }
  } catch (e: any) {
    await ctx.reply(`❌ Error: ${e.message}`);
  }
}

// /start — create wallet, ask for password
bot.command("start", async (ctx) => {
  if (ctx.chat?.type !== "private") {
    await ctx.reply("Please use this bot in private chat.");
    return;
  }

  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  const wallet = createWallet("telegram", userId);

  if (!wallet.isNew) {
    // Already confirmed
    await ctx.reply(
      `Welcome back!\n\n` +
      `Your wallet: \`${wallet.address}\`\n\n` +
      "Send me a message to get started:\n" +
      '• "分析下ETH"\n' +
      '• "帮我用1 OKB换USDT"\n' +
      '• "聪明钱在买什么"\n\n' +
      "/wallet — Your address\n" +
      "/unlock — Unlock wallet (1 hour session)\n" +
      "/lock — Lock wallet immediately\n" +
      "/export — Export private key\n" +
      "/services — All services",
      { parse_mode: "Markdown" }
    );
    return;
  }

  // New wallet — need password
  waitingFor.set(userId, { state: "set_password" });
  await ctx.reply(
    `🔐 Your new X Layer wallet:\n\`${wallet.address}\`\n\n` +
    "Please set a *trading password* (min 6 chars).\n" +
    "This password encrypts your private key — without it, nobody (including us) can access your funds.\n\n" +
    "⚠️ *Remember this password! It cannot be recovered.*\n\n" +
    "Type your password now:",
    { parse_mode: "Markdown" }
  );
});

// /wallet — show address
bot.command("wallet", async (ctx) => {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  const address = getWalletAddress("telegram", userId);
  if (!address) {
    await ctx.reply("No wallet found. Use /start to create one.");
    return;
  }

  await ctx.reply(
    `💰 *Your X Layer Wallet*\n\n` +
    `\`${address}\`\n\n` +
    `Network: X Layer Mainnet (Chain ID: 196)\n` +
    `Deposit OKB (for gas) and tokens to trade.`,
    { parse_mode: "Markdown" }
  );
});

// /unlock — unlock wallet for 1 hourutes
bot.command("unlock", async (ctx) => {
  if (ctx.chat?.type !== "private") {
    await ctx.reply("⚠️ /unlock only works in private chat.");
    return;
  }
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  if (!isWalletReady("telegram", userId)) {
    await ctx.reply("No wallet. Use /start first.");
    return;
  }

  if (getSession(userId)) {
    await ctx.reply("🔓 Already unlocked. Session refreshed (1 hour).");
    return;
  }

  waitingFor.set(userId, { state: "confirm_trade" });
  await ctx.reply("🔐 Enter your trading password to unlock (1 hour session):");
});

// /lock — immediately lock wallet
bot.command("lock", async (ctx) => {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;
  clearSession(userId);
  await ctx.reply("🔒 Wallet locked. Use /unlock to unlock again.");
});

// /export — export private key (requires password)
bot.command("export", async (ctx) => {
  if (ctx.chat?.type !== "private") {
    await ctx.reply("⚠️ /export only works in private chat.");
    return;
  }

  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  if (!isWalletReady("telegram", userId)) {
    await ctx.reply("No wallet found. Use /start to create one.");
    return;
  }

  waitingFor.set(userId, { state: "export" });
  await ctx.reply("🔐 Enter your trading password to export your private key:");
});

// /bindtwitter — link Twitter account to this wallet
bot.command("bindtwitter", async (ctx) => {
  if (ctx.chat?.type !== "private") {
    await ctx.reply("⚠️ /bindtwitter only works in private chat.");
    return;
  }
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  if (!isWalletReady("telegram", userId)) {
    await ctx.reply("No wallet. Use /start first.");
    return;
  }

  const code = generateBindCode(userId);
  await ctx.reply(
    `🐦 *Bind Twitter Account*\n\n` +
    `Tweet or reply to @AgentNexus with:\n\n` +
    `\`@AgentNexus verify ${code}\`\n\n` +
    `⏰ Code expires in 5 minutes\n` +
    `✅ One-time use — code is deleted after binding`,
    { parse_mode: "Markdown" }
  );
});

// /services
bot.command("services", async (ctx) => {
  try {
    const resp = await fetch(`${GATEWAY_URL}/services`, { signal: AbortSignal.timeout(5000) });
    const data = await resp.json() as any;
    let text = "📋 *AgentNexus Services*\n\n";
    for (const agent of data.agents || []) {
      text += `*${agent.name}*\n`;
      for (const svc of agent.services || []) {
        text += `  \`${svc.method} ${svc.route}\` ${svc.price}\n`;
      }
      text += "\n";
    }
    await ctx.reply(text, { parse_mode: "Markdown" });
  } catch {
    await ctx.reply("❌ Gateway is offline.");
  }
});

// /stats
bot.command("stats", async (ctx) => {
  try {
    const resp = await fetch(`${GATEWAY_URL}/stats`, { signal: AbortSignal.timeout(5000) });
    const data = await resp.json() as any;
    await ctx.reply(
      `📊 *Stats*\n\nCalls: ${data.total_calls}\nRevenue: $${data.total_revenue_usd}\nUptime: ${Math.floor(data.uptime_seconds / 60)} min`,
      { parse_mode: "Markdown" }
    );
  } catch {
    await ctx.reply("❌ Gateway is offline.");
  }
});

// All text messages
bot.on("message:text", async (ctx) => {
  if (ctx.chat?.type !== "private") return;

  const userId = ctx.from?.id?.toString();
  if (!userId) return;
  const text = ctx.message.text;

  const waiting = waitingFor.get(userId);

  // ── Handle password input for wallet setup ──
  if (waiting?.state === "set_password") {
    waitingFor.delete(userId);

    const result = confirmWallet("telegram", userId, text);
    if (!result.success) {
      // Re-prompt
      waitingFor.set(userId, { state: "set_password" });
      await ctx.reply(`❌ ${result.error}\n\nPlease try again:`);
      return;
    }

    // Delete the password message for security
    try { await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch {}

    const address = getWalletAddress("telegram", userId);
    await ctx.reply(
      `✅ Wallet secured!\n\n` +
      `Address: \`${address}\`\n\n` +
      `Your private key is now encrypted with your password.\n` +
      `Nobody — not even us — can access it without your password.\n\n` +
      `Deposit OKB to \`${address}\` and start trading!`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // ── Handle password for unlock / trade confirmation ──
  if (waiting?.state === "confirm_trade") {
    waitingFor.delete(userId);

    // Delete the password message
    try { await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch {}

    // If no trade data, this is a /unlock request
    if (!waiting.tradeData) {
      const unlocked = unlockWallet("telegram", userId, text);
      if (!unlocked) {
        await ctx.reply("❌ Wrong password.");
        return;
      }
      setSession(userId, unlocked.privateKey, unlocked.address);
      await ctx.reply("🔓 Wallet unlocked for 1 hourutes. You can now trade without entering password.\n\nUse /lock to lock immediately.");
      return;
    }

    // Has trade data — unlock + execute
    let session = getSession(userId);
    if (!session) {
      const unlocked = unlockWallet("telegram", userId, text);
      if (!unlocked) {
        await ctx.reply("❌ Wrong password. Trade cancelled.");
        return;
      }
      setSession(userId, unlocked.privateKey, unlocked.address);
      session = { privateKey: unlocked.privateKey, address: unlocked.address };
    }

    await executeTradeFn(ctx, waiting.tradeData, session);
    return;
  }

  // ── Handle password for export ──
  if (waiting?.state === "export") {
    waitingFor.delete(userId);

    const unlocked = unlockWallet("telegram", userId, text);

    // Delete the password message
    try { await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch {}

    if (!unlocked) {
      await ctx.reply("❌ Wrong password.");
      return;
    }

    await ctx.reply(
      "🔐 *Your Private Key*\n\n" +
      `\`${unlocked.privateKey}\`\n\n` +
      `Address: \`${unlocked.address}\`\n` +
      `Network: X Layer (Chain ID: 196)\n\n` +
      "⚠️ Import into OKX Wallet or MetaMask.\n" +
      "⚠️ Delete this message after saving!",
      { parse_mode: "Markdown" }
    );
    return;
  }

  // ── Regular message → chat with AgentNexus ──
  if (!isWalletReady("telegram", userId)) {
    if (isWalletPending("telegram", userId)) {
      waitingFor.set(userId, { state: "set_password" });
      await ctx.reply("Please set your trading password first (min 6 chars):");
      return;
    }
    await ctx.reply("Use /start to create your wallet first.");
    return;
  }

  await ctx.replyWithChatAction("typing");

  try {
    const resp = await fetch(`${GATEWAY_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        platform: "telegram",
        user_id: userId,
      }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await resp.json() as any;

    if (data.error) {
      await ctx.reply(`❌ ${data.error}`);
      return;
    }

    // Check if a trade execution was attempted — need password confirmation
    const hasTradeCall = data.calls_made?.some((c: string) =>
      c.toLowerCase().includes("execute") || c.toLowerCase().includes("swap")
    );
    const tradeResult = data.results?.find((r: any) =>
      r.service?.toLowerCase().includes("execute") || r.service?.toLowerCase().includes("swap")
    );

    if (hasTradeCall && tradeResult?.data?.needs_confirmation) {
      const session = getSession(userId);

      if (session) {
        // Session active — execute immediately, no password needed
        await executeTradeFn(ctx, tradeResult.data.trade_params, session);
        return;
      }

      // No session — ask for password
      waitingFor.set(userId, {
        state: "confirm_trade",
        tradeData: tradeResult.data.trade_params,
      });
      await ctx.reply(
        `📋 *Trade Preview*\n\n` +
        `${tradeResult.data.summary || "Ready to execute"}\n\n` +
        `🔐 Enter your trading password to confirm:\n` +
        `(or /unlock first for 15-min password-free trading)`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    // Regular response
    let reply = data.reply || "No response.";

    if (data.tokens_resolved && Object.keys(data.tokens_resolved).length > 0) {
      const resolved = Object.entries(data.tokens_resolved)
        .map(([sym, addr]) => `${sym} → \`${(addr as string).slice(0, 10)}...\``)
        .join(", ");
      reply += `\n\n🔗 ${resolved}`;
    }

    if (data.calls_made?.length > 0) {
      reply += `\n\n⚡ ${data.calls_made.join(" | ")}`;
    }

    if (reply.length > 4000) reply = reply.slice(0, 3997) + "...";

    await ctx.reply(reply);
  } catch (e: any) {
    if (e.name === "TimeoutError") {
      await ctx.reply("⏳ Taking too long. Try again.");
    } else {
      await ctx.reply(`❌ ${e.message}`);
    }
  }
});

bot.start({
  onStart: (botInfo) => {
    console.log(`\n🤖 AgentNexus Telegram Bot running`);
    console.log(`   Bot: @${botInfo.username}`);
    console.log(`   Gateway: ${GATEWAY_URL}`);
    console.log(`   Wallet security: AES-256-GCM encrypted\n`);
  },
});

const shutdown = () => { console.log("\n[TelegramBot] Shutting down..."); bot.stop(); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
