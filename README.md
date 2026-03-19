<div align="center">

# DAA Console · Dynamic Asset Allocation

**单组合动态资产配置系统 · 发现 → 洞察 → 再平衡 → 执行 → 复盘**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org)
[![pnpm](https://img.shields.io/badge/pnpm-10-orange?logo=pnpm)](https://pnpm.io)

**在线体验** → [exwxyzi.cn/daa/dashboard](https://exwxyzi.cn/daa/dashboard)

</div>

---

## 概述

DAA Console 是一个面向个人投资者的动态资产配置工作台。核心流程：

1. **资产发现** — 全市场搜索 + 基金经理持仓跟踪 + 精选资产推荐
2. **资产洞察** — 三维信号融合（技术指标 + 新闻 + LLM 分析）
3. **再平衡引擎** — 目标权重设定 → 提案生成 → 风控检查 → 执行摘要
4. **执行与复盘** — 市价预览 → 下单（模拟） → 回执 → 审计追踪

**当前能力边界**
- 支持：资产发现与入池、多维洞察、LLM 市场环境判断、再平衡提案生成与风控、市价预览与模拟执行、执行回执与日志、现金台账、汇率管理、策略实验室、Supabase Auth 邮箱认证、多渠道通知（邮件/Telegram/飞书）
- 不支持：真实券商下单、多组合管理、自动执行

---

## 快速开始

```bash
pnpm install
cp .env.example .env.local   # 填写 API Key 后启动
pnpm dev
```

打开 http://localhost:3000/daa/dashboard

### 认证配置（Supabase Auth）

1. 前往 [supabase.com](https://supabase.com) 创建项目（免费额度：50,000 MAU）
2. 在 `.env.local` 中填入 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. 在 Supabase Dashboard > Authentication > Users 创建第一个用户
4. 通过 SQL Editor 设置管理员角色：
   ```sql
   UPDATE auth.users
   SET raw_app_meta_data = raw_app_meta_data || '{"roles": ["editor"]}'::jsonb
   WHERE email = 'your@email.com';
   ```

### 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase publishable key（`sb_publishable_xxx`） |
| `SUPABASE_SERVICE_ROLE_KEY` | - | 服务端管理密钥（用于 bootstrap） |
| `DAA_LLM_API_KEY` | ✅ | LLM API Key（也兼容 `OPENAI_API_KEY`） |
| `DAA_LLM_ENDPOINT` | - | 默认 `https://api.deepseek.com/v1/chat/completions` |
| `DAA_LLM_MODEL` | - | 默认 `deepseek-chat` |
| `DAA_DB_URL` | - | Postgres 连接串（未配置时自动回退 pg-mem） |
| `DATABASE_URL` | - | 通用 DB 连接串（回退） |
| `DAA_SECRETS_ENCRYPTION_KEY` | - | 凭证加密密钥（未设置时自动从 DB URL 派生） |

### 通知配置（可选）

| 变量 | 说明 |
| --- | --- |
| `RESEND_API_KEY` | Resend 邮件通知 |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | Telegram 机器人通知 |
| `FEISHU_WEBHOOK_URL` | 飞书自定义机器人 webhook |

通知开关在前端 Settings > 通知 页面配置。所有 API Key / Token 也可通过 Settings > 凭证 页面在线配置（AES-256-GCM 加密存储），env var 优先级高于数据库。

### 避免"重启后数据清空"

如果你在 `pnpm dev` 下发现"改代码后重新登录，观察列表/执行记录都没了"，通常是因为当前运行在 `pg-mem`（内存数据库），而不是持久化 Postgres。

```bash
# 1) 确认本机 Postgres 可用
pg_isready -h 127.0.0.1 -p 5432

# 2) 创建业务库（首次）
createdb -h 127.0.0.1 -p 5432 daa

# 3) 在 .env.local 中配置连接
DAA_DB_URL=postgresql://<your_user>@127.0.0.1:5432/daa
```

---

## 架构概览

```
Next.js 14 App Router
├── app/daa/dashboard/           # 前端页面
│   ├── _components/             #   总览
│   ├── workbench/               #   工作台（资产池 · 洞察 · 再平衡 · 执行）
│   ├── trades/                  #   交易记录
│   ├── strategy-lab/            #   策略实验室
│   └── settings/                #   系统设置
├── app/api/daa/                 # API 路由
│   ├── workbench/               #   工作台核心接口
│   ├── read/                    #   只读聚合接口
│   ├── store/                   #   存储层接口（配置 · 快照 · 现金台账）
│   ├── market/                  #   市场数据代理（Yahoo · 雪球 · Twitter）
│   ├── hf/                      #   基金经理持仓跟踪
│   ├── cron/                    #   定时任务
│   ├── strategy-lab/            #   策略回测
│   └── auth/                    #   鉴权
├── src/core/                    # 纯算法模块（可单元测试）
│   ├── signals/                 #   三维信号融合
│   └── rebalance/               #   再平衡引擎
└── src/daa/                     # 业务编排层
    ├── modules/                 #   功能模块（workbench · portfolio · trade · decision …）
    ├── llm/                     #   LLM 集成（分析 · 决策）
    └── store/                   #   Postgres 存储
```

**技术栈**：Next.js 14 · TypeScript · Tailwind CSS · shadcn/ui · Supabase Auth · Postgres / pg-mem · Recharts · Framer Motion

---

## 核心 API

### 工作台

| 端点 | 说明 |
| ---- | ---- |
| `GET  /api/daa/workbench/bootstrap` | 加载工作台（持仓、价格、日志） |
| `GET  /api/daa/workbench/search-assets` | 全市场资产搜索 |
| `GET  /api/daa/workbench/featured-assets` | 精选资产推荐 |
| `POST /api/daa/workbench/assets/upsert` | 加入资产池 |
| `GET  /api/daa/workbench/assets/:key/insights` | 资产洞察（技术 + 新闻 + AI） |
| `POST /api/daa/workbench/recommendations` | 生成交易建议 |

### 再平衡

| 端点 | 说明 |
| ---- | ---- |
| `POST /api/daa/workbench/rebalance/generate` | 生成再平衡提案 |
| `POST /api/daa/workbench/risk-check` | 风控检查 |
| `POST /api/daa/workbench/rebalance/execute-summary` | 执行摘要 |
| `POST /api/daa/workbench/rebalance/execute` | 执行再平衡 |
| `GET  /api/daa/workbench/rebalance/cycles` | 再平衡周期列表 |
| `GET  /api/daa/workbench/rebalance/cycles/:id/report` | 周期报告 |
| `GET  /api/daa/workbench/rebalance/reports` | 历史报告 |

### 执行

| 端点 | 说明 |
| ---- | ---- |
| `POST /api/daa/workbench/execution/preview` | 市价预览 |
| `POST /api/daa/workbench/execution/execute` | 执行并返回回执 |
| `GET  /api/daa/workbench/execution/logs` | 执行日志 |

### 存储与配置

| 端点 | 说明 |
| ---- | ---- |
| `GET/PATCH /api/daa/store/system-config` | 系统配置（含乐观并发） |
| `GET/PUT/DELETE /api/daa/store/secrets` | 凭证管理（加密存储） |
| `POST /api/daa/store/secrets/test` | 凭证连通性测试 |
| `GET /api/daa/store/cash-ledger` | 现金台账 |
| `GET /api/daa/store/equity-snapshots` | 权益快照 |
| `GET /api/daa/store/fx-rates` | 汇率 |
| `GET /api/daa/store/op-log` | 操作日志 |
| `GET /api/daa/store/run-history` | 运行历史 |

### 定时任务

| 端点 | 说明 |
| ---- | ---- |
| `GET /api/daa/cron/price-refresh` | 价格刷新 |
| `GET /api/daa/cron/drift-check` | 漂移检查 |
| `GET /api/daa/cron/fx-refresh` | 汇率刷新 |
| `GET /api/daa/cron/news-refresh` | 新闻刷新 |
| `GET /api/daa/cron/market-indicators-refresh` | 市场指标刷新 |
| `GET /api/daa/cron/daily-analysis` | 每日分析 |
| `GET /api/daa/cron/hf-ingest` | 基金经理持仓抓取 |
| `GET /api/daa/cron/cache-cleanup` | 缓存清理 |

### 运维

| 端点 | 说明 |
| ---- | ---- |
| `GET /api/daa/engine-health` | 引擎健康检查 |
| `GET /api/daa/store/market-cache/health` | 市场缓存健康检查 |

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
