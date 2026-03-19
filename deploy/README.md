# 部署（Docker · VPS）

## 前置条件

- Docker + Docker Compose v2
- 已配置 `.env.local`（参考根目录 `.env.example`）

## 启动 / 更新

```bash
chmod +x deploy/start.sh
./deploy/start.sh
```

脚本拉取最新 `main`、重建镜像并重启服务。

## 端口与反向代理

Next.js 监听 `127.0.0.1:3000`，建议 Nginx 配置：

```nginx
location = /icon.svg    { proxy_pass http://127.0.0.1:3000; }
location = /favicon.ico { proxy_pass http://127.0.0.1:3000; }
location /daa/     { proxy_pass http://127.0.0.1:3000/daa/; }
location /api/daa/ { proxy_pass http://127.0.0.1:3000/api/daa/; }
```

如果站点还有通用静态资源规则（例如 `location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$`），要确保上面的两个根路径图标规则写在它前面，否则浏览器请求 `/icon.svg` 和 `/favicon.ico` 时会被错误转发到其他上游并返回 `404`。

## 定时任务

Cron 端点（价格刷新 / 漂移检查）建议通过 Vercel Cron 或外部调度器调用：

- `GET /api/daa/cron/price-refresh`
- `GET /api/daa/cron/drift-check`
