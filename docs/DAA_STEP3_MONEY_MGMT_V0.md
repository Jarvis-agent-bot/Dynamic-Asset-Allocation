# DAA Step3 金额管理页 v0（资金池 / 比例分配 / Tag / max in-out / 最大持仓）

> v0 目标：先 **mock 数据 + 本地校验 + copy JSON**，为后续接入真实配置/后端做铺垫。

## 页面路径

- Route: `/daa/step/3`
- 名称：金额管理（比例分配/Tag/max in-out）

## 核心交互（v0）

### 1) 资金池（Pool）
- 用户输入：本次用于 DAA 的资金池金额（单位：CNY）。
- 展示：
  - Pool = 输入值
  - 可用资金（v0 可直接等于 Pool；后续可扣除冻结/已用）
- 校验：
  - 必填
  - `> 0`
  - 允许最多 2 位小数

### 2) 比例分配（Allocation）
- 用户按「资产/标的（或策略桶）」配置权重。
- v0：支持一个可编辑表格：
  - `key`（字符串，标识符）
  - `label`（展示名称）
  - `weightPct`（0~100）
  - `tag`（可选）
- 校验：
  - 每行 `weightPct` 在 `[0,100]`
  - 所有行 `weightPct` 之和必须等于 `100`（允许误差：`±0.01`）

### 3) Tag（分组/过滤）
- v0：Tag 仅作为「分组字段」存在：
  - 允许用户为每个 allocation 行选择/输入 tag
  - 允许按 tag 筛选列表（可选）

### 4) max in / max out（单次最大流入/流出）
- 定义：每次调仓允许的最大资金变动上限（金额）。
- v0：仅本地校验 + 生成 JSON，不做真实交易限制。
- 字段：
  - `maxInCny`：单次最大加仓金额
  - `maxOutCny`：单次最大减仓金额
- 校验：
  - `>= 0`
  - 允许最多 2 位小数

### 5) 最大持仓（Max Position）
- 定义：单一标的允许占用的最大资金或最大比例。
- v0：支持两种方式（二选一）：
  - `maxPositionPct`：最大持仓比例（0~100）
  - `maxPositionCny`：最大持仓金额（>=0）
- 校验：
  - 至少填写一种
  - 若填写比例：`0 < pct <= 100`
  - 若填写金额：`>= 0`

### 6) Copy JSON
- 页面提供一个「Copy JSON」按钮，将当前配置序列化为 JSON 并复制到剪贴板。
- v0：
  - 复制成功提示
  - JSON 结构与下方 schema 一致

## 数据结构（v0）

### 顶层对象

```json
{
  "version": "step3-money-mgmt-v0",
  "poolCny": 100000,
  "allocations": [
    {
      "key": "core",
      "label": "核心",
      "weightPct": 60,
      "tag": "risk:low"
    },
    {
      "key": "satellite",
      "label": "卫星",
      "weightPct": 40,
      "tag": "risk:mid"
    }
  ],
  "limits": {
    "maxInCny": 20000,
    "maxOutCny": 20000,
    "maxPosition": {
      "mode": "pct",
      "maxPositionPct": 25
    }
  }
}
```

### 字段说明

- `version`：固定字符串，用于前后兼容。
- `poolCny`：资金池金额（CNY）。
- `allocations[]`：分配列表。
  - `key`：标识符（建议小写 + `-`）。
  - `label`：展示名。
  - `weightPct`：权重百分比。
  - `tag`：可选分组/标签。
- `limits`：限制参数集合。
  - `maxInCny`：单次最大流入（加仓）金额。
  - `maxOutCny`：单次最大流出（减仓）金额。
  - `maxPosition`：最大持仓配置。
    - `mode`：`pct | cny`
    - `maxPositionPct`：当 `mode=pct` 时生效。
    - `maxPositionCny`：当 `mode=cny` 时生效。

## 本地校验规则（可直接映射到前端）

1. `poolCny` 必填且 `> 0`
2. `allocations.length >= 1`
3. 每行 `weightPct` 在 `[0,100]`
4. `sum(weightPct) == 100`（误差 `±0.01`）
5. `maxInCny >= 0`，`maxOutCny >= 0`
6. `maxPosition.mode` 必填，且：
   - `pct` → `0 < maxPositionPct <= 100`
   - `cny` → `maxPositionCny >= 0`

## 非目标（v0 不做）

- 不接入后端持久化
- 不计算真实持仓/交易可执行性
- 不做复杂策略约束（例如按 tag 的资金上限、动态风险预算等）
