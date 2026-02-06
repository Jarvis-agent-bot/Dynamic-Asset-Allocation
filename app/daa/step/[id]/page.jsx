import Link from "next/link";
import { DAA_STEPS, getStep } from "../../steps";

function Nav({ id }) {
  const idx = DAA_STEPS.findIndex((s) => s.id === id);
  const prev = idx > 0 ? DAA_STEPS[idx - 1] : null;
  const next = idx >= 0 && idx < DAA_STEPS.length - 1 ? DAA_STEPS[idx + 1] : null;

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, marginTop: 12 }}>
      <Link href="/daa/" style={{ color: "#111" }}>
        ← 控制台
      </Link>
      <span style={{ color: "#999" }}>|</span>
      {prev ? (
        <Link href={`/daa/step/${prev.id}`} style={{ color: "#111" }}>
          ← Step {prev.id}
        </Link>
      ) : (
        <span style={{ color: "#bbb" }}>← Step</span>
      )}
      {next ? (
        <Link href={`/daa/step/${next.id}`} style={{ color: "#111" }}>
          Step {next.id} →
        </Link>
      ) : (
        <span style={{ color: "#bbb" }}>Step →</span>
      )}
    </div>
  );
}

export default function StepPage({ params }) {
  const step = getStep(params.id);

  if (!step) {
    return (
      <main>
        <h1 style={{ margin: 0, fontSize: 20 }}>Unknown step</h1>
        <p style={{ color: "#666" }}>step id: {params.id}</p>
        <Link href="/daa/" style={{ color: "#111" }}>
          ← back
        </Link>
      </main>
    );
  }

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>
        Step {step.id}: {step.title}
      </h1>
      <p style={{ color: "#444", marginTop: 8 }}>
        这个页面即“功能边界”。先定义 UI 需要的字段（inputs / outputs），再反推 contract/provider 的最小实现。
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Inputs（页面需要什么？）</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#555" }}>
            <li>TODO: 列出表单字段 / query params / 默认值</li>
            <li>TODO: 交互（按钮、校验、loading、error）</li>
          </ul>
        </section>

        <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Outputs（页面输出什么？）</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#555" }}>
            <li>TODO: JSON / table / chart 等渲染形式</li>
            <li>TODO: 显示哪些关键指标 / 解释字段</li>
          </ul>
        </section>

        <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Contract / Provider（后端最小承诺）</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#555" }}>
            <li>TODO: 定义 request/response 类型（src/core/contracts/...）</li>
            <li>TODO: provider mock → real（按页面字段测试驱动）</li>
          </ul>
        </section>
      </div>

      <Nav id={step.id} />
    </main>
  );
}
