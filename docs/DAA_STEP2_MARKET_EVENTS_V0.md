# DAA Step2 — 市场信息（v0）

目标：以**产品页面**为中心，先把市场信息的 UI 与 contract 骨架跑通。

## 顺序定位
- Step1：回测算法组合
- **Step2：市场信息（本文件）**
  - Twitter：分析师主观判断（消息组/list）
  - yfinance + 雪球：客观新闻/事件

## v0 范围（本 PR）
- `MarketEvent` schema（最小可用 + 可扩展）
- mock 数据集（两类来源）
- `/daa/step/2` 页面：
  - 事件列表
  - 来源过滤（Twitter / News）
  - 时间排序（最近优先）
  - 事件详情抽屉 / JSON 可复制

## 非目标
- 不做推荐/AI
- 不接入真实 Twitter/yfinance/雪球 API（后续 PR 再做 ingestion）

## 未来扩展点（占位）
- Twitter list ingest → 标准化为 `MarketEvent`
- yfinance news ingest → 标准化为 `MarketEvent`
- 雪球 news ingest → 标准化为 `MarketEvent`
