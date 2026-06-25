-- ============================================================
--  ENGAGEMENT BATCH — Pre-round coach notes
--  Run this in a NEW SQL Editor tab on your golf project.
--  Safe to run once. Additive only.
--
--  A pre-round note is one note from the COACH about one round
--  (e.g. "focus on tempo today, play the par 5s safe"). The
--  coach writes it; the player on that round reads it and can
--  tap to acknowledge. One note per round.
-- ============================================================


-- ------------------------------------------------------------
-- 1. ROUND_NOTES table.
--    One coach note per round (unique round_id), so editing
--    updates the same row rather than piling up duplicates.
-- ------------------------------------------------------------
create table if not exists public.round_notes (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references public.rounds(id) on delete cascade,
  body          text not null,
  acknowledged  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (round_id)
);


-- ------------------------------------------------------------
-- 2. ROW LEVEL SECURITY
--    Coach writes/edits/deletes; any linked player can read and
--    update (the update is used to flip the acknowledged flag).
--    Mirrors your round_comments pattern, using is_coach().
-- ------------------------------------------------------------
alter table public.round_notes enable row level security;

-- read: coach sees all; any authenticated user can read notes
drop policy if exists "notes read" on public.round_notes;
create policy "notes read" on public.round_notes
  for select using (
    public.is_coach()
    or auth.uid() is not null
  );

-- insert: coach only
drop policy if exists "notes insert" on public.round_notes;
create policy "notes insert" on public.round_notes
  for insert with check (
    public.is_coach()
  );

-- update: coach can edit the note; players can update (to acknowledge)
drop policy if exists "notes update" on public.round_notes;
create policy "notes update" on public.round_notes
  for update using (
    public.is_coach()
    or auth.uid() is not null
  );

-- delete: coach only
drop policy if exists "notes delete" on public.round_notes;
create policy "notes delete" on public.round_notes
  for delete using (
    public.is_coach()
  );


-- ============================================================
--  DONE. Verify (optional):
--    select * from public.round_notes;
-- ============================================================
