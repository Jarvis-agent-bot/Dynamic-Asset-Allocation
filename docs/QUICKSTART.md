# Quickstart

## 1) 本地启动

```bash
pnpm install
pnpm dev
```

打开：
- http://localhost:3000/daa
- http://localhost:3000/daa/dashboard

推荐入口顺序：
- `/daa/dashboard/portfolio`（工作台主入口：资产发现 -> 洞察 -> 市价下单 -> 执行回执）
- `/daa/dashboard/human-factor`（补充人因信号）
- `/daa/dashboard/strategy-lab`（策略实验与回测）
- `/daa/dashboard/settings`（系统与数据源配置）

## 2) 登录方式

- 仅支持账号密码登录。
- 非生产环境首次会自动初始化默认账号：`admin / admin123`。
- 未配置数据库连接时，会自动使用内置 `pg-mem`（本地内存 Postgres 兼容层）。

## 3) 数据库环境变量（可选）

- `DAA_DB_URL`：DAA 专用 Postgres 连接串（优先）。
- `DATABASE_URL`：通用 Postgres 连接串（回退）。

如果两者都不配，开发环境可直接运行，不会阻塞登录。

## 3.1) LLM 环境变量（工作台 AI 解读）

- `OPENAI_API_KEY`
- `DAA_LLM_ENDPOINT`（默认：`https://api.openai.com/v1/responses`）
- `DAA_LLM_MODEL`（可选，默认：`gpt-5-codex`）

建议直接复制根目录 `.env.example` 到 `.env.local` 后再填写。

## 4) 常用验证

```bash
pnpm test
pnpm run typecheck
pnpm run build:check
```
