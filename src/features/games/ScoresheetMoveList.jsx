import { plyLabel } from './sanMatch.js';
import { describePly, plyToMove } from './scoresheet.js';

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
 * The typed moves, laid out like a paper scoresheet, one block per readable
 * stretch. Tapping a ply hands it to `onPick` to be fixed.
 */
export default function ScoresheetMoveList({ sheet, checked, target, gap, listRef, onPick, onRemoveGap, onReopenEnd }) {
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
            <button type="button" className="btn btn-sm" onClick={() => onRemoveGap(k)}>
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
                      onClick={() => onPick(k, item.i, isTarget(item))}
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
            <button type="button" className="btn btn-sm" onClick={onReopenEnd}>
              Undo
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="ss-list" ref={listRef}>
      {checked.segments.map(renderSegment)}
    </div>
  );
}
