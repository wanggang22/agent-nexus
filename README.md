# AgentNexus — AI Agent Service Marketplace on X Layer

> **X Layer AI Agent Hackathon** | Track: AI Trading + Agentic Payment

AgentNexus is an **AI Agent Service Marketplace** on X Layer where any third-party AI agent can discover and consume professional crypto trading services. It combines **OnchainOS** (OKX's on-chain data toolkit) with **Claude AI** deep analysis, and uses the **x402 payment protocol** for machine-to-machine USDC micropayments.

**Core idea:** OnchainOS-powered services (signals, risk, trading) are **free** — anyone could call OnchainOS directly. We charge only for **Claude AI analysis**, which adds real value: meme virality scoring, technical pattern recognition, multi-dimensional recommendations.

## Architecture

```
User / External AI Agent
         │
         │  POST /chat  "帮我分析下ETH"     ← Natural language
         │  GET /services                    ← Service discovery
         ▼
┌───────────────────────────────────────────┐
│            AgentNexus Gateway             │
│  Natural Language Router (Claude AI)      │
│  Token Resolution (symbol → address)      │
│  Service Discovery + Stats                │
└──────┬──────┬──────────┬──────┬───────────┘
       │      │          │      │
       ▼      ▼          ▼      ▼
   Signal  Analyst     Risk   Trader
   Agent   Agent       Agent  Agent
   FREE    PAID(AI)    FREE   FREE
       │      │          │      │
       ▼      ▼          ▼      ▼
   OnchainOS CLI    Claude AI   OKX DEX
   (7 modules)     (Sonnet)    Aggregator
       │                          │
       ▼                          ▼
         X Layer Mainnet (Chain ID: 196)
```

## Natural Language Interface

The simplest way to use AgentNexus — just talk to it:

```bash
# Chinese or English, both work
curl -X POST http://localhost:4000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "帮我全面分析下ETH"}'

curl -X POST http://localhost:4000/chat \
  -d '{"message": "这个币安全吗 0x1E4a5963aBFD975d8c9021ce480b42188849D41d"}'

curl -X POST http://localhost:4000/chat \
  -d '{"message": "最近聪明钱在买什么"}'

curl -X POST http://localhost:4000/chat \
  -d '{"message": "帮我用1 OKB换USDT"}'
```

**How it works:**
1. Claude AI parses your intent and extracts token symbols/addresses
2. Token symbols auto-resolve to contract addresses (built-in table + OnchainOS search + dynamic cache)
3. Routes to the right agent(s) in parallel (up to 3)
4. Claude AI summarizes results in your language

**Token resolution:** Major tokens (ETH, OKB, USDT, BTC...) are built-in. Unknown symbols are searched via OnchainOS and cached for 24h. Contract addresses always work directly.

## API Services

### Signal Agent (`:4001`) — FREE

On-chain signal detection powered by OnchainOS.

| Endpoint | Price | Description |
|----------|-------|-------------|
| `GET /signals/smart-money` | Free | Smart money buy signals |
| `GET /signals/whale-alert` | Free | Whale movement alerts |
| `GET /signals/meme-scan` | Free | New meme token scan |
| `GET /signals/trending` | Free | Trending tokens |

### Analyst Agent (`:4002`) — PAID (Claude AI)

Deep market analysis combining OnchainOS data + Claude AI reasoning. The only paid services — covers AI inference cost.

| Endpoint | Price | Description |
|----------|-------|-------------|
| `GET /analysis/technical/:token` | $0.02 | Technical analysis (trend, RSI, support/resistance) |
| `GET /analysis/fundamental/:token` | $0.03 | Fundamental analysis (holder risk, honeypot, tax, liquidity) |
| `GET /analysis/spread/:token` | $0.01 | CEX-DEX spread & arbitrage analysis |
| `GET /analysis/meme/:token` | $0.03 | Meme virality & community analysis |
| `GET /analysis/full/:token` | $0.08 | Full analysis (all 4 dimensions + recommendation) |
| `GET /ai-stats` | Free | AI cost & usage monitoring |

**Meme analysis** evaluates 8 dimensions using 9 OnchainOS data sources:

```
Data Sources (OnchainOS)          Analysis Dimensions (Claude AI)
├── token info                    ├── Virality score (0-100)
├── advanced-info                 ├── Narrative strength
├── price-info                    ├── Cultural appeal
├── top-trader (smart money)      ├── Community metrics
├── top-trader (KOL)              ├── Smart money sentiment
├── top-trader (insider)          ├── KOL activity
├── top-trader (sniper)           ├── Risk factors
├── recent trades (50)            └── Catalyst prediction
└── holder distribution
```

### Risk Agent (`:4003`) — FREE

Pre-trade risk assessment powered by OnchainOS.

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /risk/assess` | Free | Pre-trade risk assessment |
| `GET /risk/token-safety/:token` | Free | Honeypot & rug pull detection |
| `GET /risk/portfolio?wallet=0x...` | Free | Portfolio risk overview |

### Trader Agent (`:4004`) — FREE

Trade execution via OKX DEX aggregator with auto slippage detection.

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /trade/quote` | Free | Optimal swap quote with auto slippage |
| `POST /trade/execute` | Free | Execute trade (simulation → gas estimate → send) |
| `GET /trade/status/:orderId` | Free | Track order via on-chain receipt |

**Auto slippage:** Detects price impact and sets slippage automatically — 0.5% for stablecoins up to 15% for ultra-low-liquidity meme coins.

### Gateway (`:4000`) — FREE

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /chat` | ~$0.01 | Natural language interface (AI routing + summary) |
| `GET /services` | Free | Service discovery (all agents + pricing) |
| `GET /health` | Free | All agent status & wallet addresses |
| `GET /stats` | Free | Call statistics & revenue tracking |

## x402 Payment Protocol

Machine-to-machine payments — no API keys, no accounts, just USDC on X Layer.

```
1. Agent calls:  GET /analysis/technical/0x1234...
2. Server returns:  402 Payment Required
   Header:  X-PAYMENT: price=$0.02, network=eip155:196, asset=USDC
3. Agent signs USDC payment and resends with:
   Header:  X-PAYMENT-SIGNATURE: <signed payment>
4. Server verifies → returns analysis + settlement receipt
```

Only Analyst Agent services require x402 payment. All other services are free.

## AI Cost Control

| Mechanism | Detail |
|-----------|--------|
| Response cache | 5-min TTL per token per analysis type |
| Input truncation | Max 400 chars per data field, max 8 fields |
| Output cap | 400 tokens (600 for meme analysis) |
| Daily limit | 500 AI calls/day, auto-reset at midnight |
| Token tracking | Input/output tokens counted, est. cost calculated |
| Monitoring | `GET /ai-stats` — real-time cost dashboard |

Max single-call cost: ~$0.04 (full analysis, 4 parallel AI calls). Charged $0.08 → ~2x margin.

## Smart Contracts (X Layer Mainnet)

| Contract | Address |
|----------|---------|
| AgentRegistry | [`0x294f885031544d7Af38D79fe1E9a5c87f3880DEA`](https://www.okx.com/web3/explorer/xlayer/address/0x294f885031544d7Af38D79fe1E9a5c87f3880DEA) |
| PaymentLedger | [`0x00e0C1C17E9c3899A0bD362560Ea0Ab8112A4E05`](https://www.okx.com/web3/explorer/xlayer/address/0x00e0C1C17E9c3899A0bD362560Ea0Ab8112A4E05) |

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/wanggang22/agent-nexus.git
cd agent-nexus
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env: set PRIVATE_KEY and ANTHROPIC_API_KEY

# 3. Start all services
bash start.sh

# 4. Try it
curl -X POST http://localhost:4000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "what tokens are trending right now?"}'
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 + TypeScript (pnpm monorepo) |
| Web Framework | Express.js |
| AI Engine | Claude Sonnet (Anthropic API) |
| On-chain Data | OnchainOS CLI — 7 modules, 43 commands |
| DEX Aggregator | OKX DEX via OnchainOS swap module |
| Payment Protocol | x402 (HTTP 402 + USDC on X Layer) |
| Blockchain | viem (wallet, gas estimation, tx receipts) |
| Smart Contracts | Solidity 0.8.24 + Hardhat |
| Dashboard | Next.js 14 + Tailwind CSS ([GitHub Pages](https://wanggang22.github.io/agent-nexus)) |
| Network | X Layer Mainnet (Chain ID: 196) |

## Project Structure

```
agent-nexus/
├── packages/
│   ├── shared/           # Types, x402 middleware, OnchainOS wrapper, token registry
│   ├── gateway/          # Natural language router, service discovery, stats
│   ├── signal-agent/     # Smart money, whale, meme signals (OnchainOS)
│   ├── analyst-agent/    # AI analysis: technical, fundamental, meme, spread (Claude)
│   ├── risk-agent/       # Honeypot, rug-pull, portfolio risk (OnchainOS)
│   ├── trader-agent/     # DEX quotes + trade execution (OnchainOS + viem)
│   ├── contracts/        # Solidity: AgentRegistry + PaymentLedger
│   ├── demo-client/      # Example: external agent using services
│   └── dashboard/        # Real-time monitoring UI (Next.js)
├── .env.example          # Environment template
├── start.sh              # Start all services
└── pnpm-workspace.yaml
```

## Why AgentNexus?

**"Why not just call OnchainOS directly?"**

You can. Signal, risk, and trading services are free because they're thin wrappers around OnchainOS. The value AgentNexus adds:

1. **AI Analysis** — Claude AI interprets raw on-chain data into actionable insights (meme virality scoring, multi-dimensional recommendations, narrative analysis)
2. **Natural Language** — Talk to it in Chinese or English instead of memorizing API endpoints
3. **Unified Interface** — One `/chat` endpoint routes to 4 specialized agents automatically
4. **Token Resolution** — Say "ETH" instead of memorizing `0x5A77f1443D16ee5761d310e38b62f77f726bC71c`
5. **x402 Payments** — Machine-to-machine micropayments, no API keys needed

## License

MIT
