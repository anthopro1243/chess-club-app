import { printName } from './names.js';
import { roundState, shortDate } from '../../tournament/eventOps.js';
import { RESULT_LABEL, BYE_LABEL, wallChartCode } from '../../tournament/results.js';
import { TIEBREAKS, formatPoints, tiebreakLabel } from '../../tournament/tiebreaks.js';
import { ratingSourceLabel } from '../../tournament/seeding.js';

/*
 * PrintSheet — the paper versions for the meeting-room wall (F079): large
 * type, black on white, one page for 15 boards. Hidden on screen; the print
 * stylesheet (events-swiss.css) shows only this while the Events page is
 * printing. Every name goes through printName() — see names.js for why.
 */

const SHORT = Object.fromEntries(TIEBREAKS.map((t) => [t.id, t.short]));

export default function PrintSheet({ mode, tournament, entrants, pairings, standings, wallStandings, numbers, playersById, round }) {
  if (!mode) return null;
  const byId = new Map(entrants.map((e) => [e.playerId, e]));
  const name = (id) => (id ? printName(byId.get(id) || { playerId: id }, playersById.get(id) || null) : '');
  const heading = `${tournament.name}`;
  const sub = [shortDate(tournament.startsOn), tournament.timeControl, `${tournament.rounds} rounds`].filter(Boolean).join(' · ');

  if (mode === 'pairings') {
    const state = roundState(pairings, round);
    return (
      <section className="ev-print pairings" aria-hidden="true">
        <h1>
          {heading}: round {round}
        </h1>
        <p className="ev-print-sub">{sub}. Find your board, sit with your colour, shake hands, start the clock.</p>
        <table>
          <thead>
            <tr>
              <th>Bd</th>
              <th>White</th>
              <th>Result</th>
              <th>Black</th>
            </tr>
          </thead>
          <tbody>
            {state.games.map((g) => (
              <tr key={g.id}>
                <td className="ev-print-board">{g.board}</td>
                <td>{name(g.white)}</td>
                <td className="ev-print-result">{g.result ? RESULT_LABEL[g.result] : ''}</td>
                <td>{name(g.black)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {state.byes.length > 0 && (
          <p className="ev-print-foot">
            {state.byes
              .map((b) => `${name(b.white)}: ${tournament.format === 'round-robin' && b.byeType === 'zero' ? 'sits out' : BYE_LABEL[b.byeType]}`)
              .join(' · ')}
          </p>
        )}
      </section>
    );
  }

  if (mode === 'standings') {
    const { rows, order, throughRound } = standings;
    return (
      <section className="ev-print standings" aria-hidden="true">
        <h1>{heading}: standings</h1>
        <p className="ev-print-sub">
          {sub}. After round {throughRound}. Tiebreaks: {order.map(tiebreakLabel).join(', ')}.
        </p>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Pts</th>
              {order.map((id) => (
                <th key={id}>{SHORT[id]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.playerId}>
                <td className="num">{row.tied ? `${row.rank}=` : row.rank}</td>
                <td>{name(row.playerId)}</td>
                <td className="num">{formatPoints(row.score)}</td>
                {order.map((id) => (
                  <td key={id} className="num">
                    {formatPoints(row.tiebreaks[id])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  const paired = tournament.pairedRounds || 0;
  const numberOf = (id) => numbers.get(id) ?? '';
  const rows = [...wallStandings.rows].sort((a, b) => numberOf(a.playerId) - numberOf(b.playerId));
  return (
    <section className="ev-print wallchart" aria-hidden="true">
      <h1>{heading}: wall chart</h1>
      <p className="ev-print-sub">
        {sub}. Seeded by {ratingSourceLabel(tournament.ratingSource)}. W win, L loss, D draw + opponent number; B/H
        byes, X/F forfeits, U unplayed.
      </p>
      <table>
        <thead>
          <tr>
            <th>No.</th>
            <th>Player</th>
            <th>Rtg</th>
            {Array.from({ length: tournament.rounds }, (_, i) => (
              <th key={i}>R{i + 1}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.playerId}>
              <td className="num">{numberOf(row.playerId)}</td>
              <td>{name(row.playerId)}</td>
              <td className="num">{row.rating ?? ''}</td>
              {Array.from({ length: tournament.rounds }, (_, i) => (
                <td key={i}>{i < paired ? wallChartCode(row.outcomes[i], numberOf) : ''}</td>
              ))}
              <td className="num">{formatPoints(row.score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
