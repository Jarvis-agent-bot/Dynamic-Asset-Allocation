# DAA Step3 — 金额管理（v0）

目标：以产品页面为中心，先把“资金池/分配/约束/Tag”这层框架跑通（mock + 本地校验 + copy JSON），为后续 Step4 推荐算法提供输入。

## v0 范围（本 PR）
- schema：MoneyAccount / Allocation / Constraints / Tags
- mock 数据
- `/daa/step/3` 页面：
  - 资金池（本金/现金/可投资）
  - 比例分配（按资产/策略/分类Tag）
  - 约束：max in/out（入金/出金）、最大持仓比例
  - JSON 预览 + Copy

## 非目标
- 不做买卖推荐
- 不做 AI
- 不接入真实交易/券商

## Tag（来自你的定义）
- 风险偏好：高 / 中 / 低
- 风险偏好评分：高 / 中 / 低 / 傻逼

## 未来扩展
- 资金流入/流出事件化（CashFlowEvent）
- 约束联动到 Step4 推荐（position sizing + max in/out）
