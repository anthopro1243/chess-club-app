import { useMemo, useState } from 'react';
import { createStore, useStore } from '../data/store.js';
import { usePlayers } from '../data/rosterStore.js';
import { usePlatformRatings, useRatingOverrides } from '../data/ratingStore.js';
import { projectTeam, whatIf, countingPlayers, rankAmong } from '../tournament/teamScore.js';
import { proposeOrder, checkLineup } from '../tournament/boardOrder.js';
import InfoTooltip from './InfoTooltip.jsx';
import '../styles/team-tools.css';

/*
 * TeamToolsPanel — the two team formats DISD might use (research F081, F082).
 *
 * Dallas ISD hasn't published whether the Oct 24 event counts each school's
 * top N individual scores or plays team-vs-team matches, so the coach gets
 * both: a live team-score projector and a board-order checker.
 *
 * Everything here is kept in this browser only (localStorage). It is meant to
 * run on the coach's phone in a school gym with bad Wi-Fi (research F086), and
 * none of it needs to be shared: the district's wall chart is the record.
 */

const state = createStore('cc-team-tools-v1', {
  squad: [],
  n: 4,
  totalRounds: 5,
  roundsPlayed: 0,
  scores: {},
  nextRound: {},
  rivals: '',
  target: '',
  boards: 4,
  tolerance: 0,
  source: 'uscf',
  lineup: null,
});

const SOURCES = [
  { key: 'uscf', label: 'US Chess' },
  { key: 'coach', label: 'Coach-set rating' },
  { key: 'chesscom:rapid', label: 'Chess.com rapid' },
  { key: 'lichess:rapid', label: 'Lichess rapid' },
];

const patch = (fields) => state.set((s) => ({ ...s, ...fields }));

export default function TeamToolsPanel() {
  const s = useStore(state);
  const players = usePlayers();
  const platformRatings = usePlatformRatings();
  const overrides = useRatingOverrides();
  // Open when there's no squad yet; after that it's the coach's choice, so
  // ticking the first box doesn't snap the list shut.
  const [squadOpen, setSquadOpen] = useState(() => state.get().squad.length === 0);

  // Ratings from ONE source, so board order compares like with like.
  const ratingFor = useMemo(() => {
    return (player) => {
      if (s.source === 'uscf') return player.ratings?.uscf ?? null;
      if (s.source === 'coach') return overrides.find((o) => o.playerId === player.playerId)?.clubRating ?? null;
      const [platform, timeControl] = s.source.split(':');
      return platformRatings.find(
        (r) => r.playerId === player.playerId && r.platform === platform && r.timeControl === timeControl,
      )?.rating ?? null;
    };
  }, [s.source, platformRatings, overrides]);

  const squadPlayers = players.filter((p) => s.squad.includes(p.playerId));
  const scored = squadPlayers.map((p) => ({ id: p.playerId, name: p.name, score: Number(s.scores[p.playerId]) || 0 }));
  // A score of 3 means at least 3 rounds have been played, whatever the box says.
  const roundsPlayed = Math.max(s.roundsPlayed, Math.ceil(Math.max(0, ...scored.map((p) => p.score))));
  const projection = projectTeam(scored, {
    n: s.n,
    roundsPlayed,
    totalRounds: s.totalRounds,
    target: s.target === '' ? null : Number(s.target),
  });
  const counting = new Set(countingPlayers(scored, s.n));
  const hypothetical = whatIf(scored, s.nextRound, s.n);
  const rivals = s.rivals.split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite);
  const rank = rivals.length ? rankAmong(projection.now, rivals) : null;

  const rated = squadPlayers.map((p) => ({ id: p.playerId, name: p.name, rating: ratingFor(p) }));
  const proposal = proposeOrder(rated, { boards: s.boards });
  const lineup = (s.lineup || proposal.lineup.map((p) => p.id))
    .map((id) => rated.find((p) => p.id === id))
    .filter(Boolean);
  const check = checkLineup(lineup, { tolerance: Number(s.tolerance) || 0 });

  const toggleSquad = (id) =>
    patch({ squad: s.squad.includes(id) ? s.squad.filter((x) => x !== id) : [...s.squad, id], lineup: null });
  const move = (index, delta) => {
    const ids = lineup.map((p) => p.id);
    const to = index + delta;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    patch({ lineup: ids });
  };

  return (
    <section className="panel team-tools">
      <div className="panel-header">
        <h2>
          Team tools
          <InfoTooltip>
            Dallas ISD hasn&rsquo;t said how Oct 24 is scored, so both formats are here. Top-N: the
            school&rsquo;s best 3 or 4 individual scores are added up. Team matches: the strongest
            player sits on board 1, in rating order. Saved on this device only, so it works without
            Wi-Fi.
          </InfoTooltip>
        </h2>
      </div>

      <details open={squadOpen} onToggle={(e) => setSquadOpen(e.currentTarget.open)}>
        <summary>Squad ({s.squad.length} selected)</summary>
        {players.length === 0 ? (
          <p className="hint-text">No members on the roster yet. Import the signup form on the Roster page.</p>
        ) : (
          <ul className="team-squad">
            {players.map((p) => (
              <li key={p.playerId}>
                <label>
                  <input type="checkbox" checked={s.squad.includes(p.playerId)} onChange={() => toggleSquad(p.playerId)} />
                  <span>{p.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </details>

      {s.squad.length > 0 && (
        <div className="team-grid">
          <div className="team-card">
            <h3>Top-N team score</h3>
            <div className="team-controls">
              <label className="field">
                <span>Scores that count</span>
                <select value={s.n} onChange={(e) => patch({ n: Number(e.target.value) })}>
                  <option value={3}>Top 3</option>
                  <option value={4}>Top 4</option>
                </select>
              </label>
              <label className="field">
                <span>Rounds played / total</span>
                <span className="team-pair">
                  <input type="number" min="0" max={s.totalRounds} value={roundsPlayed}
                    onChange={(e) => patch({ roundsPlayed: Math.max(0, Number(e.target.value) || 0) })} />
                  <input type="number" min="1" max="12" value={s.totalRounds}
                    onChange={(e) => patch({ totalRounds: Math.max(1, Number(e.target.value) || 1) })} />
                </span>
              </label>
            </div>
            <div className="table-scroll">
            <table className="roster-table team-table">
              <thead>
                <tr><th>Player</th><th>Score</th><th>Next round?</th></tr>
              </thead>
              <tbody>
                {scored.map((p) => (
                  <tr key={p.id} className={counting.has(p.id) ? 'counting' : ''}>
                    <td>{p.name}{counting.has(p.id) && <span className="badge">counts</span>}</td>
                    <td>
                      <input type="number" step="0.5" min="0" max={s.totalRounds} value={s.scores[p.id] ?? ''}
                        aria-label={`${p.name} score`}
                        onChange={(e) => patch({ scores: { ...s.scores, [p.id]: e.target.value } })} />
                    </td>
                    <td>
                      <select value={s.nextRound[p.id] ?? ''} aria-label={`${p.name} next round`}
                        onChange={(e) => patch({ nextRound: { ...s.nextRound, [p.id]: e.target.value } })}>
                        <option value="">—</option>
                        <option value="1">win</option>
                        <option value="0.5">draw</option>
                        <option value="0">loss</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <dl className="team-summary">
              <div><dt>Team score now</dt><dd className="mono">{projection.now}</dd></div>
              <div><dt>Best possible</dt><dd className="mono">{projection.ceiling}</dd></div>
              <div><dt>With the what-ifs</dt><dd className="mono">{hypothetical.score}</dd></div>
              {rank && <div><dt>Rank among entered teams</dt><dd className="mono">{rank.rank}{rank.tied ? ' (tied)' : ''}</dd></div>}
            </dl>
            <label className="field">
              <span>Other schools&rsquo; team scores from the wall chart (optional)</span>
              <input value={s.rivals} placeholder="e.g. 11, 9.5, 8" onChange={(e) => patch({ rivals: e.target.value })} />
            </label>
            <label className="field">
              <span>Target team score (optional)</span>
              <input type="number" step="0.5" value={s.target} onChange={(e) => patch({ target: e.target.value })} />
            </label>
            {projection.needed != null && (
              <p className="hint-text">
                {projection.needed === 0
                  ? 'Target reached.'
                  : projection.reachable
                    ? `${projection.needed} more points from the counting players reaches the target.`
                    : 'The target is out of reach with the rounds left.'}
              </p>
            )}
          </div>

          <div className="team-card">
            <h3>Board order (team matches)</h3>
            <div className="team-controls">
              <label className="field">
                <span>Rating source</span>
                <select value={s.source} onChange={(e) => patch({ source: e.target.value, lineup: null })}>
                  {SOURCES.map((src) => <option key={src.key} value={src.key}>{src.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Boards</span>
                <input type="number" min="1" max="8" value={s.boards}
                  onChange={(e) => patch({ boards: Math.max(1, Number(e.target.value) || 1), lineup: null })} />
              </label>
              <label className="field">
                <span>Tolerance (points)</span>
                <input type="number" min="0" step="25" value={s.tolerance}
                  onChange={(e) => patch({ tolerance: e.target.value })} />
              </label>
            </div>
            <ol className="team-lineup">
              {lineup.map((p, i) => (
                <li key={p.id}>
                  <span className="team-board">Board {i + 1}</span>
                  <span className="team-name">{p.name}</span>
                  <span className="mono">{p.rating ?? 'unrated'}</span>
                  <span className="team-move">
                    <button type="button" aria-label={`Move ${p.name} up`} onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                    <button type="button" aria-label={`Move ${p.name} down`} onClick={() => move(i, 1)} disabled={i === lineup.length - 1}>↓</button>
                  </span>
                </li>
              ))}
            </ol>
            {proposal.alternates.length > 0 && (
              <p className="hint-text">Alternates: {proposal.alternates.map((p) => p.name).join(', ')}</p>
            )}
            {check.ok ? (
              <p className="team-ok">This lineup is in legal rating order.</p>
            ) : (
              <ul className="team-violations">
                {check.violations.map((v) => <li key={`${v.upperBoard}-${v.lowerBoard}-${v.kind}`}>{v.message}</li>)}
              </ul>
            )}
            {s.lineup && (
              <button type="button" className="link-button" onClick={() => patch({ lineup: null })}>
                Reset to rating order
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
