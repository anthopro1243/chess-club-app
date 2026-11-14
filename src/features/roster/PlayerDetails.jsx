import InfoTooltip from '../../ui/InfoTooltip.jsx';
import { RUBRIC_CATEGORIES } from './roster.js';
import { gradeSection } from './privacy.js';

const ONLINE_RATINGS = [
  ['rapid', 'Rapid'],
  ['blitz', 'Blitz'],
  ['bullet', 'Bullet'],
  ['puzzles', 'Puzzles'],
];

/** One player's record, read-only: facts, rubric, goals, notes, puzzles, online accounts. */
export default function PlayerDetails({ selected, account, access, coachNotes, privateFields, suggestions }) {
  return (
    <>
      <dl className="facts">
        <div>
          <dt>Joined</dt>
          <dd>{selected.joined}</dd>
        </div>
        <div>
          <dt>Grade</dt>
          <dd>{selected.grade || '—'}</dd>
        </div>
        <div>
          <dt>Experience</dt>
          <dd>{selected.experience || '—'}</dd>
        </div>
        <div>
          <dt>Style</dt>
          <dd>{selected.style || '—'}</dd>
        </div>
        <div>
          <dt>Openings</dt>
          <dd>{selected.preferredOpenings.join(', ') || '—'}</dd>
        </div>
        {/* Coach-only. player_private refuses a player account outright,
            so for them this block has nothing to render - it is not
            merely hidden. */}
        {account.isCoach && privateFields[selected.playerId] && (
          <>
            <div>
              <dt>Student ID</dt>
              <dd>{privateFields[selected.playerId].studentId || '—'}</dd>
            </div>
            <div>
              <dt>School email</dt>
              <dd>{privateFields[selected.playerId].schoolEmail || '—'}</dd>
            </div>
          </>
        )}
        {account.isCoach && selected.guardianEmail && (
          <div>
            <dt>Guardian email</dt>
            <dd>{selected.guardianEmail}</dd>
          </div>
        )}
        <div>
          <dt>Section</dt>
          <dd>{gradeSection(selected.grade) ? `Grades ${gradeSection(selected.grade)}` : '—'}</dd>
        </div>
      </dl>

      {access.showCoachingRecord ? (
        <>
          <h3>Skill assessment</h3>
          <div className="rubric">
            {RUBRIC_CATEGORIES.map((category) => {
              const score = selected.rubric[category.key] ?? 0;
              return (
                <div className="rubric-row" key={category.key}>
                  <span className="rubric-label">
                    {category.label}
                    {suggestions[category.key] ? (
                      <em
                        className="rubric-suggestion"
                        title={`Engine's score, from ${suggestions[category.key].observations} data points`}
                      >
                        suggested {suggestions[category.key].suggestion}
                      </em>
                    ) : null}
                  </span>
                  <span className="rubric-bar">
                    <span
                      className={`rubric-fill ${score <= 3 ? 'low' : score <= 6 ? 'mid' : 'high'}`}
                      style={{ width: `${score * 10}%` }}
                    />
                  </span>
                  <span className="rubric-score mono">{score}</span>
                </div>
              );
            })}
          </div>

          <h3>Current goal</h3>
          <p>{selected.goal || '—'}</p>

          <h3>Training focus</h3>
          <p>{selected.trainingFocus || '—'}</p>
        </>
      ) : (
        <p className="muted small">
          Skill scores and goals are private to each member and the coach.
        </p>
      )}

      {account.isCoach && (
        <>
          <div className="heading-row">
            <h3>Coach notes</h3>
            <InfoTooltip label="More about Coach notes">
              Only coaches can see these.
            </InfoTooltip>
          </div>
          <p className="notes">{coachNotes[selected.playerId] || '—'}</p>
        </>
      )}

      <h3>Puzzle training</h3>
      <p>
        {selected.puzzleStats?.solvedIds?.length || 0} puzzle
        {selected.puzzleStats?.solvedIds?.length === 1 ? '' : 's'} solved
        {selected.puzzleStats?.lastPlayed
          ? ` · last practiced ${new Date(selected.puzzleStats.lastPlayed).toLocaleDateString()}`
          : ''}
      </p>

      {Object.keys(selected.connections || {}).length > 0 && (
        <>
          <div className="heading-row">
            <h3>Online play</h3>
            <InfoTooltip label="More about Online play">
              Rated games on these accounts count toward the club rating.
            </InfoTooltip>
          </div>
          {Object.entries(selected.connections).map(([platform, connection]) => (
            <p key={platform}>
              <strong>{platform === 'chesscom' ? 'Chess.com' : 'Lichess'}</strong>{' '}
              <a href={connection.url} target="_blank" rel="noreferrer">
                {connection.username}
              </a>
              {ONLINE_RATINGS.map(([key, label]) => {
                const value = connection.ratings?.[key];
                return value == null ? null : (
                  <span key={key} className="hint-text">
                    {' · '}
                    {label} <span className="mono">{value}</span>
                  </span>
                );
              })}
            </p>
          ))}
        </>
      )}
    </>
  );
}
