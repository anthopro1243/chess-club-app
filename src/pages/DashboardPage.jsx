import { RUBRIC_CATEGORIES, clubAverages, weakestAreas } from '../data/roster.js';
import { usePlayers } from '../data/rosterStore.js';

/** DashboardPage — the club at a glance. */
export default function DashboardPage({ onNavigate }) {
  const players = usePlayers();
  const averages = clubAverages(players);
  const weakest = weakestAreas(players);
  const rated = players.filter((p) => p.ratings.uscf != null);
  const averageRating = rated.length
    ? Math.round(rated.reduce((sum, p) => sum + p.ratings.uscf, 0) / rated.length)
    : null;

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
            <h2>Where group time should go</h2>
          </div>
          <p className="hint-text">
            The three lowest club-wide averages. These are the topics worth teaching to everyone
            at once; anything above them is better handled one-on-one.
          </p>
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
