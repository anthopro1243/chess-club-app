import { useEffect, useMemo, useRef, useState } from 'react';
import EndgameTrainer from './EndgameTrainer.jsx';
import MistakesReview from './MistakesReview.jsx';
import StudyPlan from './StudyPlan.jsx';
import ExternalLink from '../../ui/ExternalLink.jsx';
import InfoTooltip from '../../ui/InfoTooltip.jsx';
import { useDuePuzzles, useReviewSummary } from './ownPuzzleStore.js';
import { usePlayers, useMyProfile } from '../roster/rosterStore.js';
import { useAccount } from '../account/accountStore.js';
import { usePlayerHome } from '../club/usePlayerHome.js';
import { parseTrainingLink, traineeIdFor } from './trainingLink.js';
import { buildStudyPlan } from '../../analysis/studyPlan.js';
import { LICHESS_THEMES, LICHESS_MIXED, CHESSCOM_PUZZLES, MENU_THEMES, THEME_GROUPS } from '../../data/resources.js';
import { useRoute } from '../../app/useRoute.js';

const TRAINEE_KEY = 'cc-trainee';

/*
 * What the URL asks for: #/training?theme=fork focuses the plan on a tactic,
 * ?mode=mistakes and ?mode=endgames open those sections. Anything unknown is
 * dropped (trainingLink.js), so a stale link still lands on a working page.
 */
const linkFromHash = () => {
  try {
    return parseTrainingLink(window.location.hash, { themes: MENU_THEMES });
  } catch {
    return { theme: '', mode: '' };
  }
};

/**
 * TrainingPage — the player's weekly plan, then the two things that stay in
 * the app because nobody else can do them: reviewing their own mistakes and
 * playing endgames out against the engine. Practice on themed puzzles and
 * video lessons are other people's jobs, so those are links (src/data/resources.js).
 */
export default function TrainingPage() {
  const players = usePlayers();
  const account = useAccount();
  const me = useMyProfile();
  const canPickTrainee = account.isCoach;
  const [pickedId, setPickedId] = useState(() => {
    try {
      // null = never picked; traineeIdFor then starts the coach as themselves.
      return localStorage.getItem(TRAINEE_KEY);
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      if (canPickTrainee && pickedId != null) localStorage.setItem(TRAINEE_KEY, pickedId);
    } catch {
      /* storage can be unavailable; the selection still holds for this visit */
    }
  }, [pickedId, canPickTrainee]);
  const traineeId = traineeIdFor({ isCoach: canPickTrainee, myPlayerId: me?.playerId ?? null, pickedId });
  const trainee = players.find((p) => p.playerId === traineeId) || null;

  const [link, setLink] = useState(linkFromHash);
  const [mistakesOpen, setMistakesOpen] = useState(() => linkFromHash().mode === 'mistakes');
  const [endgamesOpen, setEndgamesOpen] = useState(() => linkFromHash().mode === 'endgames');

  // A training link followed while already on this page changes only the
  // hash; the page stays mounted, so the new link is applied here.
  const { id: routeId, hash } = useRoute();
  const firstHashRef = useRef(hash);
  const mistakesRef = useRef(null);
  const endgamesRef = useRef(null);
  useEffect(() => {
    if (routeId !== 'training' || hash === firstHashRef.current) return;
    firstHashRef.current = hash;
    const next = linkFromHash();
    setLink(next);
    if (next.mode === 'mistakes') {
      setMistakesOpen(true);
      mistakesRef.current?.scrollIntoView({ block: 'start' });
    }
    if (next.mode === 'endgames') {
      setEndgamesOpen(true);
      endgamesRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [routeId, hash]);

  // The coach may look at anyone; a member's page only ever shows their own (checked in buildPlayerHome).
  const viewer = useMemo(() => ({ role: account.role, playerId: me?.playerId ?? null }), [account.role, me?.playerId]);
  const home = usePlayerHome(traineeId || null, viewer);

  const due = useDuePuzzles(traineeId);
  const reviewState = useReviewSummary(traineeId);
  const plan = useMemo(
    () =>
      buildStudyPlan({
        priority: home.available ? home.priority : null,
        reviews: { due: due.length, active: reviewState.active, href: '#/training?mode=mistakes' },
        rating: home.available ? home.rating ?? null : null,
        analysedCount: home.available ? home.analysedCount : 0,
        themeOverride: link.theme || null,
      }),
    [home, due.length, reviewState.active, link.theme],
  );

  return (
    <div className="training-page">
      {canPickTrainee && (
        <label className="field trainee-pick">
          <span>Plan for</span>
          <select className="trainee-select" value={traineeId} onChange={(event) => setPickedId(event.target.value)}>
            <option value="">Nobody (general plan)</option>
            {players.map((p) => (
              <option key={p.playerId} value={p.playerId}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <section className="panel" aria-labelledby="plan-heading">
        <div className="heading-row">
          <h2 id="plan-heading">{trainee && canPickTrainee ? `${trainee.name}'s plan this week` : 'Your plan this week'}</h2>
          <InfoTooltip label="More about the weekly plan">
            The one thing your games point to, a video about it and Lichess puzzles to practise it, plus your own
            mistakes to review.
          </InfoTooltip>
        </div>
        {link.theme && (
          <p className="muted small">
            Showing {LICHESS_THEMES[link.theme].label.toLowerCase()}.{' '}
            <a href="#/training">Back to my plan</a>
          </p>
        )}
        <StudyPlan plan={plan} labelledBy="plan-heading" />
      </section>

      <section className="panel" id="mistakes" ref={mistakesRef} aria-labelledby="mistakes-heading">
        <div className="heading-row">
          <h2 id="mistakes-heading">Your mistakes</h2>
          <InfoTooltip label="More about Your mistakes">
            Positions you got wrong in your own games. Get one right and it comes back later. Miss it and you see
            it again tomorrow.
          </InfoTooltip>
        </div>
        {!traineeId ? (
          <p className="hint-text">Your mistakes show up here once your account is linked to a club profile and your games are analyzed.</p>
        ) : mistakesOpen ? (
          <MistakesReview due={due} trainee={trainee} />
        ) : (
          <>
            <p className="muted">
              {due.length
                ? `${due.length} position${due.length === 1 ? '' : 's'} from your games to review.`
                : reviewState.active
                  ? `Nothing due today. ${reviewState.active} more will come back later.`
                  : 'No mistakes saved yet. They show up once your games are analyzed.'}
            </p>
            {due.length > 0 && (
              <button type="button" className="btn btn-primary" onClick={() => setMistakesOpen(true)}>
                Start reviewing
              </button>
            )}
          </>
        )}
      </section>

      <section className="panel" id="endgames" ref={endgamesRef} aria-labelledby="endgames-heading">
        <div className="heading-row">
          <h2 id="endgames-heading">Endgames</h2>
          <InfoTooltip label="More about the endgame trainer">
            Play textbook endgames out against the engine. You pass by mating, keeping a safe queen or holding the draw.
          </InfoTooltip>
        </div>
        {endgamesOpen ? (
          <EndgameTrainer trainee={trainee} rating={trainee?.ratings?.uscf ?? null} />
        ) : (
          <>
            <p className="muted">Play textbook endgames out against the engine, at your level.</p>
            <button type="button" className="btn" onClick={() => setEndgamesOpen(true)}>
              Play an endgame
            </button>
          </>
        )}
      </section>

      <section className="panel" aria-labelledby="themes-heading">
        <h2 id="themes-heading">Practise a theme on Lichess — free, opens in a new tab</h2>
        {THEME_GROUPS.map((group) => (
          <div className="theme-group" key={group.title}>
            <h3>{group.title}</h3>
            <ul className="theme-chips">
              {group.themes.map((key) => (
                <li key={key}>
                  <ExternalLink href={LICHESS_THEMES[key].url} className="btn btn-sm">
                    {LICHESS_THEMES[key].label}
                    <span className="sr-only"> puzzles on Lichess</span>
                  </ExternalLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="theme-more">
          <ExternalLink href={LICHESS_MIXED.url} className="btn">
            Mixed puzzles on Lichess
          </ExternalLink>
          <ExternalLink href={CHESSCOM_PUZZLES.url} className="btn">
            Puzzles on Chess.com
          </ExternalLink>
        </div>
      </section>
    </div>
  );
}
