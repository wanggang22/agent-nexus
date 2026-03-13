import { Bot } from "grammy";
import { env } from "shared";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_TOKEN) {
  console.error("[TelegramBot] Missing TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

const GATEWAY_URL = env.GATEWAY_URL;
const bot = new Bot(TELEGRAM_TOKEN);

// /start command
bot.command("start", (ctx) =>
  ctx.reply(
    "👋 Welcome to AgentNexus!\n\n" +
    "I'm your AI crypto trading assistant on X Layer.\n\n" +
    "Just send me a message, for example:\n" +
    '• "分析下ETH"\n' +
    '• "这个币安全吗 0x1234..."\n' +
    '• "最近聪明钱在买什么"\n' +
    '• "trending tokens"\n' +
    '• "full analysis on OKB"\n\n' +
    "Commands:\n" +
    "/start — This help message\n" +
    "/services — List all available services\n" +
    "/stats — Platform statistics"
  )
);

// /services command
bot.command("services", async (ctx) => {
  try {
    const resp = await fetch(`${GATEWAY_URL}/services`, { signal: AbortSignal.timeout(5000) });
    const data = await resp.json() as any;
    let text = "📋 *AgentNexus Services*\n\n";
    for (const agent of data.agents || []) {
      text += `*${agent.name}* — ${agent.description}\n`;
      for (const svc of agent.services || []) {
        text += `  \`${svc.method} ${svc.route}\` ${svc.price}\n`;
      }
      text += "\n";
    }
    await ctx.reply(text, { parse_mode: "Markdown" });
  } catch {
    await ctx.reply("❌ Gateway is offline. Make sure AgentNexus is running.");
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

// All other messages → forward to /chat
bot.on("message:text", async (ctx) => {
  const message = ctx.message.text;

  // Show typing indicator
  await ctx.replyWithChatAction("typing");

  try {
    const resp = await fetch(`${GATEWAY_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await resp.json() as any;

    if (data.error) {
      await ctx.reply(`❌ ${data.error}`);
      return;
    }

    // Send the AI summary
    let reply = data.reply || "No response from agents.";

    // Add token resolution info if any
    if (data.tokens_resolved && Object.keys(data.tokens_resolved).length > 0) {
      const resolved = Object.entries(data.tokens_resolved)
        .map(([sym, addr]) => `${sym} → \`${(addr as string).slice(0, 10)}...\``)
        .join(", ");
      reply += `\n\n🔗 ${resolved}`;
    }

    // Add what services were called
    if (data.calls_made && data.calls_made.length > 0) {
      reply += `\n\n⚡ ${data.calls_made.join(" | ")}`;
    }

    // Telegram message limit is 4096 chars
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

// Graceful shutdown
const shutdown = () => {
  console.log("\n[TelegramBot] Shutting down...");
  bot.stop();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
