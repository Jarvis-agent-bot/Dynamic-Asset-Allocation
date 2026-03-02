# Dynamic Asset Allocation (DAA)

DAA 是一个面向单组合的动态资产配置系统，定位为 **决策 + 记录 + 监控**，不做自动交易执行。

## 项目目标

- 用统一再平衡引擎输出可解释的调仓建议。
- 以人工执行为主，系统负责记录、归档与审计追踪。
- 在风险约束下持续优化配置质量与复盘能力。

## 当前能力边界

- 支持：统一再平衡、账号密码鉴权、市场数据接入、控制台运营视图。
- 不支持：自动下单、组合托管、多组合管理。
- Python 服务：当前仓库仍保留历史兼容目录，主开发路径以 Next.js API 为准，后续按路线图移除。

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

## 核心架构概览

- 前端：Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui。
- 核心算法：`src/core/*`（可单元测试）。
- 业务编排：`src/daa/*` + `app/api/daa/*`。
- 存储：Postgres（开发可回退 pg-mem）。
- 调度（规划中）：Vercel Cron -> `/api/daa/cron/*`。

## 核心 API（已上线）

- `POST /api/daa/rebalance/unified`：统一再平衡决策。
- `GET /api/daa/engine-health`：引擎健康检查。
- `/api/daa/auth/*`：登录、会话、登出。
- `/api/daa/hf/*`：人因数据摄取与读取。

## 核心 API（配置与存储）

- `/api/daa/store/system-config`：系统统一配置（GET / PATCH，含 `version` 乐观并发）。
- `/api/daa/store/positions`：持仓存储。
- `/api/daa/store/watchlist-candidates`：候选池存储。
- `/api/daa/store/fx-rates`：汇率快照与手工维护。
- `/api/daa/cron/*`：价格刷新、drift 检查、HF ingest 定时任务入口（逐步完善）。

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
