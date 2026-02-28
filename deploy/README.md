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
- Python 引擎（可选）：`127.0.0.1:18000`

建议 Nginx 路由：
- `/daa/` → `http://127.0.0.1:3000/daa/`
- `/api/daa/` → `http://127.0.0.1:3000/api/daa/`
- `/daa-api/` → `http://127.0.0.1:18000/`

## 说明

- 当前登录由 Next.js 的账号密码鉴权统一处理（`/api/daa/auth/*`）。
- Python 侧仅作为策略/计算引擎，不承载公共鉴权入口。
