-- Cole este arquivo no SQL Editor do Supabase.
-- Guarda só a faixa que pode aparecer no perfil. O token do Spotify fica no navegador de quem conectou.

create table if not exists public.user_now_playing (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  provider text not null default 'spotify' check (provider in ('spotify')),
  track text not null check (char_length(track) between 1 and 120),
  artist text check (artist is null or char_length(artist) <= 160),
  album text check (album is null or char_length(album) <= 120),
  art_url text,
  track_url text,
  display text not null default 'both' check (display in ('profile', 'status', 'both')),
  updated_at timestamptz not null default now()
);

alter table public.user_now_playing enable row level security;

drop policy if exists user_now_playing_select on public.user_now_playing;
create policy user_now_playing_select on public.user_now_playing
  for select to authenticated using (true);

drop policy if exists user_now_playing_insert on public.user_now_playing;
create policy user_now_playing_insert on public.user_now_playing
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists user_now_playing_update on public.user_now_playing;
create policy user_now_playing_update on public.user_now_playing
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_now_playing_delete on public.user_now_playing;
create policy user_now_playing_delete on public.user_now_playing
  for delete to authenticated using (user_id = auth.uid());

do $$
begin
  alter publication supabase_realtime add table public.user_now_playing;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
