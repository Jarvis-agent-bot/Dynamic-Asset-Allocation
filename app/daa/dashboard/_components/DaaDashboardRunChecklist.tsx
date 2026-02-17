"use client";

import Link from "next/link";

import { type ReactNode } from "react";

import { useDaaRuntime } from "../../useDaaRuntime";

type Props = {
  onJump: (id: string) => void;
};

type BadgeTone = "ok" | "warn" | "missing";

type RowPriority = "now" | "soon" | "later";

type ChecklistRow = {
  stepId: number;
  title: string;
  desc: string;
  jumpId: string;
  badge: { tone: BadgeTone; text: string };
  missingHint: string | null;
  priority: RowPriority;
};

function Badge({ tone, text }: { tone: BadgeTone; text: string }) {
  const bg = tone === "ok" ? "#f0fdf4" : tone === "warn" ? "#fff7e6" : "#fff1f0";
  const fg = tone === "ok" ? "#237804" : tone === "warn" ? "#ad4e00" : "#a8071a";

  return (
    <span
      style={{
        padding: "3px 8px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.06)",
        background: bg,
        color: fg,
        fontSize: 12,
        lineHeight: "18px",
        whiteSpace: "nowrap",
      }}
      aria-label={text}
    >
      {text}
    </span>
  );
}

function JumpButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 10px",
        borderRadius: 10,
        border: "1px solid #e5e5e5",
        background: "#fafafa",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function statusToBadgeTone(status: "done" | "wip" | "todo" | "later"): BadgeTone {
  if (status === "done") return "ok";
  if (status === "wip" || status === "later") return "warn";
  return "missing";
}

function statusToBadgeText(status: "done" | "wip" | "todo" | "later"): string {
  if (status === "done") return "done";
  if (status === "wip") return "wip";
  if (status === "later") return "later";
  return "missing";
}

function getRowPriority(stepId: number, nextStepId: number | null, tone: BadgeTone): RowPriority {
  if (nextStepId != null && stepId === nextStepId) return "now";
  if (tone !== "ok") return "soon";
  return "later";
}

function rowCardStyle(priority: RowPriority, tone: BadgeTone) {
  if (priority === "now") {
    return {
      border: "1px solid #111",
      background: "#f8fafc",
      boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
    };
  }

  if (tone === "missing") {
    return {
      border: "1px solid #ffd6d9",
      background: "#fff8f8",
      boxShadow: "none",
    };
  }

  if (tone === "warn") {
    return {
      border: "1px solid #ffe3bf",
      background: "#fffaf3",
      boxShadow: "none",
    };
  }

  return {
    border: "1px solid #f0f0f0",
    background: "#fff",
    boxShadow: "none",
  };
}

export default function DaaDashboardRunChecklist({ onJump }: Props) {
  const rt = useDaaRuntime();

  const step5Blocked = !rt.hasRecommendation;
  const step5Done = rt.stepStatusById[5] === "done";

  const step7Badge =
    rt.tagTaxonomyStatus === "configured"
      ? { tone: "ok" as const, text: "configured" }
      : rt.tagTaxonomyStatus === "invalid"
        ? { tone: "missing" as const, text: "invalid" }
        : { tone: "warn" as const, text: "default" };

  const rawRows: Array<Omit<ChecklistRow, "priority">> = [
    {
      stepId: 1,
      title: "Step1 — Backtest",
      desc: "运行一次回测，产出策略与指标摘要。",
      jumpId: "step1",
      badge: {
        tone: statusToBadgeTone(rt.stepStatusById[1]),
        text: statusToBadgeText(rt.stepStatusById[1]),
      },
      missingHint: rt.hasBacktest ? null : "缺少回测结果（symbol/date/metrics）。",
    },
    {
      stepId: 2,
      title: "Step2 — Market events",
      desc: "影响 Step5 explain 的可追溯引用。",
      jumpId: "step2",
      badge: {
        tone: rt.marketEventCount > 0 ? "ok" : "missing",
        text: rt.marketEventCount > 0 ? `events ${rt.marketEventCount}` : "missing",
      },
      missingHint: rt.marketEventCount > 0 ? null : "缺少 market events（至少 1 条）。",
    },
    {
      stepId: 3,
      title: "Step3 — Money plan",
      desc: "提供 account/allocations/constraints 给后续步骤。",
      jumpId: "step3",
      badge: {
        tone: statusToBadgeTone(rt.stepStatusById[3]),
        text: statusToBadgeText(rt.stepStatusById[3]),
      },
      missingHint: rt.hasMoneyPlan ? null : "缺少 money plan（allocations 或 constraints）。",
    },
    {
      stepId: 4,
      title: "Step4 — Recommendation",
      desc: "生成 baseline recommendation（写入 localStorage）。",
      jumpId: "step4",
      badge: {
        tone: rt.hasRecommendation ? "ok" : "missing",
        text: rt.hasRecommendation ? "done" : "missing",
      },
      missingHint: rt.hasRecommendation ? null : "缺少 recommendation 输出。",
    },
    {
      stepId: 5,
      title: "Step5 — Explain",
      desc: "基于 Step4 + Step2 自动生成解释（不下单）。",
      jumpId: "step5",
      badge: {
        tone: step5Blocked ? "missing" : step5Done ? "ok" : "warn",
        text: step5Blocked ? "blocked" : step5Done ? `citations ${rt.citationsCount}` : "wip",
      },
      missingHint: step5Blocked
        ? "缺少 Step4 recommendation，无法生成 explain。"
        : step5Done
          ? null
          : "explain 缺少 citations（检查 Step2 events/symbol 匹配）。",
    },
    {
      stepId: 6,
      title: "Step6 — Human profile",
      desc: "用于人因权重（风险偏好/评分等）。",
      jumpId: "step6",
      badge: {
        tone: rt.hasHumanProfile ? "ok" : "missing",
        text: rt.hasHumanProfile ? "done" : "missing",
      },
      missingHint: rt.hasHumanProfile ? null : "缺少 human profile。",
    },
    {
      stepId: 7,
      title: "Step7 — Tag taxonomy",
      desc: "用于 Step2/Step6 输入校验与归一化。",
      jumpId: "step7",
      badge: step7Badge,
      missingHint:
        rt.tagTaxonomyStatus === "configured"
          ? null
          : rt.tagTaxonomyStatus === "invalid"
            ? "taxonomy 配置无效，请修复字段。"
            : "当前使用默认 taxonomy（建议配置自定义版本）。",
    },
  ];

  const rows: ChecklistRow[] = rawRows.map((row) => ({
    ...row,
    priority: getRowPriority(row.stepId, rt.nextStepId, row.badge.tone),
  }));

  const missingSummary = rows.filter((r) => r.badge.tone !== "ok").map((r) => `S${r.stepId}`);

  const priorityRank: Record<RowPriority, number> = { now: 0, soon: 1, later: 2 };
  const prioritizedRows = [...rows].sort((a, b) => {
    const rankDelta = priorityRank[a.priority] - priorityRank[b.priority];
    if (rankDelta !== 0) return rankDelta;
    return a.stepId - b.stepId;
  });

  return (
    <section style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Run status（Step1-7 completion）</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
            Next: <b>{rt.nextActionText}</b>
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: missingSummary.length ? "#a8071a" : "#237804" }}>
            {missingSummary.length ? `Missing data highlights: ${missingSummary.join(", ")}` : "All core steps are complete."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12 }}>
          <Link href="/daa/dashboard?tab=wizard&step=1" style={{ color: "#111" }}>
            Open Wizard
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
        {prioritizedRows.map((row) => {
          const openHref = `/daa/dashboard?tab=wizard&step=${row.stepId}`;
          const cardStyle = rowCardStyle(row.priority, row.badge.tone);
          const priorityText = row.priority === "now" ? "Do now" : row.priority === "soon" ? "Up next" : "Review";

          return (
            <div
              key={row.stepId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                borderRadius: 12,
                padding: "10px 12px",
                border: cardStyle.border,
                background: cardStyle.background,
                boxShadow: cardStyle.boxShadow,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{row.title}</div>
                  <span style={{ fontSize: 11, color: row.priority === "now" ? "#111" : "#666" }}>{priorityText}</span>
                </div>
                <div style={{ fontSize: 12, color: "#666" }}>{row.desc}</div>
                {row.missingHint ? (
                  <div style={{ marginTop: 4, fontSize: 12, color: row.badge.tone === "warn" ? "#ad4e00" : "#a8071a" }}>{row.missingHint}</div>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Badge tone={row.badge.tone} text={row.badge.text} />
                <JumpButton onClick={() => onJump(row.jumpId)}>
                  {row.priority === "now" ? `Start Step ${row.stepId}` : `Go to Step ${row.stepId}`}
                </JumpButton>
                <Link href={openHref} style={{ color: "#111", fontSize: 12 }}>
                  Open Step {row.stepId}
                </Link>
              </div>
            </div>
          );
        })}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Import bundle</div>
            <div style={{ fontSize: 12, color: "#666" }}>从 JSON 恢复 Step2/3/4/5/6/7 与 funds hub 运行态。</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Badge tone="ok" text="ready" />
            <JumpButton onClick={() => onJump("import")}>Import JSON</JumpButton>
            <Link href="/daa/dashboard#import" style={{ color: "#111", fontSize: 12 }}>
              Open importer
            </Link>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Export bundle</div>
            <div style={{ fontSize: 12, color: "#666" }}>统一从这里一键导出全量 JSON。</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Badge
              tone={rt.marketEventCount && rt.hasRecommendation && rt.hasHumanProfile ? "ok" : "warn"}
              text={rt.marketEventCount && rt.hasRecommendation && rt.hasHumanProfile ? "ready" : "partial"}
            />
            <JumpButton onClick={() => onJump("export")}>Export JSON</JumpButton>
            <Link href="/daa/dashboard#export" style={{ color: "#111", fontSize: 12 }}>
              Open exporter
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
