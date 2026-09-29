import { useMemo } from 'react';
import { usePlayers } from '../data/rosterStore.js';
import { useGames } from '../data/gamesStore.js';
import { useAnalyses } from '../data/analysisStore.js';
import { activePlayerIdSet } from '../data/retiredPlayers.js';
import { PUZZLE_THEMES } from '../data/puzzles.js';
import { clubWeaknesses, MIN_GAMES } from '../analysis/clubWeaknesses.js';
import InfoTooltip from './InfoTooltip.jsx';

/*
 * ClubWeaknessesPanel — what to teach next Tuesday, from the last 30 days of
 * members' analysed games (research F015). Coach-only: it names patterns
 * across the club, not individuals, but it lives with the coach's tools.
 */
const themes = new Set(PUZZLE_THEMES);

export default function ClubWeaknessesPanel() {
  const players = usePlayers();
  const games = useGames();
  const analyses = useAnalyses();
  const activeIds = useMemo(() => activePlayerIdSet(players), [players]);
  const report = useMemo(
    () => clubWeaknesses({ analyses, games, activeIds, knownThemes: themes }),
    [analyses, games, activeIds],
  );

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>
          Club weaknesses, last {report.windowDays} days
          <InfoTooltip>
            What keeps going wrong in members&rsquo; analysed games. Use it to plan the next
            lesson.
          </InfoTooltip>
        </h2>
        <span className="badge mono">{report.analysedGames} games</span>
      </div>

      {!report.enough ? (
        <p className="hint-text">
          {report.analysedGames === 0
            ? 'No analysed games from the last 30 days yet.'
            : `Only ${report.analysedGames} analysed game${report.analysedGames === 1 ? '' : 's'} so far. Needs at least ${MIN_GAMES}.`}
        </p>
      ) : (
        <div className="two-column">
          <div>
            <h3>Tactic themes behind mistakes</h3>
            {report.topMotifs.length === 0 ? (
              <p className="hint-text">No tactics showed up in members&rsquo; mistakes.</p>
            ) : (
              <ol>
                {report.topMotifs.map((m) => (
                  <li key={m.motif}>
                    <strong>{m.label}</strong>{' '}
                    <span className="muted">
                      {m.count} time{m.count === 1 ? '' : 's'}, {m.players} member{m.players === 1 ? '' : 's'}
                    </span>
                    {m.drill && <> · <a href={m.drill}>drill</a></>}
                  </li>
                ))}
              </ol>
            )}
            {report.worstPhase && (
              <p>
                Most games are lost in the <strong>{report.worstPhase.label.toLowerCase()}</strong>{' '}
                <span className="muted">({report.worstPhase.count} of {report.worstPhase.of})</span>.
              </p>
            )}
          </div>
          <div>
            <h3>Openings members face most</h3>
            {report.topOpenings.length === 0 ? (
              <p className="hint-text">These games don&rsquo;t have opening names.</p>
            ) : (
              <ol>
                {report.topOpenings.map((o) => (
                  <li key={o.name}>
                    <strong>{o.name}</strong>{' '}
                    <span className="muted">{o.games} game{o.games === 1 ? '' : 's'}, club scored {o.scorePct}%</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
