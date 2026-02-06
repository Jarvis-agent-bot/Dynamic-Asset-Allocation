export const DAA_STEPS = [
  {
    id: 1,
    title: "回测算法组合",
    desc: "定义回测输入、策略集合与关键指标输出。",
    status: "wip",
  },
  {
    id: 2,
    title: "市场信息（Twitter主观 + 雪球/yfinance客观）",
    desc: "把‘市场信息’拆成页面字段：主观观点 + 可验证客观数据。",
    status: "todo",
  },
  {
    id: 3,
    title: "金额管理（比例分配/Tag/max in-out）",
    desc: "页面优先：先把资金约束与分配规则‘可配置化’。",
    status: "todo",
  },
  {
    id: 4,
    title: "基准买卖推荐（暂不做）",
    desc: "占位：与交易执行分离，先留契约边界。",
    status: "later",
  },
  {
    id: 5,
    title: "AI 分析（暂不做）",
    desc: "占位：解释性输出 + 可追溯引用来源。",
    status: "later",
  },
  {
    id: 6,
    title: "人因模型（暂不做）",
    desc: "占位：把主观风险偏好等因素结构化。",
    status: "later",
  },
  {
    id: 7,
    title: "Tag 体系（占位）",
    desc: "占位：标签是配置与解释的关键。",
    status: "later",
  },
];

export const DAA_STEP_STATUS_LABEL = {
  wip: "进行中",
  todo: "待做",
  later: "以后",
};

export function getStep(id) {
  const stepId = Number(id);
  return DAA_STEPS.find((s) => s.id === stepId) || null;
}
