import Link from "next/link";
import { DAA_STEPS } from "../steps";

export default function StepsQuickNav({ activeId }) {
  return (
    <nav aria-label="DAA steps" style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Steps</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {DAA_STEPS.map((s) => {
          const isActive = Number(activeId) === s.id;
          return (
            <Link
              key={s.id}
              href={`/daa/step/${s.id}`}
              aria-current={isActive ? "page" : undefined}
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
              title={`Step ${s.id}: ${s.title}`}
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
