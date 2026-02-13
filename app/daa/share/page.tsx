import DaaRebalanceRunShareViewV0 from "./_components/DaaRebalanceRunShareViewV0";

export default function DaaSharePage() {
  return (
    <main style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 18 }}>DAA rebalance run share</h1>
      <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
        Open a shared link generated from Funds hub. Payload is stored in the URL fragment and is never sent to the server.
      </p>
      <div style={{ marginTop: 12 }}>
        <DaaRebalanceRunShareViewV0 />
      </div>
    </main>
  );
}
