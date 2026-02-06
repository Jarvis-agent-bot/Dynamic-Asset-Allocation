import Link from "next/link";
import { DAA_STEPS, DAA_STEP_STATUS_LABEL } from "./steps";

function StatusPill({ status }) {
  const label = DAA_STEP_STATUS_LABEL[status] || status || "";
  const bg = status === "wip" ? "#e6f4ff" : status === "todo" ? "#fff7e6" : "#f5f5f5";
  const fg = status === "wip" ? "#0958d9" : status === "todo" ? "#ad4e00" : "#555";

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        background: bg,
        color: fg,
        border: "1px solid rgba(0,0,0,0.06)",
        lineHeight: "18px",
      }}
    >
      {label}
    </span>
  );
}

export default function DaaConsoleHome() {
  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 22 }}>DAA 控制台</h1>
      <p style={{ color: "#444" }}>
        以页面为导向定义功能边界；后端 contract / provider 按页面字段测试驱动。
      </p>

      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>路线（固定顺序）</div>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {DAA_STEPS.map((s) => (
            <li key={s.id} style={{ margin: "10px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Link href={`/daa/step/${s.id}`} style={{ color: "#111" }}>
                  {s.title}
                </Link>
                {s.status ? <StatusPill status={s.status} /> : null}
              </div>
              {s.desc ? (
                <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>{s.desc}</div>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: "#666" }}>
        Next: 先把 Step 页面当成“功能边界”，再让 provider + contract 跟着页面字段收敛。
      </div>
    </main>
  );
}
