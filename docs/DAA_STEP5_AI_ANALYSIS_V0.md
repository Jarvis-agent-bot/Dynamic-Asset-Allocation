# DAA — Step5 AI 分析 v0（Explain-only, no-trade）

> UI route: `/daa/step/5` tab "AI Analysis".

目标：在不引入真实 LLM / 不直接下单的前提下，把 Step4/Step5 的基准推荐结果，结合 Step2 的市场信息（`MarketEvent[]`）做一层“解释 + 备选方案”输出。

## 输入

- Baseline recommendation：通过 `POST /api/daa/rebalance/simulate` 得到（复用 Step4/Step5 已有 simulate UI）。
- Market context：复用 Step2 写入 localStorage 的 `daa.wizard.marketEvents`（即 `LS_MARKET_EVENTS`）。

## 输出（v0 contract）

UI 以结构化 JSON 输出：

- `summary`：一句话概括（是否有 orders / warnings / 是否有 market events）
- `baselineNotes[]`：对 baseline recommendation 的可读解释（orders、warnings、是否超过 maxPositionPct）
- `marketNotes[]`：把 market events 里与当前 symbols 匹配的标题摘出来，作为解释上下文
- `alternatives[]`：不直接给交易指令，只给“约束参数调整建议”（例如放宽 maxPositionPct / maxIn/maxOut）与 rationale，用户可复制回 simulator 再跑
- `disclaimers[]`：明确 no-trade / 非投资建议

## 实现位置

- Rule-based analysis：`src/core/aiAnalysis.ts`
- UI：`app/daa/step/_pages/Step5AiAnalysisPage.tsx`

v0 的重点是 state-driven：用户在页面里能看到输入、复制输出，并能把 alternative constraints 复制回 simulator 做对比。后续如接入真实 LLM，可保持输出结构不变。
