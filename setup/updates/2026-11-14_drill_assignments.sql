-- Coach-assigned drills: the coach assigns a library drill to a player with an
-- optional note and due date; the player sees it on Practice and marks it done
-- (optionally with a result like "6/9").
create table if not exists public.drill_assignments (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.players(id) on delete cascade,
  drill_id      uuid not null references public.drill_library(id) on delete cascade,
  note          text,
  due_on        date,
  assigned_by   uuid default auth.uid(),
  completed_at  timestamptz,
  player_result text,
  created_at    timestamptz not null default now()
);
create index if not exists drill_assignments_player_idx on public.drill_assignments(player_id);

alter table public.drill_assignments enable row level security;

drop policy if exists drill_assignments_read on public.drill_assignments;
create policy drill_assignments_read on public.drill_assignments
  for select using (
    is_coach() or player_id in (select id from public.players where user_id = auth.uid())
  );

drop policy if exists drill_assignments_coach_insert on public.drill_assignments;
create policy drill_assignments_coach_insert on public.drill_assignments
  for insert with check (is_coach());

drop policy if exists drill_assignments_coach_delete on public.drill_assignments;
create policy drill_assignments_coach_delete on public.drill_assignments
  for delete using (is_coach());

drop policy if exists drill_assignments_update on public.drill_assignments;
create policy drill_assignments_update on public.drill_assignments
  for update using (
    is_coach() or player_id in (select id from public.players where user_id = auth.uid())
  ) with check (
    is_coach() or player_id in (select id from public.players where user_id = auth.uid())
  );

-- Data API access (required for tables created after Oct 30, 2026).
-- Signed-in users may only change the done/result columns; coaches re-assign
-- by deleting and creating.
revoke all on public.drill_assignments from anon;
grant select, insert, delete on public.drill_assignments to authenticated;
revoke update on public.drill_assignments from authenticated;
grant update (completed_at, player_result) on public.drill_assignments to authenticated;
grant all on public.drill_assignments to service_role;
