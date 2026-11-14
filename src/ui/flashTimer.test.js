import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFlashTimer } from './flashTimer.js';

// A hand-cranked clock: timers only fire when the test says so.
function fakeClock() {
  let next = 1;
  const pending = new Map();
  return {
    setTimer: (fn, ms) => { const id = next++; pending.set(id, { fn, ms }); return id; },
    clearTimer: (id) => pending.delete(id),
    fireAll: () => { const due = [...pending.values()]; pending.clear(); due.forEach((t) => t.fn()); },
    pending,
  };
}

test('flashTimer: shows a key, then clears it when the timer fires', () => {
  const clock = fakeClock();
  const seen = [];
  const flash = createFlashTimer({ ms: 1200, onChange: (k) => seen.push(k), ...clock });
  flash.show('pgn');
  assert.equal(flash.current(), 'pgn');
  assert.equal([...clock.pending.values()][0].ms, 1200);
  clock.fireAll();
  assert.deepEqual(seen, ['pgn', null]);
  assert.equal(flash.current(), null);
});

test('flashTimer: a second press restarts the clock and the old timer cannot clear the new key', () => {
  const clock = fakeClock();
  const seen = [];
  const flash = createFlashTimer({ onChange: (k) => seen.push(k), ...clock });
  flash.show('pgn');
  const firstTimer = [...clock.pending.values()][0];
  flash.show('fen');
  assert.equal(clock.pending.size, 1, 'the first timer is cancelled');
  firstTimer.fn(); // even if a stale timer slipped through, it must not clear "fen"
  assert.equal(flash.current(), 'fen');
  clock.fireAll();
  assert.deepEqual(seen, ['pgn', 'fen', null]);
});

test('flashTimer: dispose stops a pending clear', () => {
  const clock = fakeClock();
  const flash = createFlashTimer({ onChange: () => {}, ...clock });
  flash.show('x');
  flash.dispose();
  assert.equal(clock.pending.size, 0);
});

test('flashTimer: refuses a zero or missing duration and a missing onChange (should fail)', () => {
  assert.throws(() => createFlashTimer({ ms: 0, onChange: () => {} }), /positive/);
  assert.throws(() => createFlashTimer({ ms: NaN, onChange: () => {} }), /positive/);
  assert.throws(() => createFlashTimer({ ms: 500 }), /onChange/);
});
