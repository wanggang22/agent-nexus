import { Bot } from "grammy";
import { env, getWalletAddress, isWalletReady, verifyBindCode } from "shared";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_TOKEN) {
  console.error("[TelegramBot] Missing TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

const GATEWAY_URL = env.GATEWAY_URL;
const SITE_URL = process.env.SITE_URL || "https://agent-nexus.up.railway.app";
const bot = new Bot(TELEGRAM_TOKEN);

const REGISTER_MSG = (site: string) =>
  `You need to register first:\n\n` +
  `1. Go to ${site}\n` +
  `2. Login with Twitter\n` +
  `3. Create wallet + set trading password\n` +
  `4. Click "Bind Telegram" → get a code\n` +
  `5. Come back here and send /verify CODE`;

// Session check via Gateway
async function checkSession(platform: string, userId: string): Promise<boolean> {
  try {
    const resp = await fetch(`${GATEWAY_URL}/session/check/${platform}/${userId}`, { signal: AbortSignal.timeout(3000) });
    const data = await resp.json() as any;
    return !!data.active;
  } catch { return false; }
}

// Trade execution via Gateway session
async function executeTrade(ctx: any, tradeData: any, userId: string) {
  await ctx.replyWithChatAction("typing");
  try {
    const resp = await fetch(`${GATEWAY_URL}/trade/sign-and-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...tradeData,
        platform: "telegram",
        user_id: userId,
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

// /start
bot.command("start", async (ctx) => {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  if (isWalletReady("telegram", userId)) {
    const address = getWalletAddress("telegram", userId);
    await ctx.reply(
      `Welcome back!\n\n` +
      `Wallet: \`${address}\`\n\n` +
      "Just send a message:\n" +
      '• "分析下ETH"\n' +
      '• "帮我换1 OKB到USDT"\n' +
      '• "聪明钱在买什么"\n\n' +
      "Wallet is managed on the website. Unlock there to trade here.",
      { parse_mode: "Markdown" }
    );
  } else {
    await ctx.reply(REGISTER_MSG(SITE_URL));
  }
});

// /verify CODE — bind Telegram to website wallet
bot.command("verify", async (ctx) => {
  if (ctx.chat?.type !== "private") {
    await ctx.reply("⚠️ /verify only works in private chat.");
    return;
  }
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  const code = ctx.match?.trim();
  if (!code || code.length < 4) {
    await ctx.reply("Usage: /verify ABC123");
    return;
  }

  const result = verifyBindCode(code, userId, "telegram");
  if (result.success) {
    await ctx.reply(
      `✅ Wallet linked!\n\n` +
      `Address: \`${result.address}\`\n\n` +
      `Unlock your wallet on the website, then trade here directly.`,
      { parse_mode: "Markdown" }
    );
  } else {
    await ctx.reply(`❌ ${result.error}`);
  }
});

// /wallet
bot.command("wallet", async (ctx) => {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  const address = getWalletAddress("telegram", userId);
  if (!address) {
    await ctx.reply(REGISTER_MSG(SITE_URL));
    return;
  }

  const active = await checkSession("telegram", userId);
  await ctx.reply(
    `💰 *Your Wallet*\n\n` +
    `\`${address}\`\n` +
    `Network: X Layer (Chain ID: 196)\n` +
    `Status: ${active ? "🔓 Unlocked" : "🔒 Locked — unlock on website"}`,
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

// All messages → chat
bot.on("message:text", async (ctx) => {
  if (ctx.chat?.type !== "private") return;

  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  // Not registered
  if (!isWalletReady("telegram", userId)) {
    await ctx.reply(REGISTER_MSG(SITE_URL));
    return;
  }

  await ctx.replyWithChatAction("typing");

  try {
    const resp = await fetch(`${GATEWAY_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: ctx.message.text,
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

    // Trade needs session
    const tradeResult = data.results?.find((r: any) => r.data?.needs_confirmation);
    if (tradeResult) {
      const active = await checkSession("telegram", userId);
      if (active) {
        await executeTrade(ctx, tradeResult.data.trade_params, userId);
        return;
      }
      await ctx.reply(
        `📋 *Trade Preview*\n\n` +
        `${tradeResult.data.summary || "Ready to execute"}\n\n` +
        `🔒 Wallet locked. Unlock on the website first:\n${SITE_URL}`,
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
    console.log(`   Register: ${SITE_URL}\n`);
  },
});

const shutdown = () => { console.log("\n[TelegramBot] Shutting down..."); bot.stop(); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
