# Telegram 通知系统分层设计

## 背景

DAA 早期的 Telegram 推送由各业务入口直接拼接文本并调用发送函数。随着 drift-check、daily-analysis、risk autopilot、agent briefing 等入口增多，同一频道同时出现系统流水、调仓建议、风险触发和摘要报告，可读性下降。

## 决策

引入统一通知表达层：

- `DaaNotificationEvent`：表达级别、类别、标题、状态、关键事实、重点列表、下一步和来源。
- `notificationKind`：用户可见的粗粒度语义，当前包括 `risk_alert`、`review_required`、`execution_update`、`daily_digest`、`system_alert`。
- `telegramNotificationComposer`：把业务事件渲染为统一 Telegram 文案。
- 业务入口仍负责判断是否发送，但不再直接拼接 Telegram 长文本。

## 当前分类

| 业务事件 | 频道语义 | 推送策略 |
|---|---|---|
| 调仓建议 | 行动 | 生成新周期且存在建议时即时推送，提示去工作台审核。 |
| 每日复核 / 投资助理简报 | 摘要 | 每日一次；投资助理启用时由 `agent_briefing` 覆盖，`daily_report` 作为 fallback。 |
| 偏移触发 | 调仓行动或摘要材料 | 只有偏移生成新调仓周期时即时推送；未生成新周期的偏移折叠进每日复核/投资助理简报。 |
| 止盈止损 | 紧急风控 | 即时触发 agent 审核，并在同一条通知里展示审核结果和下一步。 |

## 取舍

- 保留即时推送：风险事件、有可审核调仓建议、真实交易执行结果。
- 降噪处理：无新周期的偏移不再单独推送，避免每天重复提醒同一类观察项。
- 暂不迁移：新闻、价格报警、系统健康告警、交易执行通知仍保留原入口，后续可逐步接入统一 composer 和策略层。

## 后续

下一阶段应把发送策略进一步下沉为 `NotificationPolicy`：

- 统一细分开关：news、price、health、risk、rebalance、report。
- 统一时区去重：明确按 `Asia/Shanghai` 自然日或滚动窗口。
- 统一 digest：`info` 类消息默认进入每日摘要，`critical/actionable` 即时推送。
