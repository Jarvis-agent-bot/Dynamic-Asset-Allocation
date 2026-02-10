import Link from "next/link";
import { DAA_STEPS, getStep } from "../../steps";
import StatusPill from "../../components/StatusPill";
import StepsQuickNav from "../../components/StepsQuickNav";
import StepKeyNav from "./StepKeyNav";
import WizardPersistentSummary from "../../_components/WizardPersistentSummary";
import Step1BacktestPage from "../_pages/Step1BacktestPage";
import Step2MarketEventsPage from "../_pages/Step2MarketEventsPage";
import Step3MoneyManagementPage from "../_pages/Step3MoneyManagementPage";
import { RebalanceSimulatePanel } from "../_components/RebalanceSimulatePanel";

type StepPageProps = {
  params: {
    id: string;
  };
};

export function generateMetadata({ params }: StepPageProps) {
  const step = getStep(params?.id);
  const title = step ? `DAA Step ${step.id}: ${step.title}` : `DAA Unknown Step (${String(params?.id)})`;
  const description = step?.desc ? String(step.desc) : "DAA step page";

  return {
    title,
    description,
  };
}

const SAMPLE_REBALANCE_SIMULATE_REQUEST = {
  money_plan: {
    account: {
      baseCcy: "USD",
      totalEquity: 10000,
      cash: 2500,
      investable: 8000,
    },
    constraints: {
      maxPositionPct: 0.2,
      maxIn: 1200,
      maxOut: 1200,
    },
    allocations: [
      { id: "SPY", label: "US Equity (SPY)", targetPct: 0.6, tags: { riskPreference: "mid" } },
      { id: "TLT", label: "US Bonds (TLT)", targetPct: 0.4, tags: { riskPreference: "low" } },
    ],
  },
  signals: [
    { symbol: "SPY", action: "BUY", score: 0.82, reason: "trend up" },
    { symbol: "TLT", action: "HOLD", score: 0.55, reason: "neutral" },
  ],
};

function Nav({ stepId }: { stepId: number }) {
  const idx = DAA_STEPS.findIndex((s) => s.id === stepId);
  const prev = idx > 0 ? DAA_STEPS[idx - 1] : null;
  const next = idx >= 0 && idx < DAA_STEPS.length - 1 ? DAA_STEPS[idx + 1] : null;

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 13, marginTop: 12 }}>
      <Link href="/daa/" style={{ color: "#111" }}>
        ← 控制台
      </Link>
      <span style={{ color: "#999" }}>|</span>
      {prev ? (
        <Link href={`/daa/step/${prev.id}`} style={{ color: "#111" }}>
          ← {prev.title}
        </Link>
      ) : (
        <span style={{ color: "#bbb" }}>← 上一步</span>
      )}
      {next ? (
        <Link href={`/daa/step/${next.id}`} style={{ color: "#111" }}>
          {next.title} →
        </Link>
      ) : (
        <span style={{ color: "#bbb" }}>下一步 →</span>
      )}
      <span style={{ color: "#999" }}>|</span>
      <span style={{ color: "#777", fontSize: 12 }} title="Keyboard shortcuts">
        快捷键：<kbd style={{ padding: "1px 4px", border: "1px solid #ddd", borderRadius: 4, background: "#fafafa" }}>←</kbd>
        <span style={{ margin: "0 4px" }}>/</span>
        <kbd style={{ padding: "1px 4px", border: "1px solid #ddd", borderRadius: 4, background: "#fafafa" }}>→</kbd>
      </span>
    </div>
  );
}

export default function StepPage({ params }: StepPageProps) {
  const step = getStep(params.id);

  if (!step) {
    return (
      <main>
        <h1 style={{ margin: 0, fontSize: 20 }}>未知步骤</h1>
        <p style={{ color: "#666" }}>step id: {String(params?.id)}</p>

        <StepsQuickNav activeId={null} />

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>可用步骤</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#555" }}>
            {DAA_STEPS.map((s) => (
              <li key={s.id} style={{ margin: "6px 0" }}>
                <Link href={`/daa/step/${s.id}`} style={{ color: "#111" }}>
                  Step {s.id}: {s.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ marginTop: 12 }}>
          <Link href="/daa/" style={{ color: "#111" }}>
            ← 返回控制台
          </Link>
        </div>
      </main>
    );
  }

  // Fallback rendering: even if the dynamic route is used in some deployments,
  // Step4/5 must still expose the v0 rebalance recommendation action.
  if (step.id === 1 || step.id === 2 || step.id === 3) {
    const Page = step.id === 1 ? Step1BacktestPage : step.id === 2 ? Step2MarketEventsPage : Step3MoneyManagementPage;

    return (
      <main>
        <div style={{ marginTop: 12 }}>
          <WizardPersistentSummary />
        </div>

        <div style={{ marginTop: 12 }}>
          <Page />
        </div>

        <Nav stepId={step.id} />
      </main>
    );
  }

  if (step.id === 4 || step.id === 5) {
    return (
      <main>
        <h1 style={{ margin: 0, fontSize: 20 }}>
          Step {step.id} — {step.title} v0
        </h1>
        <p style={{ color: "#444" }}>
          v0：点击按钮调用 <code>POST /api/daa/rebalance/simulate</code> 生成“再平衡推荐”（orders + target weights + explain），并提供一键复制 JSON。
        </p>

        <div style={{ marginTop: 12 }}>
          <WizardPersistentSummary />
        </div>

        <div style={{ marginTop: 12 }}>
          <RebalanceSimulatePanel
            title={step.id === 4 ? "Generate v0 rebalance recommendation" : "Generate & inspect recommendation"}
            defaultRequest={SAMPLE_REBALANCE_SIMULATE_REQUEST}
          />
        </div>

        <Nav stepId={step.id} />
      </main>
    );
  }

  const idx = DAA_STEPS.findIndex((s) => s.id === step.id);
  const indexText = idx >= 0 ? `${idx + 1}/${DAA_STEPS.length}` : "";

  const prev = idx > 0 ? DAA_STEPS[idx - 1] : null;
  const next = idx >= 0 && idx < DAA_STEPS.length - 1 ? DAA_STEPS[idx + 1] : null;

  return (
    <main>
      <StepKeyNav prevHref={prev ? `/daa/step/${prev.id}` : null} nextHref={next ? `/daa/step/${next.id}` : null} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>
          Step {step.id} {indexText ? `(${indexText})` : ""}: {step.title}
        </h1>
        {step.status ? <StatusPill status={step.status} /> : null}
      </div>

      {step.desc ? <p style={{ color: "#666", marginTop: 8 }}>{step.desc}</p> : null}

      <StepsQuickNav activeId={step.id} />

      <div style={{ marginTop: 12 }}>
        <WizardPersistentSummary />
      </div>

      <p style={{ color: "#444", marginTop: 10 }}>
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

      <Nav stepId={step.id} />
    </main>
  );
}
