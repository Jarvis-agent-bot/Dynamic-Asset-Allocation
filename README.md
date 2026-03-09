<div align="center">

# Dynamic Asset Allocation

**单组合动态资产配置系统 · 发现 → 洞察 → 执行 → 复盘**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org)
[![pnpm](https://img.shields.io/badge/pnpm-10-orange?logo=pnpm)](https://pnpm.io)

</div>

---

## 概述

DAA 是一个面向个人投资者的动态资产配置工作台，以**三维信号**（基金经理持仓 + 新闻 + 技术指标）驱动资产机会识别，通过 LLM 二次分析生成可解释的交易建议，并提供完整的执行回执与审计追踪。

**当前能力边界**
- 支持：资产发现与入池、资产洞察（技术 + 新闻 + LLM）、市价预览与执行、执行回执、账号鉴权
- 不支持：真实券商下单、多组合管理、自动执行

---

## 快速开始

```bash
pnpm install
cp .env.example .env.local   # 填写 API Key 后启动
pnpm dev
```

打开 http://localhost:3000/daa/dashboard/workbench

**默认账号**（非生产环境自动初始化）：`admin / admin123`

### 环境变量

| 变量               | 必填 | 说明                                       |
| ------------------ | ---- | ------------------------------------------ |
| `OPENAI_API_KEY`   | ✅    | LLM API Key                                |
| `DAA_LLM_ENDPOINT` | -    | 默认 `https://api.openai.com/v1/responses` |
| `DAA_LLM_MODEL`    | -    | 默认 `gpt-5-codex`                         |
| `DAA_DB_URL`       | -    | Postgres 连接串（未配置时自动回退 pg-mem） |
| `DATABASE_URL`     | -    | 通用 DB 连接串（回退）                     |

### 避免“重启后数据清空”

如果你在 `pnpm dev` 下发现“改代码后重新登录，观察列表/执行记录都没了”，通常是因为当前运行在 `pg-mem`（内存数据库），而不是持久化 Postgres。

建议本地固定配置：

```bash
# 1) 确认本机 Postgres 可用（示例端口 5432）
pg_isready -h 127.0.0.1 -p 5432

# 2) 创建业务库（首次）
createdb -h 127.0.0.1 -p 5432 daa

# 3) 在 .env.local 中配置连接（按你的系统用户调整）
DAA_DB_URL=postgresql://<your_user>@127.0.0.1:5432/daa
```

然后重启 `pnpm dev`。此后数据会落到真实 Postgres，服务重启不会丢失。

## LLM 环境变量

## 架构概览

```
Next.js 14 App Router
├── app/daa/dashboard/          # 前端页面（总览 / 工作台 / 交易记录 / 设置）
├── app/api/daa/                # API 路由
│   ├── workbench/              # 工作台核心接口
│   └── cron/                   # 定时任务（价格刷新 / 漂移检查）
├── src/core/                   # 纯算法模块（可单元测试）
│   ├── signals/                # 三维信号融合
│   └── rebalance/              # 再平衡引擎
└── src/daa/                    # 业务编排层
```

**技术栈**：Next.js 14 · TypeScript · Tailwind CSS · shadcn/ui · Postgres / pg-mem · Recharts

---

## 核心 API

| 端点                                          | 说明                           |
| --------------------------------------------- | ------------------------------ |
| `GET /api/daa/workbench/bootstrap`            | 加载工作台（持仓、价格、日志） |
| `GET /api/daa/workbench/search-assets`        | 全市场资产搜索                 |
| `POST /api/daa/workbench/assets/upsert`       | 加入资产池                     |
| `GET /api/daa/workbench/assets/:key/insights` | 资产洞察（技术 + 新闻 + AI）   |
| `POST /api/daa/workbench/recommendations`     | 生成交易建议                   |
| `POST /api/daa/workbench/execution/preview`   | 市价预览                       |
| `POST /api/daa/workbench/execution/execute`   | 执行并返回回执                 |
| `GET /api/daa/workbench/execution/logs`       | 执行日志                       |
| `GET/PATCH /api/daa/store/system-config`      | 系统配置（含乐观并发）         |

---

## 开发验证

```bash
pnpm test               # 单元测试
pnpm run typecheck      # 全量 TypeScript 检查
pnpm run typecheck:core # 仅 core 算法层 TypeScript 检查
pnpm run build:check    # 构建验证（不输出产物）

# 三项合一：
pnpm run gates
```

---

## 部署

见 [deploy/README.md](deploy/README.md)（Docker + VPS 部署说明）。

---

## Star History

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=Jarvis-agent-bot/Dynamic-Asset-Allocation&type=Date)](https://star-history.com/#Jarvis-agent-bot/Dynamic-Asset-Allocation&Date)

</div>

---

## Contributors

<div align="center">

[![Contributors](https://contrib.rocks/image?repo=Jarvis-agent-bot/Dynamic-Asset-Allocation)](https://github.com/Jarvis-agent-bot/Dynamic-Asset-Allocation/graphs/contributors)

</div>

---

## License

[GNU Affero General Public License v3.0](LICENSE)
