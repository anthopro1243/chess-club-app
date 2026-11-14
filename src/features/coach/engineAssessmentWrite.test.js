import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeEngineAssessment, utcDay } from './engineAssessmentWrite.js';

/*
 * A stand-in for the assessments table that behaves like production: one
 * engine row per (player, UTC day) via the partial unique index, and no
 * upsert at all — which is the point.
 */
function fakeClient({ rows = [], failUpdate = null, raceInsert = false } = {}) {
  const calls = [];
  const table = {
    rows,
    update(fields) {
      const filters = {};
      const builder = {
        eq(col, value) {
          filters[col] = value;
          return builder;
        },
        async select() {
          calls.push({ op: 'update', filters: { ...filters } });
          if (failUpdate) return { data: null, error: { message: failUpdate } };
          const hit = table.rows.filter((r) => r.player_id === filters.player_id
            && r.source === filters.source && utcDay(r.assessed_at) === filters.assessed_on);
          for (const r of hit) Object.assign(r, fields);
          return { data: hit.map((r) => ({ id: r.id })), error: null };
        },
      };
      return builder;
    },
    async insert(row) {
      calls.push({ op: 'insert' });
      if (raceInsert) {
        // Another tab inserted today's row a moment ago.
        table.rows.push({ ...row, id: 99, tactics: 1 });
        raceInsert = false;
        return { error: { message: 'duplicate key value violates unique constraint "assessments_engine_daily_idx"' } };
      }
      const clash = table.rows.some((r) => r.player_id === row.player_id && r.source === 'engine'
        && row.source === 'engine' && utcDay(r.assessed_at) === utcDay(row.assessed_at));
      if (clash) return { error: { message: 'duplicate key value violates unique constraint "assessments_engine_daily_idx"' } };
      table.rows.push({ ...row, id: table.rows.length + 1 });
      return { error: null };
    },
  };
  return { calls, table, from: () => table };
}

const row = (at, tactics) => ({
  player_id: 'CC-002', source: 'engine', assessed_at: at, tactics, notes: 'Engine estimate',
});

test('utcDay: uses the UTC date, like the generated assessed_on column', () => {
  assert.equal(utcDay('2026-09-25T23:30:00-05:00'), '2026-09-26');
  assert.equal(utcDay('2026-09-25T04:59:00Z'), '2026-09-25');
});

test('first assessment of the day is inserted', async () => {
  const client = fakeClient();
  const result = await writeEngineAssessment(client, row('2026-09-25T15:00:00Z', 6));
  assert.deepEqual(result, { ok: true, action: 'inserted' });
  assert.equal(client.table.rows.length, 1);
});

test('a later assessment the same day UPDATES that row instead of being dropped', async () => {
  const client = fakeClient();
  await writeEngineAssessment(client, row('2026-09-25T15:00:00Z', 6));
  const result = await writeEngineAssessment(client, row('2026-09-25T18:00:00Z', 8));
  assert.deepEqual(result, { ok: true, action: 'updated' });
  assert.equal(client.table.rows.length, 1);
  assert.equal(client.table.rows[0].tactics, 8, 'the newer scores replace the older ones');
});

test('a new day gets a new row', async () => {
  const client = fakeClient();
  await writeEngineAssessment(client, row('2026-09-25T15:00:00Z', 6));
  await writeEngineAssessment(client, row('2026-09-26T15:00:00Z', 7));
  assert.equal(client.table.rows.length, 2);
});

test('NOT touched: a coach assessment on the same day', async () => {
  const coach = { id: 1, player_id: 'CC-002', source: 'coach', assessed_at: '2026-09-25T10:00:00Z', tactics: 3 };
  const client = fakeClient({ rows: [coach] });
  const result = await writeEngineAssessment(client, row('2026-09-25T15:00:00Z', 9));
  assert.equal(result.action, 'inserted');
  assert.equal(coach.tactics, 3, 'the engine never overwrites a coach');
});

test('never sends an upsert or an ON CONFLICT target', async () => {
  const client = fakeClient();
  await writeEngineAssessment(client, row('2026-09-25T15:00:00Z', 6));
  assert.ok(client.calls.every((c) => c.op === 'update' || c.op === 'insert'));
  assert.equal(client.calls[0].filters.assessed_on, '2026-09-25');
  assert.equal(client.calls[0].filters.source, 'engine');
});

test('a tab that loses the insert race updates the winner\'s row', async () => {
  const client = fakeClient({ raceInsert: true });
  const result = await writeEngineAssessment(client, row('2026-09-25T15:00:00Z', 8));
  assert.deepEqual(result, { ok: true, action: 'updated' });
  assert.equal(client.table.rows.length, 1);
  assert.equal(client.table.rows[0].tactics, 8);
});

test('a refused update (e.g. RLS) is reported, not swallowed', async () => {
  const client = fakeClient({ failUpdate: 'new row violates row-level security policy' });
  const result = await writeEngineAssessment(client, row('2026-09-25T15:00:00Z', 6));
  assert.equal(result.ok, false);
  assert.match(result.error, /row-level security/);
});

test('refuses a row that is not an engine assessment', async () => {
  const client = fakeClient();
  const result = await writeEngineAssessment(client, { ...row('2026-09-25T15:00:00Z', 6), source: 'coach' });
  assert.equal(result.ok, false);
  assert.equal(client.calls.length, 0);
});
