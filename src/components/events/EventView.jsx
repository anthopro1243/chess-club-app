import { useEffect, useMemo, useState } from 'react';
import PairingsPanel from './PairingsPanel.jsx';
import { StandingsTable, WallChart } from './StandingsPanel.jsx';
import PlayersPanel from './PlayersPanel.jsx';
import LogPanel from './LogPanel.jsx';
import PrintSheet from './PrintSheet.jsx';
import {
  pairNextRound,
  unpairLastRound,
  finishTournament,
  reopenTournament,
  deleteTournament,
} from '../../data/tournamentStore.js';
import { computeStandings } from '../../tournament/tiebreaks.js';
import { nextStep, roundState, engineEntrants, engineRows, pairingNumbers, shortDate } from '../../tournament/eventOps.js';
import { ratingSourceLabel } from '../../tournament/seeding.js';

/*
 * EventView — one event: the round in progress, standings, wall chart, the
 * field and the override log, plus the coach's controls and the printouts.
 *
 * The coach's big button is "Pair round N". Everything the engine cannot
 * decide (a rematch it refused, a colour it had to break) comes back as a
 * warning next to that button, not buried in a log.
 */
export default function EventView({ tournament, entrants, pairings, overrides, players, games, isCoach, myPlayerId, actor, onNavigate, onDeleted, flash }) {
  const [tab, setTab] = useState('pairings');
  const [round, setRound] = useState(tournament.pairedRounds || 1);
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState('');
  const [printMode, setPrintMode] = useState(null);

  // A new round paired elsewhere (or here) moves the view to it.
  useEffect(() => {
    setRound(tournament.pairedRounds || 1);
  }, [tournament.id, tournament.pairedRounds]);

  useEffect(() => {
    setWarnings([]);
    setError('');
  }, [tournament.id]);

  const step = nextStep(tournament, pairings);
  const engineIn = useMemo(() => engineEntrants(entrants), [entrants]);
  const rowsIn = useMemo(() => engineRows(pairings), [pairings]);
  const standings = useMemo(
    () => computeStandings({ entrants: engineIn, rows: rowsIn, order: tournament.tiebreakOrder }),
    [engineIn, rowsIn, tournament.tiebreakOrder],
  );
  const wallStandings = useMemo(
    () => computeStandings({ entrants: engineIn, rows: rowsIn, order: tournament.tiebreakOrder, throughRound: tournament.pairedRounds || 0 }),
    [engineIn, rowsIn, tournament.tiebreakOrder, tournament.pairedRounds],
  );
  const numbers = useMemo(() => pairingNumbers(entrants), [entrants]);
  const playersById = useMemo(() => new Map(players.map((p) => [p.playerId, p])), [players]);
  const latest = roundState(pairings, tournament.pairedRounds || 0);
  const canUnpair = isCoach && tournament.pairedRounds > 0 && tournament.status !== 'finished' && !latest.games.some((g) => g.result);
  const allDone = tournament.pairedRounds >= tournament.rounds && latest.pending === 0;

  // Printing: mark the document so the print stylesheet shows only the sheet,
  // print once the sheet has rendered, and tidy up when the dialog closes.
  useEffect(() => {
    if (!printMode) return undefined;
    const root = document.documentElement;
    root.classList.add('ev-printing');
    const done = () => {
      root.classList.remove('ev-printing');
      setPrintMode(null);
    };
    window.addEventListener('afterprint', done);
    const frame = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
      root.classList.remove('ev-printing');
    };
  }, [printMode]);

  const pair = () => {
    const started = performance.now();
    const res = pairNextRound(tournament.id);
    if (!res.ok) {
      setError(res.message);
      setWarnings([]);
      return;
    }
    setError('');
    setWarnings(res.warnings || []);
    setTab('pairings');
    flash(`Round ${res.round} paired in ${Math.max(1, Math.round(performance.now() - started))} ms.`);
  };

  const tabs = [
    { id: 'pairings', label: 'Pairings' },
    { id: 'standings', label: 'Standings' },
    { id: 'wallchart', label: 'Wall chart' },
    { id: 'players', label: `Players (${entrants.length})` },
    ...(isCoach ? [{ id: 'log', label: `Log (${overrides.length})` }] : []),
  ];

  return (
    <div className="events-view">
      <section className="panel ev-screen">
        <div className="ev-title">
          <h2>{tournament.name}</h2>
          <span className="badge">
            {tournament.status === 'finished'
              ? 'Finished'
              : tournament.pairedRounds
                ? `Round ${tournament.pairedRounds} of ${tournament.rounds}`
                : 'Not started'}
          </span>
        </div>
        <div className="ev-meta">
          {tournament.startsOn && <span className="badge">{shortDate(tournament.startsOn)}</span>}
          <span className="badge">{tournament.format === 'round-robin' ? 'Round robin' : 'Swiss'}</span>
          <span className="badge">{tournament.timeControl}</span>
          <span className="badge">Seeded by {ratingSourceLabel(tournament.ratingSource)}</span>
        </div>

        {isCoach && (
          <div className="ev-actions">
            {tournament.status !== 'finished' && tournament.pairedRounds < tournament.rounds && (
              <button type="button" className="ev-button primary" disabled={!step.canPair} onClick={pair}>
                Pair round {step.round}
              </button>
            )}
            {canUnpair && (
              <button
                type="button"
                className="ev-button"
                onClick={() => {
                  if (!window.confirm(`Take back the round ${tournament.pairedRounds} pairings? No result has been entered yet.`)) return;
                  const res = unpairLastRound(tournament.id, { by: actor, reason: 'Re-pair' });
                  flash(res.ok ? 'Pairing taken back.' : res.message);
                  setWarnings([]);
                }}
              >
                Undo pairing
              </button>
            )}
            {tournament.status !== 'finished' && allDone && (
              <button type="button" className="ev-button" onClick={() => finishTournament(tournament.id)}>
                Finish event
              </button>
            )}
            {tournament.status === 'finished' && (
              <button type="button" className="ev-button" onClick={() => reopenTournament(tournament.id)}>
                Reopen
              </button>
            )}
          </div>
        )}
        {isCoach && !step.canPair && step.reason && tournament.status !== 'finished' && tournament.pairedRounds < tournament.rounds && (
          <p className="ev-note">{step.reason}</p>
        )}
        {error && (
          <p className="ev-error" role="alert">
            {error}
          </p>
        )}
        {warnings.map((w) => (
          <p key={w} className="ev-warn" role="status">
            {w}
          </p>
        ))}

        <div className="ev-actions ev-print-actions">
          <span className="ev-note">Print:</span>
          <button type="button" className="ev-button" disabled={!tournament.pairedRounds} onClick={() => setPrintMode('pairings')}>
            Pairings, round {round}
          </button>
          <button type="button" className="ev-button" disabled={!standings.throughRound} onClick={() => setPrintMode('standings')}>
            Standings
          </button>
          <button type="button" className="ev-button" disabled={!entrants.length} onClick={() => setPrintMode('wallchart')}>
            Wall chart
          </button>
        </div>

        <div className="ev-tabs" role="tablist" aria-label="Event views">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`ev-tab ${tab === t.id ? 'is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'pairings' && (
          <PairingsPanel
            tournament={tournament}
            entrants={entrants}
            pairings={pairings}
            games={games}
            isCoach={isCoach}
            myPlayerId={myPlayerId}
            actor={actor}
            round={round}
            onRound={setRound}
            onNavigate={onNavigate}
            flash={flash}
          />
        )}
        {tab === 'standings' && <StandingsTable standings={standings} tournament={tournament} myPlayerId={myPlayerId} />}
        {tab === 'wallchart' && (
          <WallChart standings={wallStandings} numbers={numbers} tournament={tournament} myPlayerId={myPlayerId} />
        )}
        {tab === 'players' && (
          <PlayersPanel
            tournament={tournament}
            entrants={entrants}
            players={players}
            numbers={numbers}
            isCoach={isCoach}
            actor={actor}
            flash={flash}
          />
        )}
        {tab === 'log' && isCoach && <LogPanel overrides={overrides} />}

        {isCoach && (
          <div className="ev-subpanel ev-actions">
            <button
              type="button"
              className="link-button danger"
              onClick={() => {
                if (!window.confirm(`Delete “${tournament.name}” with all its pairings and results? This cannot be undone.`)) return;
                deleteTournament(tournament.id);
                onDeleted();
              }}
            >
              Delete this event
            </button>
          </div>
        )}
      </section>

      <PrintSheet
        mode={printMode}
        tournament={tournament}
        entrants={entrants}
        pairings={pairings}
        standings={standings}
        wallStandings={wallStandings}
        numbers={numbers}
        playersById={playersById}
        round={round}
      />
    </div>
  );
}
