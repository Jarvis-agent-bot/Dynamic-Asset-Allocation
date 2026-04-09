# DAA Console — Dynamic Asset Allocation

## Project Overview

DAA Console 是面向个人投资者的单组合动态资产配置系统，品牌名 **DeepLedger**。

### 架构模式：Cognitive Agent OS（AI-Native）

系统采用 **thesis-driven Cognitive Agent** 架构：

```
observe → prioritize → investigate ⇄ reflect → review → surface → END
   ↑                                                         ↓
cron/手动                                              TG 日报推送
```

核心理念：系统不问"该买什么"，而是维护一组持续演化的**投资论点（Thesis）**，每天问"我现在最可能错在哪里"。

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

### Cognitive Agent OS（AI-Native 架构，当前）

基于 LangGraph.js 的 thesis-driven 认知 Agent，通过 `systemConfig.agentMode` 切换。

**工作流**（`src/daa/agent/cognitiveGraph.ts`）：
```
observe → prioritize → investigate ⇄ reflect → review → surface → END
```

| 节点 | 职责 | LLM 调用 |
|------|------|---------|
| `observe` | 读取持仓 + 市场指标 + 新闻 | 否 |
| `prioritize` | 选择 1-3 个最需调查的 thesis | 是（投委会主席） |
| `investigate` | 收集证据 + 推理 + 更新 thesis | 是（研究分析师） |
| `reflect` | conviction 变化时反思 + 生成记忆 | 是（首席风控官） |
| `review` | 到期 thesis 复盘 + 评分 | 是（复盘审计师） |
| `surface` | 生成 DailyBriefing + TG 推送 | 是（日报编辑） |

**数据模型**（5 张表）：
- `daa_research_threads` — 研究论点
- `daa_evidence_items` — 证据链
- `daa_agent_runs` — 运行记录
- `daa_agent_memory` — 长期记忆（pgvector 384 维）
- `daa_thesis_reviews` — 决策复盘

**三类输出**（DailyBriefing）：
1. **今日意外** — 最不符合现有认知的市场变化
2. **认知缺口** — 高权重但久未调查的持仓
3. **改观条件** — 什么会让 Agent 改变当前判断

**API**：
- `POST /api/daa/agent/run` — 手动触发 Agent 循环
- `POST /api/daa/agent/bootstrap` — 初始化 thesis（扫描持仓）
- `GET /api/daa/agent/theses` — 获取活跃论点
- `POST /api/daa/cron/cognitive-agent` — 定时 cron

**UI**：
- Today 页 → Agent Briefing 视图
- Agent Rail → 全站右侧认知面板（xl 屏幕）

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

### 数据模型（规范化）

资产数据分散在多张规范化表中，通过 `listDaaAssetUniverse()` 的 5-table JOIN 统一读取：

| 表 | 职责 |
|----|------|
| `daa_asset_master` | 元数据（symbol, market, currency, asset_class, region 等） |
| `daa_positions_v2` | 当前持仓（qty, price, cost_basis） |
| `daa_watchlist_entries` | 观察列表标记、备注、价格提醒 |
| `daa_target_allocations` | 目标权重 |
| `daa_market_price_snapshots` | 最新市场价格 |

**注意**：旧表 `daa_asset_universe` 仍存在于数据库中但已不再读写，待后续清理。

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
| **Cognitive Agent 工作流** | `src/daa/agent/cognitiveGraph.ts` |
| Cognitive Agent 类型 | `src/daa/agent/cognitiveTypes.ts` |
| Cognitive Agent 状态 | `src/daa/agent/cognitiveState.ts` |
| Cognitive Agent Prompts | `src/daa/agent/cognitivePrompts.ts` |
| Agent Rebalance 适配器 | `src/daa/agent/agentRebalanceAdapter.ts` |
| Thesis Store | `src/daa/agent/store/thesisStore.ts` |
| Memory Store (pgvector) | `src/daa/agent/store/memoryStore.ts` |
| Agent Run Store | `src/daa/agent/store/agentRunStore.ts` |
| Thesis Bootstrap | `src/daa/agent/bootstrap.ts` |
| Embedding (384d) | `src/daa/agent/embedding.ts` |
| Agent Tool 注册表 | `src/daa/agent/agentToolRegistry.ts` |
| Agent 学习记忆 | `src/daa/agent/agentLearningRepo.ts` |
| 信号概览（insights 展示用） | `src/daa/signals/fusion.ts` |
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
