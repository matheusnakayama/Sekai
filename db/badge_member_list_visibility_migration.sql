alter table public.profiles
  add column if not exists show_badges_in_member_list boolean not null default true;

alter table public.user_badges
  add column if not exists visible_in_member_list boolean not null default true;

-- Gestores globais de insígnias. A lista é administrada por esta migração;
-- cada usuário autenticado só consegue consultar a própria entrada.
create table if not exists public.badge_managers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.badge_managers enable row level security;
grant select on public.badge_managers to authenticated;
grant select on public.profiles to authenticated;
drop policy if exists badge_managers_read_self on public.badge_managers;
create policy badge_managers_read_self on public.badge_managers
  for select to authenticated
  using (user_id = auth.uid());

-- Os dois CEOs autorizados a gerir insígnias globalmente.
insert into public.badge_managers (user_id)
select profile.id
from auth.users account
join public.profiles profile on profile.id = account.id
where lower(account.email) in ('matheushideo10@gmail.com', 'nteo.titotto@gmail.com')
on conflict (user_id) do nothing;

grant update (show_badges_in_member_list) on public.profiles to authenticated;
drop policy if exists profiles_update_badges_manager_visibility on public.profiles;
create policy profiles_update_badges_manager_visibility on public.profiles
  for update to authenticated
  using (exists (
    select 1 from public.badge_managers manager
    where manager.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.badge_managers manager
    where manager.user_id = auth.uid()
  ));

grant update (visible_in_member_list) on public.user_badges to authenticated;
grant insert (user_id, badge_id, assigned_by) on public.user_badges to authenticated;
grant delete on public.user_badges to authenticated;
drop policy if exists user_badges_update_own_visibility on public.user_badges;
drop policy if exists user_badges_update_own_member_list on public.user_badges;
drop policy if exists user_badges_update_manager_member_list on public.user_badges;
drop policy if exists user_badges_insert_manager on public.user_badges;
drop policy if exists user_badges_delete_manager on public.user_badges;
create policy user_badges_update_own_member_list on public.user_badges
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy user_badges_update_manager_member_list on public.user_badges
  for update to authenticated
  using (exists (
    select 1 from public.badge_managers manager
    where manager.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.badge_managers manager
    where manager.user_id = auth.uid()
  ));
create policy user_badges_insert_manager on public.user_badges
  for insert to authenticated
  with check (exists (
    select 1 from public.badge_managers manager
    where manager.user_id = auth.uid()
  ));
create policy user_badges_delete_manager on public.user_badges
  for delete to authenticated
  using (exists (
    select 1 from public.badge_managers manager
    where manager.user_id = auth.uid()
  ));

grant insert (name, icon, background_color, foreground_color, image_url, image_path, created_by)
  on public.custom_badges to authenticated;
grant delete on public.custom_badges to authenticated;
drop policy if exists custom_badges_insert_managers on public.custom_badges;
drop policy if exists custom_badges_delete_managers on public.custom_badges;
create policy custom_badges_insert_managers on public.custom_badges
  for insert to authenticated
  with check (exists (
    select 1 from public.badge_managers manager
    where manager.user_id = auth.uid()
  ));
create policy custom_badges_delete_managers on public.custom_badges
  for delete to authenticated
  using (exists (
    select 1 from public.badge_managers manager
    where manager.user_id = auth.uid()
  ));

-- A leitura pública já é configurada pela migração bankai_themes_migration.sql.
do $migration$
begin
  if to_regclass('public.badge_managers') is not null then
    execute 'drop policy if exists custom_badges_update_managers on public.custom_badges';
    execute $policy$
      create policy custom_badges_update_managers on public.custom_badges
        for update to authenticated
        using (exists (
          select 1 from public.badge_managers manager
          where manager.user_id = auth.uid()
        ))
        with check (exists (
          select 1 from public.badge_managers manager
          where manager.user_id = auth.uid()
        ))
    $policy$;
    execute 'grant update (name, icon) on public.custom_badges to authenticated';
  end if;
end
$migration$;
