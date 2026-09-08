/*
 * rls-test.mjs — prove the database refuses what the UI merely hides.
 *
 * A broken board is obvious in a second. A broken permission rule is
 * invisible until the day it matters, which is exactly why it is worth
 * automating. Every assertion here signs in as a real account and checks
 * what Postgres actually allows, not what React chooses to render.
 *
 * Run:
 *   node supabase/rls-test.mjs
 *
 * Needs four environment variables plus the two already in .env.local:
 *   RLS_COACH_EMAIL   / RLS_COACH_PASSWORD    an account with role coach or admin
 *   RLS_PLAYER_EMAIL  / RLS_PLAYER_PASSWORD   an approved account with role player
 *
 * The player account must own a player row, and there must be at least one
 * other player row for it to fail to read. Without the variables the script
 * skips rather than fails, so `npm test` stays green on a fresh clone.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// -- environment ----------------------------------------------------------

function loadEnvLocal() {
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
    }
  } catch {
    /* no .env.local; rely on the real environment */
  }
}
loadEnvLocal();

const URL_ = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const COACH = { email: process.env.RLS_COACH_EMAIL, password: process.env.RLS_COACH_PASSWORD };
const PLAYER = { email: process.env.RLS_PLAYER_EMAIL, password: process.env.RLS_PLAYER_PASSWORD };

if (!URL_ || !ANON || !COACH.email || !PLAYER.email) {
  console.log('SKIP  rls-test: set RLS_COACH_EMAIL/PASSWORD and RLS_PLAYER_EMAIL/PASSWORD to run.');
  console.log('      These assertions need two real accounts and cannot run without them.');
  process.exit(0);
}

// -- harness --------------------------------------------------------------

let passed = 0;
let failed = 0;

function ok(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  }
}

/** A read that returns no rows is as good as a refusal: the row is unreachable. */
function blocked({ data, error }) {
  return !!error || !data || data.length === 0;
}

async function signIn({ email, password }) {
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Could not sign in as ${email}: ${error.message}`);
  return client;
}

// -- the assertions -------------------------------------------------------

const coach = await signIn(COACH);
const player = await signIn(PLAYER);

// Which player row belongs to the player account, and which does not.
const { data: mine } = await player.from('players').select('player_id').limit(50);
const { data: everyone } = await coach.from('players').select('player_id, user_id').limit(50);

const playerUser = (await player.auth.getUser()).data.user;
const ownRow = everyone?.find((r) => r.user_id === playerUser.id);
const otherRow = everyone?.find((r) => r.user_id !== playerUser.id);

if (!ownRow) {
  console.log('SKIP  rls-test: the player account has not claimed a player row yet.');
  process.exit(0);
}
if (!otherRow) {
  console.log('SKIP  rls-test: needs a second player row to test cross-player reads.');
  process.exit(0);
}

console.log(`\nCoach sees ${everyone.length} player rows; player sees ${mine?.length ?? 0}.\n`);

// --- what a coach must be able to do ---
ok('coach reads coach notes', !blocked(await coach.from('coach_notes').select('*').limit(1))
   || (await coach.from('coach_notes').select('*').limit(1)).error === null);
ok('coach reads every assessment', (await coach.from('assessments').select('*').limit(1)).error === null);
ok('coach reads every puzzle attempt', (await coach.from('puzzle_attempts').select('*').limit(1)).error === null);
ok('coach reads consent records', (await coach.from('consent_records').select('*').limit(1)).error === null);

// --- what a player must NOT be able to do ---
ok(
  'player cannot read coach notes at all',
  blocked(await player.from('coach_notes').select('*').limit(5)),
  'coach_notes leaked to a player account',
);

ok(
  "player cannot read another player's assessments",
  blocked(await player.from('assessments').select('*').eq('player_id', otherRow.player_id).limit(5)),
);

ok(
  "player cannot read another player's puzzle attempts",
  blocked(await player.from('puzzle_attempts').select('*').eq('player_id', otherRow.player_id).limit(5)),
);

ok(
  "player cannot read another player's goals",
  blocked(await player.from('goals').select('*').eq('player_id', otherRow.player_id).limit(5)),
);

ok(
  'player cannot read consent records for other players',
  blocked(await player.from('consent_records').select('*').eq('player_id', otherRow.player_id).limit(5)),
);

ok(
  "player cannot edit another player's row",
  !!(await player.from('players').update({ name: 'RLS TEST SHOULD FAIL' }).eq('player_id', otherRow.player_id).select()).error
    || (await player.from('players').update({ name: 'RLS TEST SHOULD FAIL' }).eq('player_id', otherRow.player_id).select()).data?.length === 0,
);

ok(
  'player cannot delete a player row',
  !!(await player.from('players').delete().eq('player_id', otherRow.player_id).select()).error
    || (await player.from('players').delete().eq('player_id', otherRow.player_id).select()).data?.length === 0,
);

ok(
  'player cannot promote themselves to coach',
  await (async () => {
    await player.from('profiles').update({ role: 'admin' }).eq('user_id', playerUser.id);
    const { data } = await player.from('profiles').select('role').eq('user_id', playerUser.id).single();
    return data?.role !== 'admin';
  })(),
  'a player was able to grant themselves the admin role',
);

ok(
  'player cannot read invite codes',
  blocked(await player.from('invite_codes').select('*').limit(5)),
);

// --- what a player must still be able to do ---
ok(
  'player reads the roster (the leaderboard needs it)',
  (await player.from('players').select('player_id, name').limit(5)).error === null,
);

ok(
  'player reads their own assessments',
  (await player.from('assessments').select('*').eq('player_id', ownRow.player_id).limit(5)).error === null,
);

ok(
  'player logs their own puzzle attempt',
  (await player.from('puzzle_attempts').insert({
    player_id: ownRow.player_id,
    puzzle_id: 'rls-test-fixture',
    correct: true,
  }).select()).error === null,
);

// Clean up the fixture row this script just created.
await coach.from('puzzle_attempts').delete().eq('puzzle_id', 'rls-test-fixture');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
