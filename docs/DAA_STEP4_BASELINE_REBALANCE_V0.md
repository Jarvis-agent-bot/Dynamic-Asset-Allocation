# DAA Step4 基准再平衡（signals 输出）v0

> 本文档对应 UI：`/daa/step/4`（Step 4 — 基准再平衡 / signals 输出）。
>
> v0 目标：从 **价格序列输入** 跑通 core 的 **signals 输出**（不接真实数据源、不做交易执行），为 Step5 “信号决策摘要”提供可复制 JSON。

## 页面路径

- Route: `/daa/step/4`
- 名称：基准再平衡（signals 输出）

## UI 行为（v0，与当前 UI 一致）

### 1) Strategies（固定，v0）

- v0 固定使用两种策略（与 core 配置保持一致）：
  - `buy_and_hold`
  - `sma_5_20`（由 `smaCrossover({ fast: 5, slow: 20 })` 生成）

> 说明：v0 不做策略选择器，避免 UI 复杂化；先保证 contract + 输出 JSON 稳定。

### 2) Price series (JSON)

- 一个 textarea，输入 `PriceBar[]`。
- 每项最小字段：
  - `date`: `YYYY-MM-DD`
  - `close`: number
- 提供 `Reset mock` 按钮：重置为内置 mock series。

示例：

```json
[
  { "date": "2026-02-01", "close": 100 },
  { "date": "2026-02-02", "close": 100.1 }
]
```

### 3) weightsConfig (JSON)

- 一个 textarea，输入 `Record<string, number>`。
- key 必须是策略 id；value 为非负数。
- 不要求 sum=1（core 会 normalize）。

默认：

```json
{
  "buy_and_hold": 0.4,
  "sma_5_20": 0.6
}
```

### 4) thresholds (JSON)

- 一个 textarea，输入 `SignalThresholds`。

默认：

```json
{
  "buyAbove": 0.6,
  "sellBelow": 0.4,
  "minChange": 0.15
}
```

### 5) Validation

- 展示一个状态：`OK` 或 `ERROR`。
- 若 ERROR：显示错误文本（包括 JSON parse error 或 core 抛出的 contract error）。
- 同区展示 `Last signal (today)`（signals 数组最后一项），用于快速肉眼确认。

### 6) Signals JSON + Copy

- 页面展示 `signals: Signal[]` 的完整 JSON。
- 点击 `Copy` 将 signals JSON 复制到剪贴板（当 ERROR 时 disabled）。

## 数据结构（v0）

### PriceBar

```ts
type PriceBar = {
  date: string; // YYYY-MM-DD
  close: number;
};
```

### Signal

> 由 core 输出（`ensembleSignals(...)`）。字段示例：

```json
{
  "date": "2026-03-01",
  "action": "HOLD",
  "targetWeight": 0.55,
  "confidence": 0.42,
  "reasons": ["ensemble target=55% (Δ=0.0%)", "rule: ..."]
}
```

## 非目标（v0 不做）

- 不接 yfinance/雪球 等真实数据源
- 不做交易执行/下单
- 不做策略/参数的完整配置面板（先固定两策略）
- 不输出“建议交易列表”（Step5/后续再做）
