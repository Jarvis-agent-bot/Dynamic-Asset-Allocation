export const DAA_STEPS = [
  { id: 1, title: "回测算法组合" },
  { id: 2, title: "市场信息（Twitter主观 + 雪球/yfinance客观）" },
  { id: 3, title: "金额管理（比例分配/Tag/max in-out）" },
  { id: 4, title: "基准买卖推荐（暂不做）" },
  { id: 5, title: "AI 分析（暂不做）" },
  { id: 6, title: "人因模型（暂不做）" },
  { id: 7, title: "Tag 体系（占位）" },
];

export function getStep(id) {
  const stepId = Number(id);
  return DAA_STEPS.find((s) => s.id === stepId) || null;
}
