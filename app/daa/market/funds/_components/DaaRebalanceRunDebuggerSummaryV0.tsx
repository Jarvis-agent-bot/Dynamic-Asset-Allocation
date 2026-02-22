type DaaRebalanceRunDebuggerSummaryV0Props = {
  runStatus: 'idle' | 'running' | 'error' | 'recorded';
  blockerCount: number;
};

export default function DaaRebalanceRunDebuggerSummaryV0({ runStatus, blockerCount }: DaaRebalanceRunDebuggerSummaryV0Props) {
  return (
    <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
      Run debugger · {runStatus} · blockers {blockerCount}
    </summary>
  );
}
