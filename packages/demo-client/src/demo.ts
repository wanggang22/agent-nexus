/**
 * Demo: External AI Agent using AgentNexus services via x402
 *
 * Simulates a third-party arbitrage bot that pays for each service call.
 * Shows the full x402 protocol flow: 402 → sign payment → resend with payment.
 */

const GATEWAY = "http://localhost:4000";
const SIGNAL = "http://localhost:4001";
const ANALYST = "http://localhost:4002";
const RISK = "http://localhost:4003";
const TRADER = "http://localhost:4004";

// Mock x402 payment header (in production, this would be a real signed USDC payment)
const MOCK_PAYMENT = Buffer.from(JSON.stringify({
  x402Version: 2,
  scheme: "exact",
  network: "eip155:196",
  payload: { signature: "0xmock", authorization: { from: "0xExternalAgent" } },
})).toString("base64");

const x402Headers = {
  "Content-Type": "application/json",
  "X-PAYMENT": MOCK_PAYMENT,
};

async function fetchJSON(url: string, options?: RequestInit) {
  const resp = await fetch(url, options);
  if (resp.status === 402) {
    const body = await resp.json() as any;
    console.log(`   [402] Payment required: ${body.price} — ${body.description}`);
    throw new Error(`402: ${body.price} required for ${url}`);
  }
  if (!resp.ok) throw new Error(`${url} returned ${resp.status}`);
  return resp.json();
}

/**
 * Makes a paid x402 call. First tries without payment to show 402,
 * then resends with payment header.
 */
async function x402Call(url: string, options?: RequestInit & { showProtocol?: boolean }) {
  const { showProtocol, ...fetchOpts } = options || {};

  if (showProtocol) {
    // Step 1: Call without payment — get 402
    const noPayResp = await fetch(url, { ...fetchOpts, headers: { "Content-Type": "application/json" } });
    if (noPayResp.status === 402) {
      const body = await noPayResp.json() as any;
      const paymentRequired = noPayResp.headers.get("PAYMENT-REQUIRED");
      console.log(`   → 402 Payment Required`);
      console.log(`     Price: ${body.price} USDC | Pay to: ${body.payTo?.slice(0, 10)}...`);
      if (paymentRequired) {
        console.log(`     PAYMENT-REQUIRED header: ${paymentRequired.slice(0, 40)}...`);
      }
      console.log(`   → Signing USDC payment and resending...`);
    }
  }

  // Step 2: Call with payment
  const resp = await fetch(url, {
    ...fetchOpts,
    headers: { ...x402Headers, ...(fetchOpts.headers || {}) },
  });
  if (!resp.ok) throw new Error(`${url} returned ${resp.status}`);

  const paymentResponse = resp.headers.get("PAYMENT-RESPONSE");
  if (paymentResponse && showProtocol) {
    const settlement = JSON.parse(Buffer.from(paymentResponse, "base64").toString());
    console.log(`   → Payment settled: tx ${settlement.transaction.slice(0, 14)}... on ${settlement.network}`);
  }

  return resp.json();
}

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   AgentNexus — External Agent Demo           ║");
  console.log("║   Simulating a third-party arbitrage bot     ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // Step 1: Discover services (FREE)
  console.log("▸ Step 1: Service Discovery (free)");
  const services = await fetchJSON(`${GATEWAY}/services`);
  console.log(`  Platform: ${services.platform} v${services.version}`);
  console.log(`  Network: ${services.network}`);
  console.log(`  Payment: ${services.payment}`);
  console.log(`  Agents: ${services.agents.map((a: any) => a.name).join(", ")}`);
  console.log(`  Contracts: Registry=${services.contracts?.AgentRegistry?.slice(0, 10)}... Ledger=${services.contracts?.PaymentLedger?.slice(0, 10)}...\n`);

  // Step 2: Get smart money signals — show full x402 flow
  console.log("▸ Step 2: Smart Money Signals (x402: $0.01)");
  console.log("  [x402 Protocol Flow]");
  const signals = await x402Call(`${SIGNAL}/signals/smart-money?chain=xlayer`, { showProtocol: true }) as any;
  console.log(`  Found ${signals.count} signals`);
  signals.signals.slice(0, 5).forEach((s: any, i: number) => {
    console.log(`  [${i+1}] ${s.token.symbol} | confidence: ${s.confidence} | $${s.details.amount_usd} | holders: ${s.details.holders}`);
  });

  // Pick the signal with most holders (safer token)
  const sig = signals.signals.reduce((best: any, s: any) => {
    const holders = parseInt(s.details.holders || "0");
    const bestHolders = parseInt(best.details.holders || "0");
    return holders > bestHolders ? s : best;
  }, signals.signals[0]);
  console.log(`\n  Selected: ${sig.token.symbol} (${sig.details.holders} holders, confidence: ${sig.confidence})\n`);

  const tokenAddress = sig.token.address || "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

  // Step 3: Spread analysis (x402: $0.01)
  console.log("▸ Step 3: CEX-DEX Spread Analysis (x402: $0.01)");
  const spread = await x402Call(`${ANALYST}/analysis/spread/${tokenAddress}?chain=xlayer`) as any;
  console.log(`  CEX price: $${spread.cex_price}`);
  console.log(`  DEX price: $${spread.dex_price}`);
  console.log(`  Spread: ${spread.spread_pct}%`);
  console.log(`  Arbitrage viable: ${spread.arbitrage_viable}\n`);

  // Step 4: Risk assessment (x402: $0.01)
  console.log("▸ Step 4: Risk Assessment (x402: $0.01)");
  const risk = await x402Call(`${RISK}/risk/assess`, {
    method: "POST",
    body: JSON.stringify({ token: tokenAddress, chain: "xlayer" }),
  }) as any;
  console.log(`  Risk level: ${risk.risk_level}`);
  console.log(`  Approved: ${risk.approved}`);
  console.log(`  Max position: $${risk.max_position_usd}`);
  console.log(`  Checks:`);
  const c = risk.checks;
  console.log(`    ${c.honeypot.passed ? "✓" : "✗"} honeypot: ${c.honeypot.detail}`);
  console.log(`    ${c.tax.passed ? "✓" : "✗"} tax: buy ${c.tax.buy_tax}% / sell ${c.tax.sell_tax}%`);
  console.log(`    ${c.liquidity.passed ? "✓" : "✗"} liquidity: $${c.liquidity.usd_value}`);
  console.log(`    ${c.holders.passed ? "✓" : "✗"} holders: ${c.holders.count} (${c.holders.concentration})`);
  console.log(`    ${c.dev_history.passed ? "✓" : "✗"} dev: ${c.dev_history.detail}`);
  console.log(`    ${c.bundle.passed ? "✓" : "✗"} bundle: ${(c.bundle.ratio * 100).toFixed(1)}%`);
  console.log();

  // Step 5: Get trade quote (x402: $0.005)
  if (risk.approved) {
    console.log("▸ Step 5: Trade Quote (x402: $0.005)");
    const quote = await x402Call(`${TRADER}/trade/quote`, {
      method: "POST",
      body: JSON.stringify({
        from_token: "0x74b7f16337b8972027f6196a17a631ac6de26d22",
        to_token: tokenAddress,
        amount: "1000000",
        chain: "xlayer",
      }),
    }) as any;
    console.log(`  Quote ID: ${quote.quote_id}`);
    console.log(`  Amount in: ${quote.amount_in} (1 USDC)`);
    console.log(`  Expected out: ${quote.expected_out}`);
    console.log(`  Price impact: ${quote.price_impact}%`);
    console.log(`  Expires: ${quote.expires_at}\n`);
  }

  // Wait a moment for stats to settle
  await new Promise((r) => setTimeout(r, 500));

  // Summary
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   Demo Complete                              ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log("║   Total x402 cost: $0.035                    ║");
  console.log("║   Services: Signal → Analyst → Risk → Trader ║");
  console.log(`║   Decision: ${risk.approved ? "READY TO TRADE ✓" : "TRADE REJECTED ✗"}              ║`);
  console.log("╚══════════════════════════════════════════════╝\n");

  // Gateway stats
  const stats = await fetchJSON(`${GATEWAY}/stats`);
  console.log(`Gateway Stats: ${stats.total_calls} calls | $${stats.total_revenue_usd} revenue | uptime: ${stats.uptime_seconds}s`);
}

main().catch(console.error);
