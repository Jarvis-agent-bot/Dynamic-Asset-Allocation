# DAA 基础工程（Foundation）

目标：把「算法层」与「展示层」彻底解耦，形成可测试、可组合、可扩展的核心模块（为回测→市场信息→资金管理→推荐→AI→人因→Tag 铺路）。

## 模块边界（Module Boundaries）

- `app/`：Next.js UI（页面/组件/交互）。
  - 约束：不直接实现策略/评分/回测逻辑；只做展示与调用。
- `src/core/`：DAA 算法层（UI 无关、可测试）。
  - `domain.js`：领域数据模型（JSdoc typedef，提供统一词汇表）。
  - `backtest.js`：回测引擎（最小闭环 v0）。
  - `strategies.js`：策略定义（纯函数），支持组合/ensemble。
  - `signals.js`：fixed-weight ensemble → BUY/SELL/HOLD 信号输出（v0）。
  - `metrics.js`：指标计算（收益/回撤/夏普/胜率等）。
  - `models.js` / `config.js`：轻量配置与通用结构（避免 UI 依赖）。

> 未来扩展（未实现）：
> - `src/market/`：市场信息采集与结构化（Twitter/yfinance/雪球 → MarketEvent）
> - `src/pm/`：资金管理（仓位约束、max in/out、tag 规则）
> - `src/reco/`：基准推荐（回测加权 + 约束 + 人因模型）

## 核心数据模型（Domain Model）

以 `src/core/domain.js` 为准（单一事实来源）。当前最小集合：

- `Asset`：资产（`id/symbol/assetClass/currency`）
- `PriceBar`：价格序列点（`date/close`，日频 v0）
- `Strategy`：策略接口（`weights(series) -> number[]`）
- `BacktestResult`：回测结果（`equity/dailyReturns/metrics`）
- `MarketEvent`：市场事件（`source/ts/title/summary/sentiment/confidence`）

## DONE（可观察的完成标准）

- `README.md` 链接到 `docs/DAA_FOUNDATION.md`。
- `src/core/` 至少覆盖：策略（`strategies.js`）、回测（`backtest.js`）、指标（`metrics.js`）、信号（`signals.js`）。
- 信号 v0 规格见：`docs/DAA_SIGNAL_SPEC_V0.md`。
