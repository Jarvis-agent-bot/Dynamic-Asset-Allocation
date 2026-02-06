# DAA Step3 金额管理页 v0（资金池 / 比例分配 / Tag / max in-out / 最大持仓）

> v0 目标：先把 **mock 数据 + 本地校验 + Copy JSON** 跑通（不接后端、不做推荐），为后续 Step4 的仓位/推荐逻辑提供稳定输入。

## 页面路径

- Route: `/daa/step/3`
- 名称：金额管理（资金池 / 分配 / 约束 / Tag）

## UI 行为（v0）

### 1) Account（资金池/账户概览）
- 字段：
  - `baseCcy`：基准币种（字符串，如 `USD`/`CNY`）
  - `totalEquity`：总资产（> 0）
  - `cash`：现金（>= 0，且 `cash <= totalEquity`）
  - `investable`：可投资额度（>= 0，且 `investable <= totalEquity`）

### 2) Constraints（约束）
- `maxPositionPct`：单一标的最大持仓比例（0..1，且 `>0`）
- `maxIn`：单次最大流入金额（>= 0）
- `maxOut`：单次最大流出金额（>= 0）

### 3) Allocations（比例分配 + Tag）
- v0：用一个 JSON textarea 输入 allocations（后续再换成表格/表单）。
- `allocations[]` 每项：
  - `id`：标识符（必填）
  - `label`：展示名（必填）
  - `targetPct`：目标比例（0..1）
  - `tags`（可选）：
    - `riskPreference`: `high | mid | low`
    - `riskScore`: `high | mid | low`

### 4) Validation（本地校验）
- 页面展示校验 issues 列表（path + message）。
- v0 的分配规则：
  - 允许 `sum(targetPct) <= 1`（剩余比例视为保留现金）
  - 若 `sum(targetPct) > 1` 则报错

### 5) Plan JSON 预览 + Copy
- 页面展示完整 plan JSON。
- 点击 Copy 将 plan JSON 复制到剪贴板。

## 数据结构（v0 schema）

### 顶层对象：MoneyPlan

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

## 本地校验规则（v0）

1. `account.baseCcy` 必填
2. `account.totalEquity` 必填且 `> 0`
3. `account.cash >= 0` 且 `cash <= totalEquity`
4. `account.investable >= 0` 且 `investable <= totalEquity`
5. `constraints.maxPositionPct` 在 `(0, 1]`
6. `constraints.maxIn >= 0`，`constraints.maxOut >= 0`
7. `allocations[]`：每项 `id/label` 必填，`targetPct` 在 `[0,1]`
8. `sum(allocations[].targetPct) <= 1`（允许保留现金；若 > 1 报错）

## 非目标（v0 不做）

- 不接入后端持久化
- 不做买卖推荐/AI
- 不计算真实持仓/交易可执行性
- 不做复杂约束联动（例如按 tag 的资金上限、动态风险预算等）
