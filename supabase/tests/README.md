# Migration scenario tests (local scratch Postgres only)

These run a migration against a throwaway local Postgres with a fake `auth` schema. They never
touch the Supabase project. **Never run `*-stub-setup.sql` against the real database.**

0025 (account ↔ student linking), from the repo root, with a local Postgres on port 55432:

```
psql -h localhost -p 55432 -U postgres -c "create database t0025"
psql -h localhost -p 55432 -U postgres -d t0025 -f supabase/tests/0025-stub-setup.sql
psql -h localhost -p 55432 -U postgres -d t0025 -f supabase/tests/0025-link-account.sql
# last line printed: ALL 0025 CHECKS PASSED
psql -h localhost -p 55432 -U postgres -c "drop database t0025"
```

The scenario file applies the migration twice (it must be safe to re-run), then checks every branch
of `link_my_account` (matched / created / updated / clash, retiring an empty self-made row,
refusing pending accounts and bad IDs), that members can't read `player_private` or
`account_links`, and the coach's one-click fix (`coach_link_account`) and account list.
