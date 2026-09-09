/*
 * Tests for the chess clock.
 *
 * Delay and increment are the two things worth being sure about: they behave
 * differently, scholastic events use delay, and getting either wrong would
 * only show up in the middle of a real game.
 *
 * Every call takes an explicit `now`, so none of this depends on wall time.
 */

import {
  createClock,
  startClock,
  pauseClock,
  pressClock,
  remainingFor,
  hasFlagged,
  findControl,
  customControl,
  formatClock,
  formatPgnClock,
  pgnTimeControlTag,
  annotatePgnWithClocks,
} from './chessClock.js';

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed += 1;
  } else {
    passed += 1;
  }
}

const T0 = 1_000_000;

// -- delay ----------------------------------------------------------------

{
  const control = findControl('g30d5'); // 30 minutes, 5 second delay
  let clock = startClock(createClock(control), T0);

  check('delay: full time before moving', remainingFor(clock, 'w', T0), 30 * 60000);

  // Three seconds in, still inside the delay, so nothing has been spent.
  check('delay: nothing counted inside the delay', remainingFor(clock, 'w', T0 + 3000), 30 * 60000);

  // Eight seconds in: five of delay, three off the clock.
  check('delay: counts only past the delay', remainingFor(clock, 'w', T0 + 8000), 30 * 60000 - 3000);

  // The idle side never counts down.
  check('delay: the other side does not move', remainingFor(clock, 'b', T0 + 8000), 30 * 60000);

  clock = pressClock(clock, T0 + 8000);
  check('delay: no increment is added', clock.white, 30 * 60000 - 3000);
  check('delay: turn passes', clock.turn, 'b');
  check('delay: time spent is recorded whole', clock.moveTimes.w[0].spent, 8000);
  check('delay: reading after the move is the clock', clock.moveTimes.w[0].remaining, 30 * 60000 - 3000);

  // A move made entirely inside the delay costs nothing at all.
  const quick = pressClock(clock, T0 + 8000 + 4000);
  check('delay: a move inside the delay is free', quick.black, 30 * 60000);
}

// -- increment ------------------------------------------------------------

{
  const control = findControl('b5i3'); // 5 minutes plus 3 seconds a move
  let clock = startClock(createClock(control), T0);

  // No delay, so it counts from the first millisecond.
  check('increment: counts immediately', remainingFor(clock, 'w', T0 + 2000), 5 * 60000 - 2000);

  clock = pressClock(clock, T0 + 2000);
  check('increment: added after moving', clock.white, 5 * 60000 - 2000 + 3000);

  // Moving faster than the increment gains time, which is the point of it.
  let gained = startClock(createClock(control), T0);
  gained = pressClock(gained, T0 + 1000);
  check('increment: a fast move gains time', gained.white, 5 * 60000 + 2000);
}

// -- flagging -------------------------------------------------------------

{
  const control = customControl({ minutes: 1, delaySeconds: 0 });
  const clock = startClock(createClock(control), T0);

  check('flag: not flagged with time left', hasFlagged(clock, T0 + 59000), false);
  check('flag: flagged once time is gone', hasFlagged(clock, T0 + 60000), true);
  check('flag: stays flagged after', hasFlagged(clock, T0 + 90000), true);
  check('flag: never negative', remainingFor(clock, 'w', T0 + 90000), 0);

  // Flagging is the mover's problem only: once white has passed the move,
  // white's remaining time is banked and cannot run out while black thinks.
  const afterWhiteMoved = pressClock(clock, T0 + 5000);
  check('flag: black is the one on the clock now', afterWhiteMoved.turn, 'b');
  check('flag: white banked their time', remainingFor(afterWhiteMoved, 'w', T0 + 90000), 55000);
  check('flag: black flags, not white', hasFlagged(afterWhiteMoved, T0 + 90000), true);
}

{
  // A paused clock does not run down while nobody is playing.
  const control = findControl('b10');
  let clock = startClock(createClock(control), T0);
  clock = pauseClock(clock, T0 + 5000);
  check('pause: banks the time spent', clock.white, 10 * 60000 - 5000);
  check('pause: does not keep counting', remainingFor(clock, 'w', T0 + 90000), 10 * 60000 - 5000);
  check('pause: cannot flag while paused', hasFlagged(clock, T0 + 900000), false);
}

{
  // "No clock" has to be inert rather than instantly flagging.
  const clock = startClock(createClock(findControl('none')), T0);
  check('no clock: never runs', clock.running, false);
  check('no clock: never flags', hasFlagged(clock, T0 + 10_000_000), false);
  check('no clock: still passes the turn', pressClock(clock, T0).turn, 'b');
}

// -- black to move from the start ----------------------------------------

{
  const clock = startClock(createClock(findControl('b10'), 'b'), T0);
  check('side to move follows the position', clock.turn, 'b');
  check('black counts down when black is to move', remainingFor(clock, 'b', T0 + 4000), 10 * 60000 - 4000);
  check('white is untouched', remainingFor(clock, 'w', T0 + 4000), 10 * 60000);
}

// -- formatting -----------------------------------------------------------

check('format: under ten seconds shows tenths', formatClock(9400), '9.4');
check('format: minutes and seconds', formatClock(547000), '9:07');
check('format: hours', formatClock(3849000), '1:04:09');
check('format: never negative', formatClock(-500), '0.0');

check('pgn clock: hours, minutes, tenths', formatPgnClock(3849000), '1:04:09.0');
check('pgn clock: pads seconds', formatPgnClock(65500), '0:01:05.5');

check('tag: delay control', pgnTimeControlTag(findControl('g30d5')), '1800+5');
check('tag: increment control', pgnTimeControlTag(findControl('b5i3')), '300+3');
check('tag: no clock', pgnTimeControlTag(findControl('none')), '-');

// -- PGN annotation -------------------------------------------------------

{
  const pgn = '[White "A"]\n[Black "B"]\n\n1. e4 e5 2. Nf3 1-0\n';
  const moveTimes = {
    w: [{ spent: 5000, remaining: 295000 }, { spent: 4000, remaining: 291000 }],
    b: [{ spent: 6000, remaining: 294000 }],
  };
  const out = annotatePgnWithClocks(pgn, moveTimes);

  check(
    'annotate: readings interleave white and black',
    out.includes('e4 {[%clk 0:04:55.0]} e5 {[%clk 0:04:54.0]} 2. Nf3 {[%clk 0:04:51.0]}'),
    true,
  );
  check('annotate: headers survive', out.startsWith('[White "A"]'), true);
  // PGN needs a blank line between the tag pairs and the movetext.
  check('annotate: blank line before the movetext', out.includes(']\n\n1. e4'), true);
  check('annotate: result survives', out.trim().endsWith('1-0'), true);
  check('annotate: no times means no change', annotatePgnWithClocks(pgn, { w: [], b: [] }), pgn);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
