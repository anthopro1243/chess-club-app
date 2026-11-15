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
 *   3. Replace the `title`, `channel` and `url` of the entry below, keep the
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
const playlist = (id) => `https://www.youtube.com/playlist?list=${id}`;

export const BANDS = ['under1000', '1000-1400', '1400+'];

/** Which band a rating falls in; no rating counts as a newer player. */
export function bandForRating(rating) {
  const r = Number(rating);
  if (!Number.isFinite(r) || r <= 0 || r < 1000) return 'under1000';
  return r < 1400 ? '1000-1400' : '1400+';
}

/* The general fundamentals video for each band: the fallback for everything. */
export const GENERAL_VIDEOS = Object.freeze({
  under1000: video('Chess Fundamentals', 'Chess fundamentals', 'John Bartholomew', playlist('PLl9uuRYQ-6MBwqkmwT42l1fI7Z0bYuwwO')),
  '1000-1400': video('Climbing the Rating Ladder', 'Climbing the rating ladder', 'John Bartholomew', playlist('PLl9uuRYQ-6MCBnhtCk_bTZsD8GxeWP6BV')),
  '1400+': video('SpeedRun', 'SpeedRun (Naroditsky)', 'Daniel Naroditsky', playlist('PLT1F2nOxLHOcmi_qi1BbY6axf5xLFEcit')),
});

/*
 * One video per coaching category (the keys of CATEGORY_KEYS in
 * src/analysis/scoring.js). `default` is used at any rating; a band name
 * overrides it for that band. null means "nothing good found yet".
 */
export const CATEGORY_VIDEOS = Object.freeze({
  openingKnowledge: {
    under1000: video('Must-Know Opening Principles - Central Control | Chess Basics | Beginner Level | IM Alex Astaneh', 'Opening principles: central control', 'Chessfactor', yt('gpsZAim-mYc'), 22),
    default: video('The Golden Opening and Endgame Rules | Chess Principles | Improver Level | IM Andrey Ostrovskiy', 'The golden opening and endgame rules', 'Chessfactor', yt('9ptbztQBxRA'), 25),
  },
  tacticalVision: {
    default: video('Most common Chess Tactics every Player needs to know | Attack & Defense | IM Andrey Ostrovskiy', 'The most common tactics', 'Chessfactor', yt('IKDkxv6PWf8'), 22),
  },
  positionalUnderstanding: {
    '1400+': video('Understanding Pawn Levers - Strategic Planning | Chess Middlegame |Advanced Level |GM Alex Lenderman', 'Pawn levers and planning', 'Chessfactor', yt('oEO6LhFx0p8'), 24),
    default: video('Everything you need to know about Piece Mobilization | Beginner Level | IM Andrey Ostrovskiy', 'Getting your pieces into play', 'Chessfactor', yt('XPpwG8gGqco'), 21),
  },
  endgameTechnique: {
    under1000: video('Important Endgame Principles and Techniques for Beginners | Beginner Level | IM Alex Astaneh', 'Endgame principles for beginners', 'Chessfactor', yt('PzmTEz2hlak'), 16),
    '1000-1400': video('Learn the Lucena Position (The Shield) - Beginner to Chess Master #19', 'The Lucena position', 'ChessNetwork', yt('V1QXsV9SKlk')),
    '1400+': video('My 10 tips to quickly improve your rook endgames', '10 tips for rook endgames', 'BlitzStream', yt('813QD5vW5-4')),
  },
  timeManagement: {
    default: video('How To Manage Time In Your Chess Games (197)', 'Managing your time in a game', 'NM Robert Ramirez', yt('grF4uU7gRbY'), 8),
  },
  boardVision: {
    default: video('Useful Tips to avoid Blunders | How to Blunder Less | Beginner Level | IM Kostya Kavutskiy', 'How to blunder less', 'Chessfactor', yt('AYy2A6HIcU0'), 18),
  },
  psychologicalResilience: {
    default: video('How I Deal with Losing in Chess', 'How to deal with losing', 'GM Noel Studer', yt('JgQFSgzAyIE'), 12),
  },
  notation: {
    default: video('How to Write Chess Moves - Notate a Game', 'How to write chess moves', 'Chess House', yt('itftX-QZ5Ms'), 15),
  },
});

/** One video per tactic (Lichess theme names). */
export const THEME_VIDEOS = Object.freeze({
  fork: video('The Fork | Chess Tactics | ChessKid', 'The fork', 'ChessKid', yt('mgAbXPBeVEI'), 7),
  pin: video('The Pin | Chess Tactics | ChessKid', 'The pin', 'ChessKid', yt('sjpKC9SMvKs'), 7),
  skewer: video('The Skewer | Chess Tactics | ChessKid', 'The skewer', 'ChessKid', yt('2KlDixnZMhM'), 5),
  discoveredAttack: video('Creating multiple Threats with the Discovered Attack | Chess Tactics | IM Alex Astaneh', 'The discovered attack', 'Chessfactor', yt('nMADfn1scbI'), 21),
  backRankMate: video('Incredible Back Rank Combinations | Chess Tactics | Improver Level | IM Kostya Kavutskiy', 'Back-rank combinations', 'Chessfactor', yt('spMQR31h0-0'), 9),
  hangingPiece: video('How to visualize and exploit Poorly Protected Pieces | Beginner Level | IM Kostya Kavutskiy', 'Spotting poorly protected pieces', 'Chessfactor', yt('hKZTX8ccOyc'), 19),
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
