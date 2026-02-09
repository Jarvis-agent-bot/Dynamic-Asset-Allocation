# DAA — Step5 信号决策摘要（Signal Decision Summary）v0

> 本文档对应 UI：`/daa/step/5`（Step 5 — 信号决策摘要 v0）。

## 目标（v0）

- **把 Step4 的 signals 输出变成“今日摘要”**：只提取最后一条 signal，展示 date/action/targetWeight/confidence/reasons。
- **不做推荐/不做自动下单**：仅展示 core 产出的信号结果，作为后续资金管理与交易清单的输入。

## 页面行为（与当前 UI 一致）

路径：`/daa/step/5`

页面包含：

1. **Signals (JSON) 文本框**
   - 期望输入：`Signal[]`（数组）
   - 单项字段：`{ date, action, targetWeight, confidence, reasons }`
   - 解析失败时：显示错误 `signals JSON parse failed`

2. **Validation**
   - signals 必须是 array
   - array 必须至少包含 1 个可用条目（至少有 date + action）
   - latest.action 必须是 `BUY | SELL | HOLD`
   - latest.targetWeight/latest.confidence 必须是 finite number

3. **Latest signal summary**
   - 展示最后一条 signal 的摘要 JSON（pretty JSON，2 空格缩进）
   - 提供 **Copy** 按钮：复制摘要 JSON（当 summary 为空时 disabled）

## v0 非目标（明确不做）

- 不把 signals 映射为“建议交易列表”（trade list）
- 不计算 position sizing（留给 Step3 money plan + Step6+）
- 不接入外部行情、订单、券商接口

## 下一步（不在本 PR）

- 将 Step3 money plan 接入 Step5：把信号摘要结合资金约束，输出目标仓位区间（仍不输出可执行指令）
- 增加“信号历史”视图（最近 N 条 + 过滤）
