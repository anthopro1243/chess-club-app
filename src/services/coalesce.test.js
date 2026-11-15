import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { coalesce } from './coalesce.js';

test('a burst of triggers runs once, after the last one', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fn = mock.fn(async () => {});
  const trigger = coalesce(fn, 1000);
  trigger();
  t.mock.timers.tick(600);
  trigger();
  t.mock.timers.tick(600);
  assert.equal(fn.mock.callCount(), 0);
  t.mock.timers.tick(400);
  assert.equal(fn.mock.callCount(), 1);
});

test('triggers during a run queue exactly one more run', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let release;
  const fn = mock.fn(() => new Promise((resolve) => { release = resolve; }));
  const trigger = coalesce(fn, 1000);
  trigger();
  t.mock.timers.tick(1000);
  assert.equal(fn.mock.callCount(), 1);

  trigger();
  t.mock.timers.tick(1000);
  trigger();
  t.mock.timers.tick(1000);
  assert.equal(fn.mock.callCount(), 1, 'never starts a second fetch while one is in flight');

  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fn.mock.callCount(), 2);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fn.mock.callCount(), 2, 'only one catch-up run');
});

test('a failing run does not stop later ones', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fn = mock.fn(async () => { throw new Error('boom'); });
  const trigger = coalesce(fn, 1000);
  trigger();
  t.mock.timers.tick(1000);
  await new Promise((resolve) => setImmediate(resolve));
  trigger();
  t.mock.timers.tick(1000);
  assert.equal(fn.mock.callCount(), 2);
});

test('cancel drops a scheduled run', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fn = mock.fn(async () => {});
  const trigger = coalesce(fn, 1000);
  trigger();
  trigger.cancel();
  t.mock.timers.tick(5000);
  assert.equal(fn.mock.callCount(), 0);
});
