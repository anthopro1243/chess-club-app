import { useEffect, useState } from 'react';

const KEY = 'cc-prep-trainee';

/**
 * Who a quiz or drill result is saved for.
 *
 * A member always practises as themselves (RLS would refuse anything else).
 * A coach can pick anyone, because on a Tuesday several members may take the
 * quiz on the coach's laptop in turn. "Practice only" saves nothing.
 */
export function usePractisingAs({ isCoach, me, players }) {
  const [chosen, setChosen] = useState(() => {
    try {
      return localStorage.getItem(KEY) ?? me?.playerId ?? '';
    } catch {
      return me?.playerId ?? '';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, chosen);
    } catch {
      /* storage can be unavailable; the choice still holds for this visit */
    }
  }, [chosen]);

  if (!isCoach) return { player: me || null, chosen: me?.playerId || '', setChosen: () => {} };
  const player = players.find((p) => p.playerId === chosen) || null;
  return { player, chosen: player ? chosen : '', setChosen };
}

export default function PractisingAs({ isCoach, player, chosen, setChosen, players }) {
  if (!isCoach) {
    return (
      <p className="prep-note">
        {player
          ? `Results are saved to ${player.name}'s record.`
          : 'Practice only: claim your player profile from the account menu to save results.'}
      </p>
    );
  }
  return (
    <label className="field prep-inline-field prep-trainee">
      <span>Saving for</span>
      <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
        <option value="">Practice only (not saved)</option>
        {[...players]
          .sort((a, b) => String(a.name).localeCompare(String(b.name)))
          .map((p) => (
            <option key={p.playerId} value={p.playerId}>
              {p.name}
            </option>
          ))}
      </select>
    </label>
  );
}
