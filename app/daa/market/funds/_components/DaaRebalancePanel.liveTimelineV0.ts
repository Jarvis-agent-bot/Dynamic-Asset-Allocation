import { useCallback, useEffect, useRef, useState } from 'react';

export type LiveTimelineEntryV0 = { id: string; at: string; stage: string; detail: string; level: 'info' | 'ok' | 'error' };

export function useLiveTimelineV0(params: {
  runDaaStatus: 'idle' | 'running' | 'ok' | 'error';
  runDaaStatusText: string;
  paperRunLoading: boolean;
  paperRunError: string | null;
  paperRunRecordedAt: string | null;
}) {
  const { runDaaStatus, runDaaStatusText, paperRunLoading, paperRunError, paperRunRecordedAt } = params;
  const [liveTimelineV0, setLiveTimelineV0] = useState<LiveTimelineEntryV0[]>([]);
  const lastRunDaaStatusRef = useRef<typeof runDaaStatus>('idle');
  const lastPaperRunLoadingRef = useRef(false);
  const lastPaperRunRecordedAtRef = useRef<string | null>(null);
  const lastPaperRunErrorRef = useRef<string | null>(null);

  const pushLiveTimelineV0 = useCallback((entry: Omit<LiveTimelineEntryV0, 'id' | 'at'>) => {
    setLiveTimelineV0((prev) => [{ id: `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`, at: new Date().toISOString(), ...entry }, ...prev].slice(0, 20));
  }, []);

  useEffect(() => {
    if (runDaaStatus === lastRunDaaStatusRef.current) return;
    lastRunDaaStatusRef.current = runDaaStatus;
    if (runDaaStatus === 'running') pushLiveTimelineV0({ stage: 'Run DAA', detail: 'Step2 refresh + Step4 recommendation started.', level: 'info' });
    if (runDaaStatus === 'ok') pushLiveTimelineV0({ stage: 'Run DAA', detail: runDaaStatusText || 'Run DAA completed.', level: 'ok' });
    if (runDaaStatus === 'error') pushLiveTimelineV0({ stage: 'Run DAA', detail: runDaaStatusText || 'Run DAA failed.', level: 'error' });
  }, [runDaaStatus, runDaaStatusText, pushLiveTimelineV0]);

  useEffect(() => {
    if (paperRunLoading === lastPaperRunLoadingRef.current) return;
    lastPaperRunLoadingRef.current = paperRunLoading;
    if (paperRunLoading) pushLiveTimelineV0({ stage: 'Preflight execution', detail: 'Paper run started.', level: 'info' });
    if (!paperRunLoading && !paperRunError && paperRunRecordedAt) pushLiveTimelineV0({ stage: 'Preflight execution', detail: 'Paper run finished and recorded.', level: 'ok' });
  }, [paperRunLoading, paperRunError, paperRunRecordedAt, pushLiveTimelineV0]);

  useEffect(() => {
    if (!paperRunRecordedAt || paperRunRecordedAt === lastPaperRunRecordedAtRef.current) return;
    lastPaperRunRecordedAtRef.current = paperRunRecordedAt;
    pushLiveTimelineV0({ stage: 'Execution log', detail: `Recorded at ${paperRunRecordedAt}.`, level: 'ok' });
  }, [paperRunRecordedAt, pushLiveTimelineV0]);

  useEffect(() => {
    if (!paperRunError || paperRunError === lastPaperRunErrorRef.current) return;
    lastPaperRunErrorRef.current = paperRunError;
    pushLiveTimelineV0({ stage: 'Preflight execution', detail: paperRunError, level: 'error' });
  }, [paperRunError, pushLiveTimelineV0]);

  return liveTimelineV0;
}
