# DAA Step3 金额管理页 v0（Account / Constraints / Allocations JSON / Copy Plan JSON）

> v0 目标：把 **输入结构 + 本地校验 + Copy JSON** 做出来（先 mock 数据），为后续 Step4 推荐算法提供稳定输入。

## 页面路径

- Route: `/daa/step/3`
- 标题：Step 3 — 金额管理

## 核心交互（v0）

页面分 3 块：**Account / Constraints / Allocations(JSON)**，并在右侧生成 **Plan JSON**，支持一键 Copy。

### 1) Account

字段：

- `baseCcy`（Base currency）：基础币种（字符串，v0 默认 `"USD"`）
- `totalEquity`（Total equity）：账户总权益（number）
- `cash`（Cash）：现金（number）
- `investable`（Investable）：可投资金额（number）

v0 校验（由 `validateMoneyPlan(plan)` 执行）：

- `baseCcy` 必填
- `totalEquity >= 0`
- `cash >= 0`
- `investable >= 0`

> 注：v0 不强制 `cash + investable == totalEquity`（如需约束后续再加）。

### 2) Constraints

字段：

- `maxPositionPct`（Max position % (0..1)）：单一标的最大持仓比例（0..1 小数）
- `maxIn`（Max in (absolute)）：单次最大流入（绝对金额）
- `maxOut`（Max out (absolute)）：单次最大流出（绝对金额）

v0 校验：

- `0 <= maxPositionPct <= 1`
- `maxIn >= 0`
- `maxOut >= 0`

### 3) Allocations (JSON)

- 通过 textarea 输入一个 **JSON 数组**。
- 每个元素表示一个“分配桶/资产/策略桶”。

推荐结构：

- `id`：字符串标识
- `label`：展示名
- `targetPct`：目标权重（0..1 小数）
- `tags`：对象（v0 支持 `riskPreference` / `riskScore` 两个 tag 字段）

v0 校验（关键点）：

- `allocations` 必须是数组
- 每行 `targetPct` 在 `[0, 1]`
- `sum(targetPct) <= 1`：允许 **小于 1**（剩余部分视为保留现金）；**超过 1 报错**

页面提示文案：

- `v0：允许 sum(targetPct) ≤ 1（保留现金）；超过 1 会报错。Tag 支持 riskPreference/riskScore。`

### 4) Plan JSON + Copy

页面会根据当前输入实时生成：

- **Validation**：展示校验结果（OK / issues 列表）
- **Plan JSON**：展示最终 plan（并提供 `Copy` 按钮复制到剪贴板）

## 数据结构（v0）

最终 Plan JSON 形状：

```json
{
  "account": {
    "baseCcy": "USD",
    "totalEquity": 100000,
    "cash": 20000,
    "investable": 80000
  },
  "constraints": {
    "maxPositionPct": 0.35,
    "maxIn": 20000,
    "maxOut": 20000
  },
  "allocations": [
    {
      "id": "core_equity",
      "label": "Core Equity",
      "targetPct": 0.6,
      "tags": { "riskPreference": "mid", "riskScore": "mid" }
    },
    {
      "id": "defensive",
      "label": "Defensive",
      "targetPct": 0.25,
      "tags": { "riskPreference": "low", "riskScore": "low" }
    }
  ]
}
```

## 非目标（v0 不做）

- 不接入后端持久化
- 不计算真实持仓/交易可执行性
- 不做更复杂的资金约束（例如按 tag 的资金上限、动态风险预算等）
