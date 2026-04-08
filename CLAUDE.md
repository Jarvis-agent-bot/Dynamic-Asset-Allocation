# DAA Console — Dynamic Asset Allocation

## Project Overview

DAA Console 是面向个人投资者的单组合动态资产配置系统。
核心流程：**资产发现 → 洞察分析 → 再平衡 → 执行 → 复盘**

当前为模拟执行模式，不对接真实券商。

## Tech Stack

- **Framework**: Next.js 14 (App Router), React 18, TypeScript 5
- **Styling**: Tailwind CSS, shadcn/ui, Framer Motion
- **Database**: PostgreSQL
- **Auth**: Supabase Auth (email-based)
- **LLM**: DeepSeek (primary), OpenAI-compatible fallback
- **Charts**: Recharts
- **Package Manager**: pnpm 10
- **Test**: Vitest (unit), Playwright (e2e)

## Quick Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server (requires PostgreSQL + .env.local)
pnpm test             # Run unit tests (vitest)
pnpm typecheck        # TypeScript type check
pnpm gates            # Full gate: test + typecheck + build
pnpm build            # Production build
```

## Project Structure

```
app/
├── api/daa/                    # Backend API routes
│   ├── workbench/              # Asset discovery, insights, rebalancing, execution
│   ├── market/                 # Market data proxies (yahoo, xueqiu, danjuan, twitter)
│   ├── store/                  # Data persistence (config, secrets, ledger, snapshots)
│   ├── read/                   # Read aggregates (workbench, trades)
│   ├── cron/                   # Scheduled jobs (price, fx, news, drift, analysis)
│   ├── hf/                     # Hedge fund manager holdings tracking
│   └── auth/                   # Authentication
├── daa/dashboard/              # Frontend pages
│   ├── today/                  # 投委会 — 每日决策摘要
│   ├── portfolio/              # 持仓 — 资产池、观察列表、权重管理
│   ├── rebalance/              # 调仓 — 再平衡检测、生成、执行
│   ├── trades/                 # 交易记录 — 周期、订单、复盘
│   ├── strategy-lab/           # 策略实验室 — 回测
│   ├── settings/               # 设置 — 策略、风控、数据源、通知
│   └── workbench/_components/  # 共享组件与 hooks（历史目录名，组件已重命名）

src/
├── core/                       # Pure algorithm layer (no side effects, fully testable)
│   ├── ensemble/               # Multi-strategy weighting & combination
│   ├── backtest/               # Attribution analysis
│   ├── rebalanceCore.ts        # Core rebalancing math (orders, drift, constraints)
│   ├── config.ts               # Ensemble strategy weighting config
│   └── domain.ts               # Core types (PriceBar, Strategy, Signal)
├── daa/                        # Business logic & orchestration
│   ├── modules/
│   │   ├── workbench/          # Asset universe, decision fusion, execution
│   │   ├── portfolio/          # Position tracking
│   │   ├── trade/              # Trade ticket lifecycle
│   │   ├── marketContext/      # Market regime detection (risk_off/risk_on)
│   │   ├── decision/           # Proposal decision context
│   │   └── dividend/           # Dividend tracking
│   ├── signals/                # Three-dimensional signal fusion
│   │   ├── technicalSignal.ts  # SMA, momentum, trend
│   │   ├── valuationSignal.ts  # PE, dividend yield, relative value
│   │   ├── newsSignal.ts       # Sentiment analysis
│   │   └── fusion.ts           # Multi-signal fusion engine
│   ├── store/                  # PostgreSQL persistence layer
│   ├── pg/                     # Connection pooling, schema migration
│   ├── config/                 # System config, secrets, currency
│   └── llm/                    # LLM integration (analysis, decisions)
├── market/                     # Market data clients
│   ├── yfinance.ts             # Yahoo Finance adapter
│   ├── yahooRssFetch.ts        # News RSS fetching
│   ├── marketDataClient.ts     # Unified market data API client
│   └── constants.ts            # Shared constants (User-Agent etc.)
```

## Asset Classes & Coverage

### Supported Asset Classes (AssetClass type)
`EQUITY` | `ETF` | `BOND` | `COMMODITY` | `CASH` | `CRYPTO` | `FUND` | `INDEX` | `CURRENCY` | `OTHER`

### Supported Regions (Region type)
`US` | `HK` | `CN` | `EU` | `JP` | `GLOBAL` | `OTHER`

### Featured Assets Catalog (87 items)

| Category | Count | Examples |
|----------|-------|---------|
| US Equities | 8 | AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, BRK-B |
| HK Equities | 8 | 0700.HK (腾讯), 9988.HK (阿里), 3690.HK (美团) |
| CN A-shares | 8 | 600519.SS (茅台), 300750.SZ (宁德), 601318.SS (平安) |
| US/Global ETFs | 13 | SPY, QQQ, VTI, IWM, EFA, EEM, INDA, EWJ, VNQ |
| HK ETFs | 2 | 2800.HK (盈富), 2823.HK (A50) |
| CN ETFs | 2 | 510300.SS (沪深300), 159915.SZ (创业板) |
| Commodities | 7 | GLD, IAU (黄金), SLV (白银), USO, BNO (原油), DBC, DBA |
| US Bonds | 6 | BND, TLT, IEF, LQD, TIP, SGOV |
| CN Bonds | 2 | 511010.SS (国债), 511260.SS (十年国债) |
| HK Bonds | 2 | 3141.HK (亚洲高息), 2819.HK (美元债) |
| Crypto | 3 | BTC-USD, ETH-USD, SOL-USD |
| Currency | 8 | UUP (美元多头), UDN (美元空头), FXE (欧元), FXY (日元), FXB (英镑), FXA (澳元), CYB (人民币), CEW (新兴货币) |

## Key Architecture Concepts

### Asset Key Format
`{MARKET}:{SYMBOL}` — e.g., `US:AAPL`, `HK:0700.HK`, `CRYPTO:BTC-USD`
See `src/daa/assetKey.ts` for parsing/normalization utilities.

### AI 决策架构（Structured Agent）

再平衡决策流程采用双阶段 LLM 架构：

```
漂移计算 → 规划器(LLM) → 选择性信号采集 → 融合 → 决策器(LLM) → Guardrails → 执行
                                                        ↑
                                                  outcome 反馈闭环
```

**规划器**（`src/daa/agent/llmPlanner.ts`）：用便宜模型分析漂移提案，决定每个资产需要采集哪些信号（技术/估值/新闻/人因），跳过不需要深入分析的资产。

**决策器**（`src/daa/llm/llmDecision.ts`）：分析师模式，基于目标和约束自主推理，输出调整建议 + 信号解读 + 风险分析。

**Guardrails**（`src/daa/modules/workbench/decisionFusion.ts`）：不可绕过的硬约束 — 仓位上限 cap、信号冲突惩罚、市场 regime 缩放。

**反馈闭环**：决策后验结果（`decisionOutcomeService.ts`）→ agent learning events（`agentLearningRepo.ts`）→ 下次决策的历史表现段。

**可调参数**（`DaaStrategyParams` in `systemConfig.ts`）：信号融合阈值、冲突惩罚系数、决策融合参数、市场 regime 阈值均可通过 `strategy.strategyParams` 配置覆盖。

### Signal Fusion (Four Dimensions)
Default weights: Human 35% + Technical 25% + News 20% + Valuation 20%
（通过 `dataSources.newsFeed.fusionWeights` 配置，或由 LLM 动态建议）

### Market Indicators (7 dimensions)
- `vix` — S&P 500 volatility
- `qqqSpyRatio` — Growth vs Value
- `fxiVolatility` — Foreign market exposure
- `kwebFxiRatio` — Tech vs China
- `btcEthRatio` — Crypto market stage
- `btcVolatility` — Crypto volatility
- `goldSilverRatio` — Risk-off/on signal

### Base Currency Convention (强制规范)

系统基准货币为 USD（`strategy.account.baseCurrency`），**所有面向用户的金额必须用基准货币**。

| 字段 | 币种 | 用途 |
|------|------|------|
| `costBasis` | 标的货币 | 审计、成本单价展示（K线成本线） |
| `costBasisInBase` | 基准货币 | PnL 计算、用户展示 |
| `valuationBase` | 基准货币 | 当前市值 |
| `unrealizedPnlBase` | 基准货币 | 浮动盈亏金额 |
| `unrealizedPnlPct` | 百分比 | 浮动盈亏百分比 |

**规则**：
- FX 转换只在交易入库时做一次（锁定交易时汇率），不随汇率浮动
- 前端组件**禁止**手动做 `costBasis * fxRateToBase`，直接用 `row.unrealizedPnlPct`
- PnL 在 `assetUniverseService.ts` 统一计算，前端只展示

### Market Data Caching Strategy (强制规范)

所有需要历史价格数据的接口**必须**使用通用缓存函数，**禁止**直接调用 Yahoo Finance：

```typescript
import { fetchPriceSeriesWithCache, fetchMultiplePriceSeriesWithCache } from "@/src/daa/modules/marketCache/priceSeriesCache";
```

缓存流程：DB 优先 → 判断新鲜度 → 按需补增量 → 异步写回 DB → 外部失败时降级返回缓存。

| 层级 | 表 | 用途 | TTL |
|------|---|------|-----|
| 快照 | `daa_market_price_snapshot` | 每个 symbol 最新价 | 15 分钟 fresh / 48 小时 stale |
| 历史 | `daa_market_price_history_v1` | 按日价格序列 | 永久（cron 定期刷新） |
| 指标 | `daa_market_indicator_snapshot_v1` | 指标百分位/趋势 | 由 cron 刷新间隔决定 |
| 原始 | `daa_external_payload_raw_v1` | Yahoo 原始响应 | 90 天 |

**不直接调 Yahoo 的接口**：indicator-series、insights、daily-analysis、drift-check
**允许直接调 Yahoo 的接口**：price-refresh cron（它是刷新源头）、fx-refresh cron

### Rebalancing Strategies
- Calendar-based (monthly / quarterly / semi-annual / annual)
- Drift-based (threshold-triggered, configurable)
- Risk-aware order generation with pre-trade checks

### Ensemble Backtest Strategies
`momentum` | `riskParity` | `minVariance` | `equalWeight` | `baseline`

## Database

Schema managed via runtime migrations in `src/daa/store/runtimeMigrations.ts`.

Core tables: `daa_account_state_v2`, `daa_asset_master`, `daa_portfolio_positions`,
`daa_target_allocations`, `daa_market_price_snapshots`, `daa_watchlist_entries`,
`daa_strategy_lab_run_snapshots`, `daa_job_execution_logs`

### 双写模式（技术债务）

当前存在两套并行的数据模型：

| 旧模型 | 新模型（规范化） | 说明 |
|--------|----------------|------|
| `daa_asset_universe`（单表存所有） | `daa_asset_master` + `daa_portfolio_positions` + `daa_watchlist_entries` + `daa_target_allocations` | 旧表仍在双写 |

**废弃计划**（按阶段推进）：
1. ✅ 当前：双写（两套表同步更新，通过 `tradeTicketStore.ts` 的 sync 逻辑）
2. 🔜 下一步：将所有写入统一到规范化表，`daa_asset_universe` 改为只读视图或物化查询
3. 最终：删除 `daa_asset_universe` 表，`assetUniverseStore.ts` 改为从规范化表 JOIN 读取

**新功能开发时**：优先使用规范化表（`daa_portfolio_positions` 等），避免直接写 `daa_asset_universe`。

## Key Files

| Purpose | Path |
|---------|------|
| Asset taxonomy & types | `src/daa/modules/workbench/assetTaxonomy.ts` |
| Featured asset catalog | `src/daa/modules/workbench/featuredAssetsCatalog.ts` |
| Rebalancing engine | `src/core/rebalanceCore.ts` |
| Signal fusion | `src/daa/signals/fusion.ts` |
| System config model | `src/daa/config/systemConfig.ts` |
| Strategy params (可调阈值) | `src/daa/config/systemConfig.ts` (`DaaStrategyParams`) |
| Market data client | `src/market/marketDataClient.ts` |
| DB schema migrations | `src/daa/store/runtimeMigrations.ts` |
| Workbench types | `src/daa/modules/workbench/workbenchTypes.ts` |
| Ensemble strategy | `src/core/ensemble/strategy.ts` |
| Core domain types | `src/core/domain.ts` |
| Asset key utilities | `src/daa/assetKey.ts` |
| API rate limiting | `src/daa/api/rateLimit.ts` |
| Market data constants | `src/market/constants.ts` |
| LLM 规划器 | `src/daa/agent/llmPlanner.ts` |
| LLM 决策器 | `src/daa/llm/llmDecision.ts` |
| 决策融合 (Guardrails) | `src/daa/modules/workbench/decisionFusion.ts` |
| Agent Tool 注册表 | `src/daa/agent/agentToolRegistry.ts` |
| Agent 学习记忆 | `src/daa/agent/agentLearningRepo.ts` |
| 决策后验服务 | `src/daa/modules/today/decisionOutcomeService.ts` |

## Development Conventions

- **Language**: All source code in TypeScript; comments and UI copy in Chinese (简体)
- **Pure vs Side-effect**: `src/core/` is pure algorithm code (no DB, no network); `src/daa/` handles orchestration and side effects
- **API routes**: Next.js App Router convention under `app/api/daa/`
- **Testing**: Vitest for unit tests; test files colocated or in `__tests__/` directories
- **Gate check**: Always run `pnpm gates` (test + typecheck + build) before considering a change complete
- **Database**: Requires real PostgreSQL (DAA_DB_URL in .env.local). Integration tests (12 files) skip automatically when no DB is configured.

## Cron Jobs (Scheduled Tasks)

### Cron 日志规范（强制规范）

所有 cron job **必须**使用 `runLoggedJob()` 包装业务逻辑，统一写入 `daa_job_execution_logs` 表。
**禁止**使用旧的 `appendDaaIngestJobLog()`（技术债务，逐步废弃）。

```typescript
import { runLoggedJob } from "@/src/daa/jobs/jobService";

const execution = await runLoggedJob({
  req,
  jobType: "cron_xxx",           // 必须以 cron_ 前缀
  triggerSource: "cron_xxx",
  handler: async () => { ... },   // 业务逻辑
  summarize: (result) => ({ ... }), // 摘要（存入 result_json）
});
```

### 数据清理策略（强制规范）

由 `cache-cleanup` cron（每日 00:20 UTC）统一执行：

| 数据 | 表 | 保留期 |
|------|---|--------|
| 原始 API 响应 | `daa_external_payload_raw_v1` | 90 天 |
| 价格快照(非 fresh) | `daa_market_price_snapshot` | 30 天 |
| 市场指标快照 | `daa_market_indicator_snapshot_v1` | 90 天 |
| 新闻 item | `daa_news_item_snapshot_v1` | 30 天 |
| 通知记录 | `daa_notification_delivery_log` | 180 天 |
| Job 日志 | `daa_job_execution_logs` + `_ingest_` | 90 天 |
| 价格历史 | `daa_market_price_history_v1` | **永久** |
| 权益快照 | `daa_equity_snapshots_v2` | **永久** |

| Job | Schedule | Purpose |
|-----|----------|---------|
| Price refresh | Every 15 min | Update market prices |
| FX refresh | Daily 5am UTC | Currency exchange rates |
| News refresh | Every 30 min | RSS/Twitter sentiment |
| Market indicators | Every 30 min | VIX, ratios, volatility |
| Daily analysis | Hourly | LLM market environment |
| Drift check | 1am & 9am UTC | Rebalance trigger detection |
| Fund manager holdings | 8am UTC | Hedge fund tracking |
| Dividend refresh | 1:30am UTC | Dividend data |
| Cache cleanup | 8:20pm UTC | Stale data removal |
| Health check | Every 30 min | 检查 price-refresh/indicators 是否正常，失败时 TG 告警 |

## Chat/Agent 架构

### 对话入口
- **Web**: `GET /api/daa/chat/sessions` + `POST /api/daa/chat/messages`
- **Telegram**: `POST /api/daa/chat/telegram/webhook`（需要先在设置页注册 Webhook）

### Agent 组件

| 组件 | 文件 | 职责 |
|------|------|------|
| Orchestrator | `src/daa/chat/chatOrchestrator.ts` | 接收消息 → 加载上下文 → 规划意图 → 执行工具 → 返回结果 |
| Intent Parser | `src/daa/chat/assistantIntentRules.ts` | 正则 + 关键词匹配 11 种意图 |
| LLM Planner | `src/daa/chat/assistantIntentPlanning.ts` | 不确定意图时调 LLM 辅助规划 |
| Tool Registry | `src/daa/chat/agentTools.ts` | 12 个工具（持仓查询/风险/市场/再平衡/交易/自由问答） |
| Context Builder | `src/daa/chat/agentContext.ts` | 构建上下文摘要（持仓+指标+信号+周期） |
| Session Memory | `src/daa/chat/chatRepo.ts` | 会话+消息+摘要+待确认动作 |
| Channel Adapters | `src/daa/chat/channelAdapters.ts` | Web/Telegram 双通道适配 |

### 意图类型
`help` | `portfolio_status` | `risk_status` | `market_status` | `latest_cycle` | `rebalance_generate` | `rebalance_execute` | `confirm_action` | `cancel_action` | `trade` | `llm_answer`

### 待确认动作
交易和再平衡执行需要用户确认（TTL 10 分钟），存储在 `daa_chat_session_memory.metaJson.pendingAction`。

## Notifications

Supported channels: Email (Resend), Telegram Bot, Feishu (Lark) Webhook.
Configured via Settings page or `daa_system_config_v2` in database.

## Error Handling Conventions (强制规范)

| 场景 | 处理方式 | 示例 |
|------|---------|------|
| 外部 API 失败（Yahoo/LLM） | `logSwallowed` + 降级返回缓存 | priceSeriesCache 降级到 DB 缓存 |
| DB 查询失败 | `logSwallowed` + 返回空/默认值 | agentContext 加载失败返回空摘要 |
| 用户输入验证 | `fail()` + 400 状态码 + 明确错误信息 | API route 参数校验 |
| 权限拒绝 | `mapDeniedResponse()` + 401/403 | 所有 API route 入口 |
| 不可恢复的逻辑错误 | `throw new Error()` | 缺少必须的配置项 |

**规则**：
- **禁止** `catch {}` 空块（必须至少 `logSwallowed`）
- **禁止** 在 cron job 中 throw（会中断后续任务）
- 前端组件用 `SectionErrorBoundary` 包裹，单个模块崩溃不影响整页
- `logSwallowed(scope, error)` 统一格式：`[scope] swallowed: error.message`

## Architecture Constraints (强制约束)

- **单租户**：所有表用硬编码 `'default'` 账户。不支持多用户/多组合。
- **baseCurrency 不可变**：系统基准货币一旦设定（默认 USD）不应更改，否则历史 PnL 失真。
- **src/core/ 零副作用**：纯算法层禁止 import `src/daa/`、`pg`、`fetch` 等。
- **DB 优先缓存**：所有历史价格接口必须走 `priceSeriesCache`，禁止直调 Yahoo。

## Not Yet Implemented

- Real broker integration / live execution
- Multiple portfolio management
- Options / derivatives support
- FX hedging strategies
- Real-time streaming prices (currently batch)
