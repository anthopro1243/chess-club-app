import { useEffect, useState } from 'react';
import { useStore } from '../data/store.js';
import { useAnalysisActivity } from '../analysis/useAnalysisQueue.js';
import { autoSyncStatus } from '../data/useAutoSync.js';

/*
 * BackgroundActivity — a small, quiet note in the corner saying what the app
 * is doing on its own: analysing a game, syncing an account. It exists so
 * background work never looks like nothing is happening, and it stays out of
 * the way: nothing shows while idle, a finished sync fades after a few
 * seconds, and a failed sync can be dismissed.
 */
const DONE_VISIBLE_MS = 6000;

export default function BackgroundActivity() {
  const analysis = useAnalysisActivity();
  const sync = useStore(autoSyncStatus);
  const [hiddenSync, setHiddenSync] = useState(null);

  // Let a finished or failed sync note go away on its own.
  useEffect(() => {
    if (sync.state !== 'done') return undefined;
    const timer = setTimeout(() => setHiddenSync(sync), DONE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [sync]);

  const lines = [];
  if (analysis.current) {
    const { done, total } = analysis.progress || {};
    const pct = total ? Math.round((done / total) * 100) : null;
    const queued = Math.max(0, (analysis.counts?.pending ?? 0));
    lines.push({
      key: 'analysis',
      text: `Analysing a game${pct != null ? ` — ${pct}%` : '…'}${queued ? ` · ${queued} queued` : ''}`,
      busy: true,
    });
  }
  if (sync !== hiddenSync) {
    if (sync.state === 'syncing') lines.push({ key: 'sync', text: `Syncing ${sync.label}…`, busy: true });
    if (sync.state === 'done' && sync.imported > 0) {
      lines.push({ key: 'sync', text: `Synced ${sync.imported} new ${sync.imported === 1 ? 'game' : 'games'}` });
    }
    if (sync.state === 'error') {
      lines.push({
        key: 'sync',
        text: `${sync.label} sync didn't finish — it will try again later.`,
        title: sync.error,
        dismiss: () => setHiddenSync(sync),
      });
    }
  }

  if (!lines.length) return null;
  return (
    <div className="background-activity" role="status" aria-live="polite">
      {lines.map((line) => (
        <div key={line.key} className="background-activity-line" title={line.title}>
          {line.busy && <span className="activity-dot" aria-hidden="true" />}
          <span>{line.text}</span>
          {line.dismiss && (
            <button type="button" className="link-button" onClick={line.dismiss} aria-label="Dismiss">
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
