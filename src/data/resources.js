/*
 * resources.js — where the app sends a player once it knows what they should
 * work on: one YouTube video for each weakness, and Lichess's own themed
 * puzzles for practice. The app does not teach or host puzzles itself.
 *
 * HOW TO SWAP A LINK (no programming needed beyond editing text):
 *   1. Find the video or playlist you want on YouTube and copy its address.
 *   2. Open  https://www.youtube.com/oembed?url=<that address>&format=json
 *      in a browser. If it shows a title and a channel, the link works and
 *      you can copy the title and channel from there. If it shows an error,
 *      the video is gone or private: do not use it.
 *   3. Replace the `title`, `short` (the short name shown in the app), `channel` and `url` of the entry below, keep the
 *      quote marks and commas, then save. A slot may also be set to null:
 *      the page then simply shows no video for it (the fallback described
 *      at the bottom of this comment is used instead).
 *   4. Add the date to docs/RESOURCES.md.
 *
 * How a video is chosen for a player: first the video for their weakness and
 * rating band (under 1000, 1000–1400, 1400+), then the video for that
 * weakness at any rating, then the general fundamentals video for their band.
 * So a slot left empty never leaves a gap; it hands over to the next one.
 *
 * Every link here was fetched and confirmed on the date in `VERIFIED_ON`.
 */

export const VERIFIED_ON = '2026-11-15';

/*
 * Lichess themed puzzles: https://lichess.org/training/<theme>. The keys are
 * Lichess's own puzzle theme names, which is also how the analyzer names the
 * tactics it finds. Each URL was fetched and answered with its own page
 * (a made-up theme name is sent to the general page instead, so staying on
 * the same address means the theme exists).
 */
const lichess = (theme) => `https://lichess.org/training/${theme}`;

export const LICHESS_THEMES = Object.freeze({
  fork: { label: 'Fork', url: lichess('fork') },
  pin: { label: 'Pin', url: lichess('pin') },
  skewer: { label: 'Skewer', url: lichess('skewer') },
  discoveredAttack: { label: 'Discovered attack', url: lichess('discoveredAttack') },
  doubleCheck: { label: 'Double check', url: lichess('doubleCheck') },
  deflection: { label: 'Deflection', url: lichess('deflection') },
  attraction: { label: 'Attraction (decoy)', url: lichess('attraction') },
  hangingPiece: { label: 'Hanging piece', url: lichess('hangingPiece') },
  trappedPiece: { label: 'Trapped piece', url: lichess('trappedPiece') },
  capturingDefender: { label: 'Remove the defender', url: lichess('capturingDefender') },
  quietMove: { label: 'Quiet move', url: lichess('quietMove') },
  sacrifice: { label: 'Sacrifice', url: lichess('sacrifice') },
  mateIn1: { label: 'Mate in 1', url: lichess('mateIn1') },
  mateIn2: { label: 'Mate in 2', url: lichess('mateIn2') },
  mateIn3: { label: 'Mate in 3', url: lichess('mateIn3') },
  backRankMate: { label: 'Back-rank mate', url: lichess('backRankMate') },
  smotheredMate: { label: 'Smothered mate', url: lichess('smotheredMate') },
  opening: { label: 'Opening', url: lichess('opening') },
  middlegame: { label: 'Middlegame', url: lichess('middlegame') },
  endgame: { label: 'Endgame', url: lichess('endgame') },
  pawnEndgame: { label: 'Pawn endgame', url: lichess('pawnEndgame') },
  rookEndgame: { label: 'Rook endgame', url: lichess('rookEndgame') },
});

/** Mixed puzzles at the player's level, for when no theme applies. */
export const LICHESS_MIXED = Object.freeze({ label: 'Mixed puzzles', url: 'https://lichess.org/training' });

/** One general Chess.com link (themed Chess.com puzzles are limited on free accounts). */
export const CHESSCOM_PUZZLES = Object.freeze({ label: 'Chess.com puzzles', url: 'https://www.chess.com/puzzles' });

/*
 * `title` and `channel` are exactly what YouTube's oEmbed returned. `short`
 * is the short name the app shows in place of the long title; `minutes` is
 * the running time, rounded, when known (playlists have none).
 */
const video = (title, short, channel, url, minutes) => ({ title, short, channel, url, ...(minutes ? { minutes } : {}) });
const yt = (id) => `https://www.youtube.com/watch?v=${id}`;

export const BANDS = ['under1000', '1000-1400', '1400+'];

/** Which band a rating falls in; no rating counts as a newer player. */
export function bandForRating(rating) {
  const r = Number(rating);
  if (!Number.isFinite(r) || r <= 0 || r < 1000) return 'under1000';
  return r < 1400 ? '1000-1400' : '1400+';
}

/*
 * The general video for each band: the fallback for everything. GothamChess
 * first (the videos members actually watch), then similar creators.
 */
export const GENERAL_VIDEOS = Object.freeze({
  under1000: video('Want to be 1000 in chess?', 'Want to be 1000 in chess?', 'GothamChess', yt('mjZKRoNuAvY'), 34),
  '1000-1400': video('CHESS STEPS #3 (1000-1400)', 'Chess Steps #3: 1000–1400', 'GothamChess', yt('ghJRGPXsjfk'), 63),
  '1400+': video('Intermediate Chess Masterclass: 1300 to 2000 Elo', 'Intermediate masterclass: 1300 to 2000', 'GothamChess', yt('F1gM7N-WXdU'), 40),
});

/*
 * One video per coaching category (the keys of CATEGORY_KEYS in
 * src/analysis/scoring.js). `default` is used at any rating; a band name
 * overrides it for that band. null means "nothing good found yet".
 */
export const CATEGORY_VIDEOS = Object.freeze({
  openingKnowledge: {
    under1000: video('Basic Chess Openings Explained', 'Basic chess openings explained', 'GothamChess', yt('8IlJ3v8I4Z8'), 9),
    default: video('How To Learn & Study Chess Openings', 'How to learn and study openings', 'GothamChess', yt('6IegDENuxU4'), 23),
  },
  tacticalVision: {
    default: video('How To Calculate In Chess', 'How to calculate in chess', 'GothamChess', yt('9Ga9dP3bvN8'), 32),
  },
  positionalUnderstanding: {
    '1400+': video('How To Evaluate ANY Chess Position', 'How to evaluate any position', 'GothamChess', yt('3su1RGtmfcw'), 24),
    default: video('Chess Tips: How To Make a Plan', 'Chess tips: how to make a plan', 'GothamChess', yt('u8MKyE9Qt8I'), 11),
  },
  endgameTechnique: {
    under1000: video('EASY CHESS ENDGAMES: King & Pawns', 'Easy endgames: king and pawns', 'GothamChess', yt('mCsc24k-Q8M'), 21),
    '1000-1400': video('EASY CHESS ENDGAMES: Rook & Pawn', 'Easy endgames: rook and pawn', 'GothamChess', yt('JMZJ9P2Hnq0'), 23),
    '1400+': video('Play Chess Endgames Like Magnus Carlsen', 'Endgames like Magnus Carlsen', 'GothamChess', yt('IvxhIozo_zo'), 34),
  },
  timeManagement: {
    default: video('Time Management In Chess', 'Time management in chess', 'GothamChess', yt('d_K8Xe3obMM'), 27),
  },
  boardVision: {
    default: video('The SECRET To Stop Blundering Your Pieces In Chess', 'Stop blundering your pieces', 'Anna Cramling', yt('7vt5Lt5VUH4'), 17),
  },
  psychologicalResilience: {
    default: video('How To Improve Your Chess Psychology', 'Chess psychology: handling losses', 'GothamChess', yt('mIZSNGPdxo8'), 16),
  },
  notation: {
    default: video('Learn Chess Notation - The Language of Chess! How to Read & Write Chess Moves! Basics for Beginners', 'How to read and write chess notation', 'Chess Talk', yt('b6PR885Rgb8'), 11),
  },
});

/** One video per tactic (Lichess theme names). */
export const THEME_VIDEOS = Object.freeze({
  fork: video('The Chess Tactics Guide For Beginners!  Learn the 3 most common chess tactics: forks, pins, skewers!', 'Forks, pins and skewers for beginners', 'Chess Vibes', yt('MbMslp2WcI0'), 7),
  pin: video('The Chess Tactics Guide For Beginners!  Learn the 3 most common chess tactics: forks, pins, skewers!', 'Forks, pins and skewers for beginners', 'Chess Vibes', yt('MbMslp2WcI0'), 7),
  skewer: video('Why The Skewer Chess Tactic Is More Important Than You Thought', 'The skewer', 'Chess Vibes', yt('Vre4tVytoxA'), 14),
  discoveredAttack: video('Discovered Attack Chess Tactic - Concepts, Principles and Examples', 'The discovered attack', 'Chess Vibes', yt('XTNplr3nwck'), 16),
  backRankMate: video('6 Checkmate Patterns YOU MUST KNOW', '6 checkmate patterns', 'GothamChess', yt('iBZLU1FXhcI'), 22),
  hangingPiece: video('The SECRET To Stop Blundering Your Pieces In Chess', 'Stop blundering your pieces', 'Anna Cramling', yt('7vt5Lt5VUH4'), 17),
});

/** The video for a tactic, or null when there is none. */
export function videoForTheme(theme) {
  return THEME_VIDEOS[theme] ?? null;
}

/** The video for a coaching category at a rating: band, then category, then the band's general video. */
export function videoForCategory(category, rating = null) {
  const band = bandForRating(rating);
  const slot = CATEGORY_VIDEOS[category];
  return slot?.[band] ?? slot?.default ?? GENERAL_VIDEOS[band];
}

/** The general fundamentals video for a rating, for a player with no priority yet. */
export function generalVideo(rating = null) {
  return GENERAL_VIDEOS[bandForRating(rating)];
}

/** The Lichess link for a theme key, or null for a theme Lichess has no page for here. */
export function lichessForTheme(theme) {
  const entry = LICHESS_THEMES[theme];
  return entry ? { theme, ...entry } : null;
}

/** The themes listed under "Practise a theme", in menu order. */
export const MENU_THEMES = Object.freeze(Object.keys(LICHESS_THEMES));

/** The headings the theme chips sit under on the Training page; every menu theme is in exactly one. */
export const THEME_GROUPS = Object.freeze([
  { title: 'Tactics', themes: ['fork', 'pin', 'skewer', 'discoveredAttack', 'doubleCheck', 'deflection', 'attraction', 'hangingPiece', 'trappedPiece', 'capturingDefender', 'quietMove', 'sacrifice'] },
  { title: 'Checkmates', themes: ['mateIn1', 'mateIn2', 'mateIn3', 'backRankMate', 'smotheredMate'] },
  { title: 'Phases of the game', themes: ['opening', 'middlegame', 'endgame', 'pawnEndgame', 'rookEndgame'] },
]);

export const THEME_LABELS = Object.freeze(
  Object.fromEntries(Object.entries(LICHESS_THEMES).map(([key, { label }]) => [key, label])),
);

/** Every external address this file hands out, for the docs and the tests. */
export function allLinks() {
  const videos = [
    ...Object.values(GENERAL_VIDEOS),
    ...Object.values(CATEGORY_VIDEOS).flatMap((slot) => Object.values(slot)),
    ...Object.values(THEME_VIDEOS),
  ].filter(Boolean);
  return {
    videos,
    lichess: [...Object.values(LICHESS_THEMES), LICHESS_MIXED],
    other: [CHESSCOM_PUZZLES],
  };
}
