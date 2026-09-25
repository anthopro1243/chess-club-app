import { useMemo, useRef, useState } from 'react';
import { buildImportPlan, importableRows, highestPlayerNumber } from '../data/rosterImport.js';
import { applyRosterImport, getIssuedPlayerIds } from '../data/rosterStore.js';
import { getPrivateRows } from '../data/playerPrivateStore.js';

/*
 * RosterImportModal — read a Google Form CSV, show what it would do, write
 * only once the coach says so.
 *
 * The preview is the feature. A bulk import that writes on upload is a bulk
 * mistake waiting to happen, so every row is classified first and nothing
 * reaches the roster until the coach has seen the counts and pressed the
 * button. Rows that would be a judgement call — same name, different student
 * ID — are shown but never selected by default.
 */

const KIND_LABEL = {
  new: 'New',
  update: 'Update',
  duplicate: 'Check',
  error: 'Error',
};

export default function RosterImportModal({ players, onClose, onImported }) {
  const [plan, setPlan] = useState(null);
  const [fileName, setFileName] = useState('');
  const [readError, setReadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  // Rows the coach has explicitly opted into, by line number. Only ever holds
  // 'duplicate' rows — new and update rows are in by default.
  const [acceptedDuplicates, setAcceptedDuplicates] = useState(() => new Set());
  const fileInput = useRef(null);

  const readFile = async (file) => {
    if (!file) return;
    setReadError('');
    setResult(null);
    setAcceptedDuplicates(new Set());
    setFileName(file.name);
    try {
      const text = await file.text();
      // Retired members are off the roster but their ids are still taken, so
      // they go to the planner as id-only stubs. Without them the first new
      // member would be handed a retired id and overwrite that row.
      const visible = new Set(players.map((p) => p.playerId));
      const retired = getIssuedPlayerIds()
        .filter((id) => !visible.has(id))
        .map((playerId) => ({ playerId, name: '' }));
      setPlan(
        buildImportPlan({
          csvText: text,
          existingPlayers: [...players, ...retired],
          existingPrivate: getPrivateRows(),
        }),
      );
    } catch (error) {
      setPlan(null);
      setReadError(error.message || 'That file could not be read.');
    }
  };

  const toggleDuplicate = (line) => {
    setAcceptedDuplicates((current) => {
      const next = new Set(current);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
  };

  // A duplicate the coach ticked is imported as a brand-new member: they
  // decided it is a different person who happens to share a name. Its id is
  // allocated above everything taken — retired ids and the ids this plan
  // already reserved included — in file order, so it is stable across renders.
  const toWrite = useMemo(() => {
    if (!plan) return [];
    const base = importableRows(plan.rows);
    const taken = [
      ...getIssuedPlayerIds(),
      ...plan.rows.map((row) => row.playerId).filter(Boolean),
    ].map((playerId) => ({ playerId }));
    let next = highestPlayerNumber(taken) + 1;
    const accepted = plan.rows
      .filter((row) => row.kind === 'duplicate' && acceptedDuplicates.has(row.line))
      .map((row) => {
        const playerId = `CC-${String(next).padStart(3, '0')}`;
        next += 1;
        return { ...row, kind: 'new', playerId };
      });
    return [...base, ...accepted];
  }, [plan, acceptedDuplicates]);

  // What the ID column shows: the id a row will be written under, if any. A
  // "Check" row carries the id of the member it resembles, which is not where
  // it would go — so it shows blank until ticked, then its newly allocated id.
  const writeIdByLine = useMemo(() => new Map(toWrite.map((row) => [row.line, row.playerId])), [toWrite]);

  const runImport = async () => {
    if (!toWrite.length) return;
    setBusy(true);
    setReadError('');
    try {
      const outcome = await applyRosterImport(toWrite);
      setResult(outcome);
      onImported?.(outcome);
    } catch (error) {
      setReadError(error.message || 'The import could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const summary = plan?.summary;

  return (
    <div className="promotion-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="promotion-dialog roster-import-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Import roster from CSV"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-header">
          <h3>Import roster from CSV</h3>
          <button type="button" className="link-button" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        {!plan && (
          <div className="import-intro">
            <p className="muted">
              Upload the CSV export of the club signup form. Nothing is written until you have seen
              the preview and pressed Import.
            </p>
            <p className="muted small">
              Expected columns: Timestamp, Email Address, Full name, Student ID, Grade, tournaments,
              Experience, Chess.com username, Lichess username, US Chess ID, goal, parent/guardian
              email. Header spelling and capitalisation do not have to match exactly.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => readFile(e.target.files?.[0])}
            />
          </div>
        )}

        {readError && <p className="form-error">{readError}</p>}

        {plan?.missingHeaders?.length > 0 && (
          <p className="form-error">
            {fileName} has no {plan.missingHeaders.includes('name') ? '"Full name"' : ''}
            {plan.missingHeaders.length === 2 ? ' or ' : ''}
            {plan.missingHeaders.includes('studentId') ? '"Student ID"' : ''} column, so nothing can
            be matched. Check you exported the responses sheet.
          </p>
        )}

        {plan && !plan.missingHeaders.length && !result && (
          <>
            <div className="import-summary">
              <span className="badge">{fileName}</span>
              <span className="badge">{summary.new} new</span>
              <span className="badge">{summary.update} update</span>
              {summary.duplicate > 0 && <span className="badge import-badge-duplicate">{summary.duplicate} to check</span>}
              {summary.error > 0 && <span className="badge import-badge-error">{summary.error} error</span>}
            </div>

            <div className="table-scroll import-preview">
              <table className="roster-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Result</th>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Grade</th>
                    <th>Track</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((row) => (
                    <tr key={row.line} className={`import-row import-${row.kind}`}>
                      <td>{row.line}</td>
                      <td>
                        <span className={`badge import-badge-${row.kind}`}>{KIND_LABEL[row.kind]}</span>
                      </td>
                      <td>{writeIdByLine.get(row.line) || '—'}</td>
                      <td>{row.name || row.raw.name || '—'}</td>
                      <td>{row.player.grade || '—'}</td>
                      <td>{row.kind === 'error' ? '—' : row.player.commitment}</td>
                      <td className="import-reason">
                        {row.kind === 'duplicate' ? (
                          <label className="import-accept">
                            <input
                              type="checkbox"
                              checked={acceptedDuplicates.has(row.line)}
                              onChange={() => toggleDuplicate(row.line)}
                            />
                            <span>{row.reason} Tick to add as a separate member.</span>
                          </label>
                        ) : (
                          row.reason || ''
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="import-actions">
              <button type="button" className="link-button" onClick={() => setPlan(null)}>
                Choose a different file
              </button>
              <button type="button" className="primary" disabled={!toWrite.length || busy} onClick={runImport}>
                {busy ? 'Importing…' : `Import ${toWrite.length} ${toWrite.length === 1 ? 'member' : 'members'}`}
              </button>
            </div>
          </>
        )}

        {result && (
          <div className="import-result">
            <p>
              Imported <strong>{result.created}</strong> new {result.created === 1 ? 'member' : 'members'} and
              updated <strong>{result.updated}</strong>.
            </p>
            {summary.error > 0 && (
              <p className="muted small">
                {summary.error} {summary.error === 1 ? 'row was' : 'rows were'} skipped. Fix them in the
                sheet and import the file again — anything already added will be matched on its student
                ID and updated, not duplicated.
              </p>
            )}
            <button type="button" className="primary" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
