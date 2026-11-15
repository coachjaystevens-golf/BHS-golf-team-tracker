-- =====================================================================
-- Golf Team Tracker: database setup for a NEW school
-- =====================================================================
-- Run this ONCE in a brand-new Supabase project:
--   Supabase -> your new project -> SQL Editor -> paste all -> Run
-- It creates every table, security rule (RLS), helper function and
-- permission the app needs, then loads the drill library.
--
-- It runs as one step: if anything fails, nothing is saved, so you can
-- fix the problem and run the whole file again.
--
-- Generated from the live Beech database on 2026-11-14 (includes
-- migrations through #23: team averages, drill assignments, and the
-- explicit permissions Supabase requires for projects made after
-- Oct 30, 2026). Regenerate it after future database changes.
-- =====================================================================

-- ---- Tables ----
create table if not exists public.club_shots (
  id uuid default gen_random_uuid() not null,
  player_id uuid not null,
  round_id uuid,
  club text not null,
  hole_number integer,
  start_lat double precision,
  start_lng double precision,
  end_lat double precision,
  end_lng double precision,
  yards numeric,
  counted boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.courses (
  id uuid default gen_random_uuid() not null,
  name text not null,
  holes integer not null,
  par_per_hole integer[] not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.drill_assignments (
  id uuid default gen_random_uuid() not null,
  player_id uuid not null,
  drill_id uuid not null,
  note text,
  due_on date,
  assigned_by uuid default auth.uid(),
  completed_at timestamp with time zone,
  player_result text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.drill_library (
  id uuid default gen_random_uuid() not null,
  item_type text default 'drill'::text not null,
  skill_category text not null,
  title text not null,
  summary text,
  instructions text,
  difficulty text,
  photo_url text,
  sort_order integer default 100 not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.drill_scores (
  id uuid default gen_random_uuid() not null,
  session_id uuid not null,
  player_id uuid not null,
  hole_number integer not null,
  strokes integer not null,
  hit_green boolean,
  putts integer,
  club text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.drill_sessions (
  id uuid default gen_random_uuid() not null,
  season_id uuid,
  course_id uuid not null,
  drill_key text default 'approach_100'::text not null,
  label text default '100-Yard Challenge'::text not null,
  start_distance_yards integer default 100 not null,
  target_per_hole integer default 2 not null,
  start_hole integer default 1 not null,
  end_hole integer default 18 not null,
  played_on date default CURRENT_DATE not null,
  status text default 'in_progress'::text not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.hole_coordinates (
  id uuid default gen_random_uuid() not null,
  course_id uuid not null,
  hole_number integer not null,
  front_lat double precision,
  front_lng double precision,
  center_lat double precision,
  center_lng double precision,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid
);

create table if not exists public.hole_hazards (
  id uuid default gen_random_uuid() not null,
  course_id uuid not null,
  hole_number integer not null,
  hazard_type text default 'carry'::text not null,
  label text,
  front_lat double precision,
  front_lng double precision,
  back_lat double precision,
  back_lng double precision,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.player_clubs (
  id uuid default gen_random_uuid() not null,
  player_id uuid not null,
  club text not null,
  label text not null,
  sort_order integer default 0 not null,
  avg_yards numeric,
  shot_count integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.player_drills (
  id uuid default gen_random_uuid() not null,
  player_id uuid not null,
  drill_id uuid not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.players (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  full_name text not null,
  gender text not null,
  grade integer,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  join_code text,
  capture_helper boolean default false not null,
  archived boolean default false not null,
  archived_at timestamp with time zone
);

create table if not exists public.practice_goals (
  id uuid default gen_random_uuid() not null,
  player_id uuid not null,
  description text not null,
  target_value numeric,
  created_by text default 'player'::text not null,
  completed boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.profiles (
  id uuid not null,
  full_name text,
  role text default 'player'::text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.putting_attempts (
  id uuid default gen_random_uuid() not null,
  session_id uuid not null,
  player_id uuid not null,
  attempt_number integer not null,
  distance_ft numeric,
  outcome text not null,
  points integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.putting_sessions (
  id uuid default gen_random_uuid() not null,
  season_id uuid not null,
  drill_key text not null,
  label text not null,
  config jsonb default '{}'::jsonb not null,
  played_on date default CURRENT_DATE not null,
  status text default 'in_progress'::text not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.round_comments (
  id uuid default gen_random_uuid() not null,
  round_id uuid not null,
  player_id uuid not null,
  body text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.round_lineup (
  round_id uuid not null,
  player_id uuid not null,
  team text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.round_notes (
  id uuid default gen_random_uuid() not null,
  round_id uuid not null,
  body text not null,
  acknowledged boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.round_stats (
  id uuid default gen_random_uuid() not null,
  round_id uuid not null,
  player_id uuid not null,
  up_down_made integer default 0 not null,
  up_down_attempts integer default 0 not null,
  bunker_made integer default 0 not null,
  bunker_attempts integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.rounds (
  id uuid default gen_random_uuid() not null,
  course_id uuid not null,
  played_on date default CURRENT_DATE not null,
  type text not null,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  season_id uuid,
  start_hole integer default 1 not null,
  end_hole integer default 18 not null,
  status text default 'in_progress'::text not null,
  boys_count integer,
  girls_count integer
);

create table if not exists public.scores (
  id uuid default gen_random_uuid() not null,
  round_id uuid not null,
  player_id uuid not null,
  hole_number integer not null,
  strokes integer not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  putts integer,
  fairway_hit boolean,
  green_in_regulation boolean
);

create table if not exists public.season_players (
  id uuid default gen_random_uuid() not null,
  season_id uuid not null,
  player_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.seasons (
  id uuid default gen_random_uuid() not null,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  is_active boolean default false not null,
  created_at timestamp with time zone default now() not null
);

-- ---- Keys and checks ----
alter table public.club_shots add constraint club_shots_pkey PRIMARY KEY (id);
alter table public.courses add constraint courses_pkey PRIMARY KEY (id);
alter table public.drill_assignments add constraint drill_assignments_pkey PRIMARY KEY (id);
alter table public.drill_library add constraint drill_library_pkey PRIMARY KEY (id);
alter table public.drill_scores add constraint drill_scores_pkey PRIMARY KEY (id);
alter table public.drill_sessions add constraint drill_sessions_pkey PRIMARY KEY (id);
alter table public.hole_coordinates add constraint hole_coordinates_pkey PRIMARY KEY (id);
alter table public.hole_hazards add constraint hole_hazards_pkey PRIMARY KEY (id);
alter table public.player_clubs add constraint player_clubs_pkey PRIMARY KEY (id);
alter table public.player_drills add constraint player_drills_pkey PRIMARY KEY (id);
alter table public.players add constraint players_pkey PRIMARY KEY (id);
alter table public.practice_goals add constraint practice_goals_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.putting_attempts add constraint putting_attempts_pkey PRIMARY KEY (id);
alter table public.putting_sessions add constraint putting_sessions_pkey PRIMARY KEY (id);
alter table public.round_comments add constraint round_comments_pkey PRIMARY KEY (id);
alter table public.round_lineup add constraint round_lineup_pkey PRIMARY KEY (round_id, player_id);
alter table public.round_notes add constraint round_notes_pkey PRIMARY KEY (id);
alter table public.round_stats add constraint round_stats_pkey PRIMARY KEY (id);
alter table public.rounds add constraint rounds_pkey PRIMARY KEY (id);
alter table public.scores add constraint scores_pkey PRIMARY KEY (id);
alter table public.season_players add constraint season_players_pkey PRIMARY KEY (id);
alter table public.seasons add constraint seasons_pkey PRIMARY KEY (id);
alter table public.drill_library add constraint drill_library_title_key UNIQUE (title);
alter table public.drill_scores add constraint drill_scores_session_id_player_id_hole_number_key UNIQUE (session_id, player_id, hole_number);
alter table public.hole_coordinates add constraint hole_coordinates_course_id_hole_number_key UNIQUE (course_id, hole_number);
alter table public.player_clubs add constraint player_clubs_player_id_club_key UNIQUE (player_id, club);
alter table public.player_drills add constraint player_drills_unique UNIQUE (player_id, drill_id);
alter table public.putting_attempts add constraint putting_attempts_session_id_player_id_attempt_number_key UNIQUE (session_id, player_id, attempt_number);
alter table public.round_comments add constraint round_comments_round_id_player_id_key UNIQUE (round_id, player_id);
alter table public.round_notes add constraint round_notes_round_id_key UNIQUE (round_id);
alter table public.round_stats add constraint round_stats_round_player_unique UNIQUE (round_id, player_id);
alter table public.scores add constraint scores_round_id_player_id_hole_number_key UNIQUE (round_id, player_id, hole_number);
alter table public.season_players add constraint season_players_season_id_player_id_key UNIQUE (season_id, player_id);
alter table public.courses add constraint courses_holes_check CHECK ((holes = ANY (ARRAY[9, 18])));
alter table public.drill_library add constraint drill_library_difficulty_check CHECK (((difficulty = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text])) OR (difficulty IS NULL)));
alter table public.drill_library add constraint drill_library_item_type_check CHECK ((item_type = ANY (ARRAY['drill'::text, 'reference'::text])));
alter table public.drill_library add constraint drill_library_skill_category_check CHECK ((skill_category = ANY (ARRAY['putting'::text, 'chipping'::text, 'pitching'::text, 'bunker'::text, 'full_swing'::text, 'course_management'::text])));
alter table public.hole_coordinates add constraint hole_coordinates_hole_number_check CHECK (((hole_number >= 1) AND (hole_number <= 18)));
alter table public.hole_hazards add constraint hole_hazards_hazard_type_check CHECK ((hazard_type = ANY (ARRAY['carry'::text, 'aim'::text])));
alter table public.hole_hazards add constraint hole_hazards_hole_number_check CHECK (((hole_number >= 1) AND (hole_number <= 18)));
alter table public.players add constraint players_gender_check CHECK ((gender = ANY (ARRAY['boys'::text, 'girls'::text])));
alter table public.profiles add constraint profiles_role_check CHECK ((role = ANY (ARRAY['player'::text, 'coach'::text])));
alter table public.putting_attempts add constraint putting_attempts_outcome_check CHECK ((outcome = ANY (ARRAY['holed'::text, 'zone'::text, 'miss'::text])));
alter table public.putting_sessions add constraint putting_sessions_drill_key_check CHECK ((drill_key = ANY (ARRAY['clock'::text, 'ladder'::text, 'gate'::text, 'points'::text])));
alter table public.putting_sessions add constraint putting_sessions_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'complete'::text])));
alter table public.round_stats add constraint round_stats_made_le_attempts CHECK (((up_down_made <= up_down_attempts) AND (bunker_made <= bunker_attempts)));
alter table public.round_stats add constraint round_stats_nonneg CHECK (((up_down_made >= 0) AND (up_down_attempts >= 0) AND (bunker_made >= 0) AND (bunker_attempts >= 0)));
alter table public.rounds add constraint rounds_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'complete'::text])));
alter table public.rounds add constraint rounds_type_check CHECK ((type = ANY (ARRAY['match'::text, 'practice'::text])));
alter table public.scores add constraint scores_hole_number_check CHECK (((hole_number >= 1) AND (hole_number <= 18)));
alter table public.scores add constraint scores_putts_check CHECK (((putts IS NULL) OR ((putts >= 0) AND (putts <= 15))));
alter table public.scores add constraint scores_strokes_check CHECK (((strokes >= 1) AND (strokes <= 20)));
alter table public.club_shots add constraint club_shots_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
alter table public.club_shots add constraint club_shots_round_id_fkey FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE;
alter table public.drill_assignments add constraint drill_assignments_drill_id_fkey FOREIGN KEY (drill_id) REFERENCES drill_library(id) ON DELETE CASCADE;
alter table public.drill_assignments add constraint drill_assignments_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
alter table public.drill_scores add constraint drill_scores_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
alter table public.drill_scores add constraint drill_scores_session_id_fkey FOREIGN KEY (session_id) REFERENCES drill_sessions(id) ON DELETE CASCADE;
alter table public.drill_sessions add constraint drill_sessions_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
alter table public.drill_sessions add constraint drill_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.drill_sessions add constraint drill_sessions_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE SET NULL;
alter table public.hole_coordinates add constraint hole_coordinates_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
alter table public.hole_coordinates add constraint hole_coordinates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.hole_hazards add constraint hole_hazards_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
alter table public.player_clubs add constraint player_clubs_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
alter table public.player_drills add constraint player_drills_drill_id_fkey FOREIGN KEY (drill_id) REFERENCES drill_library(id) ON DELETE CASCADE;
alter table public.player_drills add constraint player_drills_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
alter table public.players add constraint players_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.practice_goals add constraint practice_goals_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.putting_attempts add constraint putting_attempts_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
alter table public.putting_attempts add constraint putting_attempts_session_id_fkey FOREIGN KEY (session_id) REFERENCES putting_sessions(id) ON DELETE CASCADE;
alter table public.putting_sessions add constraint putting_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.putting_sessions add constraint putting_sessions_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;
alter table public.round_comments add constraint round_comments_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
alter table public.round_comments add constraint round_comments_round_id_fkey FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE;
alter table public.round_lineup add constraint round_lineup_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
alter table public.round_lineup add constraint round_lineup_round_id_fkey FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE;
alter table public.round_notes add constraint round_notes_round_id_fkey FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE;
alter table public.round_stats add constraint round_stats_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
alter table public.round_stats add constraint round_stats_round_id_fkey FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE;
alter table public.rounds add constraint rounds_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT;
alter table public.rounds add constraint rounds_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.rounds add constraint rounds_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(id);
alter table public.scores add constraint scores_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
alter table public.scores add constraint scores_round_id_fkey FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE;
alter table public.season_players add constraint season_players_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
alter table public.season_players add constraint season_players_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;

-- ---- Indexes ----
CREATE INDEX idx_club_shots_round ON public.club_shots USING btree (round_id);
CREATE INDEX idx_club_shots_player ON public.club_shots USING btree (player_id);
CREATE INDEX drill_assignments_player_idx ON public.drill_assignments USING btree (player_id);
CREATE INDEX drill_library_category_idx ON public.drill_library USING btree (skill_category);
CREATE INDEX drill_library_type_idx ON public.drill_library USING btree (item_type);
CREATE INDEX drill_scores_session_idx ON public.drill_scores USING btree (session_id);
CREATE INDEX drill_scores_player_idx ON public.drill_scores USING btree (player_id);
CREATE INDEX drill_sessions_season_idx ON public.drill_sessions USING btree (season_id, played_on DESC);
CREATE UNIQUE INDEX hole_hazards_course_hole_type_idx ON public.hole_hazards USING btree (course_id, hole_number, hazard_type);
CREATE INDEX hole_hazards_course_idx ON public.hole_hazards USING btree (course_id);
CREATE INDEX idx_player_clubs_player ON public.player_clubs USING btree (player_id);
CREATE INDEX player_drills_drill_idx ON public.player_drills USING btree (drill_id);
CREATE INDEX player_drills_player_idx ON public.player_drills USING btree (player_id);
CREATE INDEX players_archived_idx ON public.players USING btree (archived);
CREATE UNIQUE INDEX players_join_code_key ON public.players USING btree (join_code);
CREATE INDEX idx_practice_goals_player ON public.practice_goals USING btree (player_id);
CREATE INDEX idx_putting_attempts_session ON public.putting_attempts USING btree (session_id);
CREATE INDEX idx_putting_sessions_season ON public.putting_sessions USING btree (season_id, played_on DESC);
CREATE INDEX round_lineup_player_idx ON public.round_lineup USING btree (player_id);
CREATE INDEX round_lineup_round_idx ON public.round_lineup USING btree (round_id);
CREATE INDEX round_stats_round_idx ON public.round_stats USING btree (round_id);
CREATE INDEX round_stats_player_idx ON public.round_stats USING btree (player_id);
CREATE INDEX idx_rounds_status ON public.rounds USING btree (status);

-- ---- Functions ----
CREATE OR REPLACE FUNCTION public.claim_player(code text)
 RETURNS TABLE(player_id uuid, full_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target public.players%rowtype;
begin
  -- the caller must be logged in
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  -- has this user already claimed a player? if so, return it
  select * into target from public.players where user_id = auth.uid() limit 1;
  if found then
    return query select target.id, target.full_name;
    return;
  end if;

  -- find the roster row for this code
  select * into target
  from public.players
  where join_code = upper(trim(code));

  if not found then
    raise exception 'That code did not match any player';
  end if;

  if target.user_id is not null then
    raise exception 'That player has already been claimed';
  end if;

  -- link it to the current user
  update public.players
  set user_id = auth.uid()
  where id = target.id;

  return query select target.id, target.full_name;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_capture_helper()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.players
    where user_id = auth.uid() and capture_helper = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_coach()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'coach'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.make_join_code()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result   text := '';
  i        int;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
  end loop;
  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_drill_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_join_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  new_code text;
begin
  if new.join_code is null then
    loop
      new_code := public.make_join_code();
      exit when not exists (
        select 1 from public.players where join_code = new_code
      );
    end loop;
    new.join_code := new_code;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_round_stats_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.team_stat_averages(p_season uuid, p_gender text, p_holes integer)
 RETURNS TABLE(players integer, cards integer, avg_score numeric, avg_to_par numeric, putts_per_round numeric, three_putts_per_round numeric, gir_pct numeric, fir_pct numeric, birdies_per_round numeric, doubles_per_round numeric, par3 numeric, par4 numeric, par5 numeric, ud_pct numeric, sand_pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with r as (
    select ro.id, ro.course_id,
           coalesce(ro.end_hole, 18) - coalesce(ro.start_hole, 1) + 1 as hc
    from rounds ro
    where ro.season_id = p_season
  ),
  rf as (
    select * from r where case when p_holes = 9 then hc <= 9 else hc > 9 end
  ),
  h as (
    select sc.player_id, sc.round_id, sc.strokes, sc.putts, sc.fairway_hit,
           sc.green_in_regulation, (c.par_per_hole)[sc.hole_number] as par, rf.hc
    from scores sc
    join rf on rf.id = sc.round_id
    join courses c on c.id = rf.course_id
    join players p on p.id = sc.player_id and p.gender = p_gender
  ),
  cards as (
    select player_id, round_id, max(hc) as hc, count(*) as n, count(par) as np,
           sum(strokes) as tot, sum(strokes - par) as tp
    from h group by player_id, round_id
  ),
  done as (select * from cards where n >= hc and np = n),
  sg as (
    select s.* from round_stats s
    join rf on rf.id = s.round_id
    join players p on p.id = s.player_id and p.gender = p_gender
  ),
  t as (
    select
      (select count(distinct player_id) from cards)::int as players,
      (select count(*) from done)::int as cards,
      (select round(avg(tot), 1) from done) as avg_score,
      (select round(avg(tp), 1) from done) as avg_to_par,
      (select round(sum(putts)::numeric / nullif(count(putts), 0) * p_holes, 1) from h) as putts_per_round,
      (select round(count(*) filter (where putts >= 3)::numeric / nullif(count(putts), 0) * p_holes, 1) from h) as three_putts_per_round,
      (select round(100.0 * count(*) filter (where green_in_regulation) / nullif(count(green_in_regulation), 0)) from h) as gir_pct,
      (select round(100.0 * count(*) filter (where fairway_hit) / nullif(count(fairway_hit), 0)) from h where par > 3) as fir_pct,
      (select round(count(*) filter (where strokes - par <= -1)::numeric / nullif(count(par), 0) * p_holes, 1) from h) as birdies_per_round,
      (select round(count(*) filter (where strokes - par >= 2)::numeric / nullif(count(par), 0) * p_holes, 1) from h) as doubles_per_round,
      (select round(avg(strokes - par), 2) from h where par = 3) as par3,
      (select round(avg(strokes - par), 2) from h where par = 4) as par4,
      (select round(avg(strokes - par), 2) from h where par = 5) as par5,
      (select round(100.0 * sum(up_down_made) / nullif(sum(up_down_attempts), 0)) from sg) as ud_pct,
      (select round(100.0 * sum(bunker_made) / nullif(sum(bunker_attempts), 0)) from sg) as sand_pct
  )
  select
    t.players,
    case when t.players >= 3 then t.cards end,
    case when t.players >= 3 then t.avg_score end,
    case when t.players >= 3 then t.avg_to_par end,
    case when t.players >= 3 then t.putts_per_round end,
    case when t.players >= 3 then t.three_putts_per_round end,
    case when t.players >= 3 then t.gir_pct end,
    case when t.players >= 3 then t.fir_pct end,
    case when t.players >= 3 then t.birdies_per_round end,
    case when t.players >= 3 then t.doubles_per_round end,
    case when t.players >= 3 then t.par3 end,
    case when t.players >= 3 then t.par4 end,
    case when t.players >= 3 then t.par5 end,
    case when t.players >= 3 then t.ud_pct end,
    case when t.players >= 3 then t.sand_pct end
  from t
  where auth.uid() is not null;
$function$
;

-- ---- Triggers ----
CREATE TRIGGER trg_drill_library_updated_at BEFORE UPDATE ON public.drill_library FOR EACH ROW EXECUTE FUNCTION set_drill_updated_at();
CREATE TRIGGER trg_player_drills_updated_at BEFORE UPDATE ON public.player_drills FOR EACH ROW EXECUTE FUNCTION set_drill_updated_at();
CREATE TRIGGER trg_round_stats_updated_at BEFORE UPDATE ON public.round_stats FOR EACH ROW EXECUTE FUNCTION set_round_stats_updated_at();
CREATE TRIGGER trg_set_join_code BEFORE INSERT ON public.players FOR EACH ROW EXECUTE FUNCTION set_join_code();

-- ---- Turn on row-level security ----
alter table public.club_shots enable row level security;
alter table public.courses enable row level security;
alter table public.drill_assignments enable row level security;
alter table public.drill_library enable row level security;
alter table public.drill_scores enable row level security;
alter table public.drill_sessions enable row level security;
alter table public.hole_coordinates enable row level security;
alter table public.hole_hazards enable row level security;
alter table public.player_clubs enable row level security;
alter table public.player_drills enable row level security;
alter table public.players enable row level security;
alter table public.practice_goals enable row level security;
alter table public.profiles enable row level security;
alter table public.putting_attempts enable row level security;
alter table public.putting_sessions enable row level security;
alter table public.round_comments enable row level security;
alter table public.round_lineup enable row level security;
alter table public.round_notes enable row level security;
alter table public.round_stats enable row level security;
alter table public.rounds enable row level security;
alter table public.scores enable row level security;
alter table public.season_players enable row level security;
alter table public.seasons enable row level security;

-- ---- Security rules (policies) ----
create policy "shots delete" on public.club_shots as permissive for delete to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy "shots insert" on public.club_shots as permissive for insert to public with check ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy "shots read" on public.club_shots as permissive for select to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy "shots update" on public.club_shots as permissive for update to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy "coach manages courses" on public.courses as permissive for all to public using (is_coach()) with check (is_coach());
create policy "courses read" on public.courses as permissive for select to public using ((auth.uid() IS NOT NULL));
create policy drill_assignments_coach_delete on public.drill_assignments as permissive for delete to public using (is_coach());
create policy drill_assignments_coach_insert on public.drill_assignments as permissive for insert to public with check (is_coach());
create policy drill_assignments_read on public.drill_assignments as permissive for select to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy drill_assignments_update on public.drill_assignments as permissive for update to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid()))))) with check ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy drill_library_coach_write on public.drill_library as permissive for all to public using (is_coach()) with check (is_coach());
create policy drill_library_read on public.drill_library as permissive for select to public using ((auth.uid() IS NOT NULL));
create policy drill_scores_delete on public.drill_scores as permissive for delete to authenticated using (((player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text))))));
create policy drill_scores_insert on public.drill_scores as permissive for insert to authenticated with check (((player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text))))));
create policy drill_scores_select on public.drill_scores as permissive for select to authenticated using (true);
create policy drill_scores_update on public.drill_scores as permissive for update to authenticated using (((player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text)))))) with check (((player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text))))));
create policy drill_sessions_delete on public.drill_sessions as permissive for delete to authenticated using (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text))))));
create policy drill_sessions_insert on public.drill_sessions as permissive for insert to authenticated with check (true);
create policy drill_sessions_select on public.drill_sessions as permissive for select to authenticated using (true);
create policy drill_sessions_update on public.drill_sessions as permissive for update to authenticated using (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text)))))) with check (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text))))));
create policy "coords delete" on public.hole_coordinates as permissive for delete to public using (is_coach());
create policy "coords insert" on public.hole_coordinates as permissive for insert to public with check ((is_coach() OR is_capture_helper()));
create policy "coords read" on public.hole_coordinates as permissive for select to public using ((auth.uid() IS NOT NULL));
create policy "coords update" on public.hole_coordinates as permissive for update to public using ((is_coach() OR is_capture_helper()));
create policy hole_hazards_delete on public.hole_hazards as permissive for delete to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text)))));
create policy hole_hazards_insert on public.hole_hazards as permissive for insert to authenticated with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text)))));
create policy hole_hazards_select on public.hole_hazards as permissive for select to authenticated using (true);
create policy hole_hazards_update on public.hole_hazards as permissive for update to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text)))));
create policy "clubs delete" on public.player_clubs as permissive for delete to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy "clubs insert" on public.player_clubs as permissive for insert to public with check ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy "clubs read" on public.player_clubs as permissive for select to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy "clubs update" on public.player_clubs as permissive for update to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy player_drills_delete on public.player_drills as permissive for delete to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy player_drills_insert on public.player_drills as permissive for insert to public with check ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy player_drills_read on public.player_drills as permissive for select to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy "coach manages roster" on public.players as permissive for all to public using (is_coach()) with check (is_coach());
create policy "roster read" on public.players as permissive for select to public using ((auth.uid() IS NOT NULL));
create policy "goals delete" on public.practice_goals as permissive for delete to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy "goals insert" on public.practice_goals as permissive for insert to public with check ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy "goals read" on public.practice_goals as permissive for select to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy "goals update" on public.practice_goals as permissive for update to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy "own profile insert" on public.profiles as permissive for insert to public with check ((id = auth.uid()));
create policy "own profile read" on public.profiles as permissive for select to public using (((id = auth.uid()) OR is_coach()));
create policy "own profile write" on public.profiles as permissive for update to public using ((id = auth.uid()));
create policy putting_attempts_select on public.putting_attempts as permissive for select to authenticated using (true);
create policy putting_attempts_write on public.putting_attempts as permissive for all to authenticated using (((EXISTS ( SELECT 1
   FROM players pl
  WHERE ((pl.id = putting_attempts.player_id) AND (pl.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text)))))) with check (((EXISTS ( SELECT 1
   FROM players pl
  WHERE ((pl.id = putting_attempts.player_id) AND (pl.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text))))));
create policy putting_sessions_delete on public.putting_sessions as permissive for delete to authenticated using (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text))))));
create policy putting_sessions_insert on public.putting_sessions as permissive for insert to authenticated with check (true);
create policy putting_sessions_select on public.putting_sessions as permissive for select to authenticated using (true);
create policy putting_sessions_update on public.putting_sessions as permissive for update to authenticated using (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text))))));
create policy "comments delete" on public.round_comments as permissive for delete to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy "comments insert" on public.round_comments as permissive for insert to public with check ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy "comments read" on public.round_comments as permissive for select to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy "comments update" on public.round_comments as permissive for update to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy round_comments_coach_write on public.round_comments as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text)))));
create policy round_lineup_delete on public.round_lineup as permissive for delete to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text)))));
create policy round_lineup_insert on public.round_lineup as permissive for insert to authenticated with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text)))));
create policy round_lineup_select on public.round_lineup as permissive for select to authenticated using (true);
create policy "notes delete" on public.round_notes as permissive for delete to public using (is_coach());
create policy "notes insert" on public.round_notes as permissive for insert to public with check (is_coach());
create policy "notes read" on public.round_notes as permissive for select to public using ((is_coach() OR (auth.uid() IS NOT NULL)));
create policy "notes update" on public.round_notes as permissive for update to public using ((is_coach() OR (auth.uid() IS NOT NULL)));
create policy round_stats_coach_write on public.round_stats as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text)))));
create policy round_stats_delete on public.round_stats as permissive for delete to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy round_stats_insert on public.round_stats as permissive for insert to public with check ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy round_stats_read on public.round_stats as permissive for select to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy round_stats_update on public.round_stats as permissive for update to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy "coach manages rounds" on public.rounds as permissive for all to public using (is_coach()) with check (is_coach());
create policy "players create practice rounds" on public.rounds as permissive for insert to public with check (((type = 'practice'::text) AND (auth.uid() IS NOT NULL)));
create policy "rounds read" on public.rounds as permissive for select to public using ((auth.uid() IS NOT NULL));
create policy "scores delete" on public.scores as permissive for delete to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy "scores insert" on public.scores as permissive for insert to public with check ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy "scores read" on public.scores as permissive for select to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy "scores update" on public.scores as permissive for update to public using ((is_coach() OR (player_id IN ( SELECT players.id
   FROM players
  WHERE (players.user_id = auth.uid())))));
create policy scores_coach_write on public.scores as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'coach'::text)))));
create policy "coach manages season_players" on public.season_players as permissive for all to public using (is_coach()) with check (is_coach());
create policy "season_players read" on public.season_players as permissive for select to public using ((auth.uid() IS NOT NULL));
create policy "coach manages seasons" on public.seasons as permissive for all to public using (is_coach()) with check (is_coach());
create policy "seasons read" on public.seasons as permissive for select to public using ((auth.uid() IS NOT NULL));

-- ---- Table permissions ----
grant delete, insert, references, select, trigger, truncate, update on public.club_shots to anon;
grant delete, insert, references, select, trigger, truncate, update on public.club_shots to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.club_shots to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.courses to anon;
grant delete, insert, references, select, trigger, truncate, update on public.courses to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.courses to service_role;
grant delete, insert, references, select, trigger, truncate on public.drill_assignments to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.drill_assignments to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.drill_library to anon;
grant delete, insert, references, select, trigger, truncate, update on public.drill_library to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.drill_library to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.drill_scores to anon;
grant delete, insert, references, select, trigger, truncate, update on public.drill_scores to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.drill_scores to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.drill_sessions to anon;
grant delete, insert, references, select, trigger, truncate, update on public.drill_sessions to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.drill_sessions to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.hole_coordinates to anon;
grant delete, insert, references, select, trigger, truncate, update on public.hole_coordinates to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.hole_coordinates to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.hole_hazards to anon;
grant delete, insert, references, select, trigger, truncate, update on public.hole_hazards to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.hole_hazards to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.player_clubs to anon;
grant delete, insert, references, select, trigger, truncate, update on public.player_clubs to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.player_clubs to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.player_drills to anon;
grant delete, insert, references, select, trigger, truncate, update on public.player_drills to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.player_drills to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.players to anon;
grant delete, insert, references, select, trigger, truncate, update on public.players to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.players to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.practice_goals to anon;
grant delete, insert, references, select, trigger, truncate, update on public.practice_goals to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.practice_goals to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.profiles to anon;
grant delete, insert, references, select, trigger, truncate, update on public.profiles to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.profiles to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.putting_attempts to anon;
grant delete, insert, references, select, trigger, truncate, update on public.putting_attempts to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.putting_attempts to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.putting_sessions to anon;
grant delete, insert, references, select, trigger, truncate, update on public.putting_sessions to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.putting_sessions to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.round_comments to anon;
grant delete, insert, references, select, trigger, truncate, update on public.round_comments to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.round_comments to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.round_lineup to anon;
grant delete, insert, references, select, trigger, truncate, update on public.round_lineup to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.round_lineup to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.round_notes to anon;
grant delete, insert, references, select, trigger, truncate, update on public.round_notes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.round_notes to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.round_stats to anon;
grant delete, insert, references, select, trigger, truncate, update on public.round_stats to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.round_stats to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.rounds to anon;
grant delete, insert, references, select, trigger, truncate, update on public.rounds to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.rounds to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.scores to anon;
grant delete, insert, references, select, trigger, truncate, update on public.scores to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.scores to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.season_players to anon;
grant delete, insert, references, select, trigger, truncate, update on public.season_players to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.season_players to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.seasons to anon;
grant delete, insert, references, select, trigger, truncate, update on public.seasons to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.seasons to service_role;

-- ---- Column permissions ----
grant update (player_result, completed_at) on public.drill_assignments to authenticated;

-- ---- Function permissions ----
revoke all on function public.claim_player(code text) from public;
grant execute on function public.claim_player(code text) to authenticated;
grant execute on function public.claim_player(code text) to service_role;
revoke all on function public.is_capture_helper() from public;
grant execute on function public.is_capture_helper() to anon;
grant execute on function public.is_capture_helper() to authenticated;
grant execute on function public.is_capture_helper() to service_role;
revoke all on function public.is_coach() from public;
grant execute on function public.is_coach() to anon;
grant execute on function public.is_coach() to authenticated;
grant execute on function public.is_coach() to service_role;
revoke all on function public.make_join_code() from public;
grant execute on function public.make_join_code() to anon;
grant execute on function public.make_join_code() to authenticated;
grant execute on function public.make_join_code() to service_role;
revoke all on function public.set_drill_updated_at() from public;
grant execute on function public.set_drill_updated_at() to anon;
grant execute on function public.set_drill_updated_at() to authenticated;
grant execute on function public.set_drill_updated_at() to service_role;
revoke all on function public.set_join_code() from public;
grant execute on function public.set_join_code() to anon;
grant execute on function public.set_join_code() to authenticated;
grant execute on function public.set_join_code() to service_role;
revoke all on function public.set_round_stats_updated_at() from public;
grant execute on function public.set_round_stats_updated_at() to anon;
grant execute on function public.set_round_stats_updated_at() to authenticated;
grant execute on function public.set_round_stats_updated_at() to service_role;
revoke all on function public.team_stat_averages(p_season uuid, p_gender text, p_holes integer) from public;
grant execute on function public.team_stat_averages(p_season uuid, p_gender text, p_holes integer) to authenticated;
grant execute on function public.team_stat_averages(p_season uuid, p_gender text, p_holes integer) to service_role;

-- ---- Drill library (35 drills and how-to guides) ----
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'bunker', 'intermediate', 'Line-in-the-sand drill', 'Groove hitting the sand first, not the ball.', 'Draw a line in the sand and set up so the line is where the ball would be. Make swings trying to splash the sand starting right at the line, taking a shallow dollar-bill-sized divot. Once consistent, put a ball just ahead of the line. Bunker shots need sand-first contact - this trains the entry point.', 10, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'bunker', 'beginner', 'Dollar-bill splash', 'Take the right amount of sand: no ball needed to start.', 'Draw a rectangle in the sand about the size of a dollar bill (6 inches long), with a line 2 inches in from the back edge. Open the face, aim to enter the sand at the back line and exit at the front, splashing the whole rectangle out. Do 5 with no ball, then put a ball where the front of the bill would be and repeat. Goal: every ball out on the first try.', 20, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'bunker', 'advanced', 'Bunker up-and-down 5', 'Score your sand saves like a real round.', 'Drop 5 balls in different spots in a greenside bunker (good lie, slight uphill, downhill, near the lip, long shot). Play each one out and putt it in. A save is getting down in 2. Record saves out of 5. Tour players save about 50%; for high school, 2 of 5 is solid and 3+ is excellent. Track it next to your sand-save % in My Stats.', 30, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'chipping', 'beginner', 'Towel landing drill', 'Train yourself to land chips on a precise spot.', 'Lay a towel on the green about 10 feet away as your landing target. Hit 10 chips trying to land each one on the towel, letting it release to the hole. Once you can land most of them, switch to a smaller towel. Chipping is about controlling where the ball lands, not where it ends up.', 10, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'chipping', 'intermediate', 'Par-18 chipping game', 'Turn chipping practice into a scored up-and-down test.', 'Pick 9 spots around the green at different lies and distances. Each spot is a hole with a par of 2 - chip on, then putt out. Add up your score over 9 holes (par is 18). Track your number and try to beat it next time. Directly trains getting up and down.', 20, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('reference', 'chipping', 'beginner', 'Three chip trajectories', 'Bump-and-run vs. standard chip vs. high lofted chip.', 'Three ways to play a greenside shot, lowest to highest. Bump-and-run: a 7-9 iron, ball back, weight forward, played almost like a putt - low launch, lots of roll, the safest option when you have green to work with. Standard chip: a pitching wedge from the center of your stance with a steady swing - medium flight, carries part way then releases. High lofted chip: a lob wedge, ball forward, face slightly open, accelerating through - high and soft with little roll, for when you must carry trouble and stop quickly. Pick the lowest-risk shot the situation allows.', 20, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'chipping', 'intermediate', 'Three-club challenge', 'Learn to chip with more than just your most-lofted wedge.', 'From the same greenside spot, hit chips with three different clubs: a lob or sand wedge, a pitching wedge, and a 7 or 8 iron. Notice how each launches and releases differently. The goal is to stop reaching for the highest-lofted wedge every time and pick the club the shot actually calls for.', 30, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'chipping', 'beginner', 'Headcover behind the ball', 'Fix chunked and bladed chips.', 'Place a headcover or another towel about a foot behind your ball. Chip normally - if you catch the headcover, you are hitting the ground before the ball. Ball slightly back, hands ahead, weight forward, and strike ball-first. Instant feedback on a clean, descending strike.', 40, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'chipping', 'beginner', 'Bump-and-run with a 7-iron', 'When in doubt, get it rolling — fewer chunks and blades.', 'From just off the green with lots of green to work with, use a 7- or 8-iron and a putting-style stroke. Ball back of center, hands slightly ahead, little wrist. Land the ball one pace onto the green and let it roll. Hit 10 to the same hole; count how many finish inside a putter-length. Then try the same 10 with a wedge and compare. Most players get closer with less loft.', 50, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('reference', 'course_management', 'beginner', 'Wedge selection guide', 'Which wedge for which shot, by loft.', 'A quick guide to matching wedge to situation. Pitching wedge (about 44-48 degrees): full approach shots and longer bump-and-runs where you want distance and roll. Gap wedge (50-52): the in-between yardages when a pitching wedge is too much and a sand wedge is not enough. Sand wedge (54-56): greenside bunkers and higher, softer shots that need to stop. Lob wedge (58-62): flop shots over trouble, tight pins, and very short high shots that land soft. Higher loft means more height and spin but less distance.', 10, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'course_management', 'intermediate', 'No-double nine', 'Play 9 holes where the only goal is no double bogeys.', 'Play 9 holes (or a practice round) where you change one thing: after any bad shot, your next shot goes to the safest spot that takes double bogey out of play — middle of the green, wide side of the fairway, chip out sideways from trees. Mark each hole double-free or not. Most high school players make 2–4 doubles a round; cutting just one saves a stroke without hitting a single better shot.', 20, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'course_management', 'beginner', 'Pre-shot routine timer', 'Same routine, same time, every shot — especially putts.', 'Pick a routine you can repeat: look at the target, one practice swing, set up, one look, go. Have a teammate time 10 of your routines with a phone stopwatch on full shots and 10 on putts. Aim to have every time within 3 seconds of your average. Rushing (fast times after a bad hole) and freezing (slow times over short putts) both show up right away.', 30, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'course_management', 'advanced', 'Worst-ball 3 holes', 'Pressure test: play two balls and keep the worse one every shot.', 'Play 3 holes hitting two balls on every shot, then play the next shot from wherever the worse of the two finished. Hole out with both. Write down your worst-ball score vs. par. It shows which shot breaks down under pressure, and makes a normal round feel easy afterward.', 40, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'full_swing', 'beginner', '75% tempo bucket', 'Smooth out your swing and find your real tempo.', 'For a full bucket or session, swing every shot at about 75% effort with a smooth one-two count - one going back, two through the ball. Power comes from sequence and contact, not from swinging harder. A controlled 75% usually flies as far as a tense 100%.', 10, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'full_swing', 'beginner', 'Alignment-stick station', 'Build a repeatable setup and swing path.', 'Lay one stick on the ground along your toe line and another just outside the ball pointing at your target, parallel like railroad tracks. Hit shots checking your setup before each one. Aim the clubface at the target and your feet parallel-left of it. Cleans up the aim errors that hide behind swing problems.', 20, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('reference', 'full_swing', 'beginner', 'Tee height and ball position for the driver', 'Set up to launch the driver high and long.', 'Tee the ball so its top half sits above the crown of the driver when the club rests on the ground - about half the ball showing over the top edge. Play it forward in your stance, roughly off your lead heel, with a slight tilt of your spine away from the target. That setup lets you catch the ball on a slight upswing, which adds carry and cuts backspin. Keep grip pressure light and let speed build naturally, fastest at impact rather than at the top.', 30, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'full_swing', 'intermediate', 'Tee-under-arms connection drill', 'Quiet overactive hands and arms.', 'Tuck a tee or glove under each armpit and make swings keeping both in place. If one drops, your arms are disconnecting from your body turn. Trains a more rotational, connected swing - great as a warm-up before a round.', 30, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'full_swing', 'intermediate', '14-ball fairway finder', 'Driving accuracy test with a real fairway width.', 'On the range, pick two targets about 30 yards apart to be your fairway edges. Hit 14 drives (one per par 4 and 5 in a round), with your full pre-shot routine every time and a different target line every 3 balls. Count fairways hit. Goal: 9 of 14 or better. If you miss mostly one side, tee it a little lower and aim at the edge you''re missing toward.', 40, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'full_swing', 'beginner', 'Two-tee gate for start line', 'Start the ball where you aim.', 'Put two tees in the ground about a foot in front of your ball, just wider than a ball apart, on your target line. Using a 9-iron, hit 10 shots trying to start the ball through the gate (the tees stay in the ground; brush past them if you miss). Count clean starts. Move to a 7-iron, then a hybrid, once you get 7 of 10.', 50, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'full_swing', 'advanced', 'Nine-shot ladder', 'Shape and height control: low / normal / high and draw / straight / fade.', 'With a 7-iron, try to hit all nine shots: low draw, low straight, low fade, then normal-height draw, straight and fade, then high draw, straight and fade. For low, ball back and shorter finish; for high, ball forward and full finish. Count how many you pull off on the first try. Knowing your go-to shape under pressure matters more than hitting all nine.', 60, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'pitching', 'intermediate', 'Distance ladder (40-60-80)', 'Build feel for partial wedge distances.', 'Pick three targets at roughly 40, 60, and 80 yards. Hit 5 shots to each, keeping the same club and tempo, and note how far back your swing goes for each distance. Most scoring shots come from inside 100 yards, so owning these three numbers saves real strokes.', 10, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'pitching', 'advanced', 'Y-arms alignment-stick drill', 'Stop flipping your wrists through impact.', 'Hold an alignment stick or a second club so it runs up alongside your lead arm and shaft, forming a Y shape. Hit small pitches keeping that Y intact - if your wrists flip, the stick jabs your side. Trains a connected, body-led pitch with a steady clubface.', 20, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'pitching', 'intermediate', 'Wedge clock: three swing lengths', 'Three repeatable backswings give you three reliable distances per wedge.', 'Picture your lead arm as a clock hand. Hit 5 balls with your arm stopping at 7:30, 5 at 9:00, and 5 at 10:30, all with the same smooth tempo and a full finish. Have a partner or rangefinder note where each group lands. Write down your three carries for each wedge (example: 35 / 55 / 70). On the course, pick the swing length, not a harder or softer hit.', 30, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'pitching', 'intermediate', 'Towel targets at 30 / 50 / 70', 'Land it on the towel — carry distance control inside 70 yards.', 'Lay towels (or hula hoops) at 30, 50 and 70 yards. Hit 3 balls at each in random order — never two in a row at the same target. Score 2 points for landing on the towel, 1 point for landing within one step of it. Max is 18. Random order is what makes this transfer to the course.', 40, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'putting', NULL, 'Clock Drill', '12 putts around the hole from 3–4 feet, every angle and break.', 'Place 12 balls in a circle around one hole, about 4 feet out, like numbers on a clock face. Putt each one in order — every putt has a different break. Score is makes out of 12. Great pre-round warmup because you see uphill, downhill, and both side breaks. Track it in Putting under More to get on the leaderboard.', 10, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'putting', 'beginner', 'Gate drill', 'Roll putts through a tee gate to groove a square face.', 'Set two tees just wider than your putter head, about a foot in front of the ball, forming a gate. From 4-6 feet, roll putts through the gate without clipping either tee. Hitting a tee means your face was open or closed at impact. Make 10 in a row before stepping back.', 10, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'putting', NULL, 'Lag Ladder', 'Distance control from 20, 30, and 40 feet — finish inside 3 feet.', 'Hit 3 putts each from 20, 30, and 40 feet (9 total). Goal is to finish every putt inside a 3-foot circle past the hole — never short. Score 2 points for holing it, 1 point for stopping in the zone, 0 for short or long. Eliminates three-putts faster than anything else. Track it in Putting under More.', 11, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'putting', NULL, 'Pressure Gate', 'Make putts in a row from 5 feet — miss and the streak resets to zero.', 'Pick one hole, 5 feet out, slight break if you can find one. Make putts in a row; a miss resets your streak to zero. First to the target streak (10 for varsity) wins. This is the drill that makes 5-footers on the 18th feel routine, because you have practiced with consequences. Track it in Putting under More — best streak goes on the leaderboard.', 12, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'putting', NULL, 'Distance Control Points', 'Scored putts from 25–30 feet: 2 for holed, 1 inside 3 feet past, 0 short or long.', 'Hit 12 putts from around 25–30 feet, moving spots so no two putts are identical. Scoring: 2 points holed, 1 point for finishing inside 3 feet PAST the hole, 0 for anything short or more than 3 feet by. Rewards getting the ball to the hole with dying speed. 16+ out of 24 is a strong varsity score. Track it in Putting under More.', 13, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'putting', 'beginner', 'Clock drill', 'Make short putts from every angle around the hole.', 'Place 5-6 balls in a circle about 3-4 feet from the hole, like numbers on a clock. Make all of them in a row. Miss one and you start over. This builds confidence that short putts are automatic, from any break.', 20, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'putting', 'intermediate', 'Ladder drill (lag putting)', 'Dial in distance control on long putts.', 'Pick a hole 30+ feet away. Putt to leave each ball inside a 3-foot circle around the hole rather than trying to make it. Count how many in a row finish inside the circle. Teaches that on long putts, speed matters far more than line.', 30, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'putting', 'intermediate', 'Past-the-hole drill', 'Stop leaving putts short.', 'Lay a club or alignment stick on the ground about 18 inches past the hole. Putt from various distances trying to finish past the hole but before the stick. Good putts die a foot past the cup, holding their line; short putts get knocked offline by every bump.', 40, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'putting', 'intermediate', '3-6-9 pressure ladder', 'Short putts under pressure — the ones that turn pars into bogeys.', 'Put a tee at 3, 6 and 9 feet from one hole on a straight putt. Make 3 in a row from 3 ft, then 3 in a row from 6 ft, then 3 in a row from 9 ft. Miss at 3 or 6 ft and you restart that distance; miss at 9 ft and you go all the way back to 3 ft. Count how many total putts it takes to finish (perfect is 9). Write the number down and try to beat it.', 50, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'putting', 'beginner', 'Start-line spot drill', 'Roll every putt over a spot a foot in front of the ball.', 'On a breaking putt from 10–15 ft, read the putt, then pick a spot (a ball mark, a discolored blade) about 12 inches in front of your ball on your start line. Set a coin there. Hit 10 putts trying only to roll the ball over the coin. Count how many cross it. Most missed short putts are a start-line problem, not a read problem.', 60, true);
insert into public.drill_library (item_type, skill_category, difficulty, title, summary, instructions, sort_order, is_active) values ('drill', 'putting', 'intermediate', 'No three-putt 18', 'Lag putting game that copies a real round.', 'Play 18 putts from 25–50 ft to different holes, mixing uphill, downhill and sidehill. Hole out every one. Score each: 1 putt = birdie, 2 putts = par, 3 putts = bogey. Goal: zero three-putts. Your score vs. par (18 holes × 2 putts = 36) is your number. Great for anyone averaging more than 1 three-putt a round.', 70, true);
