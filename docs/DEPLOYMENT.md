# DAA Rebalance — 部署与运维

> 面向：运维 / 部署新环境 / 故障排查
> 范围：容器拓扑、环境变量、首次部署、Cron 清单、数据保留、常见故障
> 架构细节见 [ARCHITECTURE.md](./ARCHITECTURE.md)；投资助理复核细节见 [COGNITIVE_AGENT.md](./COGNITIVE_AGENT.md)。

---

## 1. 容器拓扑

```
┌───────────────────────────────────────────────────────────┐
│  docker-compose.yml                                       │
│                                                           │
│  ┌──────────────┐      ┌──────────────┐                  │
│  │   daa-web    │──HTTP│   ollama     │ bge-m3 1024d     │
│  │  Next.js 14  │      │  sidecar     │ 本地 embedding   │
│  │  :3000       │      │  :11434      │                  │
│  └──┬───────────┘      └──────┬───────┘                  │
│     │                         │                           │
│     │ SQL              pull ↑ │                           │
│     ▼                         │                           │
│  ┌──────────────┐      ┌──────┴───────┐                  │
│  │  postgres    │      │ ollama-init  │  一次性：         │
│  │ pgvector:pg16│      │ (Exited 0)   │  ollama pull     │
│  │  :5432       │      └──────────────┘  bge-m3          │
│  └──────────────┘                                         │
│                                                           │
│  ┌──────────────┐                                         │
│  │   daa-cron   │──HTTP──→ daa-web (14 cron endpoints)   │
│  │ alpine+crond │                                         │
│  └──────────────┘                                         │
└───────────────────────────────────────────────────────────┘

External:
  DeepSeek API  → LLM 调用
  Alpaca (WS) / Yahoo / 蛋卷基金 → 新闻、行情与基金持仓
  Telegram Bot / Feishu / Resend → 通知
```

**服务说明**：

| 服务 | 镜像 | 职责 | 资源 |
|------|------|------|------|
| `daa-web` | 自建（Dockerfile） | Next.js app，API + UI | 约 500MB RAM |
| `daa-cron` | `alpine:3.19` + crond | 14 个定时 Job（curl 调 web） | < 50MB RAM |
| `postgres` | `pgvector/pgvector:pg16` | 主数据库 + pgvector + pg_trgm | 约 200MB RAM + 数据盘 |
| `ollama` | `ollama/ollama:latest` | 本地 embedding（BGE-M3） | 约 1.2GB RAM（含模型常驻） |
| `ollama-init` | `ollama/ollama:latest` | 首次拉 `bge-m3` 模型后 Exit 0 | 一次性，< 200MB |

**网络**：所有服务在默认 bridge 网络内相互可达。只有 `daa-web:3000` 映射到宿主 `127.0.0.1:3000`（通常反向代理到 nginx）。`postgres:5432` 映射到 `127.0.0.1:15432` 方便本地调试。`ollama` 仅 expose 不发布。

---

## 2. 环境变量清单

**必需**：

| 变量 | 说明 |
|------|------|
| `DAA_DB_URL` | Postgres 连接串，例如 `postgresql://daa:daa@postgres:5432/daa` |
| `DAA_LLM_API_KEY` | LLM API Key（DeepSeek / OpenAI 兼容） |
| `DAA_CRON_TOKEN` | Cron 容器调 web API 的共享密钥（64 字符随机） |
| `DAA_SECRETS_ENCRYPTION_KEY` | 数据库中 secrets 的加密密钥 |

**Embedding**（必选一个）：

| 变量 | 说明 |
|------|------|
| `DAA_EMBEDDING_PROVIDER` | `ollama`（推荐，本地零成本）/ `siliconflow` / `openai` |
| `DAA_EMBEDDING_API_KEY` | 仅 siliconflow/openai 需要；ollama 不需要 |
| `DAA_EMBEDDING_ENDPOINT` | 可选，覆盖默认 endpoint |
| `DAA_EMBEDDING_MODEL` | 可选，覆盖默认模型 |

**可选**：

| 变量 | 说明 |
|------|------|
| `DAA_LLM_ENDPOINT` | 默认 `https://api.deepseek.com/v1/chat/completions` |
| `DAA_LLM_MODEL` | 默认 `deepseek-chat` |
| `ALPACA_API_KEY_ID` / `ALPACA_API_SECRET_KEY` | US 市场新闻主源（免费 REST + WS 实时推送，Benzinga 源；无则降级到 Yahoo RSS） |
| `TELEGRAM_BOT_TOKEN` | 出站通知 |
| `TELEGRAM_CHAT_ID` | 默认接收人 |
| `TELEGRAM_WEBHOOK_SECRET` | 入站 webhook 验签 |
| `TELEGRAM_ALLOWLIST` | 限制谁能通过 webhook 与助手对话 |
| `FEISHU_WEBHOOK_URL` | 飞书通知 |
| `DAA_HF_DANJUAN_ENABLED` | 启用蛋卷基金数据源 |
| `DAA_HF_DANJUAN_FUNDS` | 追踪的基金代码列表（逗号分隔） |

完整模板：[`.env.example`](../.env.example)。

---

## 3. 首次部署

### 3.1 本地开发

```bash
# 1. 克隆 + 装依赖
git clone https://github.com/your-org/Dynamic-Asset-Allocation.git
cd Dynamic-Asset-Allocation
pnpm install

# 2. 启动本地 Postgres（或连接已有实例）
docker run -d --name daa-pg -p 15432:5432 \
  -e POSTGRES_USER=daa -e POSTGRES_PASSWORD=daa -e POSTGRES_DB=daa \
  pgvector/pgvector:pg16

# 3. 配置 .env.local
cp .env.example .env.local
# 填入 DAA_DB_URL / DAA_LLM_API_KEY（其他都可选）

# 4. 运行 dev
pnpm dev    # http://localhost:3000
```

首次启动时 web 进程会自动跑 [`runtimeMigrations.ts`](../src/daa/store/runtimeMigrations.ts) 里的所有 pending 迁移。

### 3.2 VPS Docker 部署

项目路径示例：`/opt/Dynamic-Asset-Allocation`。

```bash
# 1. 准备 .env（包含所有必需变量）
scp .env onekey-vps:/opt/Dynamic-Asset-Allocation/

# 2. 部署
ssh onekey-vps 'cd /opt/Dynamic-Asset-Allocation && \
  git pull origin main && \
  docker compose up -d --build'

# 3. 等 ollama-init 拉模型完成（约 2-5 分钟，~1.2GB）
ssh onekey-vps 'docker logs -f dynamic-asset-allocation-ollama-init-1'
# 看到 "bge-m3 ready" 后 Exit 0 即可

# 4. 验证
ssh onekey-vps 'docker exec daa-ollama ollama list'   # 应列出 bge-m3:latest
ssh onekey-vps 'curl -f http://localhost:3000/'        # 应 307 重定向
```

`docker-compose.override.yml` 可以放 VPS 专属配置（如反代 host、附加 env）：

```yaml
services:
  daa-web:
    environment:
      - DAA_ENGINE_BASE_URL=https://your-domain.com
```

---

## 4. Embedding Provider 切换

系统默认模型维度 1024（BGE-M3）。切换时必须保证维度一致，否则 pgvector 列不兼容。

### 4.1 Ollama → SiliconFlow（回退云）

```bash
# .env
DAA_EMBEDDING_PROVIDER=siliconflow
DAA_EMBEDDING_API_KEY=sk-xxx   # 注册 https://cloud.siliconflow.cn/

docker compose up -d daa-web   # 只需重启 web
# ollama 容器可以留着也可以 stop，不影响
```

### 4.2 SiliconFlow → Ollama

```bash
# .env
DAA_EMBEDDING_PROVIDER=ollama
# DAA_EMBEDDING_API_KEY 留着无妨，ollama 用不到

docker compose up -d   # 启动 ollama + ollama-init
docker logs -f dynamic-asset-allocation-ollama-init-1   # 等首次拉模型
```

### 4.3 Ollama → OpenAI

```bash
# .env
DAA_EMBEDDING_PROVIDER=openai
DAA_EMBEDDING_API_KEY=sk-xxx
DAA_EMBEDDING_MODEL=text-embedding-3-small   # 支持 dimensions=1024

docker compose up -d daa-web
```

---

## 5. Cron Jobs（14 个）

所有 cron 由 `daa-cron` 容器通过 curl 调 web API 触发，用 `DAA_CRON_TOKEN` 鉴权。

**日志规范**：每个 cron 入口必须用 `runLoggedJob()` 包装，统一写 `daa_job_execution_logs`（90 天保留）。

### 5.1 清单

| Schedule (UTC) | Job | 用途 |
|----------------|-----|------|
| `*/5 * * * *` | `price-refresh` | 每 5 分钟刷新持仓 + watchlist 价格 |
| `5 0 * * *` | `fx-refresh` | 每日 00:05 刷新汇率 |
| `*/30 * * * *` | `news-refresh` | 每 30 分钟批量刷新新闻（Alpaca REST + Yahoo RSS；WS 实时推送另走 daa-ws-news） |
| `*/30 * * * *` | `market-indicators-refresh` | 每 30 分钟刷新 VIX / 比率类指标 |
| `0 * * * *` | `daily-analysis` | 每小时生成宏观 LLM 分析 |
| `0 1,9 * * *` | `drift-check` | 01:00 和 09:00 做漂移检测与调仓建议生成 |
| `0 8 * * *` | `hf-ingest` | 每日 08:00 同步基金经理持仓 |
| `30 1 * * *` | `dividend-refresh` | 每日 01:30 刷新分红数据 |
| `20 0 * * *` | `cache-cleanup` | 每日 00:20 统一清理过期缓存 |
| `*/30 * * * *` | `health-check` | 每 30 分钟检查核心 cron 是否正常，失败 TG 告警 |
| `0 * * * *` | `cognitive-agent` | 每小时触发（路由内按 `schedule` 派生窗口自门控） |
| `40 3 * * *` | `entity-backfill` | 每日 03:40 幂等补齐存量经验记录/投资判断的实体图 |
| （手动） | `monthly-report` | 月度报告（手动触发） |

### 5.2 手动触发

```bash
CRON_TOKEN=$(grep DAA_CRON_TOKEN /opt/Dynamic-Asset-Allocation/.env | cut -d= -f2)
curl -X POST -H "x-daa-cron-token: $CRON_TOKEN" \
  http://localhost:3000/api/daa/cron/price-refresh
```

常见调试参数：
- `entity-backfill?memoryLimit=1000&thesisLimit=1000` — 增大批量

---

## 6. 数据保留策略

由 `cache-cleanup` cron 每日 00:20 统一执行：

| 数据 | 表 | 保留期 |
|------|---|--------|
| 原始 API 响应 | `daa_external_payload_raw_v1` | 90 天 |
| 价格快照（非 fresh） | `daa_market_price_snapshots` | 30 天 |
| 市场指标快照 | `daa_market_indicator_snapshot_v1` | 90 天 |
| 新闻 item | `daa_news_item_snapshot_v1` | 30 天 |
| 通知记录 | `daa_notification_delivery_logs` | 180 天 |
| Job 日志 | `daa_job_execution_logs` | 90 天 |
| **价格历史** | `daa_market_price_history_v1` | **永久** |
| **权益快照** | `daa_equity_snapshots_v2` | **永久** |
| **复核经验记录** | `daa_agent_memory` | 按 `strength` 衰减 + 僵尸清理（见 [COGNITIVE_AGENT.md](./COGNITIVE_AGENT.md)） |

### 6.1 Exchange Calendar Maintenance

每年年末需要检查下一年度交易所日历：

- `src/daa/marketSession/exchangeCalendarData.ts`
- 美股：常规休市日与半日市。
- 港股：公众假期、交易所特别休市、午休保持 12:00-13:00。
- 如果交易所有临时休市，先更新该文件并部署，再允许自动执行恢复。

维护后运行：

```bash
pnpm run calendar:check
pnpm vitest run src/daa/__tests__/marketSessionCalendar.test.ts
```

未配置市场默认不能执行市价模拟成交，避免把未知市场误当 24/7。

---

## 7. 备份

### 7.1 数据库

```bash
# 完整备份
docker exec dynamic-asset-allocation-postgres-1 \
  pg_dump -U daa -d daa -Fc > /backup/daa-$(date +%Y%m%d).dump

# 只备份用户数据（排除大缓存表）
docker exec dynamic-asset-allocation-postgres-1 pg_dump -U daa -d daa \
  --exclude-table=daa_external_payload_raw_v1 \
  --exclude-table=daa_market_price_history_v1 \
  -Fc > /backup/daa-core-$(date +%Y%m%d).dump
```

### 7.2 Ollama 模型

Ollama 模型存在 volume `daa-ollama-data`。如果重建 volume，`ollama-init` 会自动重新拉取。不需要手动备份。

### 7.3 Secrets

`.env` 文件里的 API Keys、加密密钥必须备份到安全位置（password manager / 加密磁盘）。DB 中的 secrets 用 `DAA_SECRETS_ENCRYPTION_KEY` 加密，丢失此 key 无法解密。

---

## 8. 健康检查

### 8.1 容器状态

```bash
docker compose ps --format "table {{.Name}}\t{{.Status}}"
```

正常：

```
dynamic-asset-allocation-daa-web-1      Up
dynamic-asset-allocation-daa-cron-1     Up
dynamic-asset-allocation-postgres-1     Up
dynamic-asset-allocation-ollama-init-1  Exited (0)   ← 正常一次性退出
daa-ollama                              Up
```

### 8.2 关键端点

```bash
# Web 存活
curl -f http://localhost:3000/                         # 应 307

# Ollama 存活（内网）
docker exec dynamic-asset-allocation-daa-web-1 \
  wget -qO- http://ollama:11434/api/tags               # 应列出 bge-m3

# 数据库 + 迁移
docker exec dynamic-asset-allocation-postgres-1 \
  psql -U daa -d daa -c "SELECT COUNT(*) FROM daa_schema_migrations_v1"
```

### 8.3 Cron 健康告警

内置 `health-check` cron 每 30 分钟检查：
- `price-refresh` 最后执行 < 30 分钟
- `market-indicators-refresh` 最后执行 < 60 分钟

异常时推送 Telegram 告警（需配置 `TELEGRAM_*`）。

---

## 9. 常见故障

### 9.1 `pnpm build` OOM / SSH 断开

VPS 内存紧张时 Next.js build 可能触发 OOM。对策：

```bash
# 后台跑，日志落盘，避免 SSH 断导致中断
ssh onekey-vps 'cd /opt/Dynamic-Asset-Allocation && \
  nohup docker compose up -d --build > /tmp/daa-deploy.log 2>&1 < /dev/null &'

# 轮询日志
ssh onekey-vps 'tail -f /tmp/daa-deploy.log'
```

### 9.2 容器名冲突

推翻重来或两次 `docker compose up` 冲突时：

```
Error: The container name "xxx_daa-web-1" is already in use...
```

对策：

```bash
docker compose down           # 干净关停
# 或精确清理
docker rm -f $(docker ps -aq --filter name=dynamic-asset-allocation)
docker compose up -d --build
```

### 9.3 Ollama 模型未拉

`ollama-init` 失败或被清理，之后投资助理会报 embedding 失败。对策：

```bash
docker exec daa-ollama ollama pull bge-m3
docker exec daa-ollama ollama list     # 确认 bge-m3:latest 存在
```

### 9.4 Embedding API 未配置

`embedding.ts` 检测不到配置会打印警告并返回 1024 维零向量 — 语义召回失效但不报错。对策：在 `.env` 设置 `DAA_EMBEDDING_PROVIDER=ollama`，重启 web 容器。

### 9.5 迁移失败 / schema 不一致

查看迁移状态：

```bash
docker exec dynamic-asset-allocation-postgres-1 \
  psql -U daa -d daa -c "SELECT id, applied_at FROM daa_schema_migrations_v1 ORDER BY applied_at DESC LIMIT 20"
```

迁移是 `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` 设计，原则上幂等。如需重跑某条：

```sql
DELETE FROM daa_schema_migrations_v1 WHERE id = '20260419_xxx';
-- 然后 restart web 容器自动重试
```

### 9.6 投资助理 cycle 卡住

```bash
# 看最近 run
docker exec dynamic-asset-allocation-postgres-1 psql -U daa -d daa -c "
  SELECT id, status, total_tokens, duration_ms, created_at, completed_at
  FROM daa_agent_runs ORDER BY created_at DESC LIMIT 5"

# status=running 且 created_at 超过 5 分钟前 → 异常，人工结束
docker exec dynamic-asset-allocation-postgres-1 psql -U daa -d daa -c "
  UPDATE daa_agent_runs SET status='failed', completed_at=now()
  WHERE status='running' AND created_at < now() - interval '10 min'"
```

### 9.7 Telegram 不推送

```bash
# 看最近通知日志
docker exec dynamic-asset-allocation-postgres-1 psql -U daa -d daa -c "
  SELECT event_type, status, error_text, created_at
  FROM daa_notification_delivery_logs ORDER BY created_at DESC LIMIT 10"
```

常见原因：`TELEGRAM_BOT_TOKEN` 错 / `TELEGRAM_CHAT_ID` 未设 / 被 BotFather Limit。

---

## 10. 回滚

```bash
# 1. 备份当前 .env（切换配置前）
cp .env .env.bak.$(date +%Y%m%d_%H%M%S)

# 2. Git 回滚
cd /opt/Dynamic-Asset-Allocation
git log --oneline -10                    # 找到要回滚的 commit
git reset --hard <commit-hash>

# 3. 重建
docker compose up -d --build

# 4. 如需恢复旧 .env
cp .env.bak.xxx .env && docker compose up -d daa-web
```

**注意**：
- 数据库迁移无 DOWN，如果新迁移加了列或索引，回滚代码不会自动撤销。通常 `IF NOT EXISTS` 设计不会有问题。
- 若需撤销 entity/memory 数据，直接 `TRUNCATE daa_memory_entity_link, daa_thesis_entity_link, daa_agent_entity`（不影响主数据；表名保留内部兼容契约）。

---

## 11. 相关文档

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — 代码分层、模块、数据流、约束
- **[COGNITIVE_AGENT.md](./COGNITIVE_AGENT.md)** — 投资助理复核工作流、经验库、工具注册、复核简报原理
- **[../CLAUDE.md](../CLAUDE.md)** — 快速参考清单（AI 助手 / 新贡献者）
- **[../.env.example](../.env.example)** — 环境变量模板
- **[../docker-compose.yml](../docker-compose.yml)** — 容器编排
