const STEPS = [
  { id: 1, title: "回测算法组合" },
  { id: 2, title: "市场信息（Twitter主观 + 雪球/yfinance客观）" },
  { id: 3, title: "金额管理（比例分配/Tag/max in-out）" },
  { id: 4, title: "基准买卖推荐（暂不做）" },
  { id: 5, title: "AI 分析（暂不做）" },
  { id: 6, title: "人因模型（暂不做）" },
  { id: 7, title: "Tag 体系（占位）" },
];

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
          {STEPS.map((s) => (
            <li key={s.id} style={{ margin: "6px 0" }}>
              <span style={{ color: "#111" }}>{s.title}</span>
            </li>
          ))}
        </ol>
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: "#666" }}>
        Next: Step1/2/3 页面骨架 + mock → provider → JSON 输出。
      </div>
    </main>
  );
}
