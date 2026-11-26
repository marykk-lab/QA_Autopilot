-- AI QA platform — initial schema (M2).
--
-- Three tables, one owner per row. Row-level security is on everywhere and every
-- policy is scoped to auth.uid(), so a team's targets, specs and runs are not
-- readable by another account even if a query forgets to filter.
--
-- Spec files still live on disk as plain .spec.ts — that portability is the
-- product's main argument. These tables record what was approved and what
-- happened when it ran; they are not the source of truth for the test code.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- targets

-- A site under test. Mirrors target.json / target.local.json so a target can be
-- configured in the UI instead of a file, without changing the generator.
create table public.targets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  base_url    text not null,
  -- The `inspect` block: pages, sign-in locators, states. Shape lives in lib/target.ts.
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint targets_name_not_blank check (length(trim(name)) > 0),
  constraint targets_base_url_is_http check (base_url ~* '^https?://')
);

create index targets_user_id_idx on public.targets (user_id);

-- ------------------------------------------------------------------ specs

-- An approved test. A row appears only when a human clicked Approve — the review
-- gate is the product, so an unapproved generation is deliberately not stored.
create table public.specs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  target_id     uuid references public.targets (id) on delete set null,
  filename      text not null,
  code          text not null,
  -- What the user typed. Kept for the eval set (M3): the pair (description, code)
  -- is the unit being measured.
  description   text,
  base_url      text not null,
  source        text not null default 'claude' check (source in ('claude', 'cache')),
  input_tokens  integer,
  output_tokens integer,
  cost_usd      numeric(10, 6),
  approved_at   timestamptz not null default now(),

  constraint specs_filename_is_spec check (filename ~ '^[A-Za-z0-9._-]+\.spec\.ts$')
);

-- One current version per filename per user; history lives in git, not here.
create unique index specs_user_filename_key on public.specs (user_id, filename);
create index specs_target_id_idx on public.specs (target_id);

-- ------------------------------------------------------------------- runs

-- One execution of one spec file. This is what makes "last known result" survive
-- a restart, and what the eval set counts over.
create table public.runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  spec_id      uuid references public.specs (id) on delete set null,
  filename     text not null,
  passed       boolean not null,
  -- Per-test rows from Playwright's JSON reporter: title, status, durationMs, error.
  results      jsonb not null default '[]'::jsonb,
  -- Set when the run itself failed (config error, crash) rather than a test failing.
  run_error    text,
  duration_ms  integer,
  created_at   timestamptz not null default now()
);

create index runs_user_created_idx on public.runs (user_id, created_at desc);
create index runs_filename_idx on public.runs (user_id, filename, created_at desc);

-- -------------------------------------------------------------------- rls

alter table public.targets enable row level security;
alter table public.specs   enable row level security;
alter table public.runs    enable row level security;

create policy "targets are private to their owner"
  on public.targets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "specs are private to their owner"
  on public.specs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "runs are private to their owner"
  on public.runs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------- touch

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger targets_touch_updated_at
  before update on public.targets
  for each row execute function public.touch_updated_at();
