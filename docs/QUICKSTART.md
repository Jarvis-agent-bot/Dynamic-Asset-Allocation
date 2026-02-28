# Quickstart

## 1) 本地启动

```bash
pnpm install
pnpm dev
```

打开：
- http://localhost:3000/daa
- http://localhost:3000/daa/dashboard?tab=unified-core

## 2) 登录方式

- 仅支持账号密码登录。
- 非生产环境首次会自动初始化默认账号：`admin / admin123`。
- 未配置数据库连接时，会自动使用内置 `pg-mem`（本地内存 Postgres 兼容层）。

## 3) 数据库环境变量（可选）

- `DAA_DB_URL`：DAA 专用 Postgres 连接串（优先）。
- `DATABASE_URL`：通用 Postgres 连接串（回退）。

如果两者都不配，开发环境可直接运行，不会阻塞登录。

## 4) 常用验证

```bash
pnpm test
pnpm run typecheck
pnpm build
```
