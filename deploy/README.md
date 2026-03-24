# 部署（Docker · VPS）

## 前置条件

- Docker + Docker Compose v2
- 已配置 `.env.local`（参考根目录 `.env.example`）

## 启动 / 更新

```bash
chmod +x deploy/start.sh
./deploy/start.sh
```

脚本会优先把 `.env.local` 作为 `docker compose --env-file` 的输入，再拉取最新 `main`、重建镜像并重启服务。

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

## Telegram 对话助手

如果要启用 Telegram 入站对话，而不只是出站通知，还需要补齐：

```bash
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=7567255792
TELEGRAM_WEBHOOK_SECRET=replace-with-random-secret
TELEGRAM_ALLOWLIST=7567255792,7567255792:123456789
```

说明：

- `TELEGRAM_CHAT_ID` 继续作为默认通知接收人。
- `TELEGRAM_WEBHOOK_SECRET` 用于校验 Telegram 发来的 webhook 请求头。
- `TELEGRAM_ALLOWLIST` 用于限制哪些 chat / user 可以和助手对话；支持 `chatId`、`userId`、`chatId:userId` 三种写法。
- 当前执行类命令采用“先待确认，再执行”的模式；用户发出“买入 / 卖出 / 执行调仓”后，必须再回复一次“确认”。

Webhook 配置示例：

```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "content-type: application/json" \
  -d '{
    "url": "https://your-domain.example.com/api/daa/chat/telegram/webhook",
    "secret_token": "'"${TELEGRAM_WEBHOOK_SECRET}"'"
  }'
```

建议再检查一次：

- 反向代理已放行 `POST /api/daa/chat/telegram/webhook`
- 线上 `telegram_bot_token`、`telegram_chat_id`、`telegram_webhook_secret`、`telegram_allowlist` 均已配置
- Bot 已通过 `setWebhook` 指向正确域名
