---
name: 工作台页面 Review 问题清单
description: 2026-03-27~28 全面 review 发现的信息架构、语义、数据问题，待后续修复
type: project
---

## 一、决策层问题

### 1.1 信号席位语义混乱（🔴 高）
4 个信号席位名称与实际内容不匹配：
- 技术面：实际是持仓浮盈/浮亏比例，不是技术分析
- 估值：实际是目标权重偏离，不是 PE/股息率
- 新闻/宏观：只用聚合 regime，不区分 5 个 scope
- 持仓行为：看 HHI + 采纳率，不是资金流向

**Why:** Phase 1 用 bootstrap 数据硬凑，未接入 technicalSignal.ts / valuationSignal.ts / newsSignal.ts。
**相关文件:** `src/daa/modules/today/todayDecisionContext.ts`, `src/daa/signals/`

### 1.2 "看空"不说看空什么（🔴 高）
每个席位只返回一个 stance，不区分市场/资产/scope。market context 有 5 个 scope 但只用聚合值。

### 1.3 置信度含义不统一（🟡 中）
每个席位的 confidence 计算方式完全不同，但 UI 上展示方式一样。

### 1.4 行动卡片推理链断裂（🟡 中）
LLM 收到组合级信号 → 输出资产级建议，推理过程不透明。

## 二、操作层问题

### 2.1 漂移阈值不一致（🔴 高）
通知区硬编码 5%（`driftThreshold ?? 0.05`），风控面板用 `rebalanceStrategy.drift.thresholdPct`，两处可能矛盾。
**涉及:** WorkbenchNotificationBar, PortfolioRiskPanel

### 2.2 三层 Tab 嵌套（🔴 高）
主页 Tab（组合|调仓）→ 子 Tab（持仓|观察列表）→ 表内分组（股票|ETF|债券|加密），认知负荷过重。
**涉及:** TodayPageClient, WorkbenchActiveTabPanel, AssetUniverseTable

### 2.3 再平衡状态机隐式（🔴 高）
无 cycle → 已生成 → 审阅中 → 执行中 → 已完成/已取消，转换之间没有引导提示。按钮灰掉时无原因说明。
**涉及:** WorkbenchRebalanceSection

### 2.4 调仓环境分析无 cycle 时静默消失（🔴 高）
RebalanceAiInsight 在 currentCycle 为 null 时返回 null，用户看到空白无解释。
**涉及:** WorkbenchMarketIntel → RebalanceAiInsight

### 2.5 展开态混入运维信息（🟡 中）
PortfolioStatus 展开态的账户来源/市场数据健康/通知状态是运维级信息，不是投资决策信息。

### 2.6 漂移数据重复展示（🟡 中）
漂移在通知区 pills 和风控面板重复，且阈值可能不一致。

### 2.7 指标百分位无上下文（🟡 中）
"近一年位置 72%"不说明高低意味着什么，用户无法解读。

### 2.8 资产表信息密度过高（🟡 中）
每行 8+ 列，普通投资者无法快速扫描。

### 2.9 "系统信号"命名误导（🟡 中）
实际是业务告警（漂移/HF/风控），不是系统级信号。

### 2.10 回撤数据无时间范围标注（🟡 中）
最大回撤基于有限快照，短期组合数据无意义但没标注。

### 2.11 通知 pills 不可点击（🟡 中）
看到告警后用户不知道去哪处理。

## 三、Codex 架构建议（2026-03-28）

Codex 读完全部代码后的架构方向：

### 页面重组为 5 个模块（按用户心智而非系统层）

```
1. Today Brief      — 今日结论（结论卡 + 2~3 个决策驱动因素 + 1 个约束项）
2. Action Workflow   — 调仓工作流（显式 stepper: Idle → Need Review → Risk Blocked → Ready → Executed）
3. Risk Gate         — 风险约束（Before → After 对比，挂在提案旁边）
4. Portfolio Snapshot— 组合概览（总权益 + 涨跌 + Top 持仓 + 图表）
5. Holdings Workspace— 资产工作台（持仓 + 观察列表）
```

Market Context 和 Diagnostics 降级为可展开附录或右侧抽屉。

### 关键设计原则
- 信号席位如果没有真实技术/估值数据，不要硬叫 Technical/Valuation
- 调仓 workflow 不该埋在 tab 里，应该在结论卡下面成为第一执行区
- 风险用 Before→After 对比而非独立面板
- 无动作日只显示 3~4 个模块，有调仓日提升 workflow + risk gate
- 无周期时不能空白，要明确写出"没有活跃周期，因为 XXX"

### 漂移阈值不一致的新发现
通知条 `0.05`(5%)、风控面板 `3`(3%)、上层策略 `thresholdPct * 100` — 三处不同数值体系，不只是重复展示，而是数值冲突。

## 四、已修复

- 漂移状态数据源不一致 → fallback 到实时 assetRows（2026-03-27）
- 置信度 <25% 自动降级 neutral（2026-03-27）
- 现金 Tab 重复渲染 → 合并到 PortfolioStatus（2026-03-27）
- 市场数据 pills 具体数字重复 → 简化为告警文案（2026-03-27）
- AI 分析标注区分（调仓环境 vs 每日决策）（2026-03-27）
