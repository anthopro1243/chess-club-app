import { useMemo } from 'react';
import { usePlayers, useCloudStatus } from '../data/rosterStore.js';
import InfoTooltip from '../components/InfoTooltip.jsx';
import { useSkillScores } from '../data/analysisStore.js';
import { clubProfile, weakestCategories } from '../analysis/skillModel.js';
import { CATEGORY_KEYS } from '../analysis/scoring.js';
import { usePlatformRatings, useRatingOverrides } from '../data/ratingStore.js';
import { resolveRating, rankForLeaderboard } from '../analysis/ratings.js';

/** DashboardPage — the club at a glance: who's here, and how they rank. */
export default function DashboardPage({ onNavigate }) {
  const players = usePlayers();
  const cloud = useCloudStatus();
  // The club profile now prefers real engine measurements over an untouched
  // manual rubric, and leaves a category blank rather than averaging "no data"
  // as zero - which is what made every category read a flat 2.5.
  const skillRows = useSkillScores();
  const skillsByPlayer = useMemo(() => {
    const out = {};
    for (const row of skillRows) {
      (out[row.playerId] ||= {})[row.category] = row;
    }
    return out;
  }, [skillRows]);
  const profile = useMemo(() => clubProfile(players, skillsByPlayer), [players, skillsByPlayer]);
  const weakest = useMemo(() => weakestCategories(profile, 3), [profile]);
  const rated = players.filter((p) => p.ratings.uscf != null);
  const averageRating = rated.length
    ? Math.round(rated.reduce((sum, p) => sum + p.ratings.uscf, 0) / rated.length)
    : null;

  /*
   * The leaderboard used to sort on players.club_rating: a single Glicko-2
   * number computed by pouring bullet, blitz, rapid and daily games into one
   * pool, cold-starting at RD 350. It produced swings of -195 in a single game
   * and an unlabelled "1177" that meant nothing in particular.
   *
   * The sort key is now explicit and documented: a coach override wins,
   * otherwise an official USCF/FIDE number, otherwise a platform rating -
   * which is shown WITH its platform and time control, and is flagged as not
   * comparable across platforms, so it is listed separately rather than
   * ranked against a different scale.
   */
  const platformRatings = usePlatformRatings();
  const overrides = useRatingOverrides();
  const { ranked, unranked } = useMemo(() => {
    const entries = players.map((player) => ({
      player,
      playerId: player.playerId,
      override: overrides.find((o) => o.playerId === player.playerId) ?? null,
      official: player.ratings?.uscf != null
        ? { platform: 'uscf', rating: player.ratings.uscf }
        : null,
      platformRatings: platformRatings
        .filter((r) => r.playerId === player.playerId)
        .map((r) => ({ platform: r.platform, timeControl: r.timeControl, rating: r.rating })),
    }));
    return rankForLeaderboard(entries);
  }, [players, platformRatings, overrides]);
  const leaderboard = ranked;

  return (
    <div className="dashboard">
      <section className="hero">
        <div>
          <h1>Chess Club</h1>
          <p>
            Play a game, keep the roster current, and let the training plan follow the data
            instead of a hunch.
          </p>
          <div className="hero-actions">
            <button type="button" className="primary" onClick={() => onNavigate('play')}>
              Play a game
            </button>
            <button type="button" onClick={() => onNavigate('roster')}>
              View roster
            </button>
          </div>
        </div>
      </section>

      <section className="stat-row">
        <Stat label="Players" value={players.length} />
        <Stat label="Rated players" value={rated.length} />
        <Stat label="Average USCF" value={averageRating ?? '—'} />
        <Stat
          label="Competitive track"
          value={players.filter((p) => p.commitment === 'Competitive').length}
        />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>
            Club leaderboard
            <InfoTooltip>
              Sorted by the club rating: a coach override if one is set, otherwise an official
              USCF rating, otherwise the player&rsquo;s platform rating — always shown with which
              platform and time control it came from. Ratings from different platforms are never
              blended, because no official conversion between them exists.
            </InfoTooltip>
          </h2>
        </div>

        {leaderboard.length === 0 ? (
          <p className="hint-text">
            {cloud.configured
              ? 'No one has joined yet. Sign in up top to create a profile.'
              : 'Add players on the Roster page to start tracking ratings.'}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="roster-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Name</th>
                  <th>Rating</th>
                  <th>Puzzles solved</th>
                  <th>Track</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, index) => {
                  const player = entry.player;
                  return (
                    <tr key={player.playerId}>
                      <td className="mono">{index + 1}</td>
                      <td>{player.name}</td>
                      <td className="mono">
                        {entry.resolved.rating}
                        <span className="hint-text"> {entry.resolved.label}</span>
                      </td>
                      <td className="mono">{player.puzzleStats?.solvedIds?.length || 0}</td>
                      <td>
                        <span className={`track ${player.commitment.toLowerCase()}`}>
                          {player.commitment}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {unranked.length > 0 && (
              <div className="unranked-note">
                <p className="muted small">
                  Not ranked, because these numbers are not on the same scale as the ones above.
                  There is no official conversion between Lichess, Chess.com and USCF, so they are
                  listed rather than sorted against each other.
                </p>
                <ul className="muted small">
                  {unranked.map((entry) => (
                    <li key={entry.playerId}>
                      {entry.player.name} —{' '}
                      {entry.resolved.rating != null
                        ? `${entry.resolved.rating} (${entry.resolved.label})`
                        : 'unrated'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="two-column">
        <section className="panel">
          <div className="panel-header">
            <h2>Club skill profile</h2>
          </div>
          <div className="rubric">
            {CATEGORY_KEYS.map((key) => {
              const entry = profile[key];
              const score = entry?.rubricAverage;
              return (
                <div className="rubric-row" key={key}>
                  <span className="rubric-label">
                    {entry?.label ?? key}
                    {entry?.engineBacked > 0 && <em className="rubric-suggestion">from games</em>}
                  </span>
                  <span className="rubric-bar">
                    <span
                      className={`rubric-fill ${score == null ? '' : score <= 3 ? 'low' : score <= 6 ? 'mid' : 'high'}`}
                      style={{ width: `${(score ?? 0) * 10}%` }}
                    />
                  </span>
                  <span className="rubric-score mono">
                    {score == null ? '—' : score.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="muted small">
            Measured from analysed games where there is enough evidence; a dash means not enough
            data yet rather than a score of zero.
          </p>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>
              Where group time should go
              <InfoTooltip>
                The three lowest club-wide averages. Worth teaching to everyone at once, rather
                than one-on-one.
              </InfoTooltip>
            </h2>
          </div>
          <ol className="priority-list">
            {weakest.map((area, index) => (
              <li key={area.category}>
                <span className="priority-rank">{index + 1}</span>
                <span className="priority-label">{area.label}</span>
                <span className="mono">{area.rubricAverage.toFixed(1)} / 10</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
