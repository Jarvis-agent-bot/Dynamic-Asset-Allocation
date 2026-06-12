# AI Native 新闻链路重构说明

## 目标

新闻模块不再只把信息压成 `symbol -> signal`。新的边界是：

1. `daa_news_item_snapshot_v1` 保存原始新闻 item。
2. `daa_news_event_snapshot_v1` 保存某条新闻 item 的 AI 事件分析。
3. `daa_news_signal_snapshot_v1` 只保存 symbol 级聚合信号，用于调仓、评分和缓存。
4. `daa_news_event_graph_v1` 保存新闻事件所属主题和关联资产摘要。
5. `daa_news_event_related_asset_v1` 保存事件到关联资产的规范化边，便于按资产查询和审计。
6. `daa_news_portfolio_impact_v1` 保存该事件对当前账户持仓、观察列表、目标权重和候选资产的影响。
7. `daa_discovery_candidates_v1` 保存新闻触发的候选发现，只作为研究线索，并记录人工复核状态。

这样可以避免一个 symbol 的重大事件标签被错误挂到同 symbol 的所有新闻上，也避免抓取失败时用旧分析刷新 `generated_at`。

## 写入规则

- 抓到新闻 item 后，先写入 `daa_news_item_snapshot_v1`。
- 只有当新闻集合变化、缓存过期、或技术异常波动触发重新分析时，才写 `daa_news_signal_snapshot_v1`。
- 如果抓取失败或没有新新闻，但已有缓存，只返回缓存给调用方，不更新 `generated_at`，不清空 `item_hash_set`。
- 每次新 AI 分析都会写 `daa_news_event_snapshot_v1`，事件按 `provider + symbol + item_hash` 绑定。
- 事件层写入成功后，同步运行 `newsIntelligenceService`，生成事件图、组合影响和候选发现。
- 新闻智能层是确定性规则服务，不直接调用 LLM，也不会修改观察列表或交易状态。
- `cache-cleanup` 会清理旧新闻 item、事件层、事件边、组合影响和已处理候选，避免派生数据长期堆积。

## 触发规则

- Telegram 重大新闻推送仍有 24 小时去重，避免刷屏。
- 投资助理自动复核触发依据是“检测到 high-impact 新闻事件”，不依赖 Telegram 是否实际推送成功。
- Alpaca WS 实时事件会立刻写 item、event 和实时 signal；cron 批量刷新负责补全非实时来源与长期缓存。

## 投资助理可见信息

`observeNode` 现在优先读取事件层，投资助理能看到：

- 新闻标题、来源、时间；
- AI summary、actionHint；
- scorePct、confidencePct；
- majorEvent 的 type、impact、description。
- 事件图: 主题、关联资产、关联原因；
- 事件边: 关联资产、关系类型、置信度；
- 组合影响: holding / watchlist / target / related_candidate 的影响等级；
- 候选发现: 新候选资产、分数、置信度、证据引用、出现次数和人工处理状态。

如果某条新闻尚未经过 AI 事件分析，投资助理仍能看到原始新闻标题，但 summary 和 majorEvent 为空。

## 只读 API

新增 `GET /api/daa/news/intelligence`，返回:

- `eventGraphs`: 最近新闻事件图；
- `portfolioImpacts`: 当前账户新闻影响；
- `discoveryCandidates`: 状态为 `new` / `watching` 的候选发现；
- `policy`: 明确标注 `canAutoMutateWatchlist=false`、`canAutoTrade=false`。

这个 API 用于 UI 和投资助理读取，不承担任何写动作。

## 权限边界

- AI 可以发现候选、解释事件、建议进入研究或观察。
- 当前版本不会自动加入观察列表，不会自动移除观察列表。
- 当前版本不会自动生成交易订单；BUY / SELL 仍必须经过目标权重、风控、冷静期和执行授权。

## 后续可扩展点

- 候选发现雷达后续可以继续接入价格异动、成交量、宏观指标和公告源。
- 事件层可以继续扩展 `industry`、`entities_json`，用于更细的跨资产事件聚类。
- 当接入 SEC/HKEX/SSE/SZSE 官方公告源时，官方公告应直接写事件层，并提高 source credibility。
