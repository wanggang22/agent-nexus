# AgentNexus — AI-Powered On-Chain Assistant for X Layer

> **OKX X Layer AI Agent Hackathon** | Phase 1: 2026-03-12 ~ 2026-03-26

AgentNexus is an AI assistant that lets anyone interact with X Layer blockchain using natural language. Chat to analyze tokens, execute trades, launch meme coins, and build automated strategies — no technical knowledge required.

**Live Demo:** https://dashboard-production-fe35.up.railway.app
**Twitter:** [@AgentNexus_AI](https://twitter.com/AgentNexus_AI)

## Features

### 1. Natural Language Chat (Free)
Ask anything about tokens, trading, or market data in Chinese or English.

```
"XDOG 怎么样？"        → Full risk assessment + price + liquidity + holders
"热门代币有哪些？"      → Top trending tokens with market data
"这个币安全吗？"        → Honeypot detection, tax check, dev history
"聪明钱在买什么？"      → Smart money signals + whale alerts
```

### 2. One-Click Token Launch
Deploy your own meme coin with a single sentence. No Solidity knowledge needed.

```
"发一个叫MOON的币"  →  Deploy ERC-20 + Create Uniswap V3 pool + Add liquidity
```

4-step process: Deploy → Create Pool (1% fee) → Approve → Add Liquidity. Sign 4 transactions in OKX Wallet and your token is live for trading.

### 3. Natural Language Trading
Trade any token on X Layer with natural language. 500+ DEX liquidity sources aggregated.

```
"用 0.01 OKB 买 XDOG"  →  Quote via DYOR Swap → OKX Wallet sign → Done
```

Auto slippage detection: 0.5% for stablecoins, up to 15% for low-liquidity meme coins.

### 4. Strategy Automation
Create monitoring strategies with natural language. System runs them automatically.

```
"帮我盯市值低于10万的新代币"  →  Strategy created, runs every 60 minutes
```

Results pushed to your strategy dashboard. Pause, resume, or run manually anytime.

### 5. x402 Payment Protocol
Pay-per-use model built on the HTTP 402 standard.

- **10 free actions/day** (launch + strategy + trading combined)
- **$1 USDC = 100 credits** when free tier exhausted
- Chat and data queries are always free
- Payment via OKX Wallet USDC transfer on X Layer

## Architecture

```
                    User (OKX Wallet / Twitter / Browser)
                              │
                    ┌─────────▼──────────┐
                    │   AgentNexus       │
                    │   Gateway          │
                    │                    │
                    │  Claude AI Router  │  ← Intent parsing
                    │  Token Resolution  │  ← Symbol → Address
                    │  x402 Credits      │  ← Usage tracking
                    └──┬──┬──┬──┬──┬─────┘
                       │  │  │  │  │
              ┌────────┘  │  │  │  └────────┐
              ▼           ▼  ▼  ▼           ▼
          Signal      Analyst Risk     Trader    Launch
          Agent       Agent   Agent    Agent     Engine
           │            │      │         │         │
           ▼            ▼      ▼         ▼         ▼
        OnchainOS    Claude  OnchainOS  OKX DEX  Uniswap V3
        (72 skills)   AI     (security) (500+DEX) (X Layer)
                       │
                  X Layer Mainnet (Chain ID: 196)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI Engine | Claude Sonnet 4.6 (Anthropic API) |
| On-chain Data | OnchainOS v2.1 — 11 modules, 72 capabilities |
| DEX | OKX DEX Aggregator (500+ liquidity sources) |
| Token Launch | Custom ERC-20 + Uniswap V3 (Factory + NFPM on X Layer) |
| Payment | x402 protocol (HTTP 402 + USDC on X Layer) |
| Frontend | Next.js 14 + Tailwind CSS + react-markdown |
| Backend | Node.js 20 + TypeScript (pnpm monorepo) |
| Wallet | OKX Wallet (browser extension + mobile app) |
| Deployment | Railway (8 services) |
| Network | X Layer Mainnet (Chain ID: 196) |

## Project Structure

```
agent-nexus/
├── packages/
│   ├── gateway/          # API gateway, intent routing, x402 credits
│   ├── signal-agent/     # Smart money, whale, trending signals
│   ├── analyst-agent/    # Token analysis (basic + AI deep)
│   ├── risk-agent/       # Risk assessment (honeypot, tax, liquidity)
│   ├── trader-agent/     # DEX trading (quote, execute, broadcast)
│   ├── dashboard/        # ChatGPT-style web UI (Next.js)
│   ├── shared/           # OnchainOS wrapper, token registry, types
│   ├── twitter-bot/      # Twitter @mention interaction
│   └── contracts/        # Solidity (AgentRegistry, PaymentLedger)
└── contracts/
    └── MemeToken.sol     # ERC-20 template for token launch
```

## Smart Contracts (X Layer Mainnet)

| Contract | Address |
|----------|---------|
| AgentRegistry | [`0x294f885031544d7Af38D79fe1E9a5c87f3880DEA`](https://www.okx.com/web3/explorer/xlayer/address/0x294f885031544d7Af38D79fe1E9a5c87f3880DEA) |
| PaymentLedger | [`0x00e0C1C17E9c3899A0bD362560Ea0Ab8112A4E05`](https://www.okx.com/web3/explorer/xlayer/address/0x00e0C1C17E9c3899A0bD362560Ea0Ab8112A4E05) |

## Uniswap V3 on X Layer

| Contract | Address |
|----------|---------|
| Factory | `0xb76c7abd3eb4b07ec14c5d7f9b265e8d37432e11` |
| NonfungiblePositionManager | `0x8f56331c494ea64e60ab4fb7d1cd38a09230fe86` |
| WOKB | `0xe538905cf8410324e03A5A23C1c177a474D59b2b` |

## Quick Start

```bash
# Clone and install
git clone https://github.com/wanggang22/agent-nexus.git
cd agent-nexus
pnpm install

# Configure environment
cp .env.example .env
# Set: PRIVATE_KEY, ANTHROPIC_API_KEY, OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE

# Build all packages
pnpm build

# Start gateway (other agents start on their respective ports)
pnpm dev:gateway

# Try it
curl -X POST http://localhost:4000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "XDOG 怎么样？"}'
```

## Why AgentNexus?

| Without AgentNexus | With AgentNexus |
|---|---|
| Install CLI, configure API keys, learn commands | Open a webpage or OKX Wallet app |
| Write Solidity, compile, deploy, create pool | Say "发个叫MOON的币" |
| Build scripts for monitoring + cron jobs | Say "帮我盯低市值新币" |
| Memorize contract addresses | Say "XDOG" |
| Desktop only | Mobile (OKX Wallet app) + Web + Twitter |

**AgentNexus turns X Layer into a conversational experience.**

## License

MIT
