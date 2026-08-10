-- ─────────────────────────────────────────────────────────────────────────────
-- Baseline for public.profiles
--
-- The profiles base table (and its RLS policies) predate this repo's migration
-- history — earlier migrations only ALTER it, so a fresh `supabase db reset`
-- had no DDL to create it. This file versions the table exactly as it exists
-- on the live project (introspected 2026-08-09 via `supabase db query --linked`
-- against information_schema / pg_catalog: columns, constraints, RLS flag,
-- pg_policies).
--
-- Every statement is guarded (CREATE TABLE IF NOT EXISTS, policy existence
-- checks) so applying it to the live database is a strict no-op.
--
-- Live schema captured:
--   columns ......... id uuid PK/FK→auth.users, 7 nullable text profile fields,
--                     units text default 'lb', created_at/updated_at
--                     timestamptz default now(), wearable_connected +
--                     healthkit_connected boolean not null default false
--   constraints ..... profiles_pkey (id), profiles_id_fkey → auth.users(id)
--                     ON DELETE CASCADE
--   RLS ............. enabled (not forced); 3 permissive policies to PUBLIC
--   triggers/indexes  none beyond the PK index
--
-- Note: wearable_connected / healthkit_connected are also added by
-- 20260511120000 / 20260809230000. They are included here so this baseline
-- alone yields the full current shape; on databases where those migrations
-- already ran, CREATE TABLE IF NOT EXISTS skips the whole statement anyway.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id                   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name           text,
  last_name            text,
  goal                 text,
  experience           text,
  equipment            text,
  frequency            text,
  split                text,
  units                text DEFAULT 'lb'::text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  wearable_connected   boolean NOT NULL DEFAULT false,
  healthkit_connected  boolean NOT NULL DEFAULT false
);

-- Idempotent: no-op when RLS is already enabled.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'select own profile'
  ) THEN
    CREATE POLICY "select own profile" ON public.profiles
      FOR SELECT USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'insert own profile'
  ) THEN
    CREATE POLICY "insert own profile" ON public.profiles
      FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'update own profile'
  ) THEN
    CREATE POLICY "update own profile" ON public.profiles
      FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;
