# OnchainOS & Agentic Wallet 技术参考

> 更新日期: 2026-03-20
> 来源: OKX OnchainOS 官网 + GitHub + 开发者文档

---

## 1. OnchainOS 概览（2026-03 最新）

OnchainOS 是 OKX 的 Web3 AI 基础设施，日处理 12 亿 API 调用，$3 亿日交易量，<100ms 响应，99.9% 正常运行。

### 1.1 三种接入方式

| 方式 | 适用场景 | 命令 |
|------|---------|------|
| **Skills/CLI** | 本地开发，Claude Code/Cursor | `npx skills add okx/onchainos-skills` |
| **MCP 协议** | AI 原生集成 | `claude mcp add --scope user onchainos-cli onchainos mcp` |
| **Open API** | 服务器端/程序化调用 | REST + WebSocket |

**我们的项目用 Open API**（部署在 Railway 服务器上）。

### 1.2 认证方式

所有 API 请求需要 4 个 Header：

| Header | 值 |
|--------|-----|
| `OK-ACCESS-KEY` | API Key |
| `OK-ACCESS-TIMESTAMP` | ISO 8601 UTC（30秒内有效） |
| `OK-ACCESS-PASSPHRASE` | 密码短语 |
| `OK-ACCESS-SIGN` | HMAC-SHA256 签名，Base64 编码 |

签名生成：
```javascript
const sign = crypto.createHmac('sha256', secretKey)
  .update(timestamp + method + requestPath + body)
  .digest('base64');
```

API Key 申请：https://web3.okx.com/onchain-os/dev-portal

---

## 2. 11 个 Skill 模块（72 项能力）

官网宣传"9 大 Skill，72 项能力"，实际 GitHub 有 11 个模块。

### 2.1 okx-agentic-wallet（~14 能力）— 新！

TEE 安全钱包，专为 AI Agent 设计。

| 命令 | 功能 |
|------|------|
| wallet add/switch/status/logout | 钱包生命周期 |
| wallet addresses | 查看所有地址 |
| wallet balance (多种) | 全链/单链/特定代币/刷新余额 |
| wallet send | 发送代币 |
| wallet contract-call | 调用智能合约 |
| wallet history | 交易历史 |

### 2.2 okx-wallet-portfolio（4 能力）

| 命令 | 功能 |
|------|------|
| portfolio chains | 支持的链 |
| portfolio total-value | 总资产价值 |
| portfolio all-balances | 所有代币余额 |
| portfolio token-balances | 特定代币余额 |

### 2.3 okx-security（5 能力）— 新！

| 命令 | 功能 |
|------|------|
| security token-scan | 代币风险扫描 |
| security dapp-scan | DApp 钓鱼检测 |
| security tx-scan | 交易预执行安全检查 |
| security sig-scan | 签名安全验证 |
| security approvals | 授权管理 |

### 2.4 okx-dex-market（10 能力）

| 命令 | 功能 |
|------|------|
| market price/prices | 实时价格（单个/批量） |
| market kline | K 线数据 |
| market index | 指数价格 |
| market portfolio-overview | 钱包 PnL 概览 — 新 |
| market portfolio-dex-history | DEX 交易历史 — 新 |
| market portfolio-recent-pnl | 最近盈亏 — 新 |
| market portfolio-token-pnl | 特定代币盈亏 — 新 |
| market address-tracker | 地址跟踪 — 新 |

### 2.5 okx-dex-signal（4 能力）— 新！

| 命令 | 功能 |
|------|------|
| signal chains | 支持的链 |
| signal list | 聪明钱/鲸鱼/KOL 信号 |
| leaderboard supported-chains | 排行榜支持链 |
| leaderboard list | 交易员排行榜 |

### 2.6 okx-dex-trenches（7 能力）

| 命令 | 功能 |
|------|------|
| memepump chains | 支持的链 |
| memepump tokens | Meme 代币列表 |
| memepump token-details | 代币详情 |
| memepump token-dev-info | 开发者信息 |
| memepump similar-tokens | 相似代币 |
| memepump token-bundle-info | 捆绑交易检测 |
| memepump aped-wallet | 跟投钱包分析 |

### 2.7 okx-dex-swap（5 能力）

| 命令 | 功能 |
|------|------|
| swap chains | 支持的链 |
| swap liquidity | 流动性来源（500+ DEX） |
| swap approve | 代币授权 |
| swap quote | 获取报价 |
| swap swap | 执行交易 |

### 2.8 okx-dex-token（14 能力）

| 命令 | 功能 |
|------|------|
| token search | 搜索代币 |
| token info | 代币信息 |
| token price-info | 价格信息 |
| token trending | 趋势代币 |
| token holders | 持有者分析 |
| token liquidity | 流动性数据 |
| token hot-tokens | 热门代币 |
| token advanced-info | 高级信息（含风险评分）— 新 |
| token top-trader | 顶级交易者 — 新 |
| token trades | 交易记录 — 新 |
| token cluster-overview | 持仓集群概览 — 新 |
| token cluster-top-holders | 集群大户 — 新 |
| token cluster-list | 集群列表 — 新 |
| token cluster-supported-chains | 集群支持链 — 新 |

### 2.9 okx-onchain-gateway（6 能力）

| 命令 | 功能 |
|------|------|
| gateway chains | 支持的链 |
| gateway gas | 当前 Gas 价格 |
| gateway gas-limit | 估算 Gas Limit |
| gateway simulate | 交易模拟 — 新 |
| gateway broadcast | 广播交易 |
| gateway orders | 订单跟踪 |

### 2.10 okx-x402-payment（1 能力）— 新！

| 命令 | 功能 |
|------|------|
| payment x402-pay | TEE 签名 x402 支付授权 |

### 2.11 okx-audit-log（~2 能力）— 新！

审计日志导出和排查。

---

## 3. Agentic Wallet 详解

### 3.1 是什么

2026-03-18 发布，专为 AI Agent 设计的加密钱包。核心特点：

- **TEE 安全**：私钥在可信执行环境中生成和存储，LLM/Agent 永远无法直接访问私钥
- **自然语言执行**：Agent 用自然语言描述交易意图，OnchainOS 翻译为链上操作
- **预执行模拟**：每笔交易执行前模拟，生成可读摘要
- **自动风险评级**：自动评估交易风险，高风险交易被拦截
- **多链支持**：~20 个网络，包括 Ethereum, X Layer, Base, Solana 等
- **X Layer 免 Gas**：USDT/USDC 转账零 Gas 费（OKX 补贴）

### 3.2 与普通 OKX Wallet 的区别

| 方面 | OKX Wallet（浏览器插件） | Agentic Wallet |
|------|------------------------|----------------|
| 目标用户 | 人类 | AI Agent / 软件 |
| 接口 | 浏览器插件、手机 App | CLI、MCP、REST API |
| 密钥管理 | 用户持有助记词 | TEE 中生成和存储，不可导出 |
| 交易发起 | 手动 UI 操作 | 自然语言或 API |
| 安全模型 | 每次弹窗确认 | 自动风险评级 + 预执行模拟 |
| x402 支持 | 无原生支持 | 内置 `okx-x402-payment` |
| 自托管 | 是，用户控制密钥 | TEE 托管，用户和 Agent 都无法导出 |

### 3.3 认证流程

支持两种认证：
1. **Email OTP**：用户提供邮箱 → 收到验证码 → 自动创建 EVM + Solana 钱包
2. **API Key**：通过 `OKX_API_KEY` + `OKX_SECRET_KEY` + `OKX_PASSPHRASE`

### 3.4 x402 + Agentic Wallet 的配合

流程：
1. AI Agent 请求付费资源 → 服务器返回 HTTP 402
2. Agent 的 Agentic Wallet 通过 `okx-x402-payment` 在 TEE 中签名支付授权
3. Agent 带签名重新请求 → 服务器验证 → 链上结算 → 返回资源

X Layer 优势：
- USDT/USDC 零 Gas 费
- 支持 USDG, USDC, USDT
- 内置 KYT 风控
- USDC 合约：`0x779ded0c9e1022225f8e0630b35a9b54be713736`

### 3.5 当前限制

- **非常新**（2026-03-18 发布，仅 2 天）
- Session Keys / 预授权额度 **尚未公开文档化**
- Token Approval 功能标注"Coming Soon"
- 密钥不可导出 — 用户无法迁移到其他钱包

---

## 4. 与我们项目的对比（新 vs 旧）

### 旧版（我们当前使用）
- 7 个模块，43 个命令
- token, dex, memepump, wallet, bridge, earn, explore
- 通过 `onchainos` CLI 调 Open API

### 新增能力（可以集成）
- **okx-security**：5 个安全检测命令 → 增强我们的风险评估
- **okx-dex-signal**：聪明钱/KOL 信号 → 增强策略系统
- **token cluster 分析**：持仓集群 → 更深度的代币分析
- **portfolio PnL**：钱包盈亏分析 → 用户资产追踪
- **x402-payment**：标准 x402 签名 → 我们的付费系统

### 已移除
- **bridge**：跨链功能不再单独存在
- **earn**：收益/质押功能未迁移

---

## 5. 关键 API 端点

| 功能 | 端点 |
|------|------|
| 创建钱包 | `POST /api/v5/wallet/account/create-wallet-account` |
| 查余额 | `GET /api/v5/wallet/asset/wallet-all-token-balances` |
| 交易详情 | `GET /api/v5/wallet/post-transaction/transaction-detail-by-txhash` |
| DEX Swap | `/api/v6/dex/aggregator/swap` |
| x402 支付 | https://web3.okx.com/onchainos/dev-docs/payments/x402-introduction |

---

## 6. 相关资源

| 资源 | 链接 |
|------|------|
| OnchainOS 官网 | https://web3.okx.com/zh-hans/onchainos |
| 开发者文档 | https://web3.okx.com/onchainos/dev-docs/home/what-is-onchainos |
| GitHub Skills | https://github.com/okx/onchainos-skills |
| API Key 申请 | https://web3.okx.com/onchain-os/dev-portal |
| x402 支付文档 | https://web3.okx.com/onchainos/dev-docs/payments/x402-introduction |
| DEX SDK | `npm install @okx-dex/okx-dex-sdk` |
| Changelog | https://web3.okx.com/onchainos/dev-docs/home/change-log |
