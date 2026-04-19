<div align="center">

# DAA Console

**面向个人投资者的 AI-Native 动态资产配置工作台**

观察 → 研究论点 → 生成建议 → 模拟执行 → 复盘学习 → 对话协同

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org)
[![pnpm](https://img.shields.io/badge/pnpm-10-orange?logo=pnpm)](https://pnpm.io)

</div>

---

## 定位

不是实盘交易系统，不是券商管理台，是**个人用的资产配置副驾驶**。

- **单组合**：硬编码 `'default'` 账户，不做多租户
- **本地模拟**：不对接任何券商，所有执行写入本地数据库
- **AI-Native**：Cognitive Agent 每天主动追问"我现在最可能错在哪里"，不是被动问答
- **强人工确认**：所有写操作（交易 / 调仓）必须用户明确确认

## 核心能力

### 🧠 Cognitive Agent（AI 核心）

基于 LangGraph 的 6 节点认知 Agent：`observe → prioritize → investigate ⇄ reflect → review → surface`。

- **Thesis-driven**：维护一组持续演化的投资论点，每天审视并证伪
- **记忆三层**：pgvector 语义 + pg_trgm 关键字 + 实体图（6 kind）
- **16 个工具**：observe / analyze / meta / act 四类，链式调用
- **日报 5 面板**：今日意外、认知缺口、改观条件、论点冲突、风险暴露

> 详见 **[docs/COGNITIVE_AGENT.md](./docs/COGNITIVE_AGENT.md)**

### 📊 再平衡引擎

- 漂移检测（日历 / Agent / 阈值三路触发）
- 四维信号融合（技术 25% + 估值 20% + 新闻 20% + 人类 35%）
- 纯算法订单生成（`src/core/rebalanceCore.ts`）
- 风控预检 + 执行摘要 + 人工勾选

### 💬 双通道对话

Web UI + Telegram Bot，14 种意图，可查组合/市场/风险、发起调仓、确认执行。所有写操作 10 分钟 TTL 待确认。

### 🗂️ 资产覆盖

87 个精选资产 · 10 种资产类别 · 6 个市场：
- US / HK / CN / EU / JP 股票 + ETF
- 大宗商品 / 债券 / 加密 / 货币

## 技术栈

| 层 | 选型 |
|---|------|
| 框架 | Next.js 14 · React 18 · TypeScript 5 |
| UI | Tailwind CSS · shadcn/ui · Recharts · lightweight-charts |
| 后端 | PostgreSQL + pgvector + pg_trgm · Supabase Auth |
| LLM | DeepSeek（主） · OpenAI 兼容（备） |
| Embedding | Ollama BGE-M3（本地，零成本） · SiliconFlow · OpenAI |
| Agent | LangGraph.js 1.2 |
| 测试 | Vitest · Playwright |
| 部署 | Docker Compose（5 容器） |

> 详见 **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**

## 快速开始

### 本地开发

```bash
# 1. 依赖
pnpm install

# 2. 启动本地 Postgres（或用你自己的）
docker run -d --name daa-pg -p 15432:5432 \
  -e POSTGRES_USER=daa -e POSTGRES_PASSWORD=daa -e POSTGRES_DB=daa \
  pgvector/pgvector:pg16

# 3. 配置环境变量
cp .env.example .env.local
# 填 DAA_DB_URL / Supabase / DAA_LLM_API_KEY 即可启动

# 4. 启动
pnpm dev     # http://localhost:3000/daa/dashboard
```

首次启动会自动执行数据库迁移。

### Docker 部署

```bash
cp .env.example .env
# 生成密钥
echo "DAA_CRON_TOKEN=$(openssl rand -hex 32)" >> .env
echo "DAA_SECRETS_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env

docker compose up -d --build
# 等 ollama-init 拉完 bge-m3（~1.2GB，2-5 分钟），看 "bge-m3 ready" 即可
```

> 完整部署、Cron 清单、故障排查详见 **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)**

### 开发验证

```bash
pnpm test          # Vitest 单测
pnpm typecheck     # TypeScript
pnpm gates         # 完整门控（test + typecheck + build）
```

## 文档

| 文档 | 面向 | 内容 |
|------|------|------|
| **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** | 技术读者 / 贡献者 | 代码分层、模块职责、数据流、26 张表、核心约束 |
| **[docs/COGNITIVE_AGENT.md](./docs/COGNITIVE_AGENT.md)** | 想理解 Agent 原理 | 工作流、记忆三层、16 工具、日报 5 面板、配置参数 |
| **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** | 运维 / 部署 | 容器拓扑、环境变量、14 个 Cron、数据保留、故障排查 |
| **[CLAUDE.md](./CLAUDE.md)** | AI 助手 / 新贡献者 | 规范清单（快速扫读） |
| [.env.example](./.env.example) | 所有人 | 环境变量模板 |

## 明确不做

- ❌ 真实券商下单 / 实盘执行
- ❌ 多账户 / 多组合管理
- ❌ 期权 / 衍生品 / FX 对冲
- ❌ 实时流式价格（当前为批量拉取）
- ❌ 自主优化参数的量化平台

## 许可证

[GNU Affero General Public License v3.0](LICENSE)
