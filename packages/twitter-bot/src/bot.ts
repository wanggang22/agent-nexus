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

async function replyToTweet(tweetId: string, text: string) {
  const chunks = splitForTweets(text);
  let replyTo = tweetId;
  for (const chunk of chunks) {
    try {
      const posted = await client.v2.reply(chunk, replyTo);
      replyTo = posted.data.id;
    } catch (e: any) {
      console.error(`[TwitterBot] Failed to reply: ${e.message}`);
      break;
    }
  }
}

async function pollMentions() {
  try {
    const me = await client.v2.me();
    const myId = me.data.id;
    const myUsername = me.data.username;

    const params: any = {
      max_results: 10,
      "tweet.fields": ["author_id", "created_at", "text"],
    };
    if (lastMentionId) params.since_id = lastMentionId;

    const mentions = await client.v2.userMentionTimeline(myId, params);
    if (!mentions.data?.data?.length) return;

    const tweets = [...mentions.data.data].reverse();

    for (const tweet of tweets) {
      if (repliedTweets.has(tweet.id)) continue;
      if (tweet.author_id === myId) continue;

      const message = tweet.text.replace(new RegExp(`@${myUsername}\\b`, "gi"), "").trim();
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

async function main() {
  try {
    const me = await client.v2.me();
    console.log(`\n🐦 AgentNexus Twitter Bot running`);
    console.log(`   Account: @${me.data.username}`);
    console.log(`   Gateway: ${GATEWAY_URL}`);
    console.log(`   Register: ${SITE_URL}\n`);
  } catch (e: any) {
    console.error(`[TwitterBot] Auth failed: ${e.message}`);
    process.exit(1);
  }

  await pollMentions();
  setInterval(pollMentions, POLL_INTERVAL);
}

main();

process.on("SIGTERM", () => { console.log("\n[TwitterBot] Shutting down..."); process.exit(0); });
process.on("SIGINT", () => { console.log("\n[TwitterBot] Shutting down..."); process.exit(0); });
