type EvidenceLike = {
  content: string;
  source?: string;
  confidence?: number | null;
  dataSnapshot?: Record<string, unknown> | null;
};

export type EvidenceQualityLevel = "high" | "medium" | "low";

export type EvidenceQuality = {
  level: EvidenceQualityLevel;
  label: string;
  reason: string;
};

const NO_RESULT_MARKERS_ = [
  "未返回可解析的结构化结论",
  "等待下一轮证据确认",
];

export function normalizeAgentEvidenceContent(content: string): string {
  return String(content || "")
    .replace(/^\s*(?:\[子 agent\]\s*)+/i, "")
    .replace(/^\s*(?:\[子 agent 轮询\]\s*)+/i, "")
    .replace(/^\s*(?:\[Agent 轮询\]\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isNoResultFallbackEvidence(content: string): boolean {
  const normalized = normalizeAgentEvidenceContent(content);
  return NO_RESULT_MARKERS_.some((marker) => normalized.includes(marker));
}

function hasUsefulSnapshot(snapshot: Record<string, unknown> | null | undefined): boolean {
  if (!snapshot || typeof snapshot !== "object") return false;
  return Object.keys(snapshot).some((key) => {
    const value = snapshot[key];
    if (value == null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
    return true;
  });
}

export function deriveEvidenceQuality(evidence: EvidenceLike): EvidenceQuality {
  const confidence = Number(evidence.confidence ?? Number.NaN);
  let score = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.45;
  const source = String(evidence.source || "").trim();
  const normalized = normalizeAgentEvidenceContent(evidence.content);

  if (source === "market_data" || source === "valuation" || source === "trade_outcome") score += 0.18;
  else if (source === "technical" || source === "news") score += 0.1;
  else if (source === "agent_reasoning") score -= 0.08;

  if (hasUsefulSnapshot(evidence.dataSnapshot)) score += 0.14;
  if (normalized.length >= 80) score += 0.06;
  if (isNoResultFallbackEvidence(normalized)) score = 0;

  const reasons: string[] = [];
  if (source) reasons.push(`来源 ${source}`);
  if (Number.isFinite(confidence)) reasons.push(`置信度 ${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`);
  if (hasUsefulSnapshot(evidence.dataSnapshot)) reasons.push("含工具数据");
  if (normalized.length < 40) reasons.push("摘要较短");

  if (score >= 0.72) return { level: "high", label: "证据质量 高", reason: reasons.join("，") || "来源和置信度较好" };
  if (score >= 0.48) return { level: "medium", label: "证据质量 中", reason: reasons.join("，") || "具备一定参考价值" };
  return { level: "low", label: "证据质量 低", reason: reasons.join("，") || "证据不足或质量较弱" };
}
