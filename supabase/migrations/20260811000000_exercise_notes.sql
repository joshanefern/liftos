-- Pinned exercise notes: one persistent note per (user, exercise), keyed by
-- the normalized exercise name so "Bench Press" and "bench press" share a
-- note. Shown pinned at the top of that exercise's logging card, forever —
-- seat heights, grip widths, cues. (Top unmet demand across competitor
-- communities; requested in Strong for 3+ years.)

create table if not exists public.exercise_notes (
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_key text not null check (char_length(exercise_key) between 1 and 200),
  note text not null check (char_length(note) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_key)
);

alter table public.exercise_notes enable row level security;

create policy "exercise_notes_select_own" on public.exercise_notes
  for select using (auth.uid() = user_id);
create policy "exercise_notes_insert_own" on public.exercise_notes
  for insert with check (auth.uid() = user_id);
create policy "exercise_notes_update_own" on public.exercise_notes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "exercise_notes_delete_own" on public.exercise_notes
  for delete using (auth.uid() = user_id);
