/*
 * clubWeaknesses.js — what the whole club keeps getting wrong lately
 * (research F015): the tactic themes behind members' mistakes, the phase of
 * the game where decisive errors happen, and the openings members actually
 * face. It exists so the coach can pick next Tuesday's lesson from evidence.
 *
 * Only active roster members count (retired players are left out), only
 * games inside the window count, and with too few analysed games the result
 * says so instead of ranking noise.
 */

export const DEFAULT_WINDOW_DAYS = 30;
export const MIN_GAMES = 5;

export const MOTIF_LABELS = Object.freeze({
  hangingPiece: 'Leaving pieces hanging',
  fork: 'Allowing forks',
  backRank: 'Back-rank weakness',
  pin: 'Pins',
  skewer: 'Skewers',
  discoveredAttack: 'Discovered attacks',
  trappedPiece: 'Trapped pieces',
  deflection: 'Deflections',
});

/* Where a motif's puzzle theme has a different name in the Lichess puzzle set. */
const PUZZLE_THEME_FOR_MOTIF = Object.freeze({ backRank: 'backRankMate' });

const PHASE_LABELS = { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' };

const tag = (pgn, name) => new RegExp(`\\[${name}\\s+"([^"]*)"\\]`).exec(String(pgn || ''))?.[1]?.trim() || null;

/** The opening a game was, by name if the PGN has one, else its ECO code. */
export function openingOf(pgn) {
  const name = tag(pgn, 'Opening');
  if (name && name !== '?') return name.split(':')[0].trim();
  const url = tag(pgn, 'ECOUrl');
  if (url) {
    // Chess.com: .../openings/Italian-Game-Two-Knights-Defense → "Italian Game"
    const slug = url.split('/').pop().replace(/-\d.*$/, '');
    const words = slug.split('-').filter(Boolean);
    const cut = words.findIndex((w) => /^(Defense|Defence|Game|Gambit|Opening|Attack|System)$/.test(w));
    return (cut >= 0 ? words.slice(0, cut + 1) : words.slice(0, 3)).join(' ');
  }
  const eco = tag(pgn, 'ECO');
  return eco && eco !== '?' ? eco : null;
}

/**
 * @param {{analyses: object[], games: object[], activeIds: Set<string>,
 *          now?: number, days?: number, knownThemes?: Set<string>}} input
 */
export function clubWeaknesses({ analyses = [], games = [], activeIds, now = Date.now(), days = DEFAULT_WINDOW_DAYS, knownThemes = new Set() }) {
  const active = activeIds instanceof Set ? activeIds : new Set();
  const since = now - days * 24 * 60 * 60 * 1000;
  const inWindow = new Map(
    (games || [])
      .filter((g) => g && Date.parse(g.playedAt) >= since && Date.parse(g.playedAt) <= now)
      .map((g) => [g.id, g]),
  );

  const rows = (analyses || []).filter((a) => a && active.has(a.playerId) && inWindow.has(a.gameId));
  const analysedGames = new Set(rows.map((a) => a.gameId)).size;

  // Tactic themes behind members' errors.
  const motifs = {};
  for (const row of rows) {
    for (const [motif, count] of Object.entries(row.motifCounts || {})) {
      if (!MOTIF_LABELS[motif] || !count) continue;
      (motifs[motif] ||= { motif, label: MOTIF_LABELS[motif], count: 0, players: new Set() });
      motifs[motif].count += count;
      motifs[motif].players.add(row.playerId);
    }
  }
  const topMotifs = Object.values(motifs)
    .sort((a, b) => b.count - a.count || b.players.size - a.players.size)
    .slice(0, 3)
    .map((m) => ({
      motif: m.motif,
      label: m.label,
      count: m.count,
      players: m.players.size,
      drill: (() => {
        const theme = PUZZLE_THEME_FOR_MOTIF[m.motif] ?? m.motif;
        return knownThemes.has(theme) ? `#/training?theme=${theme}` : null;
      })(),
    }));

  // Where decisive errors (the stored critical moments) happen.
  const phases = { opening: 0, middlegame: 0, endgame: 0 };
  for (const row of rows) {
    const phaseByPly = new Map((row.plies || []).map((p) => [p.ply, p.phase]));
    for (const moment of row.critical || []) {
      const phase = phaseByPly.get(moment.ply);
      if (phase in phases) phases[phase] += 1;
    }
  }
  const decisive = Object.values(phases).reduce((a, b) => a + b, 0);
  const worstPhase = decisive
    ? Object.entries(phases).sort((a, b) => b[1] - a[1])[0]
    : null;

  // Openings members faced, with the club's score in them.
  const openings = {};
  for (const game of inWindow.values()) {
    const sides = [
      game.whitePlayerId && active.has(game.whitePlayerId) ? 'w' : null,
      game.blackPlayerId && active.has(game.blackPlayerId) ? 'b' : null,
    ].filter(Boolean);
    if (!sides.length) continue;
    const name = openingOf(game.pgn);
    if (!name) continue;
    (openings[name] ||= { name, games: 0, points: 0 });
    for (const side of sides) {
      openings[name].games += 1;
      if (game.result === '1/2-1/2') openings[name].points += 0.5;
      else if ((game.result === '1-0' && side === 'w') || (game.result === '0-1' && side === 'b')) openings[name].points += 1;
    }
  }
  const topOpenings = Object.values(openings)
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((o) => ({ ...o, scorePct: Math.round((o.points / o.games) * 100) }));

  return {
    windowDays: days,
    analysedGames,
    enough: analysedGames >= MIN_GAMES,
    topMotifs,
    phases,
    worstPhase: worstPhase ? { phase: worstPhase[0], label: PHASE_LABELS[worstPhase[0]], count: worstPhase[1], of: decisive } : null,
    topOpenings,
  };
}
