-- Fried Chicken Index — Supabase schema.
-- Paste this whole file into the Supabase SQL Editor and hit Run.

create table if not exists public.places (
  id            uuid primary key,
  name          text not null,
  address       text,
  city          text,
  country       text,
  country_code  text,
  lat           double precision,
  lng           double precision,
  deleted       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.visits (
  id            uuid primary key,
  place_id      uuid not null references public.places(id) on delete cascade,
  rater         text,
  visit_date    date,
  scores        jsonb not null default '{}'::jsonb,
  dish          text,
  price         numeric(10,2),
  notes         text,
  deleted       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists visits_place_id_idx on public.visits (place_id);
create index if not exists places_country_idx  on public.places (country_code);

-- Row level security.
--
-- These policies let anyone holding the project's public "anon" key read and
-- write. That is deliberate: the app has no login, and the two of you share the
-- key. Treat the key like the password to the data — anyone you give it to (or
-- who views the page source on a site where you hardcoded it) can edit entries.
-- If you would rather lock it down, enable Supabase Auth and replace `true`
-- below with `auth.uid() is not null`.

alter table public.places enable row level security;
alter table public.visits enable row level security;

drop policy if exists "anon full access to places" on public.places;
create policy "anon full access to places"
  on public.places for all
  using (true) with check (true);

drop policy if exists "anon full access to visits" on public.visits;
create policy "anon full access to visits"
  on public.visits for all
  using (true) with check (true);
