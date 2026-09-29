import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from '../engine/chess.js';
import Board from './Board.jsx';
import PromotionDialog from './PromotionDialog.jsx';
import PositionEditor from './PositionEditor.jsx';
import { matchMove, suggestMoves, splitMoveText, plyLabel } from '../data/sanMatch.js';
import {
  RESULTS,
  REASONS,
  TIME_CONTROL_PRESETS,
  blankSheet,
  buildScoresheetGame,
  checkSheet,
  describePly,
  fenFromPlacement,
  placementFromFen,
  plyToMove,
  validateSetup,
} from '../data/scoresheet.js';
import { recordImportedGames } from '../data/gamesStore.js';
import { enqueueGameRow } from '../analysis/queue.js';
import { withTimeout } from '../data/autoPolicy.js';
import '../styles/scoresheet.css';

const DRAFT_KEY = 'cc-scoresheet-draft-v1';
const OTHER_TC = '__other__';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/*
 * The half-typed sheet survives closing the dialog or a phone locking: five
 * minutes of copying handwriting is not something to lose to a stray tap.
 * Per-browser convenience only — nothing is saved to the archive until Save.
 */
const isBlank = (sheet) =>
  !sheet.segments.some((s) => s.tokens.length) &&
  !sheet.whiteId && !sheet.blackId && !sheet.whiteName && !sheet.blackName && !sheet.board;

function loadDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    const usable = draft && Array.isArray(draft.segments) && draft.segments.length && draft.segments.every((s) => Array.isArray(s.tokens));
    return usable && !isBlank(draft) ? draft : null;
  } catch {
    return null;
  }
}

function saveDraft(sheet) {
  try {
    if (isBlank(sheet)) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(sheet));
  } catch {
    /* storage can be blocked; the sheet still holds for this visit */
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nothing to clear */
  }
}

const cloneSegments = (segments) => segments.map((s) => ({ ...s, tokens: [...s.tokens] }));

/** Scoresheet rows: `[{ moveNumber, cells: [white|null, black|null] }]` from one segment's plies. */
function rowsFor(items) {
  const rows = [];
  for (const item of items) {
    const { moveNumber, color } = plyToMove(item.ply);
    let row = rows[rows.length - 1];
    if (!row || row.moveNumber !== moveNumber) {
      row = { moveNumber, cells: [null, null] };
      rows.push(row);
    }
    row.cells[color === 'w' ? 0 : 1] = item;
  }
  return rows;
}

/**
 * ScoresheetModal — type (or tap) a paper scoresheet into the archive.
 *
 * Built for a stack of tournament sheets on the Monday after: the tags
 * carry over to the next sheet, moves go in as fast as they can be typed
 * (a space ends a move; a pasted line of moves goes in whole), and every
 * move is checked against the position as it lands. When the sheet is
 * wrong — an illegal move, "Nd7" with two knights able to go there, a
 * promotion with no piece — the first bad ply is highlighted and the next
 * thing typed replaces it. Unreadable moves are marked as a gap and the
 * game continues from a position set up by hand (scoresheet.js explains
 * how such a game is stored and analysed).
 */
export default function ScoresheetModal({ players, games = [], onClose }) {
  const roster = useMemo(
    () => players.filter((p) => !p.deletedAt).map((p) => ({ playerId: p.playerId, name: p.name })),
    [players],
  );
  const existingIds = useMemo(() => new Set(games.map((g) => g.id)), [games]);
  // Offer event names already in the archive, so every game from one event
  // is spelled the same way — the event report groups on this text.
  const knownEvents = useMemo(
    () => [...new Set(games.map((g) => g.event).filter(Boolean))].slice(0, 30),
    [games],
  );

  const [restored] = useState(() => !!loadDraft());
  const [sheet, setSheet] = useState(() => loadDraft() || blankSheet(today()));
  const [selected, setSelected] = useState(null); // { segment, index } picked in the move list
  const [text, setText] = useState('');
  const [entryError, setEntryError] = useState(null); // { message, options }
  const [gap, setGap] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [orientation, setOrientation] = useState('w');
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!saved) saveDraft(sheet);
  }, [sheet, saved]);

  const checked = useMemo(() => checkSheet(sheet), [sheet]);
  const built = useMemo(() => buildScoresheetGame(sheet, { roster, checked }), [sheet, roster, checked]);
  const update = (patch) => setSheet((s) => ({ ...s, ...patch }));
  const editSegments = (fn) => setSheet((s) => ({ ...s, segments: fn(cloneSegments(s.segments)) }));

  // -- where the next move goes ----------------------------------------------
  // A ply picked in the list; else the first bad ply on the sheet (so typing
  // fixes it); else the end of the last segment.
  const target = useMemo(() => {
    if (selected) return { mode: 'replace', ...selected };
    const fe = checked.firstError;
    if (fe && fe.index < (sheet.segments[fe.segment]?.tokens.length ?? 0)) {
      return { mode: 'replace', segment: fe.segment, index: fe.index, auto: true };
    }
    const last = sheet.segments.length - 1;
    return { mode: 'append', segment: last, index: sheet.segments[last].tokens.length };
  }, [selected, checked, sheet.segments]);

  // Keep the ply being entered or fixed in view inside the list, without
  // scrolling the dialog itself (scrollIntoView would move both).
  useEffect(() => {
    const list = listRef.current;
    const here = list?.querySelector('.ss-target, .ss-cursor');
    if (!list || !here) return;
    const top = here.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + here.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, top - list.clientHeight / 2);
    }
  }, [sheet, target]);

  const targetSeg = checked.segments[target.segment];
  const targetMoves = targetSeg.replay.moves;
  const blocked = target.index > targetMoves.length; // a ply after an unfixed one
  const targetFen = target.index < targetMoves.length ? targetMoves[target.index].fenBefore : targetSeg.replay.fen;
  const boardGame = useMemo(() => new Chess(targetFen), [targetFen]);
  const legal = useMemo(() => boardGame.moves({ verbose: true }), [boardGame]);
  const suggestions = useMemo(() => suggestMoves(boardGame, text, { legal }), [boardGame, legal, text]);
  const targetLabel = plyLabel(boardGame.moveNumber, boardGame.turn);
  const lastMove = target.index > 0 ? targetMoves[target.index - 1] : null;
  const appendClosed = target.mode === 'append' && sheet.endsUnknown;
  const gameOver = target.mode === 'append' && targetSeg.replay.over;

  // -- entering moves -------------------------------------------------------
  const commitSan = (san) => {
    if (target.mode === 'replace') {
      editSegments((segs) => {
        segs[target.segment].tokens[target.index] = san;
        return segs;
      });
    } else {
      editSegments((segs) => {
        segs[target.segment].tokens.push(san);
        return segs;
      });
    }
    setSelected(null);
    setText('');
    setEntryError(null);
    inputRef.current?.focus();
  };

  const tryCommit = (raw) => {
    const found = matchMove(boardGame, raw, legal);
    if (found.ok) {
      commitSan(found.san);
      return true;
    }
    // "Nf" with exactly one way to finish it: accept the one legal completion.
    if (found.code === 'unreadable') {
      const only = suggestMoves(boardGame, raw, { legal });
      if (only.length === 1) {
        commitSan(only[0]);
        return true;
      }
    }
    setEntryError({ message: `${targetLabel} ${found.message}`, options: found.options || [] });
    return false;
  };

  const appendRaw = (tokens) => {
    editSegments((segs) => {
      segs[segs.length - 1].tokens.push(...tokens);
      return segs;
    });
    setSelected(null);
  };

  const onType = (value) => {
    setEntryError(null);
    if (!/\s/.test(value)) {
      setText(value);
      return;
    }
    const endsWithSpace = /\s$/.test(value);
    const { tokens, result } = splitMoveText(value);
    if (result && !sheet.result && result !== '*') update({ result });
    const complete = endsWithSpace ? tokens : tokens.slice(0, -1);
    const rest = endsWithSpace ? '' : tokens[tokens.length - 1] || '';
    if (!complete.length) {
      setText(rest);
      return;
    }
    if (complete.length === 1 || target.mode === 'replace') {
      if (!tryCommit(complete[0])) {
        setText(complete[0]);
        return;
      }
      setText([...complete.slice(1), rest].filter(Boolean).join(' '));
      return;
    }
    // Several whole moves at once — a paste. They go in as written, and the
    // sheet check below flags the first one that does not work.
    appendRaw(complete);
    setText(rest);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' || (event.key === 'Tab' && text.trim())) {
      event.preventDefault();
      if (text.trim() && tryCommit(text.trim())) setText('');
    } else if (event.key === 'Backspace' && !text && target.mode === 'append') {
      const tokens = sheet.segments[target.segment].tokens;
      if (tokens.length) {
        event.preventDefault();
        editSegments((segs) => {
          segs[target.segment].tokens.pop();
          return segs;
        });
      }
    } else if (event.key === 'Escape' && (selected || entryError)) {
      event.stopPropagation();
      setSelected(null);
      setEntryError(null);
    }
  };

  const onBoardMove = ({ from, to }) => {
    const options = legal.filter((m) => m.from === from && m.to === to);
    if (!options.length) return;
    if (options.some((m) => m.promotion)) {
      setPendingPromotion({ from, to, color: options[0].color });
      return;
    }
    commitSan(options[0].san);
  };

  const completePromotion = (type) => {
    const move = legal.find((m) => m.from === pendingPromotion.from && m.to === pendingPromotion.to && m.promotion === type);
    setPendingPromotion(null);
    if (move) commitSan(move.san);
  };

  const addPasted = () => {
    const { tokens, result } = splitMoveText(pasteText);
    if (result && result !== '*' && !sheet.result) update({ result });
    if (tokens.length) appendRaw(tokens);
    setPasteText('');
    setPasteOpen(false);
  };

  // -- repairing ------------------------------------------------------------
  const deletePly = () => {
    editSegments((segs) => {
      segs[target.segment].tokens.splice(target.index, 1);
      return segs;
    });
    setSelected(null);
    setEntryError(null);
  };

  const insertBefore = () => {
    editSegments((segs) => {
      segs[target.segment].tokens.splice(target.index, 0, '');
      return segs;
    });
    setSelected({ segment: target.segment, index: target.index });
    setEntryError(null);
    inputRef.current?.focus();
  };

  const openGap = () => {
    const known = Math.min(target.index, targetMoves.length);
    const lastFen = known < targetMoves.length ? targetMoves[known].fenBefore : targetSeg.replay.fen;
    const held = sheet.segments[target.segment].tokens.slice(known);
    const { squares, castling } = placementFromFen(lastFen);
    setGap({
      segment: target.segment,
      index: known,
      startPly: targetSeg.startPly + known,
      held,
      unknown: 2,
      mode: 'continue',
      squares,
      castling,
    });
    setEntryError(null);
  };

  const gapResumePly = gap ? gap.startPly + Math.max(1, gap.unknown || 1) : 0;
  const gapFen = useMemo(() => {
    if (!gap) return '';
    const { moveNumber, color } = plyToMove(gapResumePly);
    return fenFromPlacement(gap.squares, { turn: color, moveNumber, castling: gap.castling });
  }, [gap, gapResumePly]);
  const gapProblems = useMemo(() => (gapFen ? validateSetup(gapFen) : []), [gapFen]);
  const gapIsLast = gap && gap.segment === sheet.segments.length - 1;

  const applyGap = () => {
    const unknown = Math.max(1, gap.unknown || 1);
    if (gap.mode === 'end') {
      setSheet((s) => {
        const segs = cloneSegments(s.segments);
        segs[gap.segment].tokens = segs[gap.segment].tokens.slice(0, gap.index);
        return { ...s, segments: segs, endsUnknown: true };
      });
    } else {
      setSheet((s) => {
        const segs = cloneSegments(s.segments);
        segs[gap.segment].tokens = segs[gap.segment].tokens.slice(0, gap.index);
        segs.splice(gap.segment + 1, 0, { fen: gapFen, tokens: gap.held.slice(unknown) });
        return { ...s, segments: segs };
      });
    }
    setGap(null);
    setSelected(null);
  };

  const removeSegment = (k) => {
    // Its moves go back on the end of the segment before, rather than vanish.
    editSegments((segs) => {
      segs[k - 1].tokens.push(...segs[k].tokens);
      segs.splice(k, 1);
      return segs;
    });
    setSelected(null);
  };

  // -- saving ---------------------------------------------------------------
  const alreadyArchived = built.ok && existingIds.has(built.game.id);

  const save = async () => {
    setTried(true);
    setSaveError('');
    if (!built.ok || alreadyArchived) return;
    setBusy(true);
    try {
      const outcome = await withTimeout(recordImportedGames([built.game]), 60 * 1000, { label: 'Saving the game' });
      if (!outcome.ok) {
        setSaveError(`Not saved: ${outcome.error}`);
        return;
      }
      // Queue it like an imported PGN. A FEN start (after a gap) is analysed
      // from the set-up position: the analyser honours the FEN tag.
      for (const game of outcome.added) await enqueueGameRow(game.id);
      clearDraft();
      setSaved({ ...built, local: !!outcome.local, added: outcome.added.length });
    } catch (error) {
      setSaveError(error.message || 'Couldn’t save the game.');
    } finally {
      setBusy(false);
    }
  };

  const enterAnother = () => {
    // Same event, round, day and time control: the next sheet in the stack
    // is almost always from the same round.
    const next = {
      ...blankSheet(sheet.date),
      event: sheet.event,
      round: sheet.round,
      timeControl: sheet.timeControl,
    };
    setSheet(next);
    setSaved(null);
    setTried(false);
    setSelected(null);
    setText('');
    setGap(null);
  };

  const startOver = () => {
    if (!window.confirm('Clear this scoresheet and start again?')) return;
    clearDraft();
    setSheet(blankSheet(today()));
    setSelected(null);
    setText('');
    setGap(null);
    setTried(false);
  };

  const fieldError = (field) =>
    tried && !built.ok
      ? built.errors
          .filter((e) => e.field === field)
          .map((e) => e.message)
          .join(' ')
      : '';

  const tcIsPreset = !sheet.timeControl || TIME_CONTROL_PRESETS.includes(sheet.timeControl);
  const [tcOther, setTcOther] = useState(!tcIsPreset);

  const sideField = (label, idKey, nameKey) => (
    <div className="field ss-side">
      <span>{label}</span>
      <select
        value={sheet[idKey]}
        aria-label={`${label} player`}
        onChange={(e) => update({ [idKey]: e.target.value })}
      >
        <option value="">Outside player…</option>
        {roster.map((p) => (
          <option key={p.playerId} value={p.playerId}>
            {p.name}
          </option>
        ))}
      </select>
      {!sheet[idKey] && (
        <input
          type="text"
          value={sheet[nameKey]}
          maxLength={60}
          placeholder="Name or initials, e.g. J.D."
          aria-label={`${label} name`}
          onChange={(e) => update({ [nameKey]: e.target.value })}
        />
      )}
      {fieldError(nameKey) && <em className="ss-error">{fieldError(nameKey)}</em>}
    </div>
  );

  // -- rendering the move list ------------------------------------------------
  const firstError = checked.firstError;
  const renderSegment = (seg, k) => {
    const items = sheet.segments[k].tokens.map((token, i) => {
      const ok = i < seg.replay.moves.length;
      const isError = firstError && firstError.segment === k && firstError.index === i;
      return {
        i,
        ply: seg.startPly + i,
        text: ok ? seg.replay.moves[i].san : token || '?',
        state: ok ? 'ok' : isError ? 'error' : 'pending',
      };
    });
    const showCursor = target.mode === 'append' && target.segment === k && !sheet.endsUnknown && !gap;
    if (showCursor) items.push({ i: items.length, ply: seg.startPly + items.length, text: '…', state: 'cursor' });
    const rows = rowsFor(items);
    const isTarget = (item) => target.mode === 'replace' && target.segment === k && target.index === item.i;

    return (
      <div className="ss-segment" key={k}>
        {k > 0 && (
          <div className="ss-gap-row">
            <span>
              Unreadable: {describePly(checked.segments[k - 1].endPly)}
              {seg.startPly - 1 > checked.segments[k - 1].endPly ? ` to ${describePly(seg.startPly - 1)}` : ''}. Picks up
              from a set-up position.
            </span>
            <button type="button" className="link-button" onClick={() => removeSegment(k)}>
              Remove gap
            </button>
          </div>
        )}
        <ol className="ss-moves" aria-label={k ? 'Moves after the gap' : 'Moves'}>
          {rows.map((row) => (
            <li key={row.moveNumber} className="ss-row">
              <span className="ss-num mono">{row.moveNumber}.</span>
              {row.cells.map((item, c) =>
                item ? (
                  item.state === 'cursor' ? (
                    <span key={c} className="ss-ply ss-cursor" aria-hidden="true">
                      …
                    </span>
                  ) : (
                    <button
                      key={c}
                      type="button"
                      className={`ss-ply ss-ply-${item.state}${isTarget(item) ? ' ss-target' : ''}`}
                      aria-label={`${plyLabel(row.moveNumber, c ? 'b' : 'w', item.text)}${item.state === 'error' ? ' (needs fixing)' : ''}`}
                      onClick={() => {
                        setSelected(isTarget(item) && !target.auto ? null : { segment: k, index: item.i });
                        setEntryError(null);
                        setGap(null);
                        inputRef.current?.focus();
                      }}
                    >
                      {item.text}
                    </button>
                  )
                ) : (
                  <span key={c} className="ss-ply ss-empty" />
                ),
              )}
            </li>
          ))}
        </ol>
        {k === checked.segments.length - 1 && sheet.endsUnknown && (
          <div className="ss-gap-row">
            <span>The rest of the game can’t be read.</span>
            <button type="button" className="link-button" onClick={() => update({ endsUnknown: false })}>
              Undo
            </button>
          </div>
        )}
      </div>
    );
  };

  // The sheet's first problem, with its one-tap fixes only while that ply is
  // the one being edited — a fix must never land on a different ply.
  const onErrorPly = firstError && target.segment === firstError.segment && target.index === firstError.index;
  const shownError =
    entryError ||
    (firstError && !gap ? { message: firstError.message, options: onErrorPly ? firstError.options || [] : [] } : null);

  return (
    <div className="promotion-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="promotion-dialog ss-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Enter a scoresheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-header">
          <h3>Enter a scoresheet</h3>
          <button type="button" className="link-button" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        {saved ? (
          <div className="ss-saved" role="status">
            <p>
              Saved <strong>{saved.game.whiteName}</strong> vs <strong>{saved.game.blackName}</strong>
              {saved.game.event ? ` (${saved.game.event}${saved.game.round ? `, round ${saved.game.round}` : ''})` : ''}.
            </p>
            {saved.note && (
              <p className="muted">
                Note on the game: {saved.note}. The analysis covers the {saved.analysedPlies} known half-moves
                from {saved.analysedFrom}.
              </p>
            )}
            <p className="muted">
              {saved.local
                ? 'Saved in this browser only. No server is connected, so it won’t be analysed.'
                : 'It’ll be analysed shortly.'}
            </p>
            <div className="import-actions">
              <button type="button" className="primary" onClick={enterAnother}>
                Enter another from this event
              </button>
              <button type="button" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            {restored && (
              <p className="ss-restored muted">
                Picked up your unsaved sheet.{' '}
                <button type="button" className="link-button" onClick={startOver}>
                  Start over
                </button>
              </p>
            )}

            <section className="ss-tags" aria-label="Game details">
              {sideField('White', 'whiteId', 'whiteName')}
              {sideField('Black', 'blackId', 'blackName')}
              <label className="field ss-wide">
                <span>Event</span>
                <input
                  type="text"
                  list="ss-events"
                  maxLength={100}
                  value={sheet.event}
                  placeholder="e.g. DISD District Championship"
                  onChange={(e) => update({ event: e.target.value })}
                />
                <datalist id="ss-events">
                  {knownEvents.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                {fieldError('event') && <em className="ss-error">{fieldError('event')}</em>}
              </label>
              <label className="field">
                <span>Round</span>
                <input type="text" inputMode="decimal" maxLength={12} value={sheet.round} onChange={(e) => update({ round: e.target.value })} />
                {fieldError('round') && <em className="ss-error">{fieldError('round')}</em>}
              </label>
              <label className="field">
                <span>Board</span>
                <input type="text" inputMode="numeric" maxLength={3} value={sheet.board} onChange={(e) => update({ board: e.target.value })} />
                {fieldError('board') && <em className="ss-error">{fieldError('board')}</em>}
              </label>
              <label className="field">
                <span>Time control</span>
                <select
                  value={tcOther ? OTHER_TC : sheet.timeControl}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTcOther(v === OTHER_TC);
                    if (v !== OTHER_TC) update({ timeControl: v });
                  }}
                >
                  {TIME_CONTROL_PRESETS.map((tc) => (
                    <option key={tc} value={tc}>
                      {tc}
                    </option>
                  ))}
                  <option value="">Not recorded</option>
                  <option value={OTHER_TC}>Other…</option>
                </select>
                {tcOther && (
                  <input
                    type="text"
                    value={sheet.timeControl}
                    placeholder="e.g. G/40;d5"
                    aria-label="Other time control"
                    onChange={(e) => update({ timeControl: e.target.value })}
                  />
                )}
                {fieldError('timeControl') && <em className="ss-error">{fieldError('timeControl')}</em>}
              </label>
              <label className="field">
                <span>Date</span>
                <input type="date" value={sheet.date} max={today()} onChange={(e) => update({ date: e.target.value })} />
                {fieldError('date') && <em className="ss-error">{fieldError('date')}</em>}
              </label>
              <label className="field">
                <span>Result</span>
                <select value={sheet.result} onChange={(e) => update({ result: e.target.value })}>
                  <option value="">Choose…</option>
                  {RESULTS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {fieldError('result') && <em className="ss-error">{fieldError('result')}</em>}
              </label>
              <label className="field">
                <span>How it ended</span>
                <select value={sheet.reason} onChange={(e) => update({ reason: e.target.value })}>
                  <option value="">Not recorded</option>
                  {REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="ss-entry" aria-label="Moves">
              <div className="ss-board">
                {gap && gap.mode === 'continue' ? (
                  <PositionEditor
                    squares={gap.squares}
                    fen={gapFen}
                    orientation={orientation}
                    onChange={(squares) => setGap((g) => ({ ...g, squares }))}
                  />
                ) : (
                  <Board
                    game={boardGame}
                    orientation={orientation}
                    onMove={onBoardMove}
                    lastMove={lastMove}
                    interactive={!blocked && !appendClosed && !gap}
                  />
                )}
                <button type="button" className="link-button ss-flip" onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}>
                  Flip board
                </button>
              </div>

              <div className="ss-side-panel">
                <div className="ss-list" ref={listRef}>
                  {checked.segments.map(renderSegment)}
                </div>

                {gap ? (
                  <div className="ss-gap-panel">
                    <h4>Moves that can’t be read, from {describePly(gap.startPly)}</h4>
                    <label className="ss-radio">
                      <input
                        type="radio"
                        name="ss-gap-mode"
                        checked={gap.mode === 'continue'}
                        onChange={() => setGap((g) => ({ ...g, mode: 'continue' }))}
                      />
                      The game goes on. Set up the position after the gap
                    </label>
                    <label className="ss-radio">
                      <input
                        type="radio"
                        name="ss-gap-mode"
                        checked={gap.mode === 'end'}
                        disabled={!gapIsLast}
                        onChange={() => setGap((g) => ({ ...g, mode: 'end' }))}
                      />
                      Nothing after this is readable
                    </label>
                    {gap.mode === 'continue' ? (
                      <>
                        <label className="field ss-unknown">
                          <span>How many half-moves are missing?</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            max="60"
                            value={gap.unknown}
                            onChange={(e) => setGap((g) => ({ ...g, unknown: e.target.value === '' ? '' : Number(e.target.value) }))}
                          />
                        </label>
                        <p className="muted small">
                          Missing: {describePly(gap.startPly)}
                          {Math.max(1, gap.unknown || 1) > 1 ? ` to ${describePly(gapResumePly - 1)}` : ''}. The board shows the
                          last known position. Move the pieces that moved in the gap so it shows the position
                          before {describePly(gapResumePly)}.
                        </p>
                        {gap.held.length > Math.max(1, gap.unknown || 1) && (
                          <p className="muted small">
                            Moves after the gap: {gap.held.slice(Math.max(1, gap.unknown || 1)).join(' ')}
                          </p>
                        )}
                        {gapProblems.length > 0 && (
                          <ul className="ss-problems">
                            {gapProblems.map((p) => (
                              <li key={p} className="ss-error">
                                {p}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <p className="muted small">
                        The game is saved up to {describePly(gap.startPly)} with a note that the rest can’t be read.
                        {gap.held.length > 0 && ` The ${gap.held.length} move(s) typed after it will be dropped.`}
                      </p>
                    )}
                    <div className="import-actions">
                      <button type="button" onClick={() => setGap(null)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="primary"
                        disabled={gap.mode === 'continue' && gapProblems.length > 0}
                        onClick={applyGap}
                      >
                        {gap.mode === 'continue' ? 'Continue from this position' : 'Mark the rest unreadable'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="ss-input-block">
                    {shownError && (
                      <div className="ss-flag" role="alert">
                        <span>{shownError.message}</span>
                        {shownError.options?.length > 0 && (
                          <span className="ss-chips">
                            {shownError.options.map((san) => (
                              <button key={san} type="button" className="ss-chip" onClick={() => commitSan(san)}>
                                {san}
                              </button>
                            ))}
                          </span>
                        )}
                      </div>
                    )}

                    <label className="field ss-move-field">
                      <span>
                        {blocked
                          ? 'Fix the move in red first'
                          : appendClosed
                            ? 'The rest is marked unreadable'
                            : target.mode === 'replace'
                              ? `Replace ${targetLabel} ${sheet.segments[target.segment].tokens[target.index] || '(empty)'}`
                              : gameOver
                                ? `The game is over (${gameOver.reason})`
                                : `Next move: ${targetLabel}`}
                      </span>
                      <input
                        ref={inputRef}
                        type="text"
                        className="ss-move-input mono"
                        value={text}
                        autoComplete="off"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        disabled={blocked || appendClosed}
                        placeholder="Type a move, then space (e4, Nf3, O-O)"
                        aria-describedby="ss-move-help"
                        onChange={(e) => onType(e.target.value)}
                        onKeyDown={onKeyDown}
                      />
                    </label>
                    {suggestions.length > 0 && (
                      <div className="ss-chips" aria-label="Legal moves that match">
                        {suggestions.map((san) => (
                          <button key={san} type="button" className="ss-chip" onClick={() => commitSan(san)}>
                            {san}
                          </button>
                        ))}
                      </div>
                    )}
                    <p id="ss-move-help" className="hint-text ss-help">
                      Press space or Enter after each move, or play them on the board. Tap a move in the list to
                      change it.
                    </p>

                    <div className="ss-actions">
                      {target.mode === 'replace' ? (
                        <>
                          <button type="button" onClick={deletePly}>
                            Delete this move
                          </button>
                          <button type="button" onClick={insertBefore}>
                            Insert a move before
                          </button>
                          <button type="button" onClick={openGap}>
                            Unreadable from here…
                          </button>
                          {selected && (
                            <button type="button" className="link-button" onClick={() => setSelected(null)}>
                              Back to the end
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={!sheet.segments[target.segment].tokens.length}
                            onClick={() =>
                              editSegments((segs) => {
                                segs[target.segment].tokens.pop();
                                return segs;
                              })
                            }
                          >
                            Undo last move
                          </button>
                          <button type="button" disabled={appendClosed || !!gameOver} onClick={openGap}>
                            Next moves unreadable…
                          </button>
                          <button type="button" onClick={() => setPasteOpen((v) => !v)}>
                            {pasteOpen ? 'Hide paste box' : 'Paste moves'}
                          </button>
                        </>
                      )}
                    </div>

                    {pasteOpen && (
                      <div className="ss-paste">
                        <textarea
                          className="pgn-paste"
                          rows={4}
                          value={pasteText}
                          placeholder="1. e4 e5 2. Nf3 Nc6 3. Bb5 …"
                          aria-label="Moves to paste"
                          onChange={(e) => setPasteText(e.target.value)}
                        />
                        <button type="button" className="primary" disabled={!pasteText.trim()} onClick={addPasted}>
                          Add these moves
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="ss-save" aria-label="Save">
              {built.ok && built.note && (
                <p className="muted small">
                  This will be saved with a note: {built.note}. The analysis will cover the{' '}
                  {built.analysedPlies} known half-moves from {built.analysedFrom}.
                </p>
              )}
              {alreadyArchived && <p className="ss-error">This game is already in the archive.</p>}
              {tried && !built.ok && (
                <ul className="ss-problems">
                  {built.errors
                    .filter((e) => e.field === 'moves')
                    .map((e) => (
                      <li key={e.message} className="ss-error">
                        {e.message}
                      </li>
                    ))}
                  {built.errors.some((e) => e.field !== 'moves') && (
                    <li className="ss-error">Some game details need fixing. See the red notes above.</li>
                  )}
                </ul>
              )}
              {saveError && <p className="ss-error">{saveError}</p>}
              <div className="import-actions">
                <button type="button" className="link-button" onClick={startOver} disabled={busy}>
                  Start over
                </button>
                <button type="button" className="primary" onClick={save} disabled={busy || alreadyArchived} aria-busy={busy}>
                  {busy ? 'Saving…' : 'Save game'}
                </button>
              </div>
            </section>
          </>
        )}

        {pendingPromotion && (
          <PromotionDialog
            color={pendingPromotion.color}
            onChoose={completePromotion}
            onCancel={() => setPendingPromotion(null)}
          />
        )}
      </div>
    </div>
  );
}
