import { TwitterApi } from "twitter-api-v2";
import { env, verifyBindCode, getLinkedWallet, getLinkedTelegramId } from "shared";

const TWITTER_APP_KEY = process.env.TWITTER_APP_KEY || "";
const TWITTER_APP_SECRET = process.env.TWITTER_APP_SECRET || "";
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN || "";
const TWITTER_ACCESS_SECRET = process.env.TWITTER_ACCESS_SECRET || "";
const GATEWAY_URL = env.GATEWAY_URL;
const SITE_URL = process.env.SITE_URL || "https://agent-nexus.up.railway.app";
const POLL_INTERVAL = 30_000;

if (!TWITTER_APP_KEY || !TWITTER_APP_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_SECRET) {
  console.error("[TwitterBot] Missing Twitter API credentials");
  process.exit(1);
}

const client = new TwitterApi({
  appKey: TWITTER_APP_KEY,
  appSecret: TWITTER_APP_SECRET,
  accessToken: TWITTER_ACCESS_TOKEN,
  accessSecret: TWITTER_ACCESS_SECRET,
});

let lastMentionId: string | undefined;
const repliedTweets = new Set<string>();

async function askAgentNexus(message: string, authorId?: string): Promise<string> {
  try {
    const resp = await fetch(`${GATEWAY_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, platform: "twitter", user_id: authorId }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await resp.json() as any;
    if (data.error) return `Error: ${data.error}`;
    return data.reply || "No response.";
  } catch (e: any) {
    return `Service unavailable: ${e.message}`;
  }
}

function splitForTweets(text: string, maxLen = 270): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    const isLast = remaining.length <= maxLen;
    const chunkSize = isLast ? remaining.length : maxLen - 6;
    let breakAt = chunkSize;
    if (!isLast) {
      const best = Math.max(
        remaining.lastIndexOf("。", chunkSize),
        remaining.lastIndexOf(". ", chunkSize),
        remaining.lastIndexOf("\n", chunkSize)
      );
      if (best > chunkSize * 0.5) breakAt = best + 1;
    }
    chunks.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (chunks.length > 1) {
    return chunks.map((c, i) => `${c} (${i + 1}/${chunks.length})`);
  }
  return chunks;
}

/** Strip markdown for Twitter — tables, headers, bold etc don't render */
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, "")           // headers
    .replace(/\*\*(.*?)\*\*/g, "$1")     // bold
    .replace(/\*(.*?)\*/g, "$1")         // italic
    .replace(/\|[^\n]*\|/g, "")          // table rows
    .replace(/\|-+\|/g, "")             // table separators
    .replace(/```[^`]*```/g, "")         // code blocks
    .replace(/`([^`]*)`/g, "$1")         // inline code
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links
    .replace(/\n{3,}/g, "\n\n")          // excessive newlines
    .trim();
}

async function replyToTweet(tweetId: string, text: string) {
  const chunks = splitForTweets(stripMarkdown(text));
  let replyTo = tweetId;
  for (const chunk of chunks) {
    try {
      const posted = await client.v2.tweet({ text: chunk, reply: { in_reply_to_tweet_id: replyTo } });
      replyTo = posted.data.id;
    } catch (e: any) {
      console.error(`[TwitterBot] Failed to reply: ${e.message}`, e.data ? JSON.stringify(e.data) : "", e.code || "");
      break;
    }
  }
}

let botUserId: string | undefined;
let botUsername: string | undefined;

async function pollMentions() {
  try {
    if (!botUserId) {
      const me = await client.v2.me();
      botUserId = me.data.id;
      botUsername = me.data.username;

      // On first poll after restart, skip old mentions by fetching and marking latest
      if (!lastMentionId) {
        try {
          const latest = await client.v2.userMentionTimeline(botUserId, { max_results: 5, "tweet.fields": ["author_id"] });
          if (latest.data?.data?.length) {
            lastMentionId = latest.data.data[0].id;
            console.log(`[TwitterBot] Skipping old mentions, starting from ${lastMentionId}`);
          }
        } catch {}
        return; // Skip this poll cycle, start fresh next time
      }
    }

    const params: any = {
      max_results: 10,
      "tweet.fields": ["author_id", "created_at", "text"],
    };
    if (lastMentionId) params.since_id = lastMentionId;

    const mentions = await client.v2.userMentionTimeline(botUserId, params);
    if (!mentions.data?.data?.length) return;

    const tweets = [...mentions.data.data].reverse();

    for (const tweet of tweets) {
      if (repliedTweets.has(tweet.id)) continue;
      if (tweet.author_id === botUserId) continue;

      const message = tweet.text.replace(new RegExp(`@${botUsername}\\b`, "gi"), "").trim();
      if (!message) continue;

      console.log(`[TwitterBot] "${message.slice(0, 50)}..." (${tweet.id})`);

      // Handle verify — bind Twitter to website wallet
      const verifyMatch = message.match(/^verify\s+([A-Z0-9]{6})$/i);
      if (verifyMatch) {
        const result = verifyBindCode(verifyMatch[1], tweet.author_id!, "twitter");
        if (result.success) {
          await replyToTweet(tweet.id, `✅ Wallet linked: ${result.address?.slice(0, 10)}...\n\nUnlock at ${SITE_URL} then trade here!`);
        } else {
          await replyToTweet(tweet.id, `❌ ${result.error}. Get a new code at ${SITE_URL}`);
        }
        repliedTweets.add(tweet.id);
        lastMentionId = tweet.id;
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      // Launch requests → redirect to Dashboard
      const isLaunchRequest = /launch|deploy|create token|发币|发射|创建代币|发一个|发个币|造币|mint/i.test(message);
      if (isLaunchRequest) {
        await replyToTweet(tweet.id, `Token launch requires OKX Wallet signing. Please use our Dashboard:\n\n${SITE_URL}\n\nConnect OKX Wallet → Launch tab → fill in token name and symbol → done!`);
        repliedTweets.add(tweet.id);
        lastMentionId = tweet.id;
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      // Trade requests → check session, execute or redirect
      const isTradeRequest = /swap|buy|sell|trade|换|买|卖/i.test(message);
      if (isTradeRequest) {
        const wallet = getLinkedWallet(tweet.author_id!);
        if (!wallet) {
          await replyToTweet(tweet.id, `Register first at ${SITE_URL} (Twitter login → create wallet → bind)`);
        } else {
          // Check session
          let active = false;
          try {
            const resp = await fetch(`${GATEWAY_URL}/session/check/twitter/${tweet.author_id}`, { signal: AbortSignal.timeout(3000) });
            const data = await resp.json() as any;
            active = !!data.active;
          } catch {}

          if (active) {
            const response = await askAgentNexus(message, tweet.author_id);
            await replyToTweet(tweet.id, response);
          } else {
            await replyToTweet(tweet.id, `Wallet locked. Unlock at ${SITE_URL} first, then tweet again.`);
          }
        }
        repliedTweets.add(tweet.id);
        lastMentionId = tweet.id;
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      // Analysis/signals — free, no wallet needed
      const response = await askAgentNexus(message, tweet.author_id);
      await replyToTweet(tweet.id, response);

      repliedTweets.add(tweet.id);
      lastMentionId = tweet.id;
      if (repliedTweets.size > 5000) {
        const first = repliedTweets.values().next().value;
        if (first) repliedTweets.delete(first);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  } catch (e: any) {
    if (e.code === 429 || e.message?.includes("429")) {
      console.warn("[TwitterBot] Rate limited, waiting 60s...");
      await new Promise((r) => setTimeout(r, 60000));
    } else {
      console.error(`[TwitterBot] Poll error: ${e.message}`);
    }
  }
}

// ── Manual trigger HTTP server ──
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// POST /reply — manually trigger reply to a tweet
// Body: { tweet_id: "123", message?: "custom question" }
app.post("/reply", async (req, res) => {
  const { tweet_id, message } = req.body;
  if (!tweet_id) return res.status(400).json({ error: "tweet_id required" });
  try {
    // If no message provided, fetch the tweet text
    let question = message;
    if (!question) {
      try {
        const tweet = await client.v2.singleTweet(tweet_id, { "tweet.fields": ["text", "author_id"] });
        question = tweet.data.text.replace(/@\w+/g, "").trim();
      } catch {
        question = "分析当前市场趋势";
      }
    }
    const response = await askAgentNexus(question);
    await replyToTweet(tweet_id, response);
    res.json({ success: true, reply: response.slice(0, 200) });
  } catch (e: any) {
    res.json({ success: false, error: e.message });
  }
});

// POST /tweet — post a standalone tweet
app.post("/tweet", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });
  try {
    const posted = await client.v2.tweet(text);
    res.json({ success: true, tweet_id: posted.data.id });
  } catch (e: any) {
    res.json({ success: false, error: e.message });
  }
});

// POST /analyze-and-tweet — ask AI a question and post the answer as a tweet
app.post("/analyze-and-tweet", async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: "question required" });
  try {
    const response = await askAgentNexus(question);
    const tweetText = response.length > 270 ? response.slice(0, 267) + "..." : response;
    const posted = await client.v2.tweet(tweetText);
    res.json({ success: true, tweet_id: posted.data.id, reply: response.slice(0, 200) });
  } catch (e: any) {
    res.json({ success: false, error: e.message });
  }
});

app.get("/health", (_req, res) => {
  res.json({ bot: "twitter", status: "online" });
});

// ── Filtered Stream: auto-reply to mentions (free tier, 1 rule) ──
async function setupStream(myUsername: string, myId: string) {
  try {
    // Delete existing rules
    const existingRules = await client.v2.streamRules();
    if (existingRules.data?.length) {
      await client.v2.updateStreamRules({
        delete: { ids: existingRules.data.map(r => r.id) },
      });
    }

    // Add rule to match mentions of our bot
    await client.v2.updateStreamRules({
      add: [{ value: `@${myUsername}`, tag: "mentions" }],
    });
    console.log(`[TwitterBot] Stream rule set: @${myUsername}`);

    // Connect to stream
    const stream = await client.v2.searchStream({
      "tweet.fields": ["author_id", "text", "conversation_id"],
    });

    stream.autoReconnect = true;
    stream.autoReconnectRetries = Infinity;

    stream.on("data", async (event: any) => {
      const tweet = event.data;
      if (!tweet || tweet.author_id === myId) return;
      if (repliedTweets.has(tweet.id)) return;

      const message = tweet.text.replace(new RegExp(`@${myUsername}\\b`, "gi"), "").trim();
      if (!message) return;

      console.log(`[TwitterBot] Stream: "${message.slice(0, 50)}..." (${tweet.id})`);

      try {
        const response = await askAgentNexus(message, tweet.author_id);
        await replyToTweet(tweet.id, response);
        repliedTweets.add(tweet.id);
        console.log(`[TwitterBot] Replied to ${tweet.id}`);
      } catch (e: any) {
        console.error(`[TwitterBot] Reply failed: ${e.message}`);
      }
    });

    stream.on("error", (err: any) => {
      console.error(`[TwitterBot] Stream error: ${err.message}`);
    });

    console.log("[TwitterBot] Filtered stream connected — listening for mentions...");
  } catch (e: any) {
    console.error(`[TwitterBot] Stream setup failed: ${e.message}`);
    // Fallback to polling (will also fail on free tier)
    console.log("[TwitterBot] Falling back to polling...");
    setInterval(pollMentions, POLL_INTERVAL);
  }
}

async function main() {
  let myUsername = "AgentNexus_AI";
  let myId = "";
  try {
    const me = await client.v2.me();
    myUsername = me.data.username;
    myId = me.data.id;
    console.log(`\n🐦 AgentNexus Twitter Bot running`);
    console.log(`   Account: @${myUsername}`);
    console.log(`   Gateway: ${GATEWAY_URL}`);
    console.log(`   Register: ${SITE_URL}`);
    console.log(`   Manual: POST /reply, /tweet, /analyze-and-tweet\n`);
  } catch (e: any) {
    console.error(`[TwitterBot] Auth failed: ${e.message}`);
    process.exit(1);
  }

  const PORT = parseInt(process.env.PORT || "8080");
  app.listen(PORT, () => console.log(`   HTTP server on :${PORT}\n`));

  // Use Filtered Stream (free tier supports 1 rule) instead of polling
  await setupStream(myUsername, myId);
}

main();

process.on("SIGTERM", () => { console.log("\n[TwitterBot] Shutting down..."); process.exit(0); });
process.on("SIGINT", () => { console.log("\n[TwitterBot] Shutting down..."); process.exit(0); });
