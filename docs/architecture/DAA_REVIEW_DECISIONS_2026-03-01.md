# DAA Review 决策基线（2026-03-01）

## 1. 文档目的与范围

本文档用于固化本轮已确认的 13 项需求决策，作为后续 Phase 1~10 的唯一决策基线。

- 状态：Accepted
- 生效日期：2026-03-01
- 适用范围：`/daa` 单组合系统（决策 + 记录 + 监控）

## 2. 决策总览

- 产品定位：不做自动交易执行，仅输出建议并记录执行结果。
- 系统形态：以 Next.js + Postgres 为主，采用 API Route 作为统一入口。
- 实施方式：先打通数据与审计闭环，再扩展策略与归因分析。

## 3. 13 项需求逐条决策

### D1 不需要交易执行

- 结论：保留 OKX broker 的签名能力，但不扩展自动下单链路。
- 原因：当前阶段目标是策略决策、人工执行、审计追踪。
- 影响模块：`src/broker/*`、`src/daa/unifiedRebalanceV1.ts`。
- 落地建议：在 README 与架构文档明确“Draft orders only”。

### D2 自动化调度

- 结论：优先采用 Vercel Cron + Next.js API Route。
- 原因：与现有部署一致，维护成本低，无需常驻进程。
- 影响模块：`vercel.json`、`app/api/daa/cron/*`（新增）。
- 计划任务：
  - `/api/daa/cron/price-refresh`：每 4 小时。
  - `/api/daa/cron/drift-check`：每日 09:00、21:00。
  - `/api/daa/cron/hf-ingest`：每日 08:00。

### D3 持久化交易记录（DB 设计）

- 结论：新增 8 张 DAA 专用表，完成持仓、价格、交易、决策、权益、配置的持久化。
- 原因：形成回溯链路与可审计能力，替代纯前端存储。
- 影响模块：`src/daa/pg/*`、后续 SQL migration。
- 新增表：
  - `daa_positions`
  - `daa_price_history`
  - `daa_trade_journal`
  - `daa_rebalance_decisions`
  - `daa_equity_snapshots`
  - `daa_strategy_config`
  - `daa_data_sources`
  - `daa_notification_config`

### D4 风控体系补充

- 结论：在 guardrail 层增加最大回撤、单资产止损、集中度与风险敞口约束。
- 原因：将“能算”升级为“可控、可收敛”。
- 影响模块：`src/core/riskGuardrails.ts`（新增）、`src/daa/unifiedRebalanceV1.ts`。
- 关键类型：`RiskGuardrailConfig`。

### D5 策略扩展（Risk Parity / Min Variance / Equal Weight）

- 结论：新增三类可插拔策略，并支持 Ensemble 加权。
- 原因：增强策略多样性与鲁棒性。
- 影响模块：`src/core/strategies.ts`、`src/core/ensemble/*`、`app/daa/dashboard/strategy-lab/page.tsx`（新增）。

### D6 实时行情升级

- 结论：放弃 yfinance“伪实时”路径，采用 Finnhub WebSocket + DB 缓存。
- 原因：yfinance 无 WebSocket，难以满足准实时需求。
- 影响模块：`app/api/daa/market/*`、`daa_price_history`、前端 SSE/轮询层。

### D7 Backtest 绩效归因

- 结论：在 `backtestDriftRebalance` 流程中增加 Attribution 结果。
- 原因：解释“为什么赢/输”，支持策略复盘。
- 影响模块：`src/core/backtestAttribution.ts`（新增）、`app/daa/dashboard/backtest/*`。
- 关键类型：`BacktestAttribution`。

### D8 服务端存储迁移

- 结论：采用渐进式迁移，不一次性废弃 localStorage。
- 原因：降低上线风险，保留兼容回退路径。
- 影响模块：`app/daa/unifiedInputStore.ts`、`app/api/daa/store/*`（新增）、`src/daa/pg/*`。
- 迁移顺序：positions -> strategy-config -> equity-snapshots -> trade-journal。

### D9 数据源配置去硬编码

- 结论：用 `daa_data_sources` 替代硬编码 registry，Settings 页面可配置。
- 原因：减少发布耦合，支持运维可控配置。
- 影响模块：`src/daa/hf/hfSeedDataV1.ts`、`app/daa/dashboard/settings/page.tsx`（新增）。

### D10 删除 Python 服务

- 结论：删除 `services/daa-py/` 与 `src/daa/proxyToEngine.ts`（按阶段执行）。
- 原因：统一技术栈，降低跨服务维护成本。
- 影响模块：`services/daa-py/*`、`deploy/*`、相关测试。
- 兼容策略：README 先标注为“历史兼容路径，待移除”。

### D11 Rebalance 执行同步机制

- 结论：支持人工执行后回填 `trade_journal`，并关联决策记录。
- 原因：契合“系统建议 + 人工落地”工作流。
- 影响模块：`app/api/daa/trade-journal/manual-sync/route.ts`（新增）、`daa_trade_journal`。

### D12 Telegram 通知

- 结论：新增通知能力与配置中心，支持测试消息与按事件开关。
- 原因：降低人工盯盘成本，保证关键事件触达。
- 影响模块：`src/daa/notify/telegramV1.ts`（新增）、`daa_notification_config`、Settings 页面。

### D13 单组合模式

- 结论：当前仅支持单组合，不引入多组合管理。
- 原因：先集中优化单策略闭环，避免架构过早复杂化。
- 影响模块：数据模型、路由、权限均以单组合假设设计。

## 4. 分期路线（Phase 1~10）

1. Phase 1：DB Schema + Migration（D3）
2. Phase 2：服务端存储 API（D8）
3. Phase 3：自动化调度（D2）
4. Phase 4：风控扩展（D4）
5. Phase 5：数据源配置化 + Settings（D9）
6. Phase 6：Telegram 通知（D12）
7. Phase 7：策略扩展 + Strategy Lab（D5）
8. Phase 8：Backtest 归因（D7）
9. Phase 9：行情升级（D6）
10. Phase 10：删除 Python 服务（D10）

## 5. Planned Contract（待实现接口契约）

> 以下接口为计划契约，状态均为 Planned，暂不视为已上线能力。

### 5.1 存储接口

- `POST /api/daa/store/positions`
- `GET /api/daa/store/positions`
- `POST /api/daa/store/strategy-config`
- `GET /api/daa/store/strategy-config`
- `POST /api/daa/store/equity-snapshots`
- `GET /api/daa/store/equity-snapshots`
- `POST /api/daa/store/trade-journal`
- `GET /api/daa/store/trade-journal`

### 5.2 调度接口

- `GET /api/daa/cron/price-refresh`
- `GET /api/daa/cron/drift-check`
- `GET /api/daa/cron/hf-ingest`

### 5.3 人工执行同步接口

- `POST /api/daa/trade-journal/manual-sync`

## 6. Planned Type Contract（待实现类型契约）

### 6.1 风控类型

```ts
export type RiskGuardrailConfig = {
  maxDrawdownPct: number;
  perAssetStopLossPct: number;
  maxConcentrationPct: number;
  correlationCapPct: number;
  maxTotalRiskExposurePct: number;
};
```

### 6.2 归因类型

```ts
export type BacktestAttribution = {
  totalReturn: number;
  benchmark: { symbol: string; return: number };
  activeReturn: number;
  perAsset: Array<{
    symbol: string;
    avgWeight: number;
    assetReturn: number;
    contributionToReturn: number;
    allocationEffect: number;
    selectionEffect: number;
  }>;
  rebalanceEvents: Array<{
    date: string;
    turnover: number;
    driftBefore: number;
  }>;
  metrics: {
    sharpe: number;
    maxDrawdown: number;
    calmar: number;
    volatility: number;
    winRate: number;
  };
};
```

## 7. 风险与依赖

- 数据一致性风险：localStorage 与 DB 并存期间需定义冲突优先级（默认 DB 优先）。
- 定时任务风险：Vercel Cron 的触发时区需统一为 UTC，并在前端标注展示时区。
- 数据源风险：实时行情供应商有配额与限流，需内置退避与降级策略。
- 通知风险：Telegram token/Chat ID 属于敏感配置，必须服务端存储并脱敏展示。

## 8. 验收口径

- 可追溯：任意一次再平衡建议都能关联到持仓快照、价格数据、人工回填交易。
- 可解释：Backtest 页面可展示组合收益拆解与再平衡事件线。
- 可运维：Settings 页面可配置数据源与通知，无需改代码重发版。
- 可收敛：风控阈值命中时有明确拦截结果与原因。

## 9. 本文档维护规则

- 若 13 项需求有新增/变更，必须同步更新本文档后再实现代码。
- 每次变更需追加“变更日期 + 变更摘要 + 影响范围”。
