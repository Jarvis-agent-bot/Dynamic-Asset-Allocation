# DAA Phase 1~10 执行清单

> 目标：将已确认路线拆分为可执行任务卡，统一完成定义（DoD）。

## Phase 1：DB Schema + Migration

- 目标：落地 8 张 DAA 表结构与初始化数据。
- 关键文件：`src/daa/pg/*`、migration 脚本目录（待新增）。
- 接口影响：无对外 API 变更。
- 测试清单：建表成功、幂等执行、核心索引可用。
- DoD：本地与 CI 环境可自动建库并通过基础读写验证。

## Phase 2：服务端存储 API

- 目标：提供 positions/strategy/equity/trade-journal 的读写接口。
- 关键文件：`app/api/daa/store/*`（新增）、`src/daa/pg/*`。
- 接口影响：新增 `/api/daa/store/*`。
- 测试清单：鉴权、参数校验、DB 持久化、错误码契约。
- DoD：核心输入不再依赖 localStorage 作为唯一数据源。

## Phase 3：自动化调度

- 目标：配置 Vercel Cron 并打通 cron route。
- 关键文件：`vercel.json`、`app/api/daa/cron/*`（新增）。
- 接口影响：新增 `/api/daa/cron/*`。
- 测试清单：手动触发、重复触发幂等、失败重试日志。
- DoD：定时任务可稳定产出价格更新、drift 检查与 hf ingest。

## Phase 4：风控扩展

- 目标：新增最大回撤、止损、集中度与风险敞口控制。
- 关键文件：`src/core/riskGuardrails.ts`（新增）、`src/daa/unifiedRebalanceV1.ts`。
- 接口影响：统一再平衡返回中新增风控命中信息。
- 测试清单：阈值命中/未命中、极端行情、边界值。
- DoD：风控命中时订单被正确拦截并可解释。

## Phase 5：数据源配置去硬编码 + Settings

- 目标：从 DB 读取数据源配置，支持前端维护。
- 关键文件：`app/daa/dashboard/settings/page.tsx`（新增）、`src/daa/hf/*`。
- 接口影响：新增数据源配置管理 API。
- 测试清单：增删改查、启停开关、默认种子加载。
- DoD：`DEFAULT_HF_FUND_REGISTRY` 不再作为运行时真源。

## Phase 6：Telegram 通知

- 目标：支持 drift/再平衡/NAV/价格异常通知与测试消息。
- 关键文件：`src/daa/notify/telegramV1.ts`（新增）、settings 通知模块。
- 接口影响：新增通知配置 API 与测试发送 API。
- 测试清单：配置保存、测试消息、失败重试、脱敏展示。
- DoD：关键事件可按配置稳定推送。

## Phase 7：策略扩展 + Strategy Lab

- 目标：支持 Risk Parity、Min Variance、Equal Weight 与 Ensemble。
- 关键文件：`src/core/strategies.ts`、`src/core/ensemble/*`、`app/daa/dashboard/strategy-lab/page.tsx`（新增）。
- 接口影响：策略参数结构扩展。
- 测试清单：权重和约束、回测结果一致性、UI 参数回写。
- DoD：可在 Strategy Lab 完成策略切换与参数对比。

## Phase 8：Backtest 绩效归因

- 目标：提供资产贡献、配置效应、选择效应与事件时间线。
- 关键文件：`src/core/backtestAttribution.ts`（新增）、backtest 页面 Attribution Tab。
- 接口影响：回测返回结构新增 `BacktestAttribution`。
- 测试清单：指标正确性、基准对比、图表渲染。
- DoD：回测页面可解释收益来源与再平衡影响。

## Phase 9：行情升级

- 目标：接入 Finnhub WebSocket + DB 缓存 + 前端消费链路。
- 关键文件：`app/api/daa/market/*`、`daa_price_history` 读写链路。
- 接口影响：实时价格查询接口新增时效字段。
- 测试清单：连接断开重连、限流退避、缓存回退。
- DoD：前端可稳定获取准实时行情。

## Phase 10：删除 Python 服务

- 目标：移除 `services/daa-py/` 与代理链路。
- 关键文件：`services/daa-py/*`（删除）、`src/daa/proxyToEngine.ts`（删除）、部署文档。
- 接口影响：移除 `/daa-api/*` 依赖。
- 测试清单：构建脚本、CI、部署脚本无 Python 依赖。
- DoD：仓库主路径仅保留 Next.js 单栈运行方式。

## 通用完成定义（All Phases）

- 文档先行：对应文档更新并标记状态。
- 测试达标：`pnpm test`、`pnpm run typecheck`、`pnpm run build:check` 通过。
- 可回滚：说明回滚方式与数据影响。
- 可审计：关键变更具备日志与决策关联。

## 变更记录

- 2026-03-01：首版执行清单，覆盖 Phase 1~10。

最后更新日期：2026-03-01  
更新方式：Codex（按已确认路线拆解）
