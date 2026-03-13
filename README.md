# AgentNexus — AI Agent Service Marketplace on X Layer

> **X Layer AI Agent Hackathon** | Track: AI Trading + Agentic Payment

AgentNexus is an **AI Agent Service Marketplace** deployed on X Layer where any third-party AI agent can discover and pay for professional trading services via the **x402 payment protocol**. Each service call costs micro-USDC payments — no API keys, no accounts, just pay-per-call.

## How It Works

```
External AI Agent
       │
       │ 1. GET /services (discover available services)
       │ 2. x402 payment ($0.01 USDC per call)
       ▼
┌─────────────────────────────────────┐
│          AgentNexus Gateway          │
│    Service Discovery + Stats         │
└──────┬──────┬──────┬──────┬─────────┘
       │      │      │      │
       ▼      ▼      ▼      ▼
   Signal  Analyst  Risk   Trader
   Agent   Agent    Agent  Agent
       │      │      │      │
       ▼      ▼      ▼      ▼
   Onchain OS Skills + OKX Agent Trade Kit
       │
       ▼
   X Layer Smart Contracts
   (AgentRegistry + PaymentLedger)
```

**No x402 payment → 402 Payment Required**
**With x402 payment → Service response**

## Live on X Layer Mainnet

| Contract | Address |
|----------|---------|
| AgentRegistry | [`0x294f885031544d7Af38D79fe1E9a5c87f3880DEA`](https://www.okx.com/web3/explorer/xlayer/address/0x294f885031544d7Af38D79fe1E9a5c87f3880DEA) |
| PaymentLedger | [`0x00e0C1C17E9c3899A0bD362560Ea0Ab8112A4E05`](https://www.okx.com/web3/explorer/xlayer/address/0x00e0C1C17E9c3899A0bD362560Ea0Ab8112A4E05) |
| Agent Registration TX | [`0x5aa9ef8a...`](https://www.okx.com/web3/explorer/xlayer/tx/0x5aa9ef8adc034f6061f4e6fadd937a0532e0ca57ab3b5f2fdfc9eca86331d0d8) |

## x402 Paid API Services

### Signal Agent (`:4001`) — On-chain Signal Detection

| Endpoint | Price | Description |
|----------|-------|-------------|
| `GET /signals/smart-money` | $0.01 | Smart money buy signals |
| `GET /signals/whale-alert` | $0.02 | Whale movement alerts |
| `GET /signals/meme-scan` | $0.005 | New meme token scan |
| `GET /signals/trending` | $0.005 | Trending tokens |

### Analyst Agent (`:4002`) — Market Analysis

| Endpoint | Price | Description |
|----------|-------|-------------|
| `GET /analysis/technical/:token` | $0.02 | Technical analysis (AI-powered) |
| `GET /analysis/fundamental/:token` | $0.03 | Fundamental analysis |
| `GET /analysis/spread/:token` | $0.01 | CEX-DEX spread analysis |
| `GET /analysis/full/:token` | $0.05 | Full analysis report |

### Risk Agent (`:4003`) — Risk Assessment

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /risk/assess` | $0.01 | Pre-trade risk assessment |
| `GET /risk/token-safety/:token` | $0.01 | Token safety check |
| `GET /risk/portfolio` | $0.005 | Portfolio risk overview |

### Trader Agent (`:4004`) — Trade Execution

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /trade/quote` | $0.005 | Optimal trade quote |
| `POST /trade/execute` | $0.05 | Execute trade |
| `GET /trade/status/:orderId` | Free | Track order |

### Gateway (`:4000`) — Service Discovery

| Endpoint | Price | Description |
|----------|-------|-------------|
| `GET /services` | Free | All available services |
| `GET /health` | Free | Agent status |
| `GET /stats` | Free | Call statistics |

## Quick Start

```bash
# Install dependencies
pnpm install

# Start all services
bash start.sh

# Run demo (simulates external agent calling all services)
npx tsx packages/demo-client/src/demo.ts
```

## x402 Protocol Flow

```
1. Agent sends: GET /signals/smart-money
2. Server returns: 402 Payment Required
   Headers: PAYMENT-REQUIRED: <base64 payment requirements>
   Body: { price: "$0.01", network: "eip155:196", asset: "USDC" }

3. Agent signs USDC payment and resends with:
   Headers: PAYMENT-SIGNATURE: <base64 signed payment>

4. Server verifies payment, returns data + settlement receipt:
   Headers: PAYMENT-RESPONSE: <base64 settlement>
   Body: { signals: [...] }
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 + TypeScript |
| Web Framework | Express.js |
| x402 Payment | Custom middleware (x402 protocol compliant) |
| AI Engine | Claude API (Anthropic) |
| DEX Data | Onchain OS Skills (7 modules, 43 commands) |
| CEX Data | OKX Agent Trade Kit (95 MCP tools) |
| Blockchain | viem + ethers.js |
| Smart Contracts | Solidity 0.8.24 + Hardhat |
| Dashboard | Next.js 14 + Tailwind CSS |
| Network | X Layer Mainnet (Chain ID: 196) |

## OnchainOS Capabilities Used

- **Trade API** — DEX swap quotes and execution
- **Market API** — Price, K-line, liquidity data
- **Wallet API** — Portfolio balance and PnL
- **x402 Payments** — Agent-to-agent micropayments

## Project Structure

```
agent-nexus/
├── packages/
│   ├── shared/           # Types, x402 middleware, onchainos wrapper
│   ├── gateway/          # Service discovery + stats
│   ├── signal-agent/     # Smart money, whale, meme signals
│   ├── analyst-agent/    # Technical/fundamental/spread analysis
│   ├── risk-agent/       # Honeypot, rug-pull, risk engine
│   ├── trader-agent/     # DEX quotes + trade execution
│   ├── contracts/        # AgentRegistry + PaymentLedger
│   ├── demo-client/      # Example: external agent using services
│   └── dashboard/        # Real-time monitoring UI
├── .env                  # API keys (not committed)
├── start.sh              # Start all services
└── pnpm-workspace.yaml
```

## Deploy Contracts

```bash
cd packages/contracts
npx hardhat run scripts/deploy.ts --network xlayer
npx hardhat run scripts/register-agents.ts --network xlayer
```

## License

MIT
