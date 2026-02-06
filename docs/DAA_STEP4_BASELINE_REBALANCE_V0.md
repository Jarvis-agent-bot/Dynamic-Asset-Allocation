# DAA — Step4 基准再平衡（Baseline Rebalance）v0

> 本文档对应 UI：`/daa/step/4`（Step 4 — 基准再平衡 v0 占位）。

## 目标（v0）

- **先把 UI 框架搭起来**：从「价格序列输入」→「core 信号输出」的闭环可跑。
- **不做推荐/不做自动下单**：仅展示信号与后续规划方向。
- 为后续 Step3（资金管理）与 Step2（市场事件）接入预留位置。

## 页面行为（与当前 UI 一致）

路径：`/daa/step/4`

页面包含：

1. **Symbol 输入框**
   - 默认：`SPY`
   - 允许修改字符串

2. **Price series (JSON) 文本框**
   - 默认内置一段示例：
     - 数组元素形如：`{ date: "YYYY-MM-DD", close: number }`
   - 输入会被 `JSON.parse` 解析
   - 解析失败时：显示错误 `priceSeries JSON parse failed`

3. **Signals 输出区**
   - 计算逻辑：调用 core 的 `ensembleSignals({ symbol, series })`
   - 调用异常时：显示异常 message
   - 正常时：以 pretty JSON（2 空格缩进）展示输出
   - 提供 **Copy** 按钮：复制当前 signals 的 pretty JSON 到剪贴板（signals 为空时 disabled）

## v0 非目标（明确不做）

- 不接入 Step3 产出的 money plan（constraints / allocations）进行仓位 sizing
- 不把 Step2 的 market events 做成正式的风险提醒组件
- 不输出“建议交易列表”或任何可执行指令

## 下一步（不在本 PR）

- 接入 Step3 money plan，用于 position sizing（把信号映射为目标权重/仓位）
- 把 Step2 market events 作为风险提醒/情绪输入进行展示
- 再平衡输出升级为“建议交易列表”（仍不执行交易）
