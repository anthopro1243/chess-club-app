# Migration scenario tests

These run a migration against a throwaway Postgres with a fake `auth` schema. They never touch the
Supabase project. **Never run `*-stub-setup.sql` against the real database.**

They run as part of `npm test`, or on their own:

```
npm run test:sql
```

`scripts/sql-tests.mjs` gives each scenario in its `SCENARIOS` list a fresh in-process Postgres
(PGlite, a dev dependency, so there is nothing to install) and runs the stub file, then the scenario.
psql `\i` includes are expanded; other backslash commands are ignored. Every check is an `assert`
inside a `DO` block, so a scenario fails on the first check that doesn't hold.

| Scenario | Checks |
|---|---|
| `0025-link-account.sql` | Every branch of `link_my_account`: matched, new row, updated row, clash (an ID on someone else's row, or a classmate's ID under a different name), moving off an empty self-made row, nicknames that should still match, one answer per account, and refusals (pending account, bad ID, missing name). Then the coach's checks and fixes, including unlinking. |
| `0026-ratings-guard-games.sql` | `record_club_game_ratings` rates both players in one call, and a member can't rate a game between two others; a member's own edits save but coach-only fields don't, while the coach's do; a member can log their own game or a guest game but not one between two classmates; only the coach can erase a student. |
| `0027-client-errors.sql` | Uses the 0026 stub. Error reports from members are stored and readable only by the coach, and `prune_client_errors()` trims old rows. |

To add one: write `NNNN-<name>.sql` (apply the migration with `\i`, then `DO` blocks of asserts),
reuse a stub or write `NNNN-stub-setup.sql` with the minimum tables and roles it needs, and add the
pair to `SCENARIOS` in `scripts/sql-tests.mjs`.
