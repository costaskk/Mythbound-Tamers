-- Mythbound Tamers v0.72 Live Ops / Raid foundation
-- Run in Supabase SQL Editor if you want real-time shared raid lobbies.
-- The app has a local raid flow now; these tables are for Cloudflare/Supabase co-op expansion.

create table if not exists public.mythbound_live_raids (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  room_code text unique not null,
  boss_id text not null,
  boss_level int not null default 30,
  boss_hp int not null,
  boss_max_hp int not null,
  status text not null default 'open' check (status in ('open','active','defeated','expired')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '30 minutes')
);

create table if not exists public.mythbound_raid_players (
  id uuid primary key default gen_random_uuid(),
  raid_id uuid not null references public.mythbound_live_raids(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  damage int not null default 0,
  reward_claimed boolean not null default false,
  catch_attempted boolean not null default false,
  caught boolean not null default false,
  joined_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (raid_id, user_id)
);

alter table public.mythbound_live_raids enable row level security;
alter table public.mythbound_raid_players enable row level security;

drop policy if exists "raids_select_authenticated" on public.mythbound_live_raids;
create policy "raids_select_authenticated" on public.mythbound_live_raids for select using (auth.role() = 'authenticated');

drop policy if exists "raids_insert_authenticated" on public.mythbound_live_raids;
create policy "raids_insert_authenticated" on public.mythbound_live_raids for insert with check (auth.role() = 'authenticated');

drop policy if exists "raids_update_participants" on public.mythbound_live_raids;
create policy "raids_update_participants" on public.mythbound_live_raids for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "raid_players_select_authenticated" on public.mythbound_raid_players;
create policy "raid_players_select_authenticated" on public.mythbound_raid_players for select using (auth.role() = 'authenticated');

drop policy if exists "raid_players_insert_self" on public.mythbound_raid_players;
create policy "raid_players_insert_self" on public.mythbound_raid_players for insert with check (auth.uid() = user_id);

drop policy if exists "raid_players_update_self" on public.mythbound_raid_players;
create policy "raid_players_update_self" on public.mythbound_raid_players for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists mythbound_live_raids_event_status_idx on public.mythbound_live_raids(event_id, status, expires_at);
create index if not exists mythbound_raid_players_raid_idx on public.mythbound_raid_players(raid_id);

-- Optional: enable Realtime in Dashboard for:
-- mythbound_live_raids
-- mythbound_raid_players
