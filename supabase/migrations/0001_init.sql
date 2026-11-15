-- HackSC USC Rideshare: initial schema (README §4). PROPOSED, not yet applied to any
-- Supabase project. Review with the integration owner before running.
-- Field names map 1:1 to the camelCase DTOs in src/types (snake_case here).

create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  verified_usc boolean not null default false,          -- server-managed
  created_at timestamptz not null default now()
);

create table public.regions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  region_id uuid references public.regions (id),
  google_place_id text unique,                           -- unique when not null
  is_campus_pickup boolean not null default false
);
create index locations_region_idx on public.locations (region_id);

create type public.trip_status as enum ('open', 'in_progress', 'completed', 'cancelled'); -- 'full' is derived
create type public.participant_status as enum ('confirmed', 'cancelled', 'no_show');

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  booker_id uuid not null references public.profiles (id),
  pickup_location_id uuid not null references public.locations (id),
  destination_location_id uuid not null references public.locations (id),
  departure_time timestamptz not null,
  max_participants integer not null check (max_participants > 0), -- capacity snapshot per trip
  status public.trip_status not null default 'open',
  return_trip_id uuid unique references public.trips (id),
  created_at timestamptz not null default now(),
  constraint trips_endpoints_differ check (pickup_location_id <> destination_location_id),
  constraint trips_no_self_return check (return_trip_id is null or return_trip_id <> id)
);
create index trips_discovery_idx on public.trips (departure_time, destination_location_id) where status = 'open';

-- Reject return-link cycles (A -> B -> A).
create function public.trips_reject_return_cycle() returns trigger language plpgsql as $$
begin
  if new.return_trip_id is not null and exists (
    select 1 from public.trips t where t.id = new.return_trip_id and t.return_trip_id = new.id
  ) then
    raise exception 'return trip link would create a cycle';
  end if;
  return new;
end $$;
create trigger trips_return_cycle before insert or update of return_trip_id on public.trips
  for each row execute function public.trips_reject_return_cycle();

create table public.trip_participants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  status public.participant_status not null default 'confirmed',
  joined_at timestamptz not null default now(),
  agreement_accepted_at timestamptz,
  agreement_version text,
  unique (trip_id, user_id)
);
create index trip_participants_count_idx on public.trip_participants (trip_id, status);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index messages_paging_idx on public.messages (trip_id, created_at, id);

create table public.attendance_reports (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id),
  reporter_id uuid not null references public.profiles (id),
  subject_id uuid not null references public.profiles (id),
  reason text not null check (reason = 'no_show'),
  status text not null default 'pending' check (status in ('pending', 'dismissed', 'upheld')),
  created_at timestamptz not null default now(),
  unique (trip_id, reporter_id, subject_id, reason)
);

-- Row level security: all writes go through route services using the service role;
-- browser clients may only read what their membership allows (README §7).
alter table public.profiles enable row level security;
alter table public.regions enable row level security;
alter table public.locations enable row level security;
alter table public.trips enable row level security;
alter table public.trip_participants enable row level security;
alter table public.messages enable row level security;
alter table public.attendance_reports enable row level security;

create function public.is_confirmed_member(t uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trip_participants p join trips tr on tr.id = p.trip_id
    where p.trip_id = t and p.user_id = auth.uid() and p.status = 'confirmed' and tr.status <> 'cancelled'
  );
$$;

create policy "own profile" on public.profiles for select using (id = auth.uid());
create policy "regions readable" on public.regions for select using (auth.role() = 'authenticated');
create policy "locations readable" on public.locations for select using (auth.role() = 'authenticated');
create policy "visible trips" on public.trips for select using (
  status <> 'cancelled' or exists (select 1 from public.trip_participants p where p.trip_id = id and p.user_id = auth.uid())
);
create policy "own memberships" on public.trip_participants for select using (user_id = auth.uid());
-- Realtime subscriptions on messages use the same policy, so former members lose access.
create policy "members read chat" on public.messages for select using (public.is_confirmed_member(trip_id));
create policy "own reports" on public.attendance_reports for select using (reporter_id = auth.uid());
