
-- MEIN HUB – SUPABASE DATABASE
-- Im Supabase Dashboard unter SQL Editor komplett ausführen.
-- Danach in Auth -> Users deinen Account anlegen/prüfen und den eigenen
-- User in Schritt 2 der README zum Dev-Account machen.

create extension if not exists pgcrypto;

-- ---------- PROFILE ----------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  id text unique not null,
  username text unique not null,
  role text not null default 'user' check (role in ('user','dev')),
  tabs jsonb not null default '{"todo":true,"kpop":true,"calendar":true}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_username_lower_idx on public.profiles (lower(username));

create or replace function public.generate_hub_id()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := floor(100000 + random() * 900000)::int::text;
    exit when not exists (select 1 from public.profiles where id = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_username text;
begin
  requested_username := trim(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));

  if requested_username = '' then
    requested_username := 'user_' || substr(new.id::text, 1, 8);
  end if;

  if exists (select 1 from public.profiles where lower(username) = lower(requested_username)) then
    requested_username := requested_username || '_' || substr(new.id::text, 1, 6);
  end if;

  insert into public.profiles (user_id, id, username)
  values (new.id, public.generate_hub_id(), requested_username);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ---------- TODO ----------
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  priority integer not null default 3 check (priority between 1 and 4),
  status text not null default 'offen' check (status in ('offen','progress','done')),
  created_at timestamptz not null default now()
);

-- ---------- K-POP ----------
create table if not exists public.kpop_entries (
  id uuid primary key default gen_random_uuid(),
  friend text not null,
  idol text not null,
  group_name text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- CALENDAR ----------
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  date date not null,
  start_time time,
  end_time time,
  description text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists calendar_events_owner_date_idx
on public.calendar_events(owner_user_id, date);

-- ---------- CALENDAR INVITES ----------
create table if not exists public.calendar_invites (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  unique(from_user_id, to_user_id)
);

create index if not exists calendar_invites_to_idx on public.calendar_invites(to_user_id);
create index if not exists calendar_invites_from_idx on public.calendar_invites(from_user_id);

-- ---------- SECURITY HELPERS ----------
create or replace function public.is_dev()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'dev'
  );
$$;

create or replace function public.is_calendar_shared_with(viewer uuid, owner uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.calendar_invites
    where from_user_id = owner
      and to_user_id = viewer
      and status = 'accepted'
  );
$$;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.todos enable row level security;
alter table public.kpop_entries enable row level security;
alter table public.calendar_events enable row level security;
alter table public.calendar_invites enable row level security;

-- Profiles: authenticated users can see usernames/IDs, while only themselves/dev can modify.
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "profiles_update_self_or_dev" on public.profiles;
create policy "profiles_update_self_or_dev"
on public.profiles for update
to authenticated
using (user_id = auth.uid() or public.is_dev())
with check (user_id = auth.uid() or public.is_dev());

-- Todos: everyone can read; only dev can change.
drop policy if exists "todos_select_authenticated" on public.todos;
create policy "todos_select_authenticated"
on public.todos for select
to authenticated
using (true);

drop policy if exists "todos_insert_dev" on public.todos;
create policy "todos_insert_dev"
on public.todos for insert
to authenticated
with check (public.is_dev());

drop policy if exists "todos_update_dev" on public.todos;
create policy "todos_update_dev"
on public.todos for update
to authenticated
using (public.is_dev())
with check (public.is_dev());

drop policy if exists "todos_delete_dev" on public.todos;
create policy "todos_delete_dev"
on public.todos for delete
to authenticated
using (public.is_dev());

-- K-Pop: everyone can read; only dev can change.
drop policy if exists "kpop_select_authenticated" on public.kpop_entries;
create policy "kpop_select_authenticated"
on public.kpop_entries for select
to authenticated
using (true);

drop policy if exists "kpop_insert_dev" on public.kpop_entries;
create policy "kpop_insert_dev"
on public.kpop_entries for insert
to authenticated
with check (public.is_dev());

drop policy if exists "kpop_update_dev" on public.kpop_entries;
create policy "kpop_update_dev"
on public.kpop_entries for update
to authenticated
using (public.is_dev())
with check (public.is_dev());

drop policy if exists "kpop_delete_dev" on public.kpop_entries;
create policy "kpop_delete_dev"
on public.kpop_entries for delete
to authenticated
using (public.is_dev());

-- Calendar events: owner can read/write; users with accepted invite can read.
drop policy if exists "calendar_events_select" on public.calendar_events;
create policy "calendar_events_select"
on public.calendar_events for select
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_calendar_shared_with(auth.uid(), owner_user_id)
);

drop policy if exists "calendar_events_insert" on public.calendar_events;
create policy "calendar_events_insert"
on public.calendar_events for insert
to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists "calendar_events_update" on public.calendar_events;
create policy "calendar_events_update"
on public.calendar_events for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists "calendar_events_delete" on public.calendar_events;
create policy "calendar_events_delete"
on public.calendar_events for delete
to authenticated
using (owner_user_id = auth.uid());

-- Invites: sender and recipient can see/manage their own invitations.
drop policy if exists "invites_select" on public.calendar_invites;
create policy "invites_select"
on public.calendar_invites for select
to authenticated
using (from_user_id = auth.uid() or to_user_id = auth.uid());

drop policy if exists "invites_insert" on public.calendar_invites;
create policy "invites_insert"
on public.calendar_invites for insert
to authenticated
with check (from_user_id = auth.uid());

drop policy if exists "invites_update_recipient" on public.calendar_invites;
create policy "invites_update_recipient"
on public.calendar_invites for update
to authenticated
using (to_user_id = auth.uid())
with check (to_user_id = auth.uid());

drop policy if exists "invites_delete_sender" on public.calendar_invites;
create policy "invites_delete_sender"
on public.calendar_invites for delete
to authenticated
using (from_user_id = auth.uid());

-- ---------- REALTIME ----------
-- Optional: enables live refresh if you later add realtime listeners.
do $$
begin
  begin
    alter publication supabase_realtime add table public.calendar_events;
  exception when duplicate_object then null;
  end;
end $$;

-- =========================================================
-- DEV-ACCOUNT:
-- 1. Register normally on the website.
-- 2. Run this with your real username:
--
-- update public.profiles
-- set role = 'dev',
--     tabs = '{"todo":true,"kpop":true,"calendar":true}'::jsonb
-- where lower(username) = lower('DEIN_BENUTZERNAME');
--
-- Danach einmal aus- und wieder einloggen.
-- =========================================================
