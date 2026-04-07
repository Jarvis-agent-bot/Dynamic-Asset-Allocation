<div align="center">

# DAA Console

**本地模拟的动态资产配置与再平衡助手**

发现资产 → 看市场 → 生成建议 → 模拟执行 → 复盘学习 → 对话协同

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org)
[![pnpm](https://img.shields.io/badge/pnpm-10-orange?logo=pnpm)](https://pnpm.io)

</div>

## 定位

DAA Console 不是实盘交易系统，也不是券商连接器管理台。

它当前的产品定位是：

- 单组合
- 本地模拟执行
- 多资产观察与再平衡
- LLM 驱动的对话式助手
- 强人工确认，不做自动实盘下单

如果你想要的是“能看、能想、能生成建议、能做本地模拟执行、能聊天确认动作”的再平衡助手，这个仓库就是围绕这个目标构建的。

## 当前能力

### 1. 组合与工作台

- 维护资产池、观察列表、目标权重、持仓与现金
- 查看权益快照、现金台账、再平衡周期、执行记录
- 工作台以统一读模型聚合组合、市场、周期、风险、通知状态

### 2. 再平衡引擎

- 根据目标权重和当前持仓计算 drift
- 结合市场状态层、信号融合、LLM 决策输出生成再平衡建议
- 对建议执行前做风控校验和执行摘要
- 支持人工选择建议后再模拟执行

### 3. 模拟执行

- 只支持本地模拟执行
- 支持单笔手动买卖预览与模拟成交
- 支持调仓周期的批量模拟执行
- 执行后回写交易记录、账本、权益与周期状态

### 4. 对话式助手

- Web 和 Telegram 双入口
- 会话里可以查询组合、风险、市场、最近周期
- 可以发起“生成调仓建议 / 执行调仓 / 买入卖出”类动作
- 执行类动作必须先进入待确认，再由用户确认
- 助手会保存会话摘要、工具调用、近期复盘经验

### 5. 学习闭环

- 记录调仓生成、执行结果、单笔成交等学习事件
- 最近复盘经验会回流到 LLM 规划和调仓决策提示词
- 当前是“经验记忆 + 提示词回流”阶段，还不是自动改参数的自适应策略系统

## 明确不做

- 不做真实券商下单
- 不做 IBKR / TWS / Gateway 集成
- 不做自动实盘执行
- 不做多组合与多账户管理
- 不把用户名密码托管到系统里

## 核心流程

### 工作台主流程

1. 把资产加入观察池
2. 配目标权重和组合约束
3. 刷新市场状态、价格和信号
4. 生成一轮再平衡周期
5. 查看风险检查和执行摘要
6. 人工确认后执行模拟调仓
7. 在交易记录和工作台里复盘

### 聊天助手主流程

1. 用户从 Web 或 Telegram 发消息
2. 系统加载当前组合上下文、最近对话、最近复盘经验
3. LLM 先做动作规划
4. 对于查询类请求，助手直接回答
5. 对于交易或执行类请求，先生成待确认动作
6. 用户回复“确认”后才真正执行本地模拟动作
7. 系统写入消息、工具调用、学习事件

## 技术栈

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- PostgreSQL
- Supabase Auth
- Recharts
- Framer Motion

## 目录结构

```text
app/
  daa/
    dashboard/
      workbench/        工作台
      trades/           交易与调仓记录
      settings/         设置、通知、凭证
    login/              登录
  api/daa/
    read/               只读聚合接口
    workbench/          工作台写接口
    chat/               Web / Telegram 对话接口
    store/              配置、快照、台账、缓存、通知日志
    cron/               定时任务

src/daa/
  modules/
    workbench/          工作台与再平衡业务编排
    read/               Dashboard 读模型
    marketContext/      市场状态层
  llm/                  LLM 客户端、结构化决策
  chat/                 对话入口、planner、tool registry、memory/orchestrator
  agent/                Agent 学习事件与经验回流
  notify/               Telegram / 飞书通知
  store/                持久化存储与迁移
  broker/               本地模拟执行路由、状态映射与执行抽象
  gateway/              本地模拟执行入口与执行状态探针
```

## 关键页面

### `/daa/dashboard/workbench`

- 组合总览
- 资产池与观察列表
- 现金与账本
- 再平衡建议、风险、执行
- 助手聊天面板

### `/daa/dashboard/trades`

- 调仓周期历史
- 模拟订单记录
- 执行结果与复盘信息

### `/daa/dashboard/settings`

- 策略参数
- 风险阈值
- 数据源设置
- 通知开关
- 凭证管理

## 关键接口

### 只读聚合

- `GET /api/daa/read/workbench`
- `GET /api/daa/read/trades`

## Agent 内核

- `src/daa/chat/chatOrchestrator.ts`
  只负责会话创建、planner 调用、tool 执行编排。
- `src/daa/chat/agentPlanner.ts`
  负责把用户输入结合上下文、会话摘要、学习摘要映射为结构化 intent。
- `src/daa/chat/intentParser.ts`
  作为对外 facade，统一导出 intent 类型、规则解析和 LLM 规划。
- `src/daa/chat/assistantIntentRules.ts`
  负责规则兜底、只读会话降级和分析型问题 fallback。
- `src/daa/chat/assistantIntentPlanning.ts`
  负责 planner prompt 组织、LLM 调用和结构化响应解析。
- `src/daa/chat/agentTools.ts`
  维护动作工具目录，把 intent 映射到具体 handler family。
- `src/daa/chat/agentToolViewHandlers.ts`
  负责组合、风险、市场、周期等查询类回复。
- `src/daa/chat/agentToolExecutionHandlers.ts`
  负责执行类 handler 聚合，把 trade / rebalance / confirm flow 串起来。
- `src/daa/chat/agentTradeExecutionHandlers.ts`
  负责单笔模拟交易的预览、确认执行和成交学习回写。
- `src/daa/chat/agentRebalanceExecutionHandlers.ts`
  负责调仓生成、调仓执行和周期级学习回写。
- `src/daa/chat/agentToolReasoningHandlers.ts`
  负责自由问答、上下文问答和 unknown 兜底。
- `src/daa/chat/agentContext.ts`
  负责 runtime context、pending action、会话摘要和上下文摘要。
- `src/daa/chat/channelAdapters.ts`
  统一 Web / Telegram 的 session key、参与者与线程适配规则。
- `src/daa/chat/chatSessionService.ts`
  统一会话创建、入站消息查重和 Web 会话载荷读取。
- `src/daa/chat/chatThreadTypes.ts`
  定义 channel-agnostic 的 thread 视图，把 Web / Telegram 会话统一成同一阅读模型。
- `src/daa/chat/chatConversationReadService.ts`
  负责把 active session、selected session、messages、threads 聚合成统一 conversation read model。
- `src/daa/chat/chatSessionRepo.ts` / `chatMessageRepo.ts` / `chatMemoryRepo.ts` / `chatToolCallRepo.ts`
  把聊天持久化拆成 session、message、memory、tool-call 四个子 repo。
- `src/daa/agent/agentLearningRepo.ts`
  把调仓生成、模拟执行结果沉淀为可回流的学习事件。

### 工作台动作

- `GET /api/daa/workbench/search-assets`
- `GET /api/daa/workbench/featured-assets`
- `POST /api/daa/workbench/assets/upsert`
- `GET /api/daa/workbench/assets/[assetKey]`
- `GET /api/daa/workbench/assets/[assetKey]/insights`
- `POST /api/daa/workbench/rebalance/generate`
- `POST /api/daa/workbench/risk-check`
- `POST /api/daa/workbench/rebalance/execute-summary`
- `POST /api/daa/workbench/rebalance/execute`
- `PATCH /api/daa/workbench/rebalance/cycles/[id]`
- `POST /api/daa/workbench/execution/preview`
- `POST /api/daa/workbench/execution/execute`
- `POST /api/daa/workbench/llm-feedback`

### 聊天助手

- `GET /api/daa/chat/sessions`
- `POST /api/daa/chat/messages`
- `POST /api/daa/chat/telegram/webhook`

### 存储与运维

- `GET/PATCH /api/daa/store/system-config`
- `GET/PUT/DELETE /api/daa/store/secrets`
- `POST /api/daa/store/secrets/test`
- `GET /api/daa/store/cash-ledger`
- `GET /api/daa/store/equity-snapshots`
- `GET /api/daa/store/fx-rates`
- `GET /api/daa/store/op-log`
- `GET /api/daa/store/run-history`
- `GET /api/daa/store/notification-deliveries`
- `GET /api/daa/store/market-cache/health`
- `POST /api/daa/store/market-cache/refresh`
- `GET /api/daa/engine-health`
- `GET /api/daa/gateway/status`
  仅用于查看本地模拟执行网关状态，不代表任何真实券商连接状态。

## 快速开始

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

打开：

```text
http://localhost:3000/daa/dashboard
```

## 环境变量完整清单

### 必需（系统无法启动）

| 变量 | 说明 | 示例 |
|------|------|------|
| `DAA_DB_URL` | PostgreSQL 连接 | `postgresql://daa:daa@localhost:5432/daa` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase 公钥（客户端安全） | `sb_publishable_xxx` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 管理密钥（仅服务端） | `sb_secret_xxx` |

### 推荐（核心功能依赖）

| 变量 | 说明 | 示例 |
|------|------|------|
| `DAA_LLM_API_KEY` | LLM API 密钥 | `sk-xxx` |
| `DAA_LLM_ENDPOINT` | LLM 端点 | `https://api.deepseek.com/v1/chat/completions` |
| `DAA_LLM_MODEL` | LLM 模型名 | `deepseek-chat` |
| `DAA_CRON_TOKEN` | Cron 定时任务认证 | `openssl rand -hex 32` 生成 |

### 安全（生产环境必需）

| 变量 | 说明 | 默认行为 |
|------|------|---------|
| `DAA_SECRETS_ENCRYPTION_KEY` | Secrets 加密密钥 | 未设时从 DB URL 派生（不安全） |

### 可选（通知与对话）

| 变量 | 说明 |
|------|------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token（也可在设置页配置） |
| `TELEGRAM_CHAT_ID` | Telegram 默认接收人 |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook 验证密钥（设置页可一键注册） |
| `TELEGRAM_ALLOWLIST` | 允许与 Bot 对话的用户 ID |
| `FEISHU_WEBHOOK_URL` | 飞书 Webhook URL |
| `FRED_API_KEY` | FRED 宏观经济数据 API |
| `TWITTERDATA_TOKEN` | Twitter 数据 API |

> 通知类凭证优先级：环境变量 > 数据库加密存储 > 空。
> 大部分凭证可在 Settings 页面的"凭证"区直接配置，无需写环境变量。

### 开发专用

| 变量 | 说明 | 默认 |
|------|------|------|
| `DAA_AUTH_DEV_DEFAULT_ACCOUNT` | 是否自动创建 dev 账户 | `false`（opt-in） |
| `DAA_AUTH_DEV_DEFAULT_USERNAME` | dev 账户用户名 | `admin` |
| `DAA_AUTH_DEV_DEFAULT_PASSWORD` | dev 账户密码 | `admin123` |
| `DAA_API_PROXY_TARGET` | 开发时 API 代理到线上 | 空（不代理） |

## 部署

### Docker Compose（推荐）

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env，填写必需变量

# 2. 生成安全密钥
echo "DAA_CRON_TOKEN=$(openssl rand -hex 32)" >> .env
echo "DAA_SECRETS_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env

# 3. 启动
docker compose up -d

# 4. 验证
docker ps  # 应有 daa-web, daa-cron, postgres 三个容器
curl -s http://localhost:3000/daa/login  # 应返回 200
```

### VPS 部署更新

```bash
ssh your-vps "cd /opt/Dynamic-Asset-Allocation && git pull origin main && docker compose build --no-cache daa-web && docker compose up -d daa-web"
```

### Telegram 对话助手配置

1. 在设置页填写 Bot Token 和 Chat ID
2. 点击"注册 Webhook"按钮（自动完成 webhook URL + secret + allowlist）
3. 在 Telegram 给 Bot 发消息测试

## 本地开发

```bash
pnpm install
cp .env.example .env.local
# 编辑 .env.local，填写数据库和 Supabase 配置
pnpm dev
```

打开 `http://localhost:3000/daa/dashboard`

## 开发验证

```bash
pnpm test         # 单元测试
pnpm typecheck    # TypeScript 检查
pnpm gates        # 完整门控（test + typecheck + build）
```

## 开发验证

```bash
pnpm test
pnpm run typecheck
pnpm run build:check
```

常用单项检查：

```bash
pnpm exec vitest run src/daa/__tests__/assistantChatRoutes.test.ts
pnpm exec vitest run src/daa/__tests__/workbenchTradeFlowRoute.test.ts
pnpm exec vitest run src/daa/__tests__/dashboardReadModelGraph.test.ts
```

## 当前阶段的真实边界

现在这套系统最准确的描述是：

> 一个以本地模拟为核心、带再平衡引擎和 LLM 对话助手的动态资产配置工作台

它已经能：

- 看组合
- 看市场
- 生成调仓建议
- 做本地模拟执行
- 聊天确认动作
- 记录复盘经验

但它还不是：

- 自动交易机器人
- 实盘执行系统
- 自主优化参数的量化平台

## 后续方向

当前最值得继续推进的方向是：

- 提升 LLM Agent 的动作规划和多轮推理质量
- 增强学习闭环，把复盘经验更深地回流到建议生成
- 继续简化工作台 UI，让“看状态 -> 做决策 -> 确认动作”更顺手

## 许可证

[GNU Affero General Public License v3.0](LICENSE)
