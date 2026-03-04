# Dynamic Asset Allocation (DAA)

DAA 是一个面向单组合的动态资产配置系统，定位为 **发现 + 洞察 + 执行 + 复盘**，当前执行链路为内部模拟撮合与审计追踪。

## 项目目标

- 用统一信号与风控引擎输出可解释的交易建议。
- 以“执行队列”承接买卖动作，系统负责回执、归档与审计追踪。
- 在风险约束下持续优化配置质量与复盘能力。

## 当前能力边界

- 支持：资产搜索入池、资产洞察（技术+新闻+LLM）、市价预览、执行队列、回执追溯、账号密码鉴权。
- 不支持：券商真实下单、组合托管、多组合管理。
- 当前仅维护 Next.js 链路，不再保留旧兼容调用路径。

## 快速开始

```bash
pnpm install
pnpm dev
```

启动后访问：

- http://localhost:3000/daa
- http://localhost:3000/daa/dashboard

## 本地登录与数据库

- 默认使用 Postgres（优先 `DAA_DB_URL`，回退 `DATABASE_URL`）。
- 未配置数据库时，开发环境自动回退 `pg-mem`。
- 非生产环境默认账号会自动初始化：`admin / admin123`。

## LLM 环境变量

项目仅通过环境变量读取 LLM 配置，不在数据库保存密钥。

```bash
cp .env.example .env.local
```

必填项：
- `OPENAI_API_KEY`
- `DAA_LLM_ENDPOINT`（默认 `https://api.openai.com/v1/responses`）
- `DAA_LLM_MODEL`（可选，默认 `gpt-5-codex`）

## 核心架构概览

- 前端：Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui。
- 核心算法：`src/core/*`（可单元测试）。
- 业务编排：`src/daa/*` + `app/api/daa/*`。
- 存储：Postgres（开发可回退 pg-mem）。
- 调度（规划中）：Vercel Cron -> `/api/daa/cron/*`。

## 核心 API（工作台）

- `GET /api/daa/workbench/bootstrap`：加载工作台（含同步补价、执行队列、执行日志）。
- `GET /api/daa/workbench/search-assets`：全市场资产搜索（含 `yfinanceSymbol`）。
- `POST /api/daa/workbench/assets/upsert`：加入资产宇宙。
- `PATCH /api/daa/workbench/assets/{assetKey}`：更新资产标签/分组/备注。
- `GET /api/daa/workbench/assets/{assetKey}/insights`：资产洞察（技术通用+特化、新闻+AI、机会中文解释）。
- `POST /api/daa/workbench/recommendations`：生成交易建议（中文化动作与理由）。
- `POST /api/daa/workbench/execution/preview`：市价预览（风险仅提示不阻断）。
- `POST /api/daa/workbench/execution/items`：加入执行队列。
- `POST /api/daa/workbench/execution/commit`：执行当前队列并返回回执。
- `GET /api/daa/workbench/execution/logs`：查询执行日志。

## 核心 API（配置与存储）

- `/api/daa/store/system-config`：系统统一配置（GET / PATCH，含 `version` 乐观并发）。
- `/api/daa/store/cash-ledger`：现金流水与账户同步。
- `/api/daa/store/fx-rates`：汇率快照与手工维护。
- `/api/daa/store/equity-snapshots`：权益快照。
- `/api/daa/cron/*`：价格刷新、drift 检查、HF ingest 定时任务入口。

架构与重构说明：`docs/architecture/DAA_REFACTOR_BLUEPRINT_2026-03-01.md`。

## 开发与验证

```bash
pnpm test
pnpm run typecheck
pnpm run build:check
```

CI 与本地对齐，建议每次提交前执行上述三项检查。

## 目录导航

- 文档总览：`docs/README.md`
- 一次性重构蓝图：`docs/architecture/DAA_REFACTOR_BLUEPRINT_2026-03-01.md`
- 快速开始：`docs/QUICKSTART.md`
- 部署说明：`deploy/README.md`

## 路线图摘要（Phase 1~10）

1. DB schema 与 migration
2. 服务端存储 API
3. Vercel Cron 自动化调度
4. 风控扩展
5. 数据源配置化与 Settings
6. Telegram 通知
7. 策略扩展与 Strategy Lab
8. Backtest 绩效归因
9. 实时行情升级
10. 删除 Python 服务

## License

[GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html)
