import { screenName } from './names.js';
import { TIEBREAKS, formatPoints, tiebreakLabel } from '../../tournament/tiebreaks.js';
import { wallChartCode } from '../../tournament/results.js';
import { ratingSourceLabel } from '../../tournament/seeding.js';

/*
 * Standings with tiebreak columns, and the wall chart (crosstable).
 * Both take a computeStandings() result so the screen, the printout and the
 * tests all read the same numbers.
 */

const SHORT = Object.fromEntries(TIEBREAKS.map((t) => [t.id, t.short]));

export function StandingsTable({ standings, tournament, myPlayerId }) {
  const { rows, order, throughRound } = standings;
  if (!throughRound) {
    return <p className="ev-note">Standings appear once every board of round 1 has a result.</p>;
  }
  return (
    <>
      <p className="ev-note">
        After round {throughRound} of {tournament.rounds}. Ties are split by {order.map(tiebreakLabel).join(', then ')}.
      </p>
      <div className="table-scroll">
        <table className="roster-table ev-table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Player</th>
              <th className="num">Pts</th>
              {order.map((id) => (
                <th key={id} className="num" title={tiebreakLabel(id)}>
                  {SHORT[id]}
                </th>
              ))}
              <th className="num" title={`Seeding rating: ${ratingSourceLabel(tournament.ratingSource)}`}>
                Rating
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.playerId}
                className={`${row.playerId === myPlayerId ? 'is-mine' : ''} ${row.withdrawnFromRound ? 'is-out' : ''}`}
              >
                <td className="num">{row.tied ? `${row.rank}=` : row.rank}</td>
                <td className="ev-name">
                  {screenName(row)}
                  {row.withdrawnFromRound && <span className="hint-text"> · withdrew before round {row.withdrawnFromRound}</span>}
                </td>
                <td className="num ev-strong">{formatPoints(row.score)}</td>
                {order.map((id) => (
                  <td key={id} className="num">
                    {formatPoints(row.tiebreaks[id])}
                  </td>
                ))}
                <td className="num">{row.rating ?? <span className="ev-unrated">unr.</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ev-legend">
        {order.map((id) => `${SHORT[id]} = ${tiebreakLabel(id)}`).join(' · ')}. Ratings are{' '}
        {ratingSourceLabel(tournament.ratingSource)}, as entered. Byes and forfeits score their points but give no
        tiebreak credit; an opponent’s missed rounds count as draws (US Chess 34E).
      </p>
    </>
  );
}

export function WallChart({ standings, numbers, tournament, myPlayerId }) {
  const rounds = tournament.pairedRounds || 0;
  const numberOf = (id) => numbers.get(id) ?? '';
  const rows = [...standings.rows].sort((a, b) => numberOf(a.playerId) - numberOf(b.playerId));
  return (
    <>
      <div className="table-scroll">
        <table className="roster-table ev-table">
          <thead>
            <tr>
              <th className="num">No.</th>
              <th>Player</th>
              <th className="num">Rating</th>
              {Array.from({ length: rounds }, (_, i) => (
                <th key={i} className="num">
                  R{i + 1}
                </th>
              ))}
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.playerId} className={row.playerId === myPlayerId ? 'is-mine' : ''}>
                <td className="num">{numberOf(row.playerId)}</td>
                <td className="ev-name">{screenName(row)}</td>
                <td className="num">{row.rating ?? <span className="ev-unrated">unr.</span>}</td>
                {row.outcomes.map((o, i) => (
                  <td key={i} className="num mono">
                    {wallChartCode(o, numberOf)}
                  </td>
                ))}
                {Array.from({ length: Math.max(0, rounds - row.outcomes.length) }, (_, i) => (
                  <td key={`p${i}`} className="num mono" />
                ))}
                <td className="num ev-strong">{formatPoints(row.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ev-legend">
        W win, L loss, D draw, followed by the opponent’s number. X forfeit win, F forfeit loss, B full-point bye,
        H half-point bye, U unplayed, “vs 5” still playing number 5. Totals count every result entered so far.
      </p>
    </>
  );
}
