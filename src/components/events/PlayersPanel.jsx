import { useState } from 'react';
import EntrantPicker from './EntrantPicker.jsx';
import ReasonPicker, { WITHDRAW_REASONS, LATE_REASONS } from './ReasonPicker.jsx';
import { screenName } from './names.js';
import { setEntrants, addLateEntrant, withdrawEntrant, reinstateEntrant } from '../../data/tournamentStore.js';
import { ratingSourceLabel } from '../../tournament/seeding.js';

/*
 * PlayersPanel — the field. Before round 1 the coach edits it freely; after
 * that, changes are late entries and withdrawals (F077), each logged with a
 * reason, because they change who everyone else can be paired with.
 */
export default function PlayersPanel({ tournament, entrants, players, numbers, isCoach, actor, flash }) {
  const draft = (tournament.pairedRounds || 0) === 0;
  const open = tournament.status !== 'finished';
  const nextRound = (tournament.pairedRounds || 0) + 1;
  const swiss = tournament.format === 'swiss';
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState(() => new Set(entrants.map((e) => e.playerId)));
  const [acting, setActing] = useState(null); // playerId being withdrawn
  const [reason, setReason] = useState(WITHDRAW_REASONS[0]);
  const [lateId, setLateId] = useState('');
  const [lateByes, setLateByes] = useState(false);
  const [lateReason, setLateReason] = useState(LATE_REASONS[0]);

  const entered = new Set(entrants.map((e) => e.playerId));
  const notEntered = players.filter((p) => !entered.has(p.playerId));
  const sorted = [...entrants].sort((a, b) => (numbers.get(a.playerId) ?? 0) - (numbers.get(b.playerId) ?? 0));

  const status = (e) => {
    if (e.withdrawnFromRound) return `Withdrawn from round ${e.withdrawnFromRound}`;
    if (e.lateEntryRound) return `Joined in round ${e.lateEntryRound}`;
    return 'Playing';
  };

  return (
    <div>
      {isCoach && draft && open && (
        <div className="ev-actions ev-swap-toggle">
          <button
            type="button"
            className={`ev-button ${editing ? 'is-on' : ''}`}
            onClick={() => {
              setPicked(new Set(entrants.map((e) => e.playerId)));
              setEditing((v) => !v);
            }}
          >
            {editing ? 'Cancel' : 'Change players'}
          </button>
        </div>
      )}

      {editing ? (
        <div>
          <EntrantPicker players={players} source={tournament.ratingSource} picked={picked} onChange={setPicked} />
          <div className="ev-actions ev-subpanel">
            <button
              type="button"
              className="ev-button primary"
              onClick={() => {
                setEntrants(tournament.id, players.filter((p) => picked.has(p.playerId)), { by: actor });
                setEditing(false);
                flash('Players updated.');
              }}
            >
              Save {picked.size} players
            </button>
          </div>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="roster-table ev-table">
            <thead>
              <tr>
                <th className="num">No.</th>
                <th>Player</th>
                <th className="num" title={ratingSourceLabel(tournament.ratingSource)}>
                  Rating
                </th>
                <th>Status</th>
                {isCoach && !draft && open && swiss && <th />}
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.playerId} className={e.withdrawnFromRound ? 'is-out' : ''}>
                  <td className="num">{numbers.get(e.playerId)}</td>
                  <td>{screenName(e)}</td>
                  <td className="num">{e.rating ?? <span className="ev-unrated">unrated</span>}</td>
                  <td>{status(e)}</td>
                  {isCoach && !draft && open && swiss && (
                    <td>
                      {e.withdrawnFromRound ? (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => {
                            reinstateEntrant(tournament.id, e.playerId, { by: actor, reason: 'Back in the event' });
                            flash(`${screenName(e)} is back in from round ${nextRound}.`);
                          }}
                        >
                          Reinstate
                        </button>
                      ) : acting === e.playerId ? (
                        <span className="ev-inline-form">
                          <ReasonPicker value={reason} onChange={setReason} options={WITHDRAW_REASONS} />
                          <button
                            type="button"
                            className="ev-button danger"
                            onClick={() => {
                              withdrawEntrant(tournament.id, e.playerId, { fromRound: nextRound, reason, by: actor });
                              setActing(null);
                              flash(`${screenName(e)} will not be paired from round ${nextRound}.`);
                            }}
                          >
                            Withdraw from round {nextRound}
                          </button>
                          <button type="button" className="link-button" onClick={() => setActing(null)}>
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button type="button" className="link-button danger" onClick={() => setActing(e.playerId)}>
                          Withdraw…
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="ev-legend">
        Seeding ratings are {ratingSourceLabel(tournament.ratingSource)}, snapshotted when each player was entered.
        A withdrawal takes effect from the next round to be paired; results already played stand.
      </p>

      {isCoach && !draft && open && swiss && nextRound <= tournament.rounds && (
        <div className="ev-subpanel">
          <h3 className="ev-subhead">Late entry for round {nextRound}</h3>
          {notEntered.length === 0 ? (
            <p className="ev-note">Everyone on the roster is already entered.</p>
          ) : (
            <form
              className="ev-inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                const player = notEntered.find((p) => p.playerId === lateId);
                if (!player) return;
                const res = addLateEntrant(tournament.id, player, {
                  round: nextRound,
                  halfByes: lateByes,
                  reason: lateReason,
                  by: actor,
                });
                flash(res.ok ? `${player.name} joins in round ${nextRound}.` : res.message);
                if (res.ok) {
                  setLateId('');
                  setLateByes(false);
                }
              }}
            >
              <label className="field">
                <span>Player</span>
                <select value={lateId} onChange={(e) => setLateId(e.target.value)}>
                  <option value="">Choose…</option>
                  {notEntered.map((p) => (
                    <option key={p.playerId} value={p.playerId}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <ReasonPicker value={lateReason} onChange={setLateReason} options={LATE_REASONS} />
              <label className="field checkbox-field">
                <input type="checkbox" checked={lateByes} onChange={(e) => setLateByes(e.target.checked)} />
                <span>
                  Score the {nextRound - 1} missed round{nextRound - 1 === 1 ? '' : 's'} as half-point bye
                  {nextRound - 1 === 1 ? '' : 's'}
                </span>
              </label>
              <button type="submit" className="ev-button" disabled={!lateId}>
                Add late entry
              </button>
            </form>
          )}
        </div>
      )}
      {isCoach && !swiss && !draft && (
        <p className="ev-note">A round robin keeps its field once it starts. Enter a forfeit for a player who leaves.</p>
      )}
    </div>
  );
}
