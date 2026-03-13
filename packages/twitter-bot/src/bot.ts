import { TwitterApi } from "twitter-api-v2";
import { env } from "shared";

// ── Config ──
const TWITTER_APP_KEY = process.env.TWITTER_APP_KEY || "";
const TWITTER_APP_SECRET = process.env.TWITTER_APP_SECRET || "";
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN || "";
const TWITTER_ACCESS_SECRET = process.env.TWITTER_ACCESS_SECRET || "";
const GATEWAY_URL = env.GATEWAY_URL;
const POLL_INTERVAL = 30_000; // 30 seconds

if (!TWITTER_APP_KEY || !TWITTER_APP_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_SECRET) {
  console.error("[TwitterBot] Missing Twitter API credentials in .env");
  console.error("  Required: TWITTER_APP_KEY, TWITTER_APP_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET");
  process.exit(1);
}

const client = new TwitterApi({
  appKey: TWITTER_APP_KEY,
  appSecret: TWITTER_APP_SECRET,
  accessToken: TWITTER_ACCESS_TOKEN,
  accessSecret: TWITTER_ACCESS_SECRET,
});

// Track last processed mention to avoid duplicates
let lastMentionId: string | undefined;

// Set of tweet IDs we've already replied to (prevent double-reply)
const repliedTweets = new Set<string>();
const MAX_REPLIED_CACHE = 5000;

/**
 * Call AgentNexus Gateway /chat and get a response.
 */
async function askAgentNexus(message: string): Promise<string> {
  try {
    const resp = await fetch(`${GATEWAY_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await resp.json() as any;
    if (data.error) return `Error: ${data.error}`;
    return data.reply || "No response from agents.";
  } catch (e: any) {
    return `Service unavailable: ${e.message}`;
  }
}

/**
 * Split long text into tweet-sized chunks (280 chars).
 * Returns array of strings, each ≤ 280 chars.
 */
function splitForTweets(text: string, maxLen = 270): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;
  let part = 1;

  while (remaining.length > 0) {
    const isLast = remaining.length <= maxLen;
    const chunkSize = isLast ? remaining.length : maxLen - 6; // leave room for " (1/3)"

    // Try to break at sentence or word boundary
    let breakAt = chunkSize;
    if (!isLast) {
      const lastPeriod = remaining.lastIndexOf("。", chunkSize);
      const lastDot = remaining.lastIndexOf(". ", chunkSize);
      const lastNewline = remaining.lastIndexOf("\n", chunkSize);
      const bestBreak = Math.max(lastPeriod, lastDot, lastNewline);
      if (bestBreak > chunkSize * 0.5) breakAt = bestBreak + 1;
    }

    const chunk = remaining.slice(0, breakAt).trim();
    remaining = remaining.slice(breakAt).trim();

    if (isLast && chunks.length === 0) {
      chunks.push(chunk);
    } else {
      const total = chunks.length + (remaining.length > 0 ? 2 : 1);
      chunks.push(chunk); // will add numbering later
      part++;
    }
  }

  // Add numbering if multiple chunks
  if (chunks.length > 1) {
    return chunks.map((c, i) => `${c} (${i + 1}/${chunks.length})`);
  }
  return chunks;
}

/**
 * Reply to a tweet. If response is too long, reply as a thread.
 */
async function replyToTweet(tweetId: string, text: string) {
  const chunks = splitForTweets(text);
  let replyTo = tweetId;

  for (const chunk of chunks) {
    try {
      const posted = await client.v2.reply(chunk, replyTo);
      replyTo = posted.data.id; // chain replies as thread
    } catch (e: any) {
      console.error(`[TwitterBot] Failed to reply: ${e.message}`);
      break;
    }
  }
}

/**
 * Poll for new @mentions and process them.
 */
async function pollMentions() {
  try {
    const me = await client.v2.me();
    const myId = me.data.id;
    const myUsername = me.data.username;

    console.log(`[TwitterBot] Polling mentions for @${myUsername}...`);

    const params: any = {
      max_results: 10,
      "tweet.fields": ["author_id", "created_at", "text", "referenced_tweets"],
    };
    if (lastMentionId) params.since_id = lastMentionId;

    const mentions = await client.v2.userMentionTimeline(myId, params);

    if (!mentions.data?.data?.length) return;

    // Process from oldest to newest
    const tweets = [...mentions.data.data].reverse();

    for (const tweet of tweets) {
      // Skip if already replied
      if (repliedTweets.has(tweet.id)) continue;

      // Skip our own tweets
      if (tweet.author_id === myId) continue;

      // Extract the message (remove @mention)
      const message = tweet.text
        .replace(new RegExp(`@${myUsername}\\b`, "gi"), "")
        .trim();

      if (!message) continue;

      console.log(`[TwitterBot] Processing: "${message.slice(0, 50)}..." (tweet ${tweet.id})`);

      // Get response from AgentNexus
      const response = await askAgentNexus(message);

      // Reply
      await replyToTweet(tweet.id, response);

      // Track
      repliedTweets.add(tweet.id);
      lastMentionId = tweet.id;

      // Keep cache bounded
      if (repliedTweets.size > MAX_REPLIED_CACHE) {
        const first = repliedTweets.values().next().value;
        if (first) repliedTweets.delete(first);
      }

      // Rate limit: wait 2s between replies
      await new Promise((r) => setTimeout(r, 2000));
    }
  } catch (e: any) {
    // Rate limit handling
    if (e.code === 429 || e.message?.includes("429")) {
      console.warn("[TwitterBot] Rate limited, waiting 60s...");
      await new Promise((r) => setTimeout(r, 60000));
    } else {
      console.error(`[TwitterBot] Poll error: ${e.message}`);
    }
  }
}

// ── Main loop ──
async function main() {
  try {
    const me = await client.v2.me();
    console.log(`\n🐦 AgentNexus Twitter Bot running`);
    console.log(`   Account: @${me.data.username}`);
    console.log(`   Gateway: ${GATEWAY_URL}`);
    console.log(`   Poll interval: ${POLL_INTERVAL / 1000}s`);
    console.log(`   Tweet @${me.data.username} to interact!\n`);
  } catch (e: any) {
    console.error(`[TwitterBot] Failed to authenticate: ${e.message}`);
    console.error("  Check your Twitter API credentials in .env");
    process.exit(1);
  }

  // Initial poll
  await pollMentions();

  // Poll loop
  setInterval(pollMentions, POLL_INTERVAL);
}

main();

// Graceful shutdown
process.on("SIGTERM", () => { console.log("\n[TwitterBot] Shutting down..."); process.exit(0); });
process.on("SIGINT", () => { console.log("\n[TwitterBot] Shutting down..."); process.exit(0); });
