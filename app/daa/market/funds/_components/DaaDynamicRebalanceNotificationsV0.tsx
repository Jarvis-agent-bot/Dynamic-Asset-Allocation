'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { copyTextToClipboard } from '../../../copyToClipboard';
import { pretty } from '../../../wizardStorage';

import { requestBrowserNotificationPermissionV0 } from '../../../dynamicRebalanceNotificationsClientV0';

import {
  appendDynamicRebalanceNotificationLogV0,
  clearDynamicRebalanceNotificationLogV0,
  loadDynamicRebalanceNotificationLogV0,
  type DynamicRebalanceNotificationLogEntryV0,
} from '@/src/daa/dynamicRebalanceNotificationLogStoreV0';
import {
  defaultDynamicRebalanceNotifyPrefsV0,
  loadDynamicRebalanceNotifyPrefsStateV1,
  persistDynamicRebalanceNotifyPrefsV0,
} from '@/src/daa/dynamicRebalanceNotificationPrefsStoreV0';

function safeParseIso(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function formatLocalCompact(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function getPermissionText(): string {
  try {
    if (typeof window === 'undefined') return '<server>';
    const N: any = (window as any).Notification;
    if (!N) return '<unsupported>';
    return String(N.permission ?? '<unknown>');
  } catch {
    return '<unknown>';
  }
}

export default function DaaDynamicRebalanceNotificationsV0() {
  const [open, setOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [permTick, setPermTick] = useState(0);

  const [enabled, setEnabled] = useState(true);
  const [browserChannel, setBrowserChannel] = useState(false);

  const [scheduleDue, setScheduleDue] = useState(true);
  const [skipMarketClosed, setSkipMarketClosed] = useState(true);
  const [skipDataStale, setSkipDataStale] = useState(true);
  const [runRecorded, setRunRecorded] = useState(true);

  const [entries, setEntries] = useState<DynamicRebalanceNotificationLogEntryV0[]>([]);

  const loadFromStorage = useCallback(() => {
    if (typeof window === 'undefined') return;

    const st = loadDynamicRebalanceNotifyPrefsStateV1(window.localStorage);
    setEnabled(!!st.prefs.enabled);
    setBrowserChannel(!!st.prefs.channel.browser);

    setScheduleDue(!!st.prefs.events.scheduleDue);
    setSkipMarketClosed(!!st.prefs.events.skipMarketClosed);
    setSkipDataStale(!!st.prefs.events.skipDataStale);
    setRunRecorded(!!st.prefs.events.runRecorded);

    setEntries(loadDynamicRebalanceNotificationLogV0(window.localStorage));
    setSaveStatus('idle');
  }, []);

  useEffect(() => {
    if (!open) return;
    loadFromStorage();
  }, [open, loadFromStorage]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setPermTick((x) => x + 1), 5000);
    return () => window.clearInterval(id);
  }, [open]);

  const permission = useMemo(() => getPermissionText(), [permTick, open]);

  const headline = useMemo(() => {
    if (typeof window === 'undefined') return 'server';

    const st = loadDynamicRebalanceNotifyPrefsStateV1(window.localStorage);
    const p = st.prefs;

    return `enabled=${p.enabled}; browser=${p.channel.browser}; permission=${getPermissionText()}; updatedAt=${st.updatedAt}`;
  }, [open, saveStatus, permTick]);

  const view = useMemo(() => {
    const items = entries.slice(-5).reverse();
    return { items, total: entries.length };
  }, [entries]);

  async function doCopy() {
    try {
      if (typeof window === 'undefined') return;
      await copyTextToClipboard(pretty(loadDynamicRebalanceNotifyPrefsStateV1(window.localStorage)));
      setCopyStatus('ok');
      window.setTimeout(() => setCopyStatus('idle'), 1200);
    } catch {
      setCopyStatus('error');
      window.setTimeout(() => setCopyStatus('idle'), 2000);
    }
  }

  async function doRequestPermission() {
    try {
      await requestBrowserNotificationPermissionV0();
      setPermTick((x) => x + 1);
    } catch {
      // ignore
    }
  }

  function doResetDefaults() {
    const d = defaultDynamicRebalanceNotifyPrefsV0();
    setEnabled(d.enabled);
    setBrowserChannel(d.channel.browser);

    setScheduleDue(d.events.scheduleDue);
    setSkipMarketClosed(d.events.skipMarketClosed);
    setSkipDataStale(d.events.skipDataStale);
    setRunRecorded(d.events.runRecorded);
  }

  function doSave() {
    if (typeof window === 'undefined') return;

    const r = persistDynamicRebalanceNotifyPrefsV0({
      storage: window.localStorage,
      prefsLike: {
        enabled,
        channel: { browser: browserChannel },
        events: {
          scheduleDue,
          skipMarketClosed,
          skipDataStale,
          runRecorded,
        },
      },
    });

    if (!r.ok) {
      setSaveStatus('error');
      window.setTimeout(() => setSaveStatus('idle'), 2000);
      return;
    }

    setSaveStatus('ok');
    window.setTimeout(() => setSaveStatus('idle'), 1200);
  }

  function doClearLog() {
    if (typeof window === 'undefined') return;
    clearDynamicRebalanceNotificationLogV0(window.localStorage);
    setEntries([]);
  }

  async function doCopyLog() {
    try {
      if (typeof window === 'undefined') return;
      await copyTextToClipboard(JSON.stringify(loadDynamicRebalanceNotificationLogV0(window.localStorage), null, 2));
      setCopyStatus('ok');
      window.setTimeout(() => setCopyStatus('idle'), 1200);
    } catch {
      setCopyStatus('error');
      window.setTimeout(() => setCopyStatus('idle'), 2000);
    }
  }

  function doTestNotification() {
    if (typeof window === 'undefined') return;
    appendDynamicRebalanceNotificationLogV0({
      storage: window.localStorage,
      at: new Date().toISOString(),
      kind: 'unknown',
      title: 'Test (local log)',
      body: `permission=${getPermissionText()}; browser=${browserChannel}`,
    });
    setEntries(loadDynamicRebalanceNotificationLogV0(window.localStorage));
  }

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const }}>
        <div>
          <div style={{ fontWeight: 800 }}>Notification preferences v0</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {headline}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <button type="button" className="button secondary" onClick={doCopy} style={{ padding: '6px 10px' }}>
            {copyStatus === 'ok' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy prefs JSON'}
          </button>
          <button type="button" className="button secondary" onClick={() => setOpen((v) => !v)} style={{ padding: '6px 10px' }} aria-expanded={open}>
            {open ? '收起' : '编辑'}
          </button>
        </div>
      </div>

      {open ? (
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
            <button type="button" className="button secondary" onClick={loadFromStorage} style={{ padding: '6px 10px' }}>
              Reload
            </button>
            <button type="button" className="button secondary" onClick={doResetDefaults} style={{ padding: '6px 10px' }}>
              Reset defaults
            </button>
            <button type="button" className="button" onClick={doSave} style={{ padding: '6px 10px' }}>
              {saveStatus === 'ok' ? 'Saved' : saveStatus === 'error' ? 'Save failed' : 'Save'}
            </button>
            <button type="button" className="button secondary" onClick={doTestNotification} style={{ padding: '6px 10px' }}>
              Write test log entry
            </button>
          </div>

          <div className="muted" style={{ fontSize: 12 }}>
            Schedule/run notifications are evaluated locally in the browser (no server push). Keep this tab open for reminders.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <div className="muted" style={{ fontSize: 12 }}>enabled</div>
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: 18, height: 18 }} />
            </label>

            <div style={{ display: 'grid', gap: 6 }}>
              <div className="muted" style={{ fontSize: 12 }}>Browser notifications</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={browserChannel} onChange={(e) => setBrowserChannel(e.target.checked)} style={{ width: 18, height: 18 }} />
                  <span className="muted" style={{ fontSize: 12 }}>Use Web Notifications API</span>
                </label>

                <button type="button" className="button secondary" onClick={doRequestPermission} style={{ padding: '6px 10px' }}>
                  Request permission
                </button>

                <span className="muted" style={{ fontSize: 12 }}>permission: {permission}</span>
              </div>
            </div>
          </div>

          {browserChannel && permission !== 'granted' ? (
            <div className="muted" style={{ fontSize: 12, color: 'var(--warning)' }}>
              Browser notifications are enabled, but permission is not granted (current={permission}).
            </div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={scheduleDue} onChange={(e) => setScheduleDue(e.target.checked)} style={{ width: 18, height: 18 }} />
              <span className="muted" style={{ fontSize: 12 }}>Notify when schedule is due (no run recorded yet)</span>
            </label>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={runRecorded} onChange={(e) => setRunRecorded(e.target.checked)} style={{ width: 18, height: 18 }} />
              <span className="muted" style={{ fontSize: 12 }}>Notify when a paper run is recorded</span>
            </label>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={skipMarketClosed} onChange={(e) => setSkipMarketClosed(e.target.checked)} style={{ width: 18, height: 18 }} />
              <span className="muted" style={{ fontSize: 12 }}>Notify when schedule is skipped (market closed)</span>
            </label>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={skipDataStale} onChange={(e) => setSkipDataStale(e.target.checked)} style={{ width: 18, height: 18 }} />
              <span className="muted" style={{ fontSize: 12 }}>Notify when schedule is skipped (price stale)</span>
            </label>
          </div>

          {view.total ? (
            <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(100, 116, 139, 0.10)', fontSize: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' as const }}>
                <div style={{ fontWeight: 800 }}>Notification log v0</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
                  <span className="muted" style={{ fontSize: 11 }}>
                    last {Math.min(view.total, 5)} / total {view.total}
                  </span>
                  <button type="button" className="button secondary" onClick={doCopyLog} style={{ padding: '4px 8px', fontSize: 11 }}>
                    {copyStatus === 'ok' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy JSON'}
                  </button>
                  <button type="button" className="button secondary" onClick={doClearLog} style={{ padding: '4px 8px', fontSize: 11 }}>
                    Clear
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                {view.items.map((e) => {
                  const at = safeParseIso(e.at);
                  const rec = safeParseIso(e.recordedAt);

                  const atText = at ? formatLocalCompact(at) : e.at;
                  const recText = rec ? formatLocalCompact(rec) : e.recordedAt;

                  return (
                    <div key={e.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'baseline' }}>
                      <span className="badge" style={{ padding: '2px 6px', fontSize: 10, borderColor: '#64748b', color: '#64748b', background: 'rgba(100, 116, 139, 0.10)' }}>
                        {atText}
                      </span>
                      <span style={{ fontWeight: 700 }}>{e.title}</span>
                      <span className="muted">({e.kind})</span>
                      <span className="muted" style={{ marginLeft: 6 }}>
                        {e.body}
                      </span>
                      <span className="muted" style={{ fontSize: 10 }} title={e.recordedAt}>
                        recorded {recText}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 12 }}>
              Notification log is empty.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
