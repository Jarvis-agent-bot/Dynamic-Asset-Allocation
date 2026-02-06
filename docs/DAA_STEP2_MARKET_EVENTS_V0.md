# DAA Step2 — 市场信息（v0）

目标：以**产品页面**为中心，先把市场信息的 UI 与 contract 骨架跑通。

## 顺序定位
- Step1：回测算法组合
- **Step2：市场信息（本文件）**
  - Twitter：分析师主观判断（消息组/list）
  - yfinance + 雪球：客观新闻/事件

## v0 范围（本 PR）
- `MarketEvent` schema（最小可用 + 可扩展，后续 ingestion 直接落到同一结构）
- mock 数据集（两类来源：twitter/news）
- `/daa/step/2` 页面：
  - 事件列表（默认按时间倒序）
  - 来源过滤（Twitter / News）
  - symbol 过滤（单输入框，大小写不敏感）
  - 事件详情（右侧 Detail 面板）
  - JSON 展示 + 一键复制（Copy JSON）

## 非目标
- 不做推荐/AI
- 不接入真实 Twitter/yfinance/雪球 API（后续 PR 再做 ingestion）

## Schema（v0）
代码位置：`src/core/marketEvents.ts`

```ts
export type MarketEventSource = "twitter" | "news";

export type MarketEvent = {
  id: string;
  source: MarketEventSource;
  ts: string; // ISO string
  title: string;
  summary?: string;
  symbols?: string[];
  url?: string;
  author?: string;
  tags?: string[];
  raw?: unknown; // keep raw payload when ingestion is added
};
```

### Query/过滤（页面 v0 使用）
同文件内：`filterMarketEvents(events, q)`

```ts
export type MarketEventQuery = {
  sources?: MarketEventSource[];
  symbols?: string[];
  sinceTs?: string;
  untilTs?: string;
  limit?: number;
};
```

行为约定（当前实现）：
- `sources`：允许列表（不传或空数组 = 不过滤）
- `symbols`：大小写不敏感；事件的 `symbols` 任意命中即可
- `sinceTs/untilTs`：可选；可解析为 Date 的 ISO string 才生效
- 排序：按 `ts` 倒序（最近优先）
- `limit`：可选；>0 时截断

## UI 行为摘要（/daa/step/2）
代码位置：`app/daa/step/2/page.jsx`

- 顶部过滤区：
  - 两个 checkbox：Twitter（主观）/ News（客观）
  - Symbol 输入框：输入后即时过滤；提供 Clear 按钮
  - 右侧展示当前 events 数量
- 列表区（Events）：
  - 每条 event 显示：title / source / summary / symbols / author / tags / 本地格式化时间
  - 点击某条：选中并打开右侧 Detail
- 详情区（Detail）：
  - 展示 event 的 pretty JSON（`JSON.stringify(x, null, 2)`）
  - `Open`：若有 `url`，新开页面
  - `Copy JSON`：复制详情 JSON 到剪贴板
  - `Close`：关闭详情，回到单列布局

## 未来扩展点（占位）
- Twitter list ingest → 标准化为 `MarketEvent`（保留 `raw` 以便回溯）
- yfinance news ingest → 标准化为 `MarketEvent`
- 雪球 news ingest → 标准化为 `MarketEvent`
