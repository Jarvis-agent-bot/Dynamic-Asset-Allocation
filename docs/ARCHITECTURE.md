# DAA Rebalance — 系统架构

> 面向：技术读者、贡献者、架构评审
> 范围：代码分层、模块职责、数据流、数据模型、关键约束
> 投资助理复核工作流细节见 [COGNITIVE_AGENT.md](./COGNITIVE_AGENT.md)；部署运维见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

---

## 1. 系统定位

DAA Rebalance 是面向个人/小团队管理者的动态资产配置与再平衡金融系统。

- 不是实盘交易系统 — 默认执行边界是本地 `sim` / `crypto_paper`，不向真实券商下单
- 不是开放式多租户 SaaS — 当前以一个 admin 账户为主，但核心组合、观察列表、交易和通知数据已按 `owner_account_id` 做账户隔离
- 是"观察 + 投资判断复核 + 目标权重计划 + 本地模拟执行 + 复盘"的闭环工作台
- AI-Native：系统不只是展示数据，而是维护一组持续演化的**投资判断**，每天自问"我现在最可能错在哪里"

---

## 2. 技术栈

| 层次 | 选型 | 版本 | 用途 |
|------|------|------|------|
| 框架 | Next.js | 14.2.5 (App Router) | 前后端一体 |
| UI | React + TypeScript | 18.3 / 5.9 | — |
| 样式 | Tailwind CSS + shadcn/ui | 3.4 / Radix UI | 设计系统 |
| 图表 | Recharts + lightweight-charts | 3.7 / 5.1 | K 线 + 指标 |
| 数据库 | PostgreSQL + pgvector | pg16 / 0.2 | 主存储 + 向量检索 |
| 全文检索 | `pg_trgm` (Postgres 内置扩展) | — | 关键字/子串 |
| LLM | DeepSeek（主）· OpenAI 兼容（备） | — | 决策 / 反思 / 复核简报 |
| Embedding | Ollama `bge-m3`（本地）/ SiliconFlow / OpenAI | 1024 维 | 经验库语义检索 |
| 复核工作流 | `@langchain/langgraph` | 1.2.8 | 投资助理复核 6 节点编排 |
| 认证 | 本地 Postgres Auth | `daa_auth_accounts` / `daa_auth_sessions` | 登录 / 会话 / 角色 |
| 通知 | Telegram Bot · Feishu · Email (Resend) | — | 复核简报推送 + 告警 |
| 测试 | Vitest（单测）· Playwright（e2e） | 4.0 / 1.58 | — |
| 包管理 | pnpm | 10.28.2 | — |
| 运行时 | Node.js 20 | on Docker | — |

---

## 3. 代码分层

```
┌────────────────────────────────────────────────────────────────┐
│  UI Layer     app/daa/dashboard/                               │
│  ├─ today/         今日复核工作台（投资判断 + 经验库）         │
│  ├─ portfolio/     组合与观察列表                              │
│  ├─ rebalance/     漂移检测与调仓建议                          │
│  ├─ trades/        交易记录与复盘                              │
│  ├─ strategy-lab/  策略回测实验室                              │
│  ├─ settings/      策略 / 风控 / 数据源 / 通知 / 投资助理      │
│  ├─ _shared/       跨页共享 UI（K 线、持仓面板、再平衡组件）  │
│  ├─ _components/   壳组件（WorkbenchShell / Nav）             │
│  └─ _hooks/        页面模型与流程 hook                         │
├────────────────────────────────────────────────────────────────┤
│  API Layer    app/api/daa/                                     │
│  ├─ auth/          本地账号 / 会话 / 角色管理                  │
│  ├─ workbench/     资产发现 / 洞察 / 再平衡 / 执行             │
│  ├─ read/          聚合读模型（组合 / 交易 / today）           │
│  ├─ store/         持久化写入（配置 / 账本 / 快照）            │
│  ├─ market/        行情代理（Yahoo / yfinance / 指标序列）     │
│  ├─ agent/         投资助理复核 API（run / theses / memories） │
│  ├─ chat/          Web 对话 + Telegram webhook                 │
│  ├─ hf/            基金经理持仓追踪                            │
│  └─ cron/          14 个定时 Job 入口（DAA_CRON_TOKEN 鉴权）  │
├────────────────────────────────────────────────────────────────┤
│  Business     src/daa/     （编排 + 副作用）                   │
│  ├─ agent/         投资助理复核链路（6 节点 + 经验库三层检索 + 16 tools）│
│  ├─ entities/      实体图抽取与存储                            │
│  ├─ modules/       workbench / portfolio / trade /            │
│  │                 marketContext / decision / dividend         │
│  ├─ signals/       technical / valuation / news / human / fusion │
│  ├─ chat/          对话编排 + 意图识别 + 工具 + 通道适配器     │
│  ├─ store/         25+ domain stores（Postgres CRUD）         │
│  ├─ pg/            连接池 + 运行时迁移                         │
│  ├─ jobs/          `runLoggedJob()` 统一 cron 包装             │
│  ├─ config/        系统配置 / secrets / 货币                   │
│  ├─ llm/           DeepSeek / 兼容 OpenAI 客户端               │
│  └─ notify/        Telegram / Feishu / Email                   │
├────────────────────────────────────────────────────────────────┤
│  Core         src/core/   （纯算法，零副作用，零 import daa）  │
│  ├─ rebalanceCore.ts    订单生成 / 漂移 / 约束                │
│  ├─ ensemble/           多资产目标权重生成                     │
│  ├─ backtest/           归因分析                               │
│  └─ domain.ts           PriceBar / BacktestMetrics 类型       │
├────────────────────────────────────────────────────────────────┤
│  Market       src/market/                                      │
│  ├─ yfinance.ts         Yahoo Finance 适配器                   │
│  ├─ yahooRssFetch.ts    Yahoo RSS 新闻                         │
│  ├─ marketDataClient.ts 统一行情客户端                         │
│  └─ constants.ts        共享常量（User-Agent 等）              │
└────────────────────────────────────────────────────────────────┘
```

**分层硬约束**：
- `src/core/` 禁止 import `src/daa/`、`pg`、`fetch` 等副作用依赖
- `app/` 只能通过 API 和 `src/daa/` 交互，不直连 DB
- 跨层依赖违反即视为 bug

---

## 4. 六大业务模块

### 4.1 Investment Review Assistant OS（AI-Native 核心）

Investment-judgment-driven 的投资助理复核链路，基于 LangGraph.js 实现的 6 节点循环：

```
observe → prioritize → investigate ⇄ reflect → review → surface → END
   ↑                                                         ↓
 cron / 手动 / 重大新闻事件                          TG 复核简报 + 目标权重计划
```

每次 cycle 会：加载持仓+市场+新闻 → 选最需复核的投资判断 → 并行依据收集 + ReAct → 反思 + 生成经验记录 → 到期投资判断复盘 → 生成每日复核简报（5 面板：需要复核的变化 / 复核优先级 / 改观条件 / 判断不一致 / 风险暴露），必要时输出本轮目标权重计划并推 Telegram。

**详细见 [COGNITIVE_AGENT.md](./COGNITIVE_AGENT.md)**。

### 4.2 再平衡引擎

| 阶段 | 实现 |
|------|------|
| 漂移检测 | 按资产目标权重对比当前权重，行动外圈由 `policy.drift.outerBandPct` 控制（默认 5%） |
| 定期复盘 | monthly / quarterly / semi-annual / annual 只表示组合复盘节奏，不直接等同交易理由 |
| 投资助理触发 | 投资助理 LLM 建议主动调仓；自动复核授权下由定时循环、新闻刷新或实时重大事件主动触发 |
| 信号融合 | 四维信号加权合成 conviction → buy/sell/hold 建议 |
| 订单生成 | `src/core/rebalanceCore.ts` 纯算法：最小化交易次数，满足权重约束 |
| 风控预检 | 市场 regime、单仓上限、流动性、手续费阈值 |
| 模拟执行 | 无券商对接，经 trade ticket / execution gateway 写入本地模拟账本与 `daa_positions_v2` |
| 执行边界 | 自动复核可在显式配置下执行本地模拟账本；真实券商链路未接入 |

**自动化权限边界**：

所有自动执行统一经过 `src/daa/automation/automationAuthority.ts`：

1. `brain.mode` 必须允许对应动作。
2. `policy.enabled`、`policy.execution.autoGenerateEnabled`、`policy.execution.autoExecuteEnabled` 必须同时开启。
3. 执行网关必须是本地模拟网关。
4. 必须存在可执行 cycle 与 proposal。
5. 之后继续经过 `policy.execution.maxSingleOrderPctOfNav`、执行前风控、trade ticket 执行校验。

因此，自动复核可以执行本地模拟调仓，但只能在本地模拟账户内执行，不能绕过 Authority 直接从 LLM 输出下单。

**信号融合**（`src/daa/signals/fusion.ts`）：
- `technicalSignal.ts` — SMA / 动量 / 趋势
- `valuationSignal.ts` — PE / 股息率 / 相对估值
- `newsSignal.ts` — 新闻情绪分析
- `humanSignal.ts` — 基金经理持仓追踪
- 默认权重：human 35% / technical 25% / news 20% / valuation 20%

### 4.3 Market Data 层

**强制规范：所有历史价格接口必须走 `priceSeriesCache`，禁止直调 Yahoo。**

三层缓存 TTL 策略：

| 层 | 表 | 策略 |
|----|----|------|
| 最新快照 | `daa_market_price_snapshots` | 5 分钟 fresh / 48 小时 stale |
| 历史序列 | `daa_market_price_history_v1` | 永久（cron 定期刷新） |
| 指标 | `daa_market_indicator_snapshot_v1` | 由市场状态缓存有效期决定 |
| 原始响应 | `daa_external_payload_raw_v1` | 90 天 |

流程：**DB 优先 → 判断新鲜度 → 按需补增量 → 异步写回 DB → 外部失败时降级返回缓存**。

### 4.3.1 Market Session Guard

所有模拟执行入口必须经过 `src/daa/marketSession`：

- `marketSessionCalendar.ts` 负责交易所时区、节假日、半日市、午休和常规交易时段判断。
- `marketSessionExecutionGuard.ts` 负责把市场状态转换成执行层错误码。
- 手动交易、再平衡执行和自动执行共享同一个守门结果，避免各链路重复实现交易时段判断。
- 行情缓存中的 `priceUpdatedAt` 表示真实行情 bar 时间，不表示本次抓取时间；抓取时间保存在缓存行 / raw payload 的 fetched 字段。

当前内置 `US`、`HK`、`CRYPTO`。后续扩展其他市场必须先补日历数据和测试。

支持的资产类别（AssetClass）：`EQUITY` / `ETF` / `BOND` / `COMMODITY` / `CASH` / `CRYPTO` / `FUND` / `INDEX` / `CURRENCY` / `OTHER`。
支持的市场（Region）：`US` / `HK` / `CN` / `EU` / `JP` / `GLOBAL` / `OTHER`。

### 4.4 Portfolio / Trade

规范化数据模型（摒弃单一 `daa_asset_universe` 大表）：

| 表 | 职责 |
|----|------|
| `daa_asset_master` | 元数据（symbol / market / currency / asset_class / region） |
| `daa_positions_v2` | 当前持仓（qty / 平均成本 / 成本基准） |
| `daa_watchlist_entries` | 观察列表 + 入场候选规则 + 价格提醒 |
| `daa_target_allocations` | 目标权重 |
| `daa_market_price_snapshots` | 最新市场价 |

读取统一走 `listDaaAssetUniverse()` 的 5-table JOIN。

### 4.5 Chat / 投资助理对话层

双通道：
- **Web** — `POST /api/daa/chat/messages` + `GET /api/daa/chat/sessions`
- **Telegram** — `POST /api/daa/chat/telegram/webhook`（需先在 Settings 注册 Webhook）

14 种意图（`assistantIntentRules.ts`）：
`help / portfolio_status / risk_status / market_status / latest_cycle / rebalance_generate / rebalance_execute / confirm_action / cancel_action / trade / thesis_status / agent_briefing / llm_answer`。

所有写操作（交易 / 再平衡执行）需用户确认，pending action 存在 `daa_chat_session_memory.metaJson.pendingAction`，TTL 10 分钟。

### 4.6 策略实验室（Strategy Lab）

多策略回测：`momentum` / `riskParity` / `minVariance` / `equalWeight` / `baseline`。结果快照入 `daa_strategy_lab_run_snapshots`。

---

## 5. 数据模型（核心表）

### 5.1 投资助理 / 经验库（核心表）

```
daa_research_threads    — 投资判断（内部 thesis 契约，status/conviction/reviewAt）
daa_evidence_items      — 依据链（supporting/contradicting/neutral）
daa_agent_runs          — 投资助理运行记录（完整 briefing JSONB）
daa_agent_memory        — 经验库记录（内部 memory 契约，vector(1024) + pg_trgm GIN 子串索引）
daa_thesis_reviews      — 决策复盘（accuracy_score + lessons_learned）
daa_agent_entity        — 实体主表（asset/ticker/thesis_id/regime/news_source/strategy_tag）
daa_memory_entity_link  — 记忆 ↔ 实体（weight, many-to-many）
daa_thesis_entity_link  — 投资判断 ↔ 实体
daa_agent_tool_executions  — 工具调用日志（输入/输出/延迟）
daa_agent_strategies    — 从高准确率 run 提取的复核策略模板
```

### 5.2 组合与交易（5 张）

```
daa_asset_master           — 资产元数据
daa_positions_v2           — 当前持仓
daa_watchlist_entries      — 观察列表 + 入场候选
daa_target_allocations     — 目标权重
daa_trade_tickets          — 交易草稿、提交与执行状态
```

### 5.3 市场数据与新闻智能

```
daa_market_price_snapshots          — 最新价
daa_market_price_history_v1         — 历史序列（永久）
daa_market_indicator_snapshot_v1    — 指标（VIX / 比率等）
daa_macro_cycle_snapshots           — 宏观周期
daa_external_payload_raw_v1         — 原始 API 响应（90 天）
daa_news_item_snapshot_v1           — 新闻原始 item 快照（30 天）
daa_news_signal_snapshot_v1         — symbol 级新闻信号快照
daa_news_event_snapshot_v1          — 新闻事件层快照（30 天）
daa_news_event_graph_v1             — 事件主题图谱摘要（30 天）
daa_news_event_related_asset_v1     — 事件 ↔ 关联资产边表（30 天）
daa_news_portfolio_impact_v1        — 账户组合影响判断（90 天）
daa_discovery_candidates_v1         — 候选发现池，保留人工复核状态与审计字段
```

### 5.4 运营与其他

```
daa_account_state_v2               — 账户状态
daa_equity_snapshots_v2            — 权益快照（永久）
daa_job_execution_logs             — Cron 日志（90 天）
daa_notification_delivery_logs     — 通知发送记录
daa_today_cache                    — Today 页面缓存
daa_strategy_lab_run_snapshots     — 回测快照
daa_broker_*                       — 本地执行网关的订单/账户/持仓快照
daa_schema_migrations_v1           — 迁移元表
```

迁移脚本：`src/daa/store/runtimeMigrations.ts`，应用在 web 容器冷启动时自动执行（向后兼容，无 DOWN）。

---

## 6. 核心约束（强制规范）

### 6.1 账户隔离与权限边界

系统不是开放注册的 SaaS，但不能再假设所有业务表都硬编码 `'default'`。当前规则：

- 登录、会话和角色在 `daa_auth_accounts` / `daa_auth_sessions` 中维护。
- 持仓、观察列表、目标权重、交易、调仓周期、通知和组合影响等账户相关表必须带 `owner_account_id`。
- 资产主数据、市场价格、新闻 item、新闻事件图谱属于全局事实层；组合影响和候选处理状态属于账户层。
- AI 只能生成候选、影响判断和建议动作；加入观察列表、忽略候选、调仓和执行都必须经过权限与策略门禁。

### 6.2 Money / Valuation Domain

系统基准货币默认 USD，一旦设定不应更改，否则历史 PnL 失真。运行时账户状态是基准货币 source of truth，系统配置只作为默认值和展示配置。

所有组合级金额必须由 Money/Valuation Domain 输出，不能在 UI、投资助理、通知或 cron 中各自拼装：

| 字段 | 币种 | 用途 |
|------|------|------|
| `costBasis` | 标的货币 | 审计、成本单价展示 |
| `costBasisInBase` | 基准货币 | **PnL 计算、用户展示** |
| `valuationBase` | 基准货币 | 当前市值 |
| `unrealizedPnlBase` | 基准货币 | 浮动盈亏金额 |
| `unrealizedPnlPct` | 百分比 | 浮动盈亏百分比 |
| `derivedTotalEquity` | 基准货币 | `holdingsValue + cash` 推导权益 |
| `totalEquity` | 基准货币 | 权重、风控和自动执行上限使用的总权益 |
| `equitySource` | 枚举 | `derived_mark_to_market` / `account_state_override` |

缺失 FX 时，展示层可以带状态降级，执行层不可静默按 1:1 处理。

FX 转换只在交易入库时做一次（锁定当时汇率），不随汇率浮动。前端**禁止**手动 `costBasis * fxRate`。

### 6.3 Asset Key 格式

`{MARKET}::{SYMBOL}`（双冒号），例如：`US::AAPL` / `HK::0700.HK` / `CRYPTO::BTC-USD`。

解析工具：`src/daa/assetKey.ts`。

### 6.4 错误处理约定

| 场景 | 做法 |
|------|------|
| 外部 API 失败 | `logSwallowed` + 降级返回缓存 |
| DB 失败 | `logSwallowed` + 返回空/默认值 |
| 用户输入校验 | `fail()` + 400 |
| 权限 | `mapDeniedResponse()` + 401/403 |
| 不可恢复逻辑错误 | `throw new Error()` |

**禁止**：`catch {}` 空块（必须至少 `logSwallowed`）；cron job 中 `throw`（会中断后续 job）。
前端组件用 `SectionErrorBoundary` 包裹，模块崩溃不影响整页。

### 6.5 Cron 日志规范

所有 cron job 必须用 `runLoggedJob()` 包装，统一写 `daa_job_execution_logs`。

```ts
await runLoggedJob({
  req,
  jobType: "cron_xxx",             // 必须 cron_ 前缀
  triggerSource: "cron_xxx",
  handler: async () => { /* 业务 */ },
  summarize: (r) => ({ ... }),     // 摘要入 result_json
});
```

### 6.6 测试 Gate

任何变更前运行 `pnpm gates`（test + typecheck + build:check）。DB 集成测试（12 文件）在未配置 `DAA_DB_URL` 时自动 skip。

---

## 7. 数据流示例：漂移检测一次调仓

```
[cron] drift-check 01:00 UTC
   │
   ▼
GET /api/daa/cron/drift-check
   │
   ▼
loadConfig() + listAllHoldings() + listTargetAllocations()
   │
   ▼
计算 drift = |current - target|
   │
   ├─ 无漂移超限 → end（写 job log）
   │
   ▼
fusionSignals({ technical, valuation, news, human })
   │
   ▼
marketContext.decide({ regime, buyScale, highRiskBuyScale })
   │
   ├─ 投资助理 overlay（若启用）→ 覆盖 regime / 单资产阈值
   │
   ▼
src/core/rebalanceCore.rebalanceCore()       ← 纯算法
   │
   ▼
runWorkbenchRiskCheck()                       ← 风控预检
   │
   ▼
write → daa_decision_log（status=pending）
   │
   ▼
notifyTelegram()                              ← 人工审核
   │
   ▼
[user] 在 Chat 或 UI 勾选提案并确认
   │
   ▼
POST /api/daa/workbench/rebalance/execute
   │
   ▼
simulateExecute() → 写持仓/账本/快照
```

---

## 8. 尚未实现

- 真实券商对接 / 实盘执行（当前全模拟）
- 多组合管理
- 期权 / 衍生品
- FX 对冲策略
- 实时流式价格（当前为批量拉取）

---

## 9. 关键文件索引

| 用途 | 路径 |
|------|------|
| Asset 分类与类型 | `src/daa/modules/workbench/assetTaxonomy.ts` |
| 精选资产目录（87 条） | `src/daa/modules/workbench/featuredAssetsCatalog.ts` |
| 再平衡引擎 | `src/core/rebalanceCore.ts` |
| 信号融合 | `src/daa/signals/fusion.ts` |
| 系统配置 | `src/daa/config/systemConfig.ts` |
| 行情客户端 | `src/market/marketDataClient.ts` |
| DB 迁移 | `src/daa/store/runtimeMigrations.ts` |
| Asset key 工具 | `src/daa/assetKey.ts` |
| API 限流 | `src/daa/api/rateLimit.ts` |
| 投资助理复核工作流 | `src/daa/agent/cognitiveGraph.ts` |
| 复核工具注册表 | `src/daa/agent/tools/index.ts` |
| 实体图抽取 | `src/daa/agent/entities/entityExtractor.ts` |
| 实体图存储 | `src/daa/agent/entities/entityStore.ts` |

---

## 10. 进一步阅读

- **[COGNITIVE_AGENT.md](./COGNITIVE_AGENT.md)** — 投资助理复核链路详解（工作流、经验库三层检索、16 工具、每日复核原理）
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Docker Compose、环境变量、Cron、故障排查
- **[../CLAUDE.md](../CLAUDE.md)** — 面向 AI 助手和新贡献者的快速参考（规范清单）
- **[archived/](./archived/)** — 历史设计文档
