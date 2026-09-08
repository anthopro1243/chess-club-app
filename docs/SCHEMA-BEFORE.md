# Schema before the gap-audit buildout

Snapshot taken 2026-09-08, before any Phase 0 work. Reconstructed from
`supabase/schema.sql` plus migrations 2 and 3, which are the ones actually
applied to the live project. **Migration 4 (linked Chess.com / Lichess
accounts) is written but not yet run** — see PROGRESS.md.

Two tables. Everything else is a JSON column inside one of them.

## `public.players`

| Column | Type | Notes |
|---|---|---|
| `player_id` | text | primary key, `CC-001` convention |
| `user_id` | uuid | unique, → `auth.users(id)` on delete set null |
| `name` | text | not null |
| `grade` | text | |
| `joined` | date | |
| `board_role` | text | free text, e.g. "Board 4" |
| `commitment` | text | 'Casual' or 'Competitive' |
| `ratings` | jsonb | `{ uscf, chesscomRapid, chesscomBlitz, lichessPuzzles, ... }` |
| `preferred_openings` | text[] | |
| `style` | text | |
| `rubric` | jsonb | the 8 categories, current values only |
| `goal` | text | **one free-text goal, no history** |
| `training_focus` | text | |
| `coach_notes` | text | **readable by every signed-in user** |
| `puzzle_stats` | jsonb | `{ solvedIds[], attempts, lastPlayed }` — counts only |
| `club_rating` | jsonb | `{ rating, rd, volatility, count }` (migration 2) |
| `rating_history` | jsonb | append-only array, capped at 500 (migration 3) |
| `assessments` | jsonb | array of `{ at, rubric, notes }` (migration 3) |
| `attendance` | jsonb | array of `{ date, present }` (migration 3) |
| `updated_at` | timestamptz | maintained by the `touch_updated_at` trigger |

Pending in migration 4: `connections` jsonb, `imported_game_ids` jsonb.

## `public.games`

| Column | Type | Notes |
|---|---|---|
| `id` | text | primary key |
| `played_at` | timestamptz | |
| `white_player_id` | text | → `players(player_id)` on delete set null |
| `black_player_id` | text | → `players(player_id)` on delete set null |
| `white_name` | text | |
| `black_name` | text | |
| `result` | text | `1-0` / `0-1` / `1/2-1/2` |
| `reason` | text | |
| `move_count` | integer | plies |
| `mode` | text | `human`, `computer`, and now `chesscom` / `lichess` |
| `computer_elo` | integer | |
| `pgn` | text | |

Indexes: `games_played_at_idx` (played_at desc). Migration 4 adds `games_mode_idx`.

## Row-level security as it stands

RLS is **enabled** on both tables, and every policy is the same:

```sql
create policy "Signed-in users can read the roster"
  on public.players for select
  to authenticated
  using (true);
```

Eight policies total (select/insert/update/delete × 2 tables), all
`using (true)` for the `authenticated` role.

### What this actually means

Any account that can sign in can read and write **every column of every row**,
including `coach_notes`, every player's assessments, and every rating history.
There is no role concept in the database at all. The React app decides what to
show, which means anyone who opens the network tab or calls the public API
directly sees everything.

Signup is open to anyone with the URL, so "any account that can sign in" means
"anyone on the internet who finds the link". This is the gap the audit flags as
Tier 0, and it is confirmed accurate.

## Realtime

Both tables are in the `supabase_realtime` publication.

## Other objects

- `public.touch_updated_at()` — trigger function, keeps `players.updated_at` current
- `players_touch_updated_at` — before-update trigger on `players`

## Counts at snapshot time

Not recorded — the live database was not queried for this snapshot, because
only the anon key is available in this environment and the roster contains
real club members. Run `select count(*) from players;` before migrating if you
want a before/after check.
