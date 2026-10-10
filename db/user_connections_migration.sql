-- Cole este arquivo no SQL Editor do Supabase.
-- Guarda a conta conectada que aparece no perfil mesmo quando nada está tocando.
-- O token do Spotify continua só no navegador de quem conectou.

create table if not exists public.user_connections (
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'spotify' check (provider in ('spotify')),
  display_name text not null check (char_length(display_name) between 1 and 80),
  profile_url text,
  primary key (user_id, provider)
);

alter table public.user_connections enable row level security;

drop policy if exists user_connections_select on public.user_connections;
create policy user_connections_select on public.user_connections
  for select to authenticated using (true);

drop policy if exists user_connections_insert on public.user_connections;
create policy user_connections_insert on public.user_connections
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists user_connections_update on public.user_connections;
create policy user_connections_update on public.user_connections
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_connections_delete on public.user_connections;
create policy user_connections_delete on public.user_connections
  for delete to authenticated using (user_id = auth.uid());

do $$
begin
  alter publication supabase_realtime add table public.user_connections;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
