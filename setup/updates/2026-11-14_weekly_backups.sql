-- =====================================================================
-- Weekly automatic backups, kept inside the school's own database
-- =====================================================================
-- Run once per school: Supabase -> SQL Editor -> paste -> Run.
--
-- Every Monday at about 2 AM (Central) this saves a full copy of every app
-- table (scores, rounds, players, courses, drills...) into a private
-- "backup" area that the app and players can't see. The last 12 weeks are
-- kept; older copies are removed automatically. It also takes the first
-- copy right now.
--
-- This protects against the most likely problems: rows deleted by mistake,
-- a bad update, a season set up wrong. To get data back, ask for a restore
-- from a given date. (It lives in the same Supabase project, so for an
-- extra off-site copy, use Manage -> Export a couple of times a season.)
-- =====================================================================

create extension if not exists pg_cron;

create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;

create table if not exists backup.snapshots (
  id         bigserial primary key,
  taken_at   timestamptz not null default now(),
  table_name text not null,
  row_count  int not null,
  data       jsonb not null
);
create index if not exists snapshots_taken_idx on backup.snapshots (taken_at, table_name);
revoke all on backup.snapshots from public, anon, authenticated;

create or replace function backup.take_snapshot()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
  n int := 0;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public' order by tablename
  loop
    execute format(
      'insert into backup.snapshots (table_name, row_count, data)
       select %L, count(*), coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x',
      t, t);
    n := n + 1;
  end loop;
  delete from backup.snapshots where taken_at < now() - interval '12 weeks';
  return n;
end;
$$;
revoke all on function backup.take_snapshot() from public, anon, authenticated;

-- schedule: Mondays 08:17 UTC (about 2 AM Central). Re-running this file
-- replaces the schedule instead of adding a second one.
select cron.unschedule(jobid) from cron.job where jobname = 'weekly-backup';
select cron.schedule('weekly-backup', '17 8 * * 1', 'select backup.take_snapshot()');

-- first copy now
select backup.take_snapshot() as tables_backed_up;

-- ---------------------------------------------------------------------
-- Handy checks (optional, run any time):
--   select taken_at::date, count(*) tables, sum(row_count) rows
--   from backup.snapshots group by 1 order by 1 desc;
-- ---------------------------------------------------------------------
