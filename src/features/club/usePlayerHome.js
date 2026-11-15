import { useMemo, useState } from 'react';
import { usePlayers } from '../roster/rosterStore.js';
import { useAnalyses, useSkillScores } from '../analysis/analysisStore.js';
import { useGames } from '../games/gamesStore.js';
import { useOwnPuzzlesFor } from '../training/ownPuzzleStore.js';
import { usePlatformRatings } from '../ratings/ratingStore.js';
import { buildPlayerHome } from '../../analysis/playerHome.js';
import { planRating } from '../../analysis/studyPlan.js';

/**
 * One player's home view model (buildPlayerHome), read from the stores. The
 * player's page and the Training page both use it, so they show the same
 * priority and the same plan. `viewer` is checked inside buildPlayerHome.
 */
export function usePlayerHome(playerId, viewer) {
  const players = usePlayers();
  const skillRows = useSkillScores();
  const analyses = useAnalyses();
  const games = useGames();
  const ownPuzzles = useOwnPuzzlesFor(playerId);
  const platformRatings = usePlatformRatings();
  // Fixed for the visit: "due now" should not shift under the player while
  // they read the page, and a fresh value every render would defeat useMemo.
  const [now] = useState(() => Date.now());

  const player = players.find((p) => p.playerId === playerId) ?? null;
  return useMemo(
    () =>
      buildPlayerHome({
        player,
        viewer,
        skillRows,
        analyses,
        games,
        ownPuzzles,
        rating: planRating(player, platformRatings),
        now,
      }),
    [player, viewer, skillRows, analyses, games, ownPuzzles, platformRatings, now],
  );
}
