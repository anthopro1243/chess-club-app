import { useMemo, useState } from 'react';
import ReasonPicker, { SWAP_REASONS, BYE_REASONS } from './ReasonPicker.jsx';
import { screenName } from './names.js';
import { swapSeats, setResult, linkGame, requestBye, cancelBye } from '../../data/tournamentStore.js';
import { roundState, roundIssues, archiveCandidates, shortDate } from '../../tournament/eventOps.js';
import { isActive } from '../../tournament/swiss.js';
import { RESULT_LABEL, BYE_LABEL } from '../../tournament/results.js';

/*
 * PairingsPanel — one round's boards: results in one tap each, the two-tap
 * swap, and the archive-game link.
 *
 * Results are entered where the boards are, because that is how a coach
 * collects them: walking the room, board by board. A tap on the result that
 * is already set does nothing, so a stray tap cannot clear a board; clearing
 * is in the "More" menu with the forfeits.
 */

const QUICK = [
  { code: '1-0', label: '1–0' },
  { code: '1/2-1/2', label: '½' },
  { code: '0-1', label: '0–1' },
];

const MORE = [
  { code: '1F-0F', label: 'White wins, forfeit' },
  { code: '0F-1F', label: 'Black wins, forfeit' },
  { code: '0F-0F', label: 'Double forfeit' },
];

export default function PairingsPanel({
  tournament,
  entrants,
  pairings,
  games,
  isCoach,
  myPlayerId,
  actor,
  round,
  onRound,
  onNavigate,
  flash,
}) {
  const [swapping, setSwapping] = useState(false);
  const [reason, setReason] = useState(SWAP_REASONS[0]);
  const [picked, setPicked] = useState(null);

  const byId = useMemo(() => new Map(entrants.map((e) => [e.playerId, e])), [entrants]);
  const nameOf = (id) => (id ? screenName(byId.get(id) || { playerId: id }) : '—');
  const ratingOf = (id) => byId.get(id)?.rating ?? null;

  const paired = tournament.pairedRounds || 0;
  const shown = Math.min(Math.max(round || paired, 1), Math.max(paired, 1));
  const state = roundState(pairings, shown);
  const latest = shown === paired;
  const canSwap = isCoach && latest && tournament.status !== 'finished' && state.pending > 0;
  const issues = paired ? roundIssues(pairings, shown, nameOf) : [];

  const tapSeat = (pairingId, side) => {
    const seat = { pairingId, side };
    if (!picked) {
      setPicked(seat);
      return;
    }
    if (picked.pairingId === pairingId && picked.side === side) {
      setPicked(null);
      return;
    }
    const res = swapSeats(tournament.id, picked, seat, { reason: reason || 'Coach decision', by: actor, nameOf });
    setPicked(null);
    flash(res.ok ? 'Swapped. Logged with the reason.' : res.message);
  };

  const renderSeat = (row, side) => {
    const id = row[side];
    const rating = ratingOf(id);
    const content = (
      <>
        <span className={`ev-colour ${side === 'white' ? 'w' : 'b'}`} role="img" aria-label={side === 'white' ? 'White' : 'Black'} />
        <span className="ev-seat-name">{nameOf(id)}</span>
        <span className={`ev-rating ${rating == null ? 'ev-unrated' : ''}`}>{rating ?? 'unr.'}</span>
      </>
    );
    if (swapping && canSwap && !row.result) {
      const isPicked = picked?.pairingId === row.id && picked?.side === side;
      return (
        <button
          type="button"
          className={`ev-seat ${side} ${isPicked ? 'is-picked' : ''}`}
          aria-pressed={isPicked}
          onClick={() => tapSeat(row.id, side)}
        >
          {content}
        </button>
      );
    }
    return <div className={`ev-seat ${side}`}>{content}</div>;
  };

  const renderResult = (row) => {
    if (!isCoach) {
      return <span className="ev-result-text">{row.result ? RESULT_LABEL[row.result] : 'playing'}</span>;
    }
    const enter = (code) => {
      if (code === row.result) return;
      const res = setResult(row.id, code, { by: actor });
      if (!res.ok) flash(res.message);
    };
    const forfeit = MORE.some((m) => m.code === row.result) ? row.result : '';
    return (
      <>
        {QUICK.map((q) => (
          <button
            key={q.code}
            type="button"
            className={`ev-result-btn ${row.result === q.code ? 'is-set' : ''}`}
            aria-pressed={row.result === q.code}
            aria-label={`Board ${row.board}: ${RESULT_LABEL[q.code]}`}
            onClick={() => enter(q.code)}
          >
            {q.label}
          </button>
        ))}
        <select
          value={forfeit}
          aria-label={`Board ${row.board}: more results`}
          onChange={(e) => {
            const value = e.target.value;
            if (value === 'clear') enter(null);
            else if (value) enter(value);
          }}
        >
          <option value="">More…</option>
          {MORE.map((m) => (
            <option key={m.code} value={m.code}>
              {m.label}
            </option>
          ))}
          {row.result && <option value="clear">Clear result</option>}
        </select>
      </>
    );
  };

  const renderGameLink = (row) => {
    if (row.gameId) {
      return (
        <>
          <button type="button" className="ev-button" onClick={() => onNavigate('games', { game: row.gameId })}>
            Open game
          </button>
          {isCoach && (
            <button type="button" className="link-button" onClick={() => linkGame(row.id, null)}>
              Unlink
            </button>
          )}
        </>
      );
    }
    if (!isCoach) return null;
    const candidates = archiveCandidates(games, row, tournament.startsOn);
    if (!candidates.length) return null;
    return (
      <select value="" aria-label={`Board ${row.board}: link an archived game`} onChange={(e) => e.target.value && linkGame(row.id, e.target.value)}>
        <option value="">Link game ({candidates.length})…</option>
        {candidates.map((g) => (
          <option key={g.id} value={g.id}>
            {shortDate(String(g.playedAt).slice(0, 10)) || String(g.playedAt).slice(0, 10)} · {g.result} · {g.moveCount || 0} moves
          </option>
        ))}
      </select>
    );
  };

  // Bye requests for the next unpaired round (Swiss only: a round robin's
  // sit-outs are fixed by the schedule).
  const nextRound = paired + 1;
  const canRequest = isCoach && tournament.format === 'swiss' && tournament.status !== 'finished' && nextRound <= tournament.rounds;
  const requests = pairings.filter((p) => p.round === nextRound && p.byeType);
  const requestable = entrants.filter(
    (e) => isActive(e, nextRound) && !requests.some((r) => r.white === e.playerId),
  );
  const [byePlayer, setByePlayer] = useState('');
  const [byeType, setByeType] = useState('half');
  const [byeReason, setByeReason] = useState(BYE_REASONS[0]);

  const myBoard = state.games.find((g) => g.white === myPlayerId || g.black === myPlayerId);

  return (
    <div>
      {paired > 0 && (
        <div className="ev-rounds" role="tablist" aria-label="Round">
          {Array.from({ length: paired }, (_, i) => i + 1).map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={r === shown}
              className={`ev-round-btn ${r === shown ? 'is-active' : ''}`}
              onClick={() => {
                setPicked(null);
                onRound(r);
              }}
            >
              Round {r}
            </button>
          ))}
        </div>
      )}

      {paired === 0 ? (
        <p className="ev-note">
          No round is paired yet.{isCoach ? ' Check the players, then press “Pair round 1”.' : ' The coach pairs each round on the night.'}
        </p>
      ) : (
        <>
          {myBoard && (
            <p className="ev-note">
              You are on <strong>board {myBoard.board}</strong> with{' '}
              {myBoard.white === myPlayerId ? 'White' : 'Black'} against{' '}
              {nameOf(myBoard.white === myPlayerId ? myBoard.black : myBoard.white)}.
            </p>
          )}

          {canSwap && (
            <div className="ev-actions ev-swap-toggle">
              <button
                type="button"
                className={`ev-button ${swapping ? 'is-on' : ''}`}
                aria-pressed={swapping}
                onClick={() => {
                  setSwapping((v) => !v);
                  setPicked(null);
                }}
              >
                {swapping ? 'Done swapping' : 'Swap seats'}
              </button>
              <span className="ev-note">
                {state.pending} of {state.games.length} boards still playing
              </span>
            </div>
          )}

          {swapping && canSwap && (
            <div className="ev-swapbar">
              <ReasonPicker value={reason} onChange={setReason} options={SWAP_REASONS} label="Reason for the next swap" />
              <p className="ev-note ev-swap-help">
                {picked
                  ? `${nameOf(pairings.find((p) => p.id === picked.pairingId)?.[picked.side])} picked. Tap the seat to swap with.`
                  : 'Tap one player, then another: they change places. Both seats on one board swap colours. Boards with a result are locked.'}
              </p>
            </div>
          )}

          {issues.length > 0 && (
            <div role="alert">
              {issues.map((issue) => (
                <p key={`${issue.type}-${issue.players.join()}`} className="ev-warn">
                  Check: {issue.message}
                </p>
              ))}
            </div>
          )}

          <ol className="ev-boards" aria-label={`Round ${shown} boards`}>
            {state.games.map((row) => (
              <li
                key={row.id}
                className={`ev-board ${row.white === myPlayerId || row.black === myPlayerId ? 'is-mine' : ''}`}
              >
                <span className="ev-board-num" aria-label={`Board ${row.board}`}>
                  {row.board}
                </span>
                {renderSeat(row, 'white')}
                <div className="ev-result">
                  {renderResult(row)}
                </div>
                {renderSeat(row, 'black')}
                <div className="ev-game">
                  {renderGameLink(row)}
                </div>
              </li>
            ))}
          </ol>

          {isCoach &&
            !state.games.some((g) => g.gameId || archiveCandidates(games, g, tournament.startsOn).length) && (
              <p className="ev-legend">
                Once a game is in the archive (logged or imported on the Games page) with the same White and Black,
                its board offers a link to it here.
              </p>
            )}

          {state.byes.length > 0 && (
            <ul className="ev-byes">
              {state.byes.map((row) => (
                <li key={row.id}>
                  {swapping && canSwap && row.byeType === 'full' ? (
                    <button
                      type="button"
                      className={`ev-seat ${picked?.pairingId === row.id ? 'is-picked' : ''}`}
                      onClick={() => tapSeat(row.id, 'white')}
                    >
                      <span className="ev-seat-name">{nameOf(row.white)}</span>
                    </button>
                  ) : (
                    <strong>{nameOf(row.white)}</strong>
                  )}
                  <span className="badge">
                    {tournament.format === 'round-robin' && row.byeType === 'zero' ? 'Sits out this round' : BYE_LABEL[row.byeType]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {(canRequest || requests.length > 0) && nextRound <= tournament.rounds && (
        <div className="ev-subpanel">
          <h3 className="ev-subhead">Byes asked for in round {nextRound}</h3>
          {requests.length === 0 ? (
            <p className="ev-note">None yet. A player who will miss the next round can ask for a half-point bye now.</p>
          ) : (
            <ul className="ev-byes">
              {requests.map((row) => (
                <li key={row.id}>
                  <strong>{nameOf(row.white)}</strong>
                  <span className="badge">{BYE_LABEL[row.byeType]}</span>
                  {canRequest && (
                    <button
                      type="button"
                      className="link-button danger"
                      onClick={() => cancelBye(tournament.id, row.id, { by: actor, reason: 'Request withdrawn' })}
                    >
                      Cancel
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canRequest && requestable.length > 0 && (
            <form
              className="ev-inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!byePlayer) return;
                const res = requestBye(tournament.id, byePlayer, { round: nextRound, type: byeType, reason: byeReason, by: actor });
                flash(res.ok ? 'Bye recorded.' : res.message);
                if (res.ok) setByePlayer('');
              }}
            >
              <label className="field">
                <span>Player</span>
                <select value={byePlayer} onChange={(e) => setByePlayer(e.target.value)}>
                  <option value="">Choose…</option>
                  {requestable.map((e) => (
                    <option key={e.playerId} value={e.playerId}>
                      {screenName(e)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Bye</span>
                <select value={byeType} onChange={(e) => setByeType(e.target.value)}>
                  <option value="half">Half point (asked in advance)</option>
                  <option value="zero">Zero points (missing it)</option>
                </select>
              </label>
              <ReasonPicker value={byeReason} onChange={setByeReason} options={BYE_REASONS} />
              <button type="submit" className="ev-button" disabled={!byePlayer}>
                Add bye
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
