# Cognitive Agent OS — 设计与实现

> 面向：想理解 Agent 工作原理、调参、扩展能力的读者
> 范围：工作流、记忆系统、工具注册、日报生成、配置与可调参数
> 系统整体架构见 [ARCHITECTURE.md](./ARCHITECTURE.md)；部署见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

---

## 1. 设计理念

传统投资助手问的是"**该买什么？**" → LLM 给出建议 → 用户决策。

Cognitive Agent 问的是"**我现在最可能错在哪里？**"：

- 系统维护一组持续演化的**投资论点（Thesis）**
- 每个 thesis 绑定 assetKeys、conviction、失效条件、复盘时间
- 每天 Agent 审视所有 thesis，选出最需要调查的几个，收集证据，反思，复盘，生成日报

这个取向来自 Karl Popper 的"证伪主义" —— 好的判断不是"被证实"，而是"**迟迟没被证伪**"。

Agent 的每次 cycle 输出的不是"买入 NVDA"的指令，而是：

- **今日意外** — 什么新事实与现有认知矛盾？
- **认知缺口** — 哪些持仓久未调查？
- **改观条件** — 什么会让我改变看法？
- **论点冲突** — 我是否在自相矛盾？
- **风险暴露** — 如果论点失效，组合损失多大？

架构灵感来自 Nous Research 的 [Hermes Agent](https://github.com/NousResearch/hermes-agent)（工作流形态）+ MemGPT / Mem0（记忆管理）。

---

## 2. 工作流（LangGraph 6 节点）

```
       ┌───────────────┐
       │   observe     │  ← cron / 手动触发
       └───────┬───────┘
               ▼
       ┌───────────────┐
       │  prioritize   │  ← LLM：投委会主席
       └───────┬───────┘
               ▼
       ┌───────────────┐
       │  investigate  │◄──┐  ← LLM：研究分析师（ReAct 循环）
       └───────┬───────┘   │
               ▼           │
       ┌───────────────┐   │
       │    reflect    │───┘  ← LLM：首席风控官（conviction 变化时才调）
       └───────┬───────┘
               ▼
       ┌───────────────┐
       │    review     │  ← LLM：复盘审计师（仅到期 thesis）
       └───────┬───────┘
               ▼
       ┌───────────────┐
       │    surface    │  ← LLM：日报编辑 + 策略顾问 → TG 推送
       └───────┬───────┘
               ▼
             END
```

实现：`src/daa/agent/cognitiveGraph.ts` + `src/daa/agent/nodes/*.ts`。

### 2.1 每个节点的职责

| 节点 | 文件 | LLM | 职责 |
|------|------|-----|------|
| `observe` | [observeNode.ts](../src/daa/agent/nodes/observeNode.ts) | ❌ | 加载持仓 + 市场指标 + 新闻 + **DB 配置** + **记忆衰减** + **归档 stale uncertain thesis** |
| `prioritize` | [prioritizeNode.ts](../src/daa/agent/nodes/prioritizeNode.ts) | ✅ fast tier | 选本次 cycle 最需调查的 thesis（数量由 `maxInvestigationTargets` 配置）+ 可能创建新研究线索 |
| `investigate` | [investigateNode.ts](../src/daa/agent/nodes/investigateNode.ts) | ✅ ReAct 循环 | 并行证据收集（Promise.allSettled）+ 多轮工具调用 + Context Engine 压缩 + 更新 thesis |
| `reflect` | [reflectNode.ts](../src/daa/agent/nodes/reflectNode.ts) | ✅ | conviction 变化时反思 + 生成记忆（含 thesis 关联 + 实体图自动抽取） |
| `review` | [reviewNode.ts](../src/daa/agent/nodes/reviewNode.ts) | ✅ | 到期 thesis 复盘（含真实价格变动 ground truth）+ 评分 |
| `surface` | [surfaceNode.ts](../src/daa/agent/nodes/surfaceNode.ts) | ✅ + 策略顾问 | 生成 DailyBriefing（5 面板）+ 风险建模（纯计算）+ 冲突检测 + 目标权重计划 + TG 推送 |

### 2.2 健壮性机制

- **LLM 重试**：指数退避，最多 3 次，仅网络/429 错误
- **熔断**：连续 LLM 失败达 `circuitBreakerThreshold`（默认 3）自动跳过剩余 LLM 调用，保留确定性输出
- **结构校验**：所有 LLM 输出经 `validateShape()` 校验，失败按字段降级（保留有效部分）
- **Few-shot 示例**：每个 prompt 包含示例 JSON 输出
- **Thesis 去重**：创建前 `findSimilarThesis(assetKeys, title)` 检查
- **Uncertain 清理**：`observe` 节点每次 cycle 归档 `updatedAt > 7 days` 的 uncertain thesis（防止调查型 thesis 堆积）
- **降级兼容**：所有 LLM 失败 `logSwallowed` + 使用默认/上次结果，不中断 cycle

---

## 3. 记忆系统（三层架构）

```
┌───────────────────────────────────────────────────────────────┐
│  Layer 1 — pgvector 语义召回                                  │
│  BGE-M3 1024d embedding × strength                            │
│  Hebbian 增强（+0.1 / 召回）                                  │
│  指数衰减（0.97^days since last_access，23 天半衰期）         │
├───────────────────────────────────────────────────────────────┤
│  Layer 2 — pg_trgm 关键字搜索（episodic）                     │
│  GIN 子串索引，命中精确 ticker / 数字 / 术语                  │
│  降级：pg_trgm 未启用 → ILIKE                                 │
├───────────────────────────────────────────────────────────────┤
│  Layer 3 — 实体图（跨资产因果）                               │
│  6 kind：asset / ticker / thesis_id / regime /                │
│           news_source / strategy_tag                          │
│  自动抽取（中英停用词过滤）+ 链接到 memory / thesis           │
└───────────────────────────────────────────────────────────────┘
```

### 3.1 Layer 1：pgvector 语义

**表**：`daa_agent_memory`（[schema](../src/daa/store/runtimeMigrations.ts#L619)）

| 字段 | 说明 |
|------|------|
| `memory_type` | `pattern` / `lesson` / `preference` / `fact` |
| `content` | 原始文本（≤ 300 char） |
| `embedding` | `vector(1024)`（BGE-M3） |
| `strength` | 默认 1.0，Hebbian 增强，每天衰减 |
| `relevance_tags` | 含关联 thesis UUID + thesis.tags |
| `last_accessed` | 每次召回刷新 |

**生成时机**：
- `reflectNode` — conviction 变化时，记 `lesson`
- `investigateNode` — 证据充分时，记 `fact`（观察型）
- `reviewNode` — 复盘有 lesson 时，记 `lesson`

**召回排序**（[memoryStore.ts](../src/daa/agent/store/memoryStore.ts)）：

```sql
SELECT *, 1 - (embedding <=> $query::vector) AS sim
FROM daa_agent_memory
WHERE embedding IS NOT NULL AND strength >= 0.05
ORDER BY sim * strength DESC            -- 相似度 × 强度
LIMIT $limit
```

**衰减**（`observeNode` 每次 cycle 开头执行）：

```sql
UPDATE daa_agent_memory
SET strength = strength * POWER(0.97, EXTRACT(EPOCH FROM (NOW() - last_accessed)) / 86400)
WHERE last_accessed < NOW() - INTERVAL '1 day' AND strength > 0.01;

DELETE FROM daa_agent_memory
WHERE strength < 0.01 AND last_accessed < NOW() - INTERVAL '30 days';  -- 僵尸清理
```

### 3.2 Layer 2：pg_trgm 关键字

**Why**：向量擅长语义相近（"AI 芯片" ≈ "GPU 算力"），但面对精确 ticker（`NVDA` / `0700.HK` / `$120.5`）命中不稳定。pg_trgm 子串匹配刚好互补。

**实现**：
- 迁移 `20260419_pg_trgm_episodic` 创建 GIN 索引：`daa_agent_memory.content` + `daa_evidence_items.content`
- API：`searchMemoriesByKeyword(keyword, limit)` / `searchEvidenceByKeyword(keyword, limit)`
- 降级：pg_trgm 扩展不可用时自动退回 `ILIKE '%kw%'`

### 3.3 Layer 3：实体图

**表**：

```
daa_agent_entity         (id, kind, value, mention_count, first/last_seen)
daa_memory_entity_link   (memory_id, entity_id, weight)
daa_thesis_entity_link   (thesis_id, entity_id, weight)
```

**6 种 entity kind**：

| Kind | 示例 | 抽取规则 |
|------|------|---------|
| `asset` | `US::NVDA` | 正则 `\b(US\|HK\|CN\|EU\|JP\|GLOBAL\|CRYPTO)::[A-Z0-9.\-_]+` |
| `ticker` | `NVDA`、`0700.HK` | 从 assetKey 拆解 + 粗筛 2-5 大写字母（停用词过滤） |
| `thesis_id` | UUID | 从 `relevanceTags` 或 thread 自身 |
| `regime` | `risk_off` / `risk_on` / `transitional` | 中英关键词匹配（"避险" / "risk_off" 等） |
| `news_source` | `reuters`、`bloomberg`、`wsj`、`finnhub` 等 | 9 种来源关键词匹配 |
| `strategy_tag` | `个股` / `AI基建` | 从 `thesis.tags` 或 `relevanceTags` 非 UUID 部分 |

**停用词过滤**（避免 `PE / ETF / USD / THE` 被误判为 ticker）：详见 [entityExtractor.ts](../src/daa/agent/entities/entityExtractor.ts)。

**自动抽取**：`createMemory` 和 `createResearchThread` 在 store 层自动调用 extractor + link。**无需调用方手动处理。**

**查询 Agent Tool**：`query_entity_history(kind, value, limit)` 返回该实体关联的所有记忆 + 论点 + 协同出现的其他实体。

**回填**：`/api/daa/cron/entity-backfill`（每日 03:40 UTC）幂等补齐存量数据的实体链接。

### 3.4 三路混合召回

`investigateNode` 在 ReAct 循环开始前**并行**三路召回，合并去重：

```
queryEmb = embed(thread.title + thesisText)
tickerKw = assetKeys → 拆出 ticker
threadTags = [thread.id, ...thread.tags]

在 Promise.all 中：
  1. recallMemoryHybrid(vector=queryEmb, keywords=tickerKw, tags=threadTags)
  2. getMemoriesByEntity("asset", each assetKey, 3)  ← 实体图补位

合并去重（向量优先）→ 取前 N+2 条注入 prompt
```

---

## 4. Agent Tools（16 个，V2 动态注册）

借鉴 Hermes Agent 自注册模式：每个工具文件 import 时调用 `registerTool()`。`src/daa/agent/tools/index.ts` 统一 import，`cognitiveGraph.ts` 只需 import 一次。

### 4.1 分类与职责

| Category | 数量 | 用途 | 示例 |
|----------|------|------|------|
| `observe` | 6 | 只读查询 | 技术/估值/新闻/人类信号、市场 regime、持仓集中度 |
| `analyze` | 3 | 计算分析 | 回测 thesis、相关性、再平衡模拟 |
| `meta` | 5 | 自省反思 | 论点历史、历史决策、自评准确率、**关键字搜索**、**实体图查询** |
| `act` | 2 | 写入（需审批） | 建议目标权重、创建 thesis |

### 4.2 工具清单

```
observe/
├─ fetch_technical_signal        SMA / 动量 / 趋势
├─ fetch_valuation_signal        PE / 股息率 / 相对估值
├─ fetch_news_signal             最近新闻 + 情绪
├─ fetch_human_signal            基金经理持仓 + 人类偏好
├─ query_market_regime           当前市场环境
└─ query_portfolio_concentration HHI / 单资产占比

analyze/
├─ backtest_thesis               指定窗口回测论点
├─ compute_correlation           资产对相关性
└─ simulate_rebalance            What-if 调仓模拟

meta/
├─ query_thesis_history          论点证据链 + conviction 轨迹 + 复盘
├─ query_past_decisions          最近 N 次 Agent run 的决策摘要
├─ evaluate_self_accuracy        回测自己历史 thesis 准确率
├─ search_past_reasoning         【pg_trgm】按关键字搜记忆 + 证据
└─ query_entity_history          【实体图】"关于 NVDA 学到过什么"

act/（requiresApproval=true）
├─ suggest_target_weight         建议目标权重调整
└─ create_thesis                 创建新研究线索
```

### 4.3 链式调用

工具结果可通过 `$tool_results.{toolName}.{field}` 变量在后续工具中引用。例如：

```json
{
  "tool": "compute_correlation",
  "params": { "symbol": "$tool_results.fetch_technical_signal.symbol" }
}
```

细节见 [tools/registry.ts](../src/daa/agent/tools/registry.ts) 的 `resolveToolResultVariables()`。

---

## 5. 日报（DailyBriefing）5 面板

Agent cycle 的最终产出，经 `formatBriefingForTelegram` 推送到 TG + 前端 `/daa/dashboard/today` 展示。

### 5.1 今日意外（Surprises）

**问**：今天什么事实最不符合现有认知？

- LLM 从本次 cycle 的 surprises + 工具调用结果中总结
- 每条含：title / description / relatedThesisId / **severityScore 1-10** / suggestedAction
- **过滤规则**：`severityScore < 3` 的占位条目被丢弃（避免"市场与预期一致"的噪声）
- TG 显示最多 3 条

### 5.2 认知缺口（Cognition Gaps）

**问**：哪些高权重持仓久未调查？

- 系统预计算：`(thesis × asset)` 展开，硬门槛 `权重 > 5% 或 停滞天数 ≥ 7`
- LLM 按清单输出单 assetKey 条目
- **去重**：同 assetKey 只保留 `daysSinceLastInvestigation` 最大的一条
- TG 显示最多 3 条

### 5.3 改观条件（Mind Change Conditions）

**问**：什么会让我改变现在的判断？

- 针对当前 high/medium conviction 的 thesis 生成失效条件
- 每条含：thesisTitle / currentConviction / **具体可监测的条件** / monitoringIndicators
- Prompt 要求基于本次调查的**具体数据**，不接受泛泛而谈
- 避免逐字重复上次日报（对比 `previousBriefing`）

### 5.4 论点冲突（Thesis Conflicts）

**问**：我是否在自相矛盾？

- **纯计算**，无 LLM：遍历所有 thesis 对，找 assetKeys 交集 + conviction 方向对立
- **仅保留** `conviction != uncertain` 的论点，避免调查型临时假设造成假冲突
- 方向判定：`aBullish = (high || medium)`，两边 bullish 不同方向才算冲突
- Severity：overlapping ≥ 2 资产 → high；含 high conviction → high；否则 medium

### 5.5 风险暴露（Thesis Failure Impact）

**问**：如果论点错了，组合损失多大？

- **纯计算**，无 LLM：每个 high/medium thesis 的失效影响
- 公式：`estimatedLossPct = 总暴露权重 × lossMultiplier`
  - high conviction → `lossMultiplier = 0.5`
  - medium conviction → `lossMultiplier = 0.3`
- Risk level：`> 15%` critical / `> 10%` high / `> 5%` medium / else low
- **显示时明确标注**"假设情景·暴露×30%/50% 经验系数"，避免被误读为 VaR

### 5.6 策略顾问（目标权重计划，Autopilot 默认启用）

Autopilot 模式不再自动修改系统配置或风险护栏。Agent 的唯一主动调仓输出是本轮 `targetAllocationPlan`，系统只把它转换成本次周期的临时目标权重覆盖。

LLM 基于持仓 + 论点 + 意外 + 缺口输出：

| 建议类型 | 安全约束 |
|---------|---------|
| 目标权重计划 | 仅接受已知 `assetKey`，置信度需达到执行阈值 |
| 单仓目标权重 | 按 `strategy.constraints.maxPositionPct` 截断 |
| 周期生成 | 0 条可执行提案时跳过创建 cycle |
| 自动执行 | 统一经过 `AutomationAuthority`、`autoExecuteMaxSinglePct`、执行前风控和本地执行网关 |

目标权重计划只作用于本次 cycle，不写入 `systemConfig.strategy.targetWeights`，避免把一次性事件判断永久固化为配置。

Autopilot 自动执行不需要用户逐笔确认；它依赖显式配置和权限矩阵：

- `brain.mode=autopilot`
- `rebalanceStrategy.autoGenerateEnabled=true`
- `rebalanceStrategy.autoExecuteEnabled=true`
- 本地执行网关为 `local`
- cycle 与 proposal 存在
- 风控与单笔 NAV 上限通过

这条链路只覆盖本地模拟执行，不代表真实券商下单权限。

---

## 6. 配置与可调参数

所有 Agent 参数通过 `systemConfig.cognitiveAgent`（Settings UI 可改），落库 `daa_system_config_v2`。

| 参数 | 默认值 | 含义 |
|------|--------|------|
| `enabled` | `true` | 启用 Cognitive Agent |
| `maxInvestigationTargets` | `3` | 每次 cycle 最多调查几个 thesis |
| `reviewIntervalDays` | `14` | 新 thesis 默认复盘间隔 |
| `memoryRecallLimit` | `5` | 每次调查召回记忆条数 |
| `memoryDecayRate` | `0.97` | 每日衰减率 |
| `circuitBreakerThreshold` | `3` | 连续 LLM 失败次数触发熔断 |
| `schedule` | `"2x_daily"` | `2x_daily` / `daily` / `every_6h` / `manual_only` |

运行时间窗口不再作为独立配置持久化，而是由 `schedule` 统一派生，避免出现“频率为 daily 但仍保留两个窗口”的冲突。

---

## 7. API 端点

| 端点 | 用途 |
|------|------|
| `POST /api/daa/agent/run` | 手动触发一次 Agent cycle |
| `POST /api/daa/agent/bootstrap` | 扫描持仓初始化初始 theses |
| `GET /api/daa/agent/theses` | 活跃论点 + 最新 briefing |
| `GET /api/daa/agent/thesis/[id]` | 论点详情（证据链 + 复盘历史） |
| `GET /api/daa/agent/memories` | 分页列出记忆（支持 type 过滤） |
| `DELETE /api/daa/agent/memories?id=xxx` | 删除单条记忆 |
| `POST /api/daa/cron/cognitive-agent` | 自门控 cron（每小时触发，按 schedule 派生窗口过滤） |
| `POST /api/daa/cron/entity-backfill` | 实体图幂等回填（每日 03:40 UTC） |

---

## 8. UI 入口

- `/daa/dashboard/today` — Agent 日报主视图（5 面板）
- `/daa/dashboard/today/thesis/[id]` — 论点详情（证据时间线 + 复盘历史）
- `/daa/dashboard/today/memories` — 记忆浏览器（分页 + 类型过滤 + 删除）
- `/daa/dashboard/settings` — 认知 Agent 配置面板

前端组件：`app/daa/dashboard/today/_components/AgentBriefingView.tsx`。

---

## 9. 调试 Tips

- 手动触发一次 cycle：`curl -X POST -H "x-daa-cron-token: $TOKEN" http://localhost:3000/api/daa/cron/cognitive-agent?force=1`
- 查看最近 10 次 run：`SELECT id, created_at, total_tokens, duration_ms FROM daa_agent_runs ORDER BY created_at DESC LIMIT 10;`
- 看某次 run 的完整 briefing：`SELECT briefing FROM daa_agent_runs WHERE id = $id;`
- 实体图统计：`SELECT kind, COUNT(*) FROM daa_agent_entity GROUP BY kind;`
- 记忆衰减 dry-run：调 `applyMemoryDecay(0.97)` 前先 `SELECT id, strength, last_accessed FROM daa_agent_memory`

---

## 10. 核心文件索引

| 用途 | 路径 |
|------|------|
| 工作流总装 | [`src/daa/agent/cognitiveGraph.ts`](../src/daa/agent/cognitiveGraph.ts) |
| 状态类型 | [`src/daa/agent/cognitiveState.ts`](../src/daa/agent/cognitiveState.ts) |
| Prompt 模板 | [`src/daa/agent/cognitivePrompts.ts`](../src/daa/agent/cognitivePrompts.ts) |
| 节点实现 | [`src/daa/agent/nodes/*.ts`](../src/daa/agent/nodes/) |
| Thesis Store | [`src/daa/agent/store/thesisStore.ts`](../src/daa/agent/store/thesisStore.ts) |
| Memory Store | [`src/daa/agent/store/memoryStore.ts`](../src/daa/agent/store/memoryStore.ts) |
| Entity Extractor | [`src/daa/agent/entities/entityExtractor.ts`](../src/daa/agent/entities/entityExtractor.ts) |
| Entity Store | [`src/daa/agent/entities/entityStore.ts`](../src/daa/agent/entities/entityStore.ts) |
| Entity Backfill | [`src/daa/agent/entities/entityBackfill.ts`](../src/daa/agent/entities/entityBackfill.ts) |
| Embedding 抽象 | [`src/daa/agent/embedding.ts`](../src/daa/agent/embedding.ts) |
| Tool 注册表 | [`src/daa/agent/tools/registry.ts`](../src/daa/agent/tools/registry.ts) |
| Tool 定义索引 | [`src/daa/agent/tools/index.ts`](../src/daa/agent/tools/index.ts) |
