# DAA Step 5 — 信号决策摘要 v0

> 本文档对应 UI：`/daa/step/5`（Step 5 — 信号决策摘要）。
>
> v0 目标：把 Step4 的 `signals: Signal[]`（JSON 数组）粘贴进来，提取最后一条作为“今日动作摘要”，仅做结构化展示与校验，不做任何推荐/执行。

## 页面路径

- Route: `/daa/step/5`
- 名称：信号决策摘要

## UI 行为（v0，与当前 UI 一致）

### 1) Signals (JSON)

- 一个 textarea：粘贴/编辑 `signals` JSON。
- 默认内置示例：两条 signal（HOLD → BUY）。
- 解析规则：
  - 使用 `JSON.parse` 解析。
  - 解析失败时显示错误：`signals JSON parse failed`。

> 期望字段（来自 core 输出）：`{ date, action, targetWeight, confidence, reasons }`。

### 2) Normalize（宽松容错）

页面会将解析后的数组做一次 normalize（容错字段缺失/类型不一致）：

- 仅接受数组；非数组视为无效。
- 对每一项：
  - `date` → `String(date)`
  - `action` → `String(action)`
  - `targetWeight` → `Number(targetWeight)`
  - `confidence` → `Number(confidence)`
  - `reasons` → string[]（非数组则置空）
- 最后过滤掉 `date` 或 `action` 为空的项。

### 3) Validation

Validation 面板会给出 `OK` / `issue(s)`：

- JSON parse 失败 → 1 issue
- parsed 不是数组 → `signals must be a JSON array`
- normalize 后数组为空 → `signals array is empty or has no valid items`
- 最新一条（last item）额外校验：
  - `latest.action` 必须是 `BUY | SELL | HOLD`
  - `latest.targetWeight` 必须是 finite number
  - `latest.confidence` 必须是 finite number

### 4) Latest signal summary + Copy

- 从 normalize 后的 `signals` 取最后一条作为 `latest`。
- summary 结构：

```json
{
  "date": "YYYY-MM-DD",
  "action": "BUY|SELL|HOLD",
  "confidence": 0.0,
  "targetWeight": 0.0,
  "reasons": ["..."]
}
```

- 点击 `Copy`：复制 pretty JSON（2 空格缩进）到剪贴板。
- 当 summary 不存在（无有效 signals）时按钮 disabled。

## 非目标（v0 不做）

- 不对 signals 做任何交易建议/推荐
- 不执行交易、不下单
- 不输出“建议交易列表”（后续 Step/版本再做）
- 不接真实数据源（signals 由 Step4 或外部复制粘贴提供）
