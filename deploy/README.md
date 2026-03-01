# VPS 部署（Docker）

## 前置条件

- VPS 已安装 Docker 与 Docker Compose v2
- 已拉取本仓库代码

## 启动 / 更新

```bash
chmod +x deploy/start.sh
./deploy/start.sh
```

脚本会拉取最新 `main`、重建镜像并重启服务。

## 端口与路由建议

- Next.js（Web + `/api/daa/*`）：`127.0.0.1:3000`

建议 Nginx 路由：
- `/daa/` → `http://127.0.0.1:3000/daa/`
- `/api/daa/` → `http://127.0.0.1:3000/api/daa/`

## 说明

- 当前登录与再平衡执行链路均由 Next.js 统一处理。
- 建议在 Vercel 或外部调度器中调用 `/api/daa/cron/*` 完成自动任务。
