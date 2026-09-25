-- skip-cc003-games.sql — one-off data fix. NOT APPLIED. For Anthony to run.
--
-- CC-003 ("Magnus Carlsen") is test data, soft-deleted by 0018. Its games are
-- kept, but nobody on the roster will ever read their analysis, so the queue
-- should stop spending engine time on them. This sets analysis_status =
-- 'skipped' on CC-003's pending and failed games — only where no ACTIVE club
-- player is on the other side, matching the rule the app's queue now applies
-- (src/data/retiredPlayers.js → isRetiredOnlyGame).
--
-- Safe to re-run. Touches only analysis_* columns; no row is deleted, and a
-- 'done' analysis is never changed.
--
-- Run the SELECT first and check the count (expected: about 67 pending + 13
-- failed as of 2026-09-17, if nothing has drained since), then the UPDATE.

-- 1. Preview.
select g.analysis_status, count(*)
from public.games g
where g.deleted_at is null
  and g.analysis_status in ('pending', 'failed')
  and (g.white_player_id = 'CC-003' or g.black_player_id = 'CC-003')
  and not exists (
    select 1 from public.players p
    where p.deleted_at is null
      and p.player_id in (g.white_player_id, g.black_player_id)
  )
group by g.analysis_status;

-- 2. Apply.
begin;

update public.games g
set analysis_status     = 'skipped',
    analysis_error      = 'skipped: every club player in this game has been removed from the roster',
    analysis_claimed_at = null,
    analysis_updated_at = now()
where g.deleted_at is null
  and g.analysis_status in ('pending', 'failed')
  and (g.white_player_id = 'CC-003' or g.black_player_id = 'CC-003')
  and not exists (
    select 1 from public.players p
    where p.deleted_at is null
      and p.player_id in (g.white_player_id, g.black_player_id)
  );

-- Check the row count printed above matches the preview, then:
commit;

-- Undo (puts them back in the queue):
-- update public.games set analysis_status = 'pending', analysis_attempts = 0, analysis_error = null
-- where analysis_error like 'skipped: every club player%';
