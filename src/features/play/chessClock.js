/*
 * chessClock.js — tournament time controls, as pure functions.
 *
 * Kept free of React and of the board so it can be tested directly: a clock
 * that is wrong by five seconds under increment is not something you want to
 * discover during a real game.
 *
 * Two things that are easy to confuse, and which scholastic chess uses
 * differently:
 *
 *   increment (Fischer, the "+3" in 5+3) — time is ADDED after you move.
 *   delay (the ";d5" in G/30;d5)         — your clock does not start for the
 *                                          first 5 seconds of your turn. No
 *                                          time is added; unused delay is
 *                                          simply lost.
 *
 * US scholastic events overwhelmingly use delay, so it is the default here.
 */

export const TIME_CONTROLS = [
  { id: 'none', label: 'No clock', baseMs: 0, incrementMs: 0, delayMs: 0 },
  { id: 'g30d5', label: 'G/30;d5 (standard)', baseMs: 30 * 60000, incrementMs: 0, delayMs: 5000 },
  { id: 'g60d5', label: 'G/60;d5 (long)', baseMs: 60 * 60000, incrementMs: 0, delayMs: 5000 },
  { id: 'g25d5', label: 'G/25;d5 (quick)', baseMs: 25 * 60000, incrementMs: 0, delayMs: 5000 },
  { id: 'b5i3', label: '5+3 blitz', baseMs: 5 * 60000, incrementMs: 3000, delayMs: 0 },
  { id: 'b10', label: '10+0 rapid', baseMs: 10 * 60000, incrementMs: 0, delayMs: 0 },
  { id: 'b3i2', label: '3+2 blitz', baseMs: 3 * 60000, incrementMs: 2000, delayMs: 0 },
];

export function findControl(id) {
  return TIME_CONTROLS.find((c) => c.id === id) || TIME_CONTROLS[0];
}

/** A custom control from minutes plus either an increment or a delay, in seconds. */
export function customControl({ minutes, incrementSeconds = 0, delaySeconds = 0 }) {
  return {
    id: 'custom',
    label: `G/${minutes}${delaySeconds ? `;d${delaySeconds}` : ''}${
      incrementSeconds ? ` +${incrementSeconds}` : ''
    }`,
    baseMs: Math.max(0, Math.round(minutes * 60000)),
    incrementMs: Math.max(0, Math.round(incrementSeconds * 1000)),
    delayMs: Math.max(0, Math.round(delaySeconds * 1000)),
  };
}

/**
 * A fresh clock. `turn` follows the board, so a position loaded with Black
 * to move starts Black's clock.
 */
export function createClock(control, turn = 'w') {
  return {
    control,
    white: control.baseMs,
    black: control.baseMs,
    turn,
    running: false,
    turnStartedAt: null,
    // Per move, in order: how long that side thought, and what their clock
    // read afterwards. The first drives time-management stats, the second is
    // what a PGN [%clk] comment records.
    moveTimes: { w: [], b: [] },
  };
}

export function startClock(clock, now = Date.now()) {
  if (clock.running || clock.control.baseMs === 0) return clock;
  return { ...clock, running: true, turnStartedAt: now };
}

export function pauseClock(clock, now = Date.now()) {
  if (!clock.running) return clock;
  return {
    ...clock,
    running: false,
    turnStartedAt: null,
    [colorKey(clock.turn)]: remainingFor(clock, clock.turn, now),
  };
}

const colorKey = (turn) => (turn === 'w' ? 'white' : 'black');

/**
 * How much time a side has left right now. Only the side to move is
 * counting down, and only after any delay has been used up.
 */
export function remainingFor(clock, turn, now = Date.now()) {
  const stored = clock[colorKey(turn)];
  if (!clock.running || clock.turn !== turn || clock.turnStartedAt == null) return stored;

  const elapsed = now - clock.turnStartedAt;
  const counted = Math.max(0, elapsed - clock.control.delayMs);
  return Math.max(0, stored - counted);
}

/** True once the side to move has run out. */
export function hasFlagged(clock, now = Date.now()) {
  if (!clock.running || clock.control.baseMs === 0) return false;
  return remainingFor(clock, clock.turn, now) <= 0;
}

/**
 * Hand the move over. Commits what the mover actually spent, adds any
 * increment, records the time that move took, and starts the other clock.
 */
export function pressClock(clock, now = Date.now()) {
  if (clock.control.baseMs === 0) return { ...clock, turn: clock.turn === 'w' ? 'b' : 'w' };

  const mover = clock.turn;
  const left = remainingFor(clock, mover, now);
  const spent = clock.turnStartedAt == null ? 0 : Math.max(0, now - clock.turnStartedAt);
  const after = left > 0 ? left + clock.control.incrementMs : 0;

  return {
    ...clock,
    [colorKey(mover)]: after,
    turn: mover === 'w' ? 'b' : 'w',
    turnStartedAt: clock.running ? now : null,
    moveTimes: {
      ...clock.moveTimes,
      [mover]: [...clock.moveTimes[mover], { spent, remaining: after }],
    },
  };
}

/** `1:04:09` over an hour, `9:07` under it, and tenths inside the last ten seconds. */
export function formatClock(ms) {
  const safe = Math.max(0, ms);
  const totalSeconds = safe / 1000;

  if (safe < 10000) return totalSeconds.toFixed(1);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const mm = String(minutes).padStart(hours ? 2 : 1, '0');
  return `${hours ? `${hours}:` : ''}${mm}:${String(seconds).padStart(2, '0')}`;
}

/**
 * The `[%clk H:MM:SS.s]` form used in PGN comments, which is what both
 * Chess.com and Lichess emit and what game_analyzer.py already parses.
 */
export function formatPgnClock(ms) {
  const safe = Math.max(0, ms) / 1000;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${seconds.toFixed(1).padStart(4, '0')}`;
}

/**
 * Put `{[%clk ...]}` after every move in an existing PGN.
 *
 * Written as a post-processing pass rather than as a change to the rules
 * engine, which stays exactly as it is. `moveTimes` is the clock's own
 * record; readings are interleaved white, black, white, black to match the
 * order the moves appear in.
 */
export function annotatePgnWithClocks(pgn, moveTimes) {
  if (!pgn || !moveTimes) return pgn;

  const readings = [];
  const maxLength = Math.max(moveTimes.w.length, moveTimes.b.length);
  for (let i = 0; i < maxLength; i += 1) {
    if (moveTimes.w[i]) readings.push(moveTimes.w[i].remaining);
    if (moveTimes.b[i]) readings.push(moveTimes.b[i].remaining);
  }
  if (!readings.length) return pgn;

  const splitAt = pgn.lastIndexOf(']\n');
  const headers = splitAt === -1 ? '' : pgn.slice(0, splitAt + 2);
  const movetext = splitAt === -1 ? pgn : pgn.slice(splitAt + 2);

  let ply = 0;
  const annotated = movetext
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const isMoveNumber = /^\d+\.+$/.test(token);
      const isResult = /^(1-0|0-1|1\/2-1\/2|\*)$/.test(token);
      if (isMoveNumber || isResult) return token;

      const reading = readings[ply];
      ply += 1;
      return reading == null ? token : `${token} {[%clk ${formatPgnClock(reading)}]}`;
    })
    .join(' ');

  // PGN requires a blank line between the tag pairs and the movetext, and
  // splitting on whitespace above ate it.
  return headers ? `${headers}\n${annotated}\n` : `${annotated}\n`;
}

/** The PGN TimeControl tag: `1800+0`, `300+3`, or with delay noted the way the USCF writes it. */
export function pgnTimeControlTag(control) {
  if (!control || control.baseMs === 0) return '-';
  const base = Math.round(control.baseMs / 1000);
  if (control.delayMs) return `${base}+${Math.round(control.delayMs / 1000)}`;
  return `${base}+${Math.round(control.incrementMs / 1000)}`;
}
