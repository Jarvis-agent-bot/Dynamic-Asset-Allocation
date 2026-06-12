# DAA Rebalance — Dynamic Asset Allocation

## Project Overview

DAA Rebalance 是面向个人投资者的单组合动态资产配置与再平衡金融系统。

### 架构模式：Investment Review Assistant OS（AI-Native）

系统采用 **investment-judgment-driven 投资助理复核链路**：

```
observe → prioritize → investigate ⇄ reflect → review → surface → END
   ↑                                                         ↓
cron/手动                                              TG 复核简报推送
```

核心理念：系统不问"该买什么"，而是维护一组持续演化的**投资判断**，每天问"我现在最可能错在哪里"。

当前为本地模拟执行模式，不对接真实券商。手动交易/手动调仓走确认交互；自动复核授权开启时可以按显式配置自动生成并执行本地模拟调仓。

## Tech Stack

- **Framework**: Next.js 14 (App Router), React 18, TypeScript 5
- **Styling**: Tailwind CSS, shadcn/ui, Framer Motion
- **Database**: PostgreSQL
- **Auth**: 本地 PostgreSQL 账号与 Session（scrypt 密码哈希）
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
│   └── _shared/                # 跨页面复用的业务 UI 组件（AssetKlineChart / InvestmentClockWidget / rebalance/ 等）

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
│   ├── signals/                # 复核 observe-tool 数据源（无规则融合）
│   │   ├── technicalSignal.ts  # SMA, momentum, trend
│   │   ├── valuationSignal.ts  # PE, dividend yield, relative value
│   │   └── newsSignal.ts       # Sentiment analysis
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

### Featured Assets Catalog (63 items)

只列实际入库的标的；新增需求请直接在 `src/daa/modules/workbench/featuredAssetsCatalog.ts` 加 entry。

| Category | Count | Examples |
|----------|-------|---------|
| US Equities | 11 | AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, AMD, AVGO, ASML, ARM |
| HK Equities | 6 | 0700.HK (腾讯), 9988.HK (阿里), 3690.HK (美团), 1810.HK (小米), 0883.HK (中海油), 0941.HK (中国移动) |
| CN A-shares | 5 | 600519.SS (茅台), 300750.SZ (宁德), 601318.SS (平安), 600036.SS (招商), 002594.SZ (比亚迪) |
| KR Equities | 1 | 000660.KS (SK 海力士) |
| US/Global ETFs | 13 | SPY, QQQ, VTI, VT, EFA, EEM, VGK, HEDJ, EWJ, DXJ, INDA, SMH, BOTZ, CIBR |
| HK ETFs | 1 | 2800.HK (盈富) |
| CN ETFs | 4 | 510300.SS (沪深300), 510500.SS (中证500), 159915.SZ (创业板), 510880.SS (上证红利) |
| Commodities | 5 | GLD, IAU (黄金), SLV (白银), DBC (商品篮子), GC=F (黄金期货) |
| US Bonds | 6 | BND, TLT, IEF, TIP, SGOV, BIL, SHV, USFR |
| Crypto | 2 | BTC-USD, ETH-USD |
| Currency | 2 | UUP (美元多头), FXY (日元) |

**缺口**：日股 / 欧股 / 印度仅有 ETF，无个股；CN/HK 债券、A 股更多白马、EU 个股暂未覆盖。

## Key Architecture Concepts

### Asset Key Format
`{MARKET}::{SYMBOL}` (双冒号) — e.g., `US::AAPL`, `HK::0700.HK`, `CRYPTO::BTC-USD`
See `src/daa/assetKey.ts` for parsing/normalization utilities.

### Investment Review Assistant OS（AI-Native 架构，当前）

基于 LangGraph.js 的 investment-judgment-driven 投资助理复核链路。所有参数通过 Settings → 投资助理自动复核配置。

**工作流**（`src/daa/agent/cognitiveGraph.ts`）：
```
observe → prioritize → investigate ⇄ reflect → review → surface → END
```

| 节点 | 职责 | LLM 调用 |
|------|------|---------|
| `observe` | 读取持仓 + 市场指标 + 新闻 + **加载 DB 配置** + **经验记录衰减** | 否 |
| `prioritize` | 选择最需复核的投资判断（数量由 `maxInvestigationTargets` 配置） | 是（投委会主席） |
| `investigate` | 并行收集依据（Promise.allSettled）+ 推理 + 更新投资判断 | 是（研究分析师） |
| `reflect` | conviction 变化时反思 + 生成经验记录（含 thesis 关联） | 是（首席风控官） |
| `review` | 到期投资判断复盘 + 评分（含真实价格变动 ground truth） | 是（复盘审计师） |
| `surface` | 生成每日复核简报 + **风险建模** + **判断不一致检测** + TG 推送 | 是（复核简报编辑） |

**健壮性机制**：
- LLM 调用带指数退避重试（最多 3 次，仅网络/429 错误）
- 连续 LLM 失败触发熔断（阈值可配置，跳过剩余 LLM 调用）
- 所有 LLM 输出经 `validateShape()` 结构校验
- 每个 prompt 包含 few-shot JSON 示例
- 新投资判断创建前去重检查（assetKeys + 标题 pg_trgm 相似度 ≥ 0.40）
- 单资产投资判断上限 `MAX_ACTIVE_THESES_PER_ASSET = 5`（防止热门标的积累几十条并行判断）
- review 节点 LLM 同时输出 `shouldInvalidate` 和 `shouldArchive`：判断失效 → `status='invalidated'`；已兑现 → `status='archived'`；都不是 → 30 天后再复盘
- 自动复核执行统一经过 `AutomationAuthority`、单笔 NAV 上限、执行前风控和本地执行网关；LLM 只能输出本轮目标权重计划，不能直接改永久配置或绕过执行授权

**数据模型**（8 张表）：
- `daa_research_threads` — 投资判断（内部仍沿用 thesis 存储契约）
- `daa_evidence_items` — 依据链（pg_trgm 子串索引，供 `search_past_reasoning` 工具）
- `daa_agent_runs` — 运行记录（含完整 briefing JSONB）
- `daa_agent_memory` — 经验库记录（内部仍沿用 memory 存储契约；pgvector 1024 维 + pg_trgm 子串索引，Hebbian 增强 + 指数衰减）
- `daa_thesis_reviews` — 决策复盘
- `daa_agent_entity` — 实体主表（asset / thesis_id / regime / ticker / news_source / strategy_tag）
- `daa_memory_entity_link` — 记忆 ↔ 实体（many-to-many，weight 越高越紧密）
- `daa_thesis_entity_link` — 投资判断 ↔ 实体

**五类输出**（DailyBriefing）：
1. **需要复核的变化** — 最需要检查原判断的市场变化（severity 1-10）
2. **复核优先级** — 高权重但久未复核的持仓
3. **改观条件** — 什么会让投资助理改变当前判断
4. **风险暴露** — 各 thesis 失效对组合的影响（暴露% + 预估损失%）
5. **判断不一致** — 方向矛盾的 thesis 对（assetKeys 交集 + conviction 矛盾）

**经验库管理**：
- **增强**: 每次被 `recallMemory` 召回时 strength +0.1（Hebbian）
- **衰减**: 每个 cycle 开始时 `strength *= decayRate^days_since_last_access`（默认 0.97/天，约 23 天半衰期）
- **归档**: `strength < 0.05` 的经验记录不参与召回，但仍可在经验库中查看
- **关联**: 创建时 `relevanceTags` 包含 threadId，召回时优先匹配关联投资判断

**三路召回**（investigateNode ReAct 前一次性并行）：
1. **pgvector 语义**：BGE-M3 1024d 余弦相似度，按 `similarity × strength` 排序
2. **pg_trgm 关键字**（`recallMemoryHybrid`）：从 `thread.assetKeys` 抽 ticker 子串匹配，命中精确 ticker / 数字 / 术语
3. **实体图**：`thread.assetKeys` → `daa_memory_entity_link` JOIN，补位同资产历史记忆

**实体图**：6 种 kind 自动抽取
- `asset`（US::NVDA）、`ticker`（NVDA）、`thesis_id`（UUID）、`regime`（risk_off/on/transitional）
- `news_source`（reuters/bloomberg/wsj/ft/cnbc/xueqiu/alpaca/benzinga/finnhub/yahoo/sec_filing）、`strategy_tag`（thesis.tags）
- 抽取内嵌于 `createMemory` / `createResearchThread`，所有调用方自动获得链接
- 投资助理工具 `query_entity_history(kind, value)` 回答"关于 NVDA 学到过什么"类查询

**API**：
- `POST /api/daa/agent/run` — 手动触发投资助理复核循环
- `POST /api/daa/agent/bootstrap` — 建立初始投资判断（扫描持仓）
- `GET /api/daa/agent/theses` — 获取活跃投资判断 + 最新 briefing
- `GET /api/daa/agent/thesis/[id]` — 投资判断详情（依据链 + 复盘历史）
- `GET /api/daa/agent/memories` — 分页列出经验记录（支持类型过滤，API 路径保留兼容命名）
- `DELETE /api/daa/agent/memories?id=xxx` — 删除单条经验记录
- `POST /api/daa/cron/cognitive-agent` — 定时 cron（自门控：检查 schedule + scheduleTimesUtc）

**UI**：
- Today 页 → 今日复核工作台（需要复核/优先级/改观/不一致/风险）
- Today 页 → 投资判断详情页（`/today/thesis/[id]`，依据时间线 + 复盘历史）
- Today 页 → 经验库（`/today/experience-library`，分页列表 + 类型过滤 + 删除；`/today/memories` 保留重定向）
- Settings → 投资助理自动复核（复核数量/复盘周期/运行频率/经验衰减率/熔断阈值）

**配置**（`systemConfig.cognitiveAgent`）：
| 参数 | 默认值 | 说明 |
|------|--------|------|
| `enabled` | true | 是否启用投资助理复核 |
| `maxInvestigationTargets` | 3 | 每次复核最大投资判断数 |
| `reviewIntervalDays` | 14 | 新投资判断默认复盘间隔 |
| `memoryRecallLimit` | 5 | 每次复核召回经验记录数 |
| `circuitBreakerThreshold` | 3 | 连续 LLM 失败触发熔断 |
| `schedule` | "2x_daily" | 运行频率（2x_daily/daily/every_6h/manual_only） |
| `scheduleTimesUtc` | ["13:00","21:00"] | 运行时间窗口 UTC（±30 分钟匹配） |
| `memoryDecayRate` | 0.97 | 每天衰减率 |
| `memoryArchiveThreshold` | 0.05 | 低于此 strength 排除召回 |

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
- Assistant-triggered (投资助理 LLM 输出目标权重计划；自动复核授权下定时循环、新闻刷新和实时重大事件可主动触发)
- Risk-aware order generation with pre-trade checks

### 目标权重计划（AI 驱动调仓）

投资助理每个 cycle 在 surfaceNode 末尾调用 LLM 目标权重建议，输出本轮 `targetAllocationPlan`：

| 功能 | 描述 | 约束 |
|------|------|------|
| 目标权重计划 | 投资助理给出最终目标权重，而不是修改系统配置 | 只作用于本轮 cycle |
| 资产范围 | 只接受资产池里已知的 `assetKey` | 未知资产直接跳过 |
| 置信度过滤 | 低置信度 intent 不进入执行层 | 默认阈值 70 |
| 单仓截断 | 目标权重不能超过 `maxPositionPct` | 只截断，不自动放宽护栏 |
| 自动执行 | 统一走本地执行网关 | `autoExecuteMaxSinglePct` + 执行前风控 |

**安全约束**：
- 投资助理不能自动修改 `systemConfig`
- 0 条可执行提案时跳过创建 cycle
- 自动复核只消费本轮复核运行产出的目标权重计划，避免误用历史建议主动执行
- 所有自动执行路径共用 `executeAutoRebalanceCycle`
- LLM 失败不影响正常复核 cycle（熔断兼容）

### Ensemble Backtest Strategies
`momentum` | `riskParity` | `minVariance` | `equalWeight` | `baseline`

## Database

Schema managed via runtime migrations in `src/daa/store/runtimeMigrations.ts`.

Core tables: `daa_account_state_v2`, `daa_asset_master`, `daa_positions_v2`,
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

## Key Files

| Purpose | Path |
|---------|------|
| Asset taxonomy & types | `src/daa/modules/workbench/assetTaxonomy.ts` |
| Featured asset catalog | `src/daa/modules/workbench/featuredAssetsCatalog.ts` |
| Rebalancing engine | `src/core/rebalanceCore.ts` |
| System config model | `src/daa/config/systemConfig.ts` |
| Authority gate（自动/手动执行授权） | `src/daa/automation/automationAuthority.ts` |
| Portfolio valuation（金额来源） | `src/daa/modules/portfolio/portfolioValuation.ts` |
| Market data client | `src/market/marketDataClient.ts` |
| DB schema migrations | `src/daa/store/runtimeMigrations.ts` |
| Workbench types | `src/daa/modules/workbench/workbenchTypes.ts` |
| Ensemble strategy | `src/core/ensemble/strategy.ts` |
| Core domain types | `src/core/domain.ts` |
| Asset key utilities | `src/daa/assetKey.ts` |
| API rate limiting | `src/daa/api/rateLimit.ts` |
| Market data constants | `src/market/constants.ts` |
| **投资助理复核工作流** | `src/daa/agent/cognitiveGraph.ts` |
| 复核工作流类型 | `src/daa/agent/cognitiveTypes.ts` |
| 复核工作流状态 | `src/daa/agent/cognitiveState.ts` |
| 复核工作流 Prompts | `src/daa/agent/cognitivePrompts.ts` |
| 复核调仓适配器 | `src/daa/agent/agentRebalanceAdapter.ts` |
| 投资判断 Store（内部 thesis 契约） | `src/daa/agent/store/thesisStore.ts` |
| 经验库 Store（内部 memory 契约，pgvector） | `src/daa/agent/store/memoryStore.ts` |
| 复核运行 Store | `src/daa/agent/store/agentRunStore.ts` |
| 投资判断 Bootstrap | `src/daa/agent/bootstrap.ts` |
| Embedding (1024d) | `src/daa/agent/embedding.ts` |
| 复核工具注册表（V2 动态自注册） | `src/daa/agent/tools/registry.ts` |
| 复核工具定义（16 工具） | `src/daa/agent/tools/index.ts` |
| 投资助理复盘经验 | `src/daa/agent/agentLearningRepo.ts` |
| **Episodic 关键字搜索** (pg_trgm) | `searchMemoriesByKeyword` in `memoryStore.ts`、`searchEvidenceByKeyword` in `thesisStore.ts` |
| **实体图抽取** | `src/daa/agent/entities/entityExtractor.ts` |
| **实体图存储** | `src/daa/agent/entities/entityStore.ts` |
| 交易反馈闭环 | `src/daa/agent/tradeOutcomeFeedback.ts` |

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
| 投资助理复核 | Hourly (自门控) | 投资判断复核循环（按 Settings 配置的 schedule + scheduleTimesUtc 自门控） |
| Entity backfill | Daily 3:40am UTC | 为存量经验记录/投资判断补齐实体图（幂等，每次最多 200+200 条） |

## 对话/投资助理架构

### 对话入口
- **Web**: `GET /api/daa/chat/sessions` + `POST /api/daa/chat/messages`
- **Telegram**: `POST /api/daa/chat/telegram/webhook`（需要先在设置页注册 Webhook）

### 对话助手组件

| 组件 | 文件 | 职责 |
|------|------|------|
| Orchestrator | `src/daa/chat/chatOrchestrator.ts` | 接收消息 → 加载上下文 → 规划意图 → 执行工具 → 返回结果 |
| Intent Parser | `src/daa/chat/assistantIntentRules.ts` | 正则 + 关键词匹配 13 种意图 |
| LLM Planner | `src/daa/chat/assistantIntentPlanning.ts` | 不确定意图时调 LLM 辅助规划 |
| Tool Registry | `src/daa/chat/agentTools.ts` | 14 个对话工具（持仓/风险/市场/再平衡/交易/投资判断查询/复核简报查询/自由问答） |
| Context Builder | `src/daa/chat/agentContext.ts` | 构建对话上下文摘要（持仓+指标+信号+周期） |
| Session State | `src/daa/chat/chatRepo.ts` | 会话+消息+摘要+待确认动作 |
| Channel Adapters | `src/daa/chat/channelAdapters.ts` | Web/Telegram 双通道适配 |

### 意图类型
`help` | `portfolio_status` | `risk_status` | `market_status` | `latest_cycle` | `rebalance_generate` | `rebalance_execute` | `confirm_action` | `cancel_action` | `trade` | `thesis_status` | `agent_briefing` | `llm_answer`

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

## Deployment（VPS Docker）

```
docker-compose.yml
├── daa-web       Next.js app (port 3000, behind nginx reverse proxy)
├── daa-cron      Alpine + crond (curl 调 daa-web API，用 DAA_CRON_TOKEN 认证)
├── postgres      pgvector:pg16 + pg_trgm (port 15432, volume: daa-postgres-data)
├── ollama        本地 embedding（BGE-M3 1024d, 内部 11434, volume: daa-ollama-data）
└── ollama-init   一次性：拉取 bge-m3 模型（首启后自动退出）
```

**启用本地 embedding**：
```
DAA_EMBEDDING_PROVIDER=ollama
# 无需 API Key；docker compose up 后 ollama-init 会自动 pull bge-m3
# 手动触发：docker exec daa-ollama ollama pull bge-m3
```

**关键环境变量**（`.env` 文件）：
| 变量 | 用途 |
|------|------|
| `DAA_CRON_TOKEN` | Cron 容器调 API 的认证 token |
| `DAA_SECRETS_ENCRYPTION_KEY` | DB 中 secrets 加密密钥 |
| `ALPACA_API_KEY_ID` / `ALPACA_API_SECRET_KEY` | Alpaca 免费 News API（REST + WebSocket 实时，Benzinga 源，US 主源） |
| `DAA_EMBEDDING_PROVIDER` | Embedding 提供商（siliconflow/deepseek/openai） |
| `DAA_EMBEDDING_API_KEY` | Embedding API key |

**新闻数据源**：
| Provider | 模式 | 覆盖市场 | 优先级 | 备注 |
|----------|------|---------|--------|------|
| Alpaca (Benzinga) | REST + **WebSocket 推送** | US | 主源 | 免费无实名，WS 秒级延迟 |
| Yahoo RSS | REST | US/HK/CN/JP/EU | Fallback | 无需 Key；HK/CN 等富途 OpenD |

**实时推送链路**（`daa-ws-news` 容器）：
```
wss://stream.data.alpaca.markets/v1beta1/news
  ├─ 每 5min GET /api/daa/news/subscribed-symbols (持仓+watchlist 的 US symbol)
  └─ 收到 news 事件 → POST /api/daa/news/realtime-event
       ├─ 写 daa_news_item_snapshot_v1
       └─ 若命中持仓 → LLM 分析 → majorEvent=high 时即时 TG push (24h 去重)
```
