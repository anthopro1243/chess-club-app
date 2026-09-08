import { RUBRIC_CATEGORIES, clubAverages, weakestAreas } from '../data/roster.js';
import { usePlayers, useCloudStatus } from '../data/rosterStore.js';
import InfoTooltip from '../components/InfoTooltip.jsx';

/** DashboardPage — the club at a glance: who's here, and how they rank. */
export default function DashboardPage({ onNavigate }) {
  const players = usePlayers();
  const cloud = useCloudStatus();
  const averages = clubAverages(players);
  const weakest = weakestAreas(players);
  const rated = players.filter((p) => p.ratings.uscf != null);
  const averageRating = rated.length
    ? Math.round(rated.reduce((sum, p) => sum + p.ratings.uscf, 0) / rated.length)
    : null;

  const leaderboard = [...players].sort(
    (a, b) => (b.clubRating?.rating ?? 1500) - (a.clubRating?.rating ?? 1500),
  );

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
              Ratings use Glicko-2, the same system Chess.com runs on. They update after every
              puzzle and game.
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
                {leaderboard.map((player, index) => {
                  const rating = player.clubRating ?? { rating: 1500, count: 0 };
                  return (
                    <tr key={player.playerId}>
                      <td className="mono">{index + 1}</td>
                      <td>{player.name}</td>
                      <td className="mono">
                        {Math.round(rating.rating)}
                        {rating.count < 10 && <span className="hint-text"> (provisional)</span>}
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
          </div>
        )}
      </section>

      <div className="two-column">
        <section className="panel">
          <div className="panel-header">
            <h2>Club skill profile</h2>
          </div>
          <div className="rubric">
            {RUBRIC_CATEGORIES.map((category) => {
              const score = averages[category.key] || 0;
              return (
                <div className="rubric-row" key={category.key}>
                  <span className="rubric-label">{category.label}</span>
                  <span className="rubric-bar">
                    <span
                      className={`rubric-fill ${score <= 3 ? 'low' : score <= 6 ? 'mid' : 'high'}`}
                      style={{ width: `${score * 10}%` }}
                    />
                  </span>
                  <span className="rubric-score mono">{score.toFixed(1)}</span>
                </div>
              );
            })}
          </div>
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
              <li key={area.key}>
                <span className="priority-rank">{index + 1}</span>
                <span className="priority-label">{area.label}</span>
                <span className="mono">{area.average.toFixed(1)} / 10</span>
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
