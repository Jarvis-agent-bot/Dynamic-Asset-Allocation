# Dynamic Asset Allocation (DAA)

DAA 是一个以“动态再平衡 + 人因过滤 + 风险隔离”为核心的量化控制台系统。

## 当前产品形态

- `/daa`：统一入口（自动进入控制台）
- `/daa/dashboard?tab=unified-core`：统一运营台（主入口）
- `/daa/dashboard?tab=settings`：账号与会话设置
- `/daa/login`：账号密码登录

## 已收敛的核心能力

- 统一再平衡引擎：`POST /api/daa/rebalance/unified`
- 账号密码鉴权：`/api/daa/auth/*`
- 市场情报接入：yfinance / 雪球 / Twitter / Yahoo RSS
- 引擎健康探测：`GET /api/daa/engine-health`

## 技术栈

- 前端：Next.js 14（App Router）+ TypeScript + Tailwind + shadcn/ui
- 算法：`src/core/*`（可测试）
- 部署：Docker + Nginx
- Python 引擎：可选，通过 `/daa-api/*` 反向代理

## 本地开发

```bash
pnpm install
pnpm dev
```

打开 http://localhost:3000/daa

## 本地登录与数据库

- 默认使用 Postgres（`DAA_DB_URL` 或 `DATABASE_URL`）。
- 开发环境未配置数据库时，自动回退 `pg-mem`，可直接登录。
- 默认开发账号（仅非生产自动初始化）：`admin / admin123`。

## 文档

- 核心架构：[`docs/DAA_GLOBAL_ARCHITECTURE_GUIDE.md`](./docs/DAA_GLOBAL_ARCHITECTURE_GUIDE.md)
- 快速开始：[`docs/QUICKSTART.md`](./docs/QUICKSTART.md)
- 部署说明：[`deploy/README.md`](./deploy/README.md)

## License

[GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html)
