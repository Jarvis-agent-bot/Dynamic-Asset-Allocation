import Link from "next/link";
import { DAA_STEPS, DAA_STEP_STATUS_LABEL, type DaaStepStatus } from "../steps";

type Props = {
  activeId?: number | null;
};

export default function StepsQuickNav({ activeId }: Props) {
  return (
    <nav aria-label="DAA steps" style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Steps</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {DAA_STEPS.map((s) => {
          const isActive = Number(activeId) === s.id;
          const status = s.status as DaaStepStatus | string | undefined;
          const statusLabel = status ? DAA_STEP_STATUS_LABEL[status as DaaStepStatus] || status : "";
          const a11yLabel = statusLabel ? `Step ${s.id}: ${s.title}（${statusLabel}）` : `Step ${s.id}: ${s.title}`;

          return (
            <Link
              key={s.id}
              href={`/daa/step/${s.id}`}
              aria-current={isActive ? "page" : undefined}
              aria-label={a11yLabel}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                borderRadius: 999,
                border: `1px solid ${isActive ? "#111" : "#ddd"}`,
                background: isActive ? "#111" : "#fff",
                color: isActive ? "#fff" : "#111",
                textDecoration: "none",
                fontSize: 12,
                lineHeight: 1,
              }}
              title={a11yLabel}
            >
              <span style={{ fontWeight: 700, opacity: isActive ? 1 : 0.85 }}>{s.id}</span>
              <span style={{ opacity: isActive ? 1 : 0.75 }}>{s.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
