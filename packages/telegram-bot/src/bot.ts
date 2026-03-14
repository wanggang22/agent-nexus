import { Bot } from "grammy";
import { env } from "shared";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_TOKEN) {
  console.error("[TelegramBot] Missing TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

const GATEWAY_URL = env.GATEWAY_URL;
const bot = new Bot(TELEGRAM_TOKEN);

// /start command — auto-create wallet
bot.command("start", async (ctx) => {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  try {
    const resp = await fetch(`${GATEWAY_URL}/wallet/telegram/${userId}`, { signal: AbortSignal.timeout(5000) });
    const wallet = await resp.json() as any;

    await ctx.reply(
      "👋 Welcome to AgentNexus!\n\n" +
      `💰 Your X Layer Wallet:\n\`${wallet.address}\`\n\n` +
      (wallet.is_new
        ? "⚠️ This is a new wallet. Deposit OKB (for gas) and tokens to start trading.\n\n"
        : "✅ Wallet loaded.\n\n") +
      "Just send me a message:\n" +
      '• "分析下ETH" — basic analysis (free)\n' +
      '• "深度分析ETH" — deep AI analysis (paid)\n' +
      '• "这个币安全吗 0x1234..." — safety check\n' +
      '• "帮我用1 OKB换USDT" — swap tokens\n' +
      '• "最近聪明钱在买什么" — smart money signals\n\n' +
      "Commands:\n" +
      "/wallet — Show your wallet address\n" +
      "/services — List all services\n" +
      "/stats — Platform statistics",
      { parse_mode: "Markdown" }
    );
  } catch {
    await ctx.reply(
      "👋 Welcome to AgentNexus! Gateway is offline — try again later."
    );
  }
});

// /wallet command
bot.command("wallet", async (ctx) => {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  try {
    const resp = await fetch(`${GATEWAY_URL}/wallet/telegram/${userId}`, { signal: AbortSignal.timeout(5000) });
    const wallet = await resp.json() as any;

    await ctx.reply(
      `💰 *Your X Layer Wallet*\n\n` +
      `Address: \`${wallet.address}\`\n\n` +
      `Deposit OKB (gas) and tokens to this address to trade.\n` +
      `Network: X Layer Mainnet (Chain ID: 196)`,
      { parse_mode: "Markdown" }
    );
  } catch {
    await ctx.reply("❌ Gateway is offline.");
  }
});

// /services command
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

// /stats command
bot.command("stats", async (ctx) => {
  try {
    const resp = await fetch(`${GATEWAY_URL}/stats`, { signal: AbortSignal.timeout(5000) });
    const data = await resp.json() as any;
    await ctx.reply(
      `📊 *AgentNexus Stats*\n\n` +
      `Total calls: ${data.total_calls}\n` +
      `Revenue: $${data.total_revenue_usd}\n` +
      `Uptime: ${Math.floor(data.uptime_seconds / 60)} min`,
      { parse_mode: "Markdown" }
    );
  } catch {
    await ctx.reply("❌ Gateway is offline.");
  }
});

// All other messages → forward to /chat with user identity
bot.on("message:text", async (ctx) => {
  const message = ctx.message.text;
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  await ctx.replyWithChatAction("typing");

  try {
    const resp = await fetch(`${GATEWAY_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
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

    let reply = data.reply || "No response from agents.";

    if (data.tokens_resolved && Object.keys(data.tokens_resolved).length > 0) {
      const resolved = Object.entries(data.tokens_resolved)
        .map(([sym, addr]) => `${sym} → \`${(addr as string).slice(0, 10)}...\``)
        .join(", ");
      reply += `\n\n🔗 ${resolved}`;
    }

    if (data.calls_made && data.calls_made.length > 0) {
      reply += `\n\n⚡ ${data.calls_made.join(" | ")}`;
    }

    if (reply.length > 4000) {
      reply = reply.slice(0, 3997) + "...";
    }

    await ctx.reply(reply);
  } catch (e: any) {
    if (e.name === "TimeoutError") {
      await ctx.reply("⏳ Analysis is taking longer than expected. Please try again.");
    } else {
      await ctx.reply(`❌ Error: ${e.message}`);
    }
  }
});

// Start bot
bot.start({
  onStart: (botInfo) => {
    console.log(`\n🤖 AgentNexus Telegram Bot running`);
    console.log(`   Bot: @${botInfo.username}`);
    console.log(`   Gateway: ${GATEWAY_URL}`);
    console.log(`   Send any message to start!\n`);
  },
});

const shutdown = () => {
  console.log("\n[TelegramBot] Shutting down...");
  bot.stop();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
