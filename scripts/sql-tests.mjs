/*
 * sql-tests.mjs — run the migration scenario tests in supabase/tests on an
 * in-process Postgres (PGlite), so they need no database server and never
 * touch the Supabase project. Each scenario gets a fresh database.
 *
 * A scenario is a stub file plus a test file; psql's `\i` includes are
 * expanded and other backslash commands are ignored. A test fails by raising
 * (every check is an `assert` inside a DO block).
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);

const SCENARIOS = [
  ['supabase/tests/0025-stub-setup.sql', 'supabase/tests/0025-link-account.sql'],
  ['supabase/tests/0026-stub-setup.sql', 'supabase/tests/0026-ratings-guard-games.sql'],
];

const expand = (file) =>
  readFileSync(resolve(root, file), 'utf8')
    .split('\n')
    .map((line) => {
      const include = line.match(/^\\i\s+(\S+)/);
      if (include) return expand(include[1]);
      return line.startsWith('\\') ? '' : line;
    })
    .join('\n');

let failed = 0;
for (const files of SCENARIOS) {
  const db = new PGlite();
  const name = files.at(-1);
  try {
    for (const file of files) await db.exec(expand(file));
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}: ${error.message}`);
  } finally {
    await db.close();
  }
}
if (failed) process.exit(1);
