# DAA Rebalance — 系统架构文档

> Dynamic Asset Allocation · 个人投资者动态资产配置工作台
> 更新于 2026-03-25

---

## 一、代码分层架构

```
┌─────────────────────────────────────────────────────────────────────┐
│  Frontend Layer  (Next.js 14 App Router + React 18 + Tailwind)     │
│  app/daa/dashboard/                                                 │
│  ┌────────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────────────┐  │
│  │ Workbench  │ │  Trades  │ │ Settings │ │  Login / Session    │  │
│  │ - Cockpit  │ │ - History│ │ - Config │ │  - Supabase Auth    │  │
│  │ - Watchlist│ │ - Tickets│ │ - Secrets│ │  - Role Guard       │  │
│  │ - Rebalance│ │ - Reports│ │ - Notify │ │                     │  │
│  │ - Cash     │ │          │ │ - Strategy│ │                     │  │
│  │ - Insights │ │          │ │          │ │                     │  │
│  └─────┬──────┘ └────┬─────┘ └────┬─────┘ └──────────┬──────────┘  │
│        └─────────────┴────────────┴───────────────────┘             │
│                      React Hooks + API Client                       │
├─────────────────────────────────────────────────────────────────────┤
│  API Layer  (70+ REST Endpoints)                                    │
│  app/api/daa/                                                       │
│  ┌──────┐ ┌─────────┐ ┌──────┐ ┌───────┐ ┌──────┐ ┌──────┐ ┌────┐│
│  │ auth │ │workbench│ │ read │ │ store │ │ cron │ │market│ │chat││
│  │4 端点│ │ 12 端点 │ │2 端点│ │14 端点│ │9 job │ │6 proxy│ │3  ││
│  └──────┘ └─────────┘ └──────┘ └───────┘ └──────┘ └──────┘ └────┘│
│                   routeHelpers + withApiHandler                     │
├─────────────────────────────────────────────────────────────────────┤
│  Business Logic Layer  (src/daa/ — 编排 + 副作用)                   │
│  ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────────┐   │
│  │ modules/  │ │ signals/ │ │   llm/   │ │     broker/        │   │
│  │ workbench │ │ technical│ │ llmClient│ │ simBroker (模拟)    │   │
│  │ portfolio │ │ valuation│ │ llmAnalys│ │ cryptoPaperBroker  │   │
│  │ trade     │ │ news     │ │ llmDecis │ │ executionRouting   │   │
│  │ marketCtx │ │ fusion   │ │          │ │                    │   │
│  │ dividend  │ │ opportun │ │          │ │                    │   │
│  └───────────┘ └──────────┘ └──────────┘ └────────────────────┘   │
│  ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────────┐   │
│  │  config/  │ │  notify/ │ │   hf/    │ │      store/        │   │
│  │ sysConfig │ │ telegram │ │ hfService│ │ 15 domain stores   │   │
│  │ secrets   │ │ feishu   │ │ humanSig │ │ (account, position │   │
│  │ currency  │ │ daily rpt│ │ danjuan  │ │  trade, fx, mkt..) │   │
│  └───────────┘ └──────────┘ └──────────┘ └────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│  Core Algorithm Layer  (src/core/ — 纯算法，零副作用)               │
│  ┌──────────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────────┐   │
│  │rebalanceCore │ │ ensemble/│ │ backtest/│ │  math / metrics │   │
│  │ 漂移检测     │ │ strategy │ │ attribut │ │  Sharpe / MaxDD │   │
│  │ 订单生成     │ │ 权重组合 │ │ 归因分析 │ │  收益率 / 波动率│   │
│  │ 约束检查     │ │ 归一化   │ │          │ │  累积乘积       │   │
│  └──────────────┘ └──────────┘ └──────────┘ └─────────────────┘   │
│  ⚠️ 禁止引用 src/daa/，无 DB、无网络、无副作用                     │
├─────────────────────────────────────────────────────────────────────┤
│  Data Layer                                                         │
│  ┌────────────────┐ ┌─────────────────────────┐                      │
│  │  PostgreSQL    │ │   External APIs         │                      │
│  │  15+ 表       │ │   Yahoo, DeepSeek,      │                      │
│  │               │ │   Xueqiu, Twitter, TG   │                      │
│  └────────────────┘ └─────────────────────────┘                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 二、功能架构

```
                   ┌──────────────────────────────────────┐
                   │       DAA Rebalance 功能全景          │
                   │    个人投资者动态资产配置工作台         │
                   └──────────────────┬───────────────────┘
                                      │
       ┌──────────────┬───────────────┼───────────────┬──────────────┐
       ▼              ▼               ▼               ▼              ▼
 ┌───────────┐ ┌───────────┐ ┌────────────┐ ┌───────────┐ ┌──────────┐
 │ 📡 资产发现│ │ 🔍 洞察分析│ │ ⚖️ 再平衡  │ │ 📊 执行   │ │ 📋 复盘  │
 │           │ │           │ │            │ │           │ │          │
 │ 78 精选   │ │三维信号融合│ │ 漂移检测   │ │ 模拟下单  │ │ 交易记录 │
 │ Yahoo搜索 │ │ 人类 35%  │ │ 日历触发   │ │ 风控检查  │ │ 周期报告 │
 │ 观察列表  │ │ 技术 25%  │ │ 提案生成   │ │ 头寸更新  │ │ 归因分析 │
 │ 10类/6区域│ │ 新闻 20%  │ │ LLM调整    │ │ 现金流水  │ │          │
 │           │ │ 估值 20%  │ │ 人工审批   │ │ 通知推送  │ │          │
 └───────────┘ └───────────┘ └────────────┘ └───────────┘ └──────────┘
```

### 辅助子系统

| 子系统 | 功能 |
|--------|------|
| 🌐 市场环境 | 7 维指标 (VIX, QQQ/SPY, FXI Vol, KWeb/FXI, BTC/ETH, BTC Vol, 金银比) → risk_on/off |
| 🤖 AI 辅助 | DeepSeek 分析 (OpenAI 回退), 每日摘要, 提案调整, Telegram 助手 |
| 📊 策略回测 | 5 策略 (momentum/riskParity/minVariance/equalWeight/baseline), 漂移模拟, 绩效指标 |
| 🏦 HF 追踪 | 基金经理持仓, 信号聚合, 蛋卷基金数据 |
| 🔔 通知 | Telegram Bot, 飞书 Webhook, Email(计划中) |
| ⚙️ 配置 | 策略参数, 风控规则, 再平衡策略, 密钥管理 |

---

## 三、核心数据流

```
Yahoo Finance ──┐
Xueqiu API ─────┤── Market Data Client ──┬── Technical Signal (SMA/EMA/MACD/RSI)
Twitter/X ──────┘                        ├── News Signal (RSS/推文情绪)
                                         ├── Valuation Signal (PE/PB/DY/Z分)
                                         │
                   HF 持仓信号 ──────────►│
                                         ▼
                                   Signal Fusion
                              (人类35% 技术25% 新闻20% 估值20%)
                              (冲突检测 + 惩罚机制)
                                         │
           Market Context ──────────────►│
           (7维指标 → risk regime)        ▼
                                   Rebalance Core
                                   (漂移计算 → 订单生成 → 约束检查)
                                         │
           DeepSeek LLM ───────────────►│
           (AI 调整建议)                  ▼
                                   Proposal Engine → User Review
                                         │
                                         ▼
                                   Execution Engine
                                   (模拟下单 → 头寸更新 → 现金流水)
                                         │
                          ┌──────────────┼──────────────┐
                          ▼              ▼              ▼
                     PostgreSQL    Telegram/飞书    交易记录
```

---

## 四、Store 领域拆分 (15 模块)

| 模块 | 职责 | Exports |
|------|------|---------|
| `storeTypes.ts` | 55 个类型定义 | — |
| `storeShared.ts` | DB 工具 (parseJsonb, quoteIdent, withPgTransaction) | 15 |
| `accountStore.ts` | 账户状态, 系统配置, 策略配置 | 25 |
| `assetUniverseStore.ts` | 资产主数据 CRUD + 批量价格更新 | 7 |
| `positionStore.ts` | 头寸管理 | 11 |
| `portfolioStore.ts` | 权益快照, 价格历史 | 11 |
| `fxStore.ts` | 外汇汇率 | 8 |
| `cashLedgerStore.ts` | 现金流水 | 4 |
| `tradeTicketStore.ts` | 交易工单, 篮子, 执行 (最大) | 31 |
| `rebalanceCycleStore.ts` | 再平衡周期, 报告, 反馈 | 8 |
| `notificationStore.ts` | 运行历史, 操作日志 | 4 |
| `marketCacheStore.ts` | 价格缓存, 新闻, 指标, HF 信号 | 18 |
| `jobStore.ts` | 外部载荷, 任务日志 | 5 |
| `storeSchema.ts` | Schema 初始化, 迁移 | 3 |
| `daaStorePg.ts` | Barrel 重导出 (零破坏性变更) | all |

---

## 五、API 端点总览 (70+)

### 认证 (`/api/daa/auth/`)
| Method | Path | 说明 |
|--------|------|------|
| POST | `/auth/bootstrap` | 初始账号创建 (仅无账号时) |
| POST | `/auth/login` | 邮箱登录 |
| POST | `/auth/logout` | 登出 |
| GET | `/auth/me` | 当前用户信息 |

### 工作台 (`/api/daa/workbench/`)
| Method | Path | 说明 |
|--------|------|------|
| GET | `/workbench/search-assets` | 搜索资产 |
| GET | `/workbench/featured-assets` | 78 精选资产 |
| POST | `/workbench/assets/upsert` | 添加/更新资产 |
| GET | `/workbench/assets/[key]/insights` | 单资产 AI 洞察 |
| POST | `/workbench/execution/preview` | 预览执行 |
| POST | `/workbench/execution/execute` | 执行交易 |
| POST | `/workbench/rebalance/generate` | 生成提案 |
| POST | `/workbench/rebalance/execute` | 执行提案 |
| POST | `/workbench/risk-check` | 风控检查 |
| GET | `/workbench/llm/env-status` | LLM 配置状态 |

### 定时任务 (`/api/daa/cron/`)
| Job | 频率 | 说明 |
|-----|------|------|
| price-refresh | 每 15 分钟 | 批量更新资产价格 |
| fx-refresh | 每日 5am UTC | 汇率更新 |
| news-refresh | 每 30 分钟 | RSS/Twitter 新闻 |
| market-indicators | 每 30 分钟 | 7 维市场指标 |
| daily-analysis | 每小时 | LLM 市场分析 |
| drift-check | 1am & 9am UTC | 漂移触发检测 |
| hf-ingest | 8am UTC | 对冲基金持仓 |
| dividend-refresh | 1:30am UTC | 股息数据 |
| cache-cleanup | 8:20pm UTC | 过期数据清理 |

---

## 六、信号融合算法

```
权重分配:  人类 35%  |  技术 25%  |  新闻 20%  |  估值 20%
              │           │            │           │
              ▼           ▼            ▼           ▼
         加权平均 → 基础分数 (0-100)
              │
         冲突检测:
           人类看多(65+) + 技术看空(≤40) → -9 惩罚
           新闻看多(62+) + 技术看空      → -7 惩罚
              │
         行动推断:
           分数 ≥72 & 信心 ≥58 → "open_or_add"  (建仓/加仓)
           分数 ≥56 & 信心 ≥42 → "watch"         (观察)
           其他               → "reduce_or_avoid" (减仓/回避)
```

---

## 七、系统规模指标

| 指标 | 数值 | 说明 |
|------|------|------|
| API 端点 | 70+ | REST，覆盖全部功能 |
| 前端页面 | 4 | Workbench / Trades / Settings / Login |
| Store 模块 | 15 | 领域拆分后的独立存储模块 |
| 数据库表 | 15+ | 运行时自动迁移 |
| 定时任务 | 9 | 覆盖价格/FX/新闻/指标/分析/漂移/持仓/股息/清理 |
| 精选资产 | 78 | US/HK/CN 股票, ETF, 债券, 商品, 加密, 外汇 |
| 信号维度 | 4 | 人类 + 技术 + 新闻 + 估值 |
| 市场指标 | 7 | VIX, QQQ/SPY, FXI Vol, KWeb/FXI, BTC/ETH, BTC Vol, 金银比 |
| 回测策略 | 5 | momentum, riskParity, minVariance, equalWeight, baseline |
| 通知渠道 | 3 | Telegram, 飞书, Email(计划中) |
| 单测覆盖 | 77 文件 / 284 断言 | Core + Store + API 层 |
| TypeScript | 0 错误 | 严格类型检查通过 |

---

## 八、能力边界

### ✅ 已实现
- 78 精选资产覆盖 (10 类别, 6 区域)
- 三维信号融合 + 冲突检测
- 日历/漂移再平衡 + LLM 决策
- 7 维市场环境 → 风险体制判断
- 模拟执行 (simBroker / cryptoPaperBroker)
- AI 辅助分析 + Telegram 智能助手
- 9 个定时任务自动化
- AES-256-GCM 密钥存储

### ⚠️ 未实现
| 能力 | 说明 |
|------|------|
| 真实券商对接 | 仅模拟执行，无实盘下单 |
| 多组合管理 | 仅单一组合，无子账户 |
| 衍生品/期权 | 无对冲工具 |
| 实时行情推送 | 批量刷新 (15 分钟间隔)，无 WebSocket |
| 外汇对冲策略 | 多币种持仓无自动对冲 |

---

## 九、技术栈

| 层 | 技术 |
|----|------|
| Frontend | Next.js 14, React 18, TypeScript 5, Tailwind CSS, shadcn/ui, Framer Motion |
| Backend | Node.js, Next.js API Routes |
| Database | PostgreSQL |
| Auth | Supabase (email-based) |
| LLM | DeepSeek (primary), OpenAI (fallback) |
| Charts | Recharts |
| Package Manager | pnpm 10 |
| Testing | Vitest (unit), Playwright (e2e) |
| Notifications | Telegram Bot API, Feishu Webhook |
