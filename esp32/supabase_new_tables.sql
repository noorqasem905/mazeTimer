-- ====================================================================
-- Run this in your Supabase SQL editor to add the new tables
-- ====================================================================

-- Team members (players on each team)
create table if not exists public.maze_team_members (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.maze_teams(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Club organizers / administration staff
create table if not exists public.maze_organizers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  role          text not null,
  image_url     text,
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);

-- Enable RLS
alter table public.maze_team_members enable row level security;
alter table public.maze_organizers    enable row level security;

-- Public can read both tables (no login needed)
create policy "public_read_members"    on public.maze_team_members for select to anon, authenticated using (true);
create policy "public_read_organizers" on public.maze_organizers    for select to anon, authenticated using (true);

-- Only admins can write
create policy "admin_write_members"    on public.maze_team_members
  for all to authenticated using (public.is_maze_admin()) with check (public.is_maze_admin());

create policy "admin_write_organizers" on public.maze_organizers
  for all to authenticated using (public.is_maze_admin()) with check (public.is_maze_admin());
