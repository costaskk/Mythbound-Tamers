-- Mythbound Tamers v0.62 Friends / Presence / Invites
-- Run in Supabase SQL Editor. Safe to re-run.

create table if not exists public.mythbound_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  player_code text,
  status text not null default 'online' check (status in ('online','busy','offline')),
  discoverable boolean not null default true,
  last_seen timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.mythbound_friends (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','blocked')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint mythbound_friends_not_self check (requester_id <> addressee_id),
  constraint mythbound_friends_unique_direction unique (requester_id, addressee_id)
);

create table if not exists public.mythbound_invites (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references auth.users(id) on delete cascade,
  to_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('trade','battle')),
  room_code text not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  message text,
  created_at timestamptz default now(),
  responded_at timestamptz,
  constraint mythbound_invites_not_self check (from_id <> to_id)
);

alter table public.mythbound_presence enable row level security;
alter table public.mythbound_friends enable row level security;
alter table public.mythbound_invites enable row level security;

drop policy if exists "presence_select_discoverable_or_self" on public.mythbound_presence;
create policy "presence_select_discoverable_or_self"
on public.mythbound_presence for select
using (discoverable = true or auth.uid() = user_id);

drop policy if exists "presence_upsert_self" on public.mythbound_presence;
create policy "presence_upsert_self"
on public.mythbound_presence for insert
with check (auth.uid() = user_id);

drop policy if exists "presence_update_self" on public.mythbound_presence;
create policy "presence_update_self"
on public.mythbound_presence for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "friends_select_participants" on public.mythbound_friends;
create policy "friends_select_participants"
on public.mythbound_friends for select
using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "friends_insert_self_requester" on public.mythbound_friends;
create policy "friends_insert_self_requester"
on public.mythbound_friends for insert
with check (auth.uid() = requester_id and requester_id <> addressee_id);

drop policy if exists "friends_update_participants" on public.mythbound_friends;
create policy "friends_update_participants"
on public.mythbound_friends for update
using (auth.uid() = requester_id or auth.uid() = addressee_id)
with check (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "friends_delete_participants" on public.mythbound_friends;
create policy "friends_delete_participants"
on public.mythbound_friends for delete
using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "invites_select_participants" on public.mythbound_invites;
create policy "invites_select_participants"
on public.mythbound_invites for select
using (auth.uid() = from_id or auth.uid() = to_id);

drop policy if exists "invites_insert_sender" on public.mythbound_invites;
create policy "invites_insert_sender"
on public.mythbound_invites for insert
with check (auth.uid() = from_id and from_id <> to_id);

drop policy if exists "invites_update_participants" on public.mythbound_invites;
create policy "invites_update_participants"
on public.mythbound_invites for update
using (auth.uid() = from_id or auth.uid() = to_id)
with check (auth.uid() = from_id or auth.uid() = to_id);

create index if not exists mythbound_presence_discoverable_seen_idx on public.mythbound_presence(discoverable, last_seen desc);
create index if not exists mythbound_friends_requester_idx on public.mythbound_friends(requester_id);
create index if not exists mythbound_friends_addressee_idx on public.mythbound_friends(addressee_id);
create index if not exists mythbound_invites_to_status_idx on public.mythbound_invites(to_id, status, created_at desc);
create index if not exists mythbound_invites_from_status_idx on public.mythbound_invites(from_id, status, created_at desc);

-- Optional but recommended: enable Realtime for these tables in Supabase Dashboard:
-- mythbound_presence, mythbound_friends, mythbound_invites
