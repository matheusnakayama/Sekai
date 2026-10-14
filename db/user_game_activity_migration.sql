create table if not exists public.user_game_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  game_id text not null check (char_length(game_id) between 1 and 120),
  game_name text not null check (char_length(game_name) between 1 and 80),
  game_icon_url text,
  started_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.user_game_activity add column if not exists game_icon_url text;

alter table public.user_game_activity enable row level security;

drop policy if exists "Users can publish their own game activity" on public.user_game_activity;
create policy "Users can publish their own game activity"
  on public.user_game_activity for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Members can view shared server game activity" on public.user_game_activity;
create policy "Members can view shared server game activity"
  on public.user_game_activity for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.members viewer
      join public.members subject on subject.server_id = viewer.server_id
      where viewer.user_id = auth.uid()
        and subject.user_id = user_game_activity.user_id
        and coalesce(viewer.is_banned, false) = false
        and coalesce(subject.is_banned, false) = false
    )
  );

grant select, insert, update, delete on public.user_game_activity to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_game_activity'
  ) then
    alter publication supabase_realtime add table public.user_game_activity;
  end if;
end $$;
