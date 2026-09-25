import { useMemo, useState } from 'react';
import { planPgnImport, rowProblem, recordsToImport, summarise } from '../data/pgnImportPlan.js';
import { recordImportedGames } from '../data/gamesStore.js';
import { enqueueGameRow } from '../analysis/queue.js';

/*
 * PgnImportModal — paste or upload PGN, check who played, then archive.
 *
 * Built for Tuesday scoresheets and tournament exports. Names on a typed-up
 * scoresheet rarely match the roster exactly, so every game gets a player
 * picker per side, pre-filled only where pgnImport.js is confident. Nothing
 * is written until the coach presses Import; imported games are queued for
 * analysis straight away, like games from Chess.com and Lichess.
 */

const RESULT_LABEL = { '1-0': '1–0', '0-1': '0–1', '1/2-1/2': '½–½', '*': '*' };
const MAX_BYTES = 5 * 1024 * 1024;

export default function PgnImportModal({ players, existingIds, onClose }) {
  const [text, setText] = useState('');
  const [plan, setPlan] = useState(null);
  const [readError, setReadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const roster = useMemo(
    () => players.map((p) => ({ playerId: p.playerId, name: p.name })),
    [players],
  );

  const preview = (source) => {
    setReadError('');
    setResult(null);
    const next = planPgnImport(source, { roster, existingIds });
    setPlan(next);
  };

  const readFile = async (file) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setReadError('That file is over 5 MB. Split it and import the parts.');
      return;
    }
    try {
      const content = await file.text();
      setText(content);
      preview(content);
    } catch (error) {
      setReadError(error.message || 'That file could not be read.');
    }
  };

  const updateRow = (index, patch) => {
    setPlan((current) => ({
      ...current,
      rows: current.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  };

  const toWrite = useMemo(() => (plan ? recordsToImport(plan.rows, roster) : []), [plan, roster]);
  const summary = plan ? summarise(plan.rows, plan.errors) : null;

  const runImport = async () => {
    if (!toWrite.length) return;
    setBusy(true);
    setReadError('');
    try {
      const outcome = await recordImportedGames(toWrite);
      if (!outcome.ok) {
        setReadError(`Nothing was saved: ${outcome.error}`);
        return;
      }
      // Queue each one for analysis, the same as synced online games.
      for (const game of outcome.added) await enqueueGameRow(game.id);
      setResult({ added: outcome.added.length });
    } catch (error) {
      setReadError(error.message || 'The import could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const picker = (value, onChange, label, disabled = false) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} disabled={disabled}>
      <option value="">Not a club member</option>
      {players.map((p) => (
        <option key={p.playerId} value={p.playerId}>
          {p.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="promotion-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="promotion-dialog roster-import-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Import games from PGN"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-header">
          <h3>Import games from PGN</h3>
          <button type="button" className="link-button" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        {!plan && (
          <div className="import-intro">
            <p className="muted">
              Paste one or more games, or upload a .pgn file. You will see every game and who played
              it before anything is saved.
            </p>
            <textarea
              className="pgn-paste"
              rows={8}
              value={text}
              placeholder={'[Event "Tuesday Club"]\n[White "…"]\n[Black "…"]\n\n1. e4 e5 …'}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="import-actions">
              <input type="file" accept=".pgn,application/x-chess-pgn,text/plain" onChange={(e) => readFile(e.target.files?.[0])} />
              <button type="button" className="primary" disabled={!text.trim()} onClick={() => preview(text)}>
                Preview
              </button>
            </div>
          </div>
        )}

        {readError && <p className="form-error">{readError}</p>}

        {plan && !result && (
          <>
            <div className="import-summary">
              <span className="badge import-badge-new">{summary.ready} ready</span>
              {summary.archived > 0 && <span className="badge import-badge-update">{summary.archived} already archived</span>}
              {summary.blocked > 0 && <span className="badge import-badge-duplicate">{summary.blocked} need a fix</span>}
              {summary.errors > 0 && <span className="badge import-badge-error">{summary.errors} could not be read</span>}
            </div>

            {plan.errors.length > 0 && (
              <ul className="import-errors">
                {plan.errors.map((e) => (
                  <li key={e.index} className="form-error small">{e.message}</li>
                ))}
              </ul>
            )}

            {plan.rows.length > 0 && (
              <div className="table-scroll import-preview">
                <table className="roster-table">
                  <thead>
                    <tr>
                      <th />
                      <th>Date</th>
                      <th>White</th>
                      <th>Black</th>
                      <th>Result</th>
                      <th>Moves</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.rows.map((row, index) => {
                      const problem = rowProblem(row);
                      return (
                        <tr key={row.game.id} className={row.alreadyArchived ? 'import-row import-error' : 'import-row'}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label="Include this game"
                              checked={row.include && !row.alreadyArchived}
                              disabled={row.alreadyArchived}
                              onChange={(e) => updateRow(index, { include: e.target.checked })}
                            />
                          </td>
                          <td>
                            {row.needsDate && !row.alreadyArchived ? (
                              <input
                                type="date"
                                value={row.playedOn}
                                aria-label="Date played"
                                onChange={(e) => updateRow(index, { playedOn: e.target.value })}
                              />
                            ) : (
                              row.playedOn || '—'
                            )}
                          </td>
                          <td>
                            <div className="small muted">{row.game.whiteName}</div>
                            {picker(row.whitePlayerId, (v) => updateRow(index, { whitePlayerId: v }), 'White player', row.alreadyArchived)}
                          </td>
                          <td>
                            <div className="small muted">{row.game.blackName}</div>
                            {picker(row.blackPlayerId, (v) => updateRow(index, { blackPlayerId: v }), 'Black player', row.alreadyArchived)}
                          </td>
                          <td>{RESULT_LABEL[row.game.result] ?? row.game.result}</td>
                          <td>{Math.ceil(row.game.moveCount / 2)}</td>
                          <td className="import-reason">{problem || ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="import-actions">
              <button type="button" className="link-button" onClick={() => setPlan(null)} disabled={busy}>
                Back to the PGN
              </button>
              <button type="button" className="primary" disabled={!toWrite.length || busy} onClick={runImport}>
                {busy ? 'Importing…' : `Import ${toWrite.length} ${toWrite.length === 1 ? 'game' : 'games'}`}
              </button>
            </div>
          </>
        )}

        {result && (
          <div className="import-result">
            <p>
              Archived <strong>{result.added}</strong> {result.added === 1 ? 'game' : 'games'}. They are
              queued for analysis and will be analysed while the app is open.
            </p>
            <button type="button" className="primary" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
