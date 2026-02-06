export const metadata = {
  title: "DAA Console",
};

export default function DaaLayout({ children }) {
  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
      <div style={{ marginBottom: 16 }}>
        <a href="/daa/" style={{ textDecoration: "none", color: "#111" }}>
          <strong>Dynamic Asset Allocation</strong>
        </a>
        <div style={{ fontSize: 12, color: "#666" }}>Console (v0) — front-end driven</div>
      </div>
      {children}
    </div>
  );
}
