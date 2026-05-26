# 资产候选发现雷达设计

生成日期: 2026-05-11
目标: 在现有“持仓 + 观察列表 + 推荐候选池”的基础上，补齐 AI Native 金融系统里的主动候选发现能力。

## 1. 当前结论

当前系统已经具备前两层能力的一部分:

1. **组合内监控层**
   - 覆盖持仓、观察列表、目标权重、漂移、价格、新闻和 Agent thesis。
   - 适合回答“已有资产是否需要复核、调仓、降权或继续观察”。

2. **人工候选池层**
   - 通过 `featuredAssetsCatalog` 提供精选资产。
   - 适合从少量高流动性资产中手动加入观察列表。

缺口是第三层:

3. **主动发现雷达层**
   - 系统还不会结构化扫描“观察列表之外”的机会。
   - 新闻、主题、价格异动、宏观变化和 AI 研究尚未形成候选资产漏斗。

因此后续不应该直接做“全市场乱扫”，而应该做“主题白名单 + 流动性白名单 + 新闻/价格/宏观触发”的候选发现雷达。

## 2. 黄金独立品种边界

系统内应区分三类黄金表达:

| 品种 | 系统表达 | 用途 | 交易含义 |
| --- | --- | --- | --- |
| 黄金本身 | `COMMODITY::GC=F` | 黄金价格基准、配置层里的独立黄金敞口 | Yahoo 上是 COMEX 黄金连续期货，不能等同于券商一定可直接下单 |
| 黄金 ETF | `US::GLD` / `US::IAU` | 美股账户里更常见的可交易代理 | ETF 份额，跟踪黄金但有费率、溢折价和交易时段差异 |
| 现货/期货/券商品种 | 后续执行映射 | 真实交易路由 | 需要 execution venue 单独映射 |

当前系统先把 `GC=F` 作为独立黄金配置品种接入资产域、候选池、搜索、行情和新闻识别。后续如果接真实券商，需要新增执行层映射，例如:

```text
COMMODITY::GC=F -> venue instrument
  paper/sim: 直接按 GC=F 估值
  stock broker: 映射到 GLD/IAU
  futures broker: 映射到具体黄金期货合约
  spot venue: 映射到 XAUUSD/实物金产品
```

## 3. 当前实现与后续模块

当前第一版已经落在新闻智能层，而不是单独的 discovery 目录:

```text
src/daa/modules/news-intelligence/newsIntelligenceService.ts
app/api/daa/news/intelligence/route.ts
src/daa/store/marketCacheStore.ts
```

它的定位是“新闻触发的候选发现最小闭环”: 从重大新闻事件生成主题、关联资产、组合影响和候选池。

后续如果要升级为完整发现雷达，再拆独立模块:

```text
src/daa/modules/discovery/
  discoveryTopicTypes.ts
  discoveryCandidateTypes.ts
  discoveryRadarService.ts
  discoveryScoring.ts
  discoveryEvidenceBuilder.ts
  discoveryActionPolicy.ts
  discoveryStore.ts
```

职责划分:

| 模块 | 职责 |
| --- | --- |
| `discoveryRadarService` | 编排一次雷达扫描 |
| `discoveryScoring` | 新闻热度、价格异动、主题相关、组合相关、风险惩罚评分 |
| `discoveryEvidenceBuilder` | 把新闻、行情、宏观、已有 thesis 转成可审计证据 |
| `discoveryActionPolicy` | 决定候选进入展示、建议加入观察、建议忽略或归档 |
| `discoveryStore` | 持久化主题、候选、运行记录和用户处理状态 |

## 4. 数据模型

当前已落地的表:

| 表 | 作用 | 生命周期 |
| --- | --- | --- |
| `daa_news_event_snapshot_v1` | 新闻事件层快照 | 30 天 |
| `daa_news_event_graph_v1` | 事件主题图谱摘要 | 30 天 |
| `daa_news_event_related_asset_v1` | 事件到关联资产的边表，便于查询和审计 | 30 天 |
| `daa_news_portfolio_impact_v1` | 账户组合影响判断 | 90 天 |
| `daa_discovery_candidates_v1` | 候选发现池，保留状态、证据和人工复核审计 | 活跃候选保留；dismissed/archived 180 天后清理 |

`daa_discovery_candidates_v1` 当前字段重点:

```ts
type DiscoveryCandidate = {
  id: string;
  ownerAccountId: string;
  topicKey: string;
  assetKey: string;
  symbol: string;
  market: string;
  displayNameZh: string | null;
  scorePct: number;
  confidence: "low" | "medium" | "high";
  status: "new" | "watching" | "dismissed" | "archived";
  reasonZh: string;
  riskNotesZh: string[];
  evidenceRefs: string[];
  discoveredAt: string;
  lastSeenAt: string;
  seenCount: number;
  reviewedAt: string | null;
  promotedAt: string | null;
  dismissedAt: string | null;
  archivedAt: string | null;
};
```

后续完整雷达仍建议新增两类表:

### `daa_discovery_topics`

主题定义，不是资产列表。示例: AI 算力、存储周期、黄金避险、半导体设备、港股互联网、宏观避险。

```ts
type DiscoveryTopic = {
  id: string;
  key: string;
  labelZh: string;
  enabled: boolean;
  queryText: string;
  seedSymbols: string[];
  riskTags: string[];
  maxCandidatesPerRun: number;
};
```

### `daa_discovery_runs`

每次扫描记录，便于审计和复盘。

```ts
type DiscoveryRun = {
  id: string;
  trigger: "scheduled" | "manual" | "agent";
  startedAt: string;
  finishedAt: string | null;
  topicKeys: string[];
  candidatesFound: number;
  candidatesPromoted: number;
  status: "running" | "success" | "failed";
  summaryJson: Record<string, unknown>;
};
```

## 5. 雷达扫描流程

```text
cron/manual/agent
  -> load enabled topics
  -> expand seed universe
  -> collect news + price moves + market indicators
  -> build evidence
  -> score candidates
  -> dedupe existing holdings/watchlist/candidates
  -> write discovery candidates
  -> notify or surface in UI
```

评分建议:

| 维度 | 含义 |
| --- | --- |
| 新闻热度 | 同一主题下出现频率、来源质量、重大事件类型 |
| 价格异动 | 近 1 日 / 5 日 / 20 日异常波动和成交量变化 |
| 主题相关 | 与 topic query、seed symbols、已有 thesis 的语义相关性 |
| 组合相关 | 能否改善当前组合暴露、分散度或风险缺口 |
| 风险惩罚 | 流动性差、单日暴涨、财报/监管/地缘事件不确定性 |

输出不是交易建议，而是:

- 加入观察列表
- 加入但默认不启用入场候选
- 稍后复核
- 忽略/归档

## 6. Agent 权限边界

建议权限如下:

| 动作 | Advisor | Operator | Autopilot |
| --- | --- | --- | --- |
| 生成候选 | 允许 | 允许 | 允许 |
| 建议加入观察列表 | 允许 | 允许 | 允许 |
| 自动加入观察列表 | 不允许 | 可手动确认 | 可配置开启 |
| 自动移除观察列表 | 不允许 | 不允许 | 默认不允许，只能建议归档 |
| 自动生成买入提案 | 不允许 | 需显式 auto-entry | 需目标权重 + 风控 + 冷静期 |

原则:

- AI 可以发现候选，也可以建议加入/移除观察列表。
- 自动加入观察列表可以作为低风险写动作，但必须有开关、日志和撤销入口。
- 自动移除比自动加入更危险，默认只做“降级/归档建议”，避免系统误删用户关注资产。
- 任何 BUY/SELL 仍必须经过目标权重、价格/FX、风控、冷静期和执行授权。

## 7. UI 建议

Portfolio 的观察列表旁新增 “发现雷达” 入口，展示:

- 主题: AI 算力 / 黄金避险 / 存储周期等
- 候选资产: 中文名、ticker、市场、资产类型
- 触发原因: 新闻、价格异动、宏观指标、Agent 发现
- 风险标签: 高波动、估值拥挤、流动性、事件风险
- 操作: 加入观察、忽略、稍后复核、查看证据

展示上应避免营销式大卡片，使用可扫描的表格/列表:

```text
主题       标的        分数  触发原因             操作
黄金避险   黄金 GC=F   82   美元回落 + 避险新闻   加入观察 / 复核
存储周期   美光 MU     76   HBM 需求 + 价格异动   加入观察 / 忽略
```

## 8. 实施顺序

1. 补齐资产主数据: `name`、`displayNameZh`、`assetClass`、`market` 一致写入。
2. 完成黄金、白银、原油等商品基准的搜索、行情、新闻 market 识别。
3. 新增 discovery 数据表和 store。当前已落地 `daa_discovery_candidates_v1`，并由新闻智能层写入。
4. 做第一版手动触发 API: `POST /api/daa/discovery/radar/run`。
5. 做只读列表 API。当前先通过 `GET /api/daa/news/intelligence` 暴露新闻触发的候选发现。
6. 在 Portfolio 观察列表旁新增“发现雷达”视图。
7. 接入 Agent: 只允许生成候选和建议动作，不直接调仓。
8. 最后再考虑 scheduled radar cron 和自动加入观察列表开关。

第一版验收标准:

- 能从主题扫描中产生候选。
- 能看到候选理由和证据。
- 能一键加入观察列表并保留中文名。
- 不会自动买入、不会自动删除用户观察资产。

## 9. 当前已落地的新闻雷达版本

本次先把主动发现雷达接在新闻事件层之后，形成一个可审计的最小闭环:

```text
daa_news_event_snapshot_v1
  -> newsIntelligenceService
  -> daa_news_event_graph_v1
  -> daa_news_event_related_asset_v1
  -> daa_news_portfolio_impact_v1
  -> daa_discovery_candidates_v1
  -> observeNode / prioritizePrompt / GET /api/daa/news/intelligence
```

当前能力:

- 从新闻标题、AI summary、majorEvent、drivers 中识别主题，例如半导体、黄金/商品、债券、加密、网络安全、机器人。
- 基于精选资产池扩展同主题关联资产，例如 NVDA/HBM 新闻会关联 MU、AVGO、TSM、ASML 等半导体链条。
- 对持仓、观察列表、目标权重资产生成 `holding` / `watchlist` / `target` 影响。
- 对非当前组合资产生成 `related_candidate` 候选发现，状态默认为 `new`。
- 对候选发现记录 `lastSeenAt`、`seenCount`、`reviewedAt`、`promotedAt`、`dismissedAt`、`archivedAt`，支持后续人工操作审计。
- 统一清理策略已接入 cache-cleanup: 新闻事件/图谱 30 天、组合影响 90 天、已忽略/归档候选 180 天。

仍未做的部分:

- 尚未接入独立 `discovery_topics` 和 `discovery_runs`。
- 尚未把价格异动、成交量、宏观指标纳入评分。
- 尚未提供完整的“加入观察列表 / 忽略 / 归档”UI 操作闭环。
- 尚未开启任何自动加入观察列表能力。
