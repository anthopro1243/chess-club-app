# Runbook

Operational procedures for the Chess Club app. Written for whoever is
holding the club, which may not be whoever built this.

## Applying a migration

Migrations live in `supabase/migrations/`, numbered, forward-only. They are
written to be safe against a database with real rows and safe to run twice.

1. Take a backup first (see below). Every time. It takes a minute.
2. Open the Supabase dashboard → SQL Editor.
3. Paste one migration file. Run it. Read the output.
4. Some files end with a section headed **DO THIS BY HAND** — do it before
   moving on. `0005` in particular ends with the step that makes you an
   admin, and without it nobody can approve members or read coach notes,
   including you.
5. Deploy the app **after** the migration, never before. The app writes the
   columns the migration adds; if it ships first, writes fail.

### Order they must run in

| File | Adds |
|---|---|
| `migration-4-linked-accounts.sql` (in `supabase/`) | Chess.com / Lichess links |
| `0005_roles_and_access.sql` | profiles, roles, invite codes, coach notes table, real policies |
| `0006_puzzle_attempts.sql` | puzzle attempt logging |
| `0007_split_player_row.sql` | assessments, attendance, ratings, goals |
| `0008_consent_and_soft_delete.sql` | consent records, soft deletes |

`0005` must run before `0006`–`0008`: they all call its helper functions.

## Backups

### What Supabase gives you

Free and Pro projects take automatic daily backups, kept for 7 days on Free
and longer on Pro. Check yours under **Database → Backups**. Daily is not
enough on its own: a mistake on Tuesday found on the following Wednesday is
past the window on a Free plan.

### The manual backup, before anything risky

From the dashboard, **Database → Backups → Download**, or with the CLI:

```bash
supabase db dump --db-url "$DATABASE_URL" -f backup-$(date +%Y-%m-%d).sql
```

Keep these somewhere that is not Supabase and not the same laptop.

### Restore, and testing it

**A backup you have never restored is not a backup.** Do this once, now,
while nothing is wrong:

1. Create a second, empty Supabase project (see Staging below).
2. Restore the dump into it:
   `psql "$STAGING_DB_URL" -f backup-YYYY-MM-DD.sql`
3. Point a local `.env.local` at the staging project and open the app.
4. Confirm the roster, games and assessments are all there.

Now you know the procedure works, and you have a staging environment.

### Recovering from an accidental delete

Deletes are soft since `0008`: removing a player sets `deleted_at` rather
than removing the row. To undo:

```sql
update public.players set deleted_at = null where player_id = 'CC-004';
```

Only an admin can hard-delete, and that is reserved for genuine data-removal
requests from a parent.

## Staging

There is currently one database and it is the live one, which means the first
schema change made mid-season lands on real assessments with no way back.

To set up staging:

1. New Supabase project, any name with `-staging` in it.
2. Run `supabase/schema.sql`, then every migration in order.
3. Copy the URL and anon key into `.env.staging.local`.
4. Run migrations there first, always. Then production.

## Checking the permission rules still hold

`supabase/rls-test.mjs` signs in as a real coach account and a real player
account and asserts what the database actually allows — that a player cannot
read coach notes, cannot read another member's assessments, and cannot
promote themselves.

```bash
RLS_COACH_EMAIL=you@example.com RLS_COACH_PASSWORD=... \
RLS_PLAYER_EMAIL=kid@example.com RLS_PLAYER_PASSWORD=... \
npm run test:rls
```

Without those variables it skips, so `npm test` stays green on a fresh clone.
Run it after any policy change. A broken board is obvious in a second; a
broken permission rule is invisible until it matters.

## Deploying

```bash
npm test
npm run build
npx vercel --prod
```

Migration first, deploy second. Always that order.

## Routine checks

**Every club night:** anyone waiting for approval? Coach page → Members.

**Monthly:** download a manual backup. Check for members without a consent
record:

```sql
select p.player_id, p.name
  from public.players p
 where p.deleted_at is null
   and not exists (select 1 from public.consent_records c
                    where c.player_id = p.player_id and c.withdrawn_at is null);
```

**Each term:** run the restore test again. Procedures rot.

## If something has gone wrong

- **Nobody can use the coach tools.** The admin step in `0005` was skipped.
  Run the `update public.profiles set role = 'admin'` at the end of that file.
- **Every write fails after a deploy.** The app is ahead of the database.
  Apply the outstanding migration.
- **A member cannot get in.** Coach page → Members. They are probably pending.
- **A member cannot reach their email.** Coach page → Members → Password help,
  and send the reset to the guardian address recorded at intake.
