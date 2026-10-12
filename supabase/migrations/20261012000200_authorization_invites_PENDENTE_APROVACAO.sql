-- PENDENTE DE APROVACAO DO DONO: endurece moderacao, hierarquia de cargos,
-- convites e escritas diretas que hoje contornam as RPCs.
-- Requer a migration 20261012000100_auth_security_PENDENTE_APROVACAO.sql.
-- Esta migration NAO foi aplicada neste workspace.

begin;
set local search_path = pg_catalog, public, auth, extensions, pg_temp;

-- Guarda a hierarquia que deixa de existir quando o membro banido e removido.
alter table public.guild_bans
  add column if not exists target_role_position integer not null default 2147483647;

-- Timeout survives leaving and rejoining; its original hierarchy is retained for revoke.
create table if not exists public.guild_timeouts (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  executor_id uuid references public.profiles(id) on delete set null,
  until_at timestamptz not null,
  target_role_position integer not null default 2147483647,
  created_at timestamptz not null default clock_timestamp(),
  primary key (server_id, user_id)
);
alter table public.guild_timeouts add column if not exists target_role_position integer not null default 2147483647;
alter table public.guild_timeouts enable row level security;
revoke all on public.guild_timeouts from public, anon, authenticated;
grant select on public.guild_timeouts to authenticated;
drop policy if exists guild_timeouts_select_self on public.guild_timeouts;
create policy guild_timeouts_select_self on public.guild_timeouts for select to authenticated
  using (user_id = auth.uid());

create or replace function public.sekai_is_member_timed_out(p_server_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select exists (select 1 from public.guild_timeouts t
    where t.server_id = p_server_id and t.user_id = p_user_id and t.until_at > clock_timestamp())
    or exists (select 1 from public.members m
      where m.server_id = p_server_id and m.user_id = p_user_id
        and m.communication_disabled_until > clock_timestamp());
$$;
revoke all on function public.sekai_is_member_timed_out(uuid, uuid) from public, anon, authenticated;

create or replace function public.sekai_actor_can_manage_server(p_server_id uuid, p_permission text)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
begin
  if auth.uid() is null or p_server_id is null
     or p_permission not in ('manage_guild','manage_channels','manage_roles','create_instant_invite')
     or not public.has_permission(p_server_id, p_permission) then return false; end if;
  if public.is_sekai_admin() then return true; end if;
  if public.sekai_is_member_timed_out(p_server_id, auth.uid()) then return false; end if;
  if public.is_server_owner(p_server_id) then return true; end if;
  return exists (select 1 from public.members m
    where m.server_id = p_server_id and m.user_id = auth.uid() and not coalesce(m.is_banned, false));
end;
$$;
revoke all on function public.sekai_actor_can_manage_server(uuid, text) from public, anon;

create table if not exists public.sekai_moderation_dispatches (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('kick', 'ban', 'timeout')),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.sekai_moderation_dispatches enable row level security;
revoke all on public.sekai_moderation_dispatches from public, anon, authenticated;

create or replace function public.sekai_actor_role_position(p_server_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_position integer;
begin
  if v_user_id is null then return -1; end if;
  if public.is_sekai_admin() or public.is_server_owner(p_server_id) then
    return 2147483647;
  end if;
  if not exists (select 1 from public.members m where m.server_id = p_server_id
      and m.user_id = v_user_id and not coalesce(m.is_banned, false)) then return -1; end if;
  select max(r.position) into v_position
  from (
    select m.role_id
    from public.members m
    where m.server_id = p_server_id and m.user_id = v_user_id
    union
    select mr.role_id
    from public.member_roles mr
    where mr.server_id = p_server_id and mr.user_id = v_user_id
  ) assigned
  join public.roles r on r.id = assigned.role_id and r.server_id = p_server_id;
  return coalesce(v_position, -1);
end;
$$;

create or replace function public.sekai_target_role_position(p_server_id uuid, p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select case when exists (
      select 1 from public.servers s where s.id = p_server_id and s.owner_id = p_user_id
    ) then 2147483647
    else coalesce((
      select max(r.position)
      from (
        select m.role_id from public.members m where m.server_id = p_server_id and m.user_id = p_user_id
        union
        select mr.role_id from public.member_roles mr where mr.server_id = p_server_id and mr.user_id = p_user_id
      ) assigned
      join public.roles r on r.id = assigned.role_id and r.server_id = p_server_id
    ), -1) end;
$$;

create or replace function public.sekai_can_manage_member(
  p_server_id uuid,
  p_user_id uuid,
  p_permission text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or p_server_id is null or p_user_id is null
     or p_user_id = v_actor
     or p_permission not in ('kick_members', 'ban_members', 'mute_members', 'moderate_members', 'move_members', 'manage_roles', 'manage_nicknames') then
    return false;
  end if;
  -- Serializa cambios a roles/moderacao do servidor e le a hierarquia apos obter o lock.
  perform pg_advisory_xact_lock(hashtextextended(p_server_id::text, 9173));
  if not public.has_permission(p_server_id, p_permission) then return false; end if;
  if public.sekai_is_member_timed_out(p_server_id, v_actor) then return false; end if;
  if public.is_sekai_admin() then return true; end if;
  if not public.is_server_owner(p_server_id) and not exists (select 1 from public.members m
      where m.server_id = p_server_id and m.user_id = v_actor and not coalesce(m.is_banned, false)) then return false; end if;
  if public.is_server_owner(p_server_id) then return true; end if;
  if exists (select 1 from public.servers s where s.id = p_server_id and s.owner_id = p_user_id) then return false; end if;
  if not exists (
    select 1 from public.members m
    where m.server_id = p_server_id and m.user_id = p_user_id
  ) then return false; end if;
  return public.sekai_actor_role_position(p_server_id)
    > public.sekai_target_role_position(p_server_id, p_user_id);
end;
$$;

create or replace function public.sekai_can_manage_role(p_server_id uuid, p_role_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role_position integer;
begin
  if v_actor is null or p_server_id is null or p_role_id is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_server_id::text, 9173));
  if not public.has_permission(p_server_id, 'manage_roles') then return false; end if;
  if public.sekai_is_member_timed_out(p_server_id, v_actor) then return false; end if;
  if not public.is_sekai_admin() and not public.is_server_owner(p_server_id)
     and not exists (select 1 from public.members m where m.server_id = p_server_id
       and m.user_id = v_actor and not coalesce(m.is_banned, false)) then return false; end if;
  select r.position into v_role_position
  from public.roles r
  where r.id = p_role_id and r.server_id = p_server_id and not coalesce(r.is_default, false);
  if not found then return false; end if;
  if public.is_sekai_admin() or public.is_server_owner(p_server_id) then return true; end if;
  if exists (select 1 from public.roles r where r.id = p_role_id and (r.permissions & public.perm('ADMINISTRATOR')) <> 0) then
    return false;
  end if;
  return v_role_position < public.sekai_actor_role_position(p_server_id);
end;
$$;

create or replace function public.sekai_can_create_role(p_server_id uuid, p_position integer, p_permissions bigint)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_rank integer;
  v_permissions bigint;
begin
  if v_actor is null or p_server_id is null or p_position is null or p_position < 0 or p_permissions is null then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_server_id::text, 9173));
  if not public.has_permission(p_server_id, 'manage_roles') then return false; end if;
  if public.is_sekai_admin() then return true; end if;
  if public.sekai_is_member_timed_out(p_server_id, v_actor)
     or not exists (select 1 from public.members m where m.server_id = p_server_id
       and m.user_id = v_actor and not coalesce(m.is_banned, false)) then return false; end if;
  if public.is_server_owner(p_server_id) then return true; end if;
  if (p_permissions & public.perm('ADMINISTRATOR')) <> 0 then return false; end if;
  v_rank := public.sekai_actor_role_position(p_server_id);
  if p_position >= v_rank then return false; end if;
  v_permissions := public.member_base_permissions(p_server_id, v_actor);
  return (p_permissions & ~v_permissions) = 0;
end;
$$;

create or replace function public.sekai_can_update_role(
  p_server_id uuid, p_role_id uuid, p_position integer, p_permissions bigint, p_is_default boolean
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_rank integer;
  v_permissions bigint;
begin
  if p_is_default is distinct from false or p_position is null or p_position < 0 or p_permissions is null
     or not public.sekai_can_manage_role(p_server_id, p_role_id) then return false; end if;
  if public.is_sekai_admin() or public.is_server_owner(p_server_id) then return true; end if;
  if (p_permissions & public.perm('ADMINISTRATOR')) <> 0 then return false; end if;
  v_rank := public.sekai_actor_role_position(p_server_id);
  if p_position >= v_rank then return false; end if;
  v_permissions := public.member_base_permissions(p_server_id, v_actor);
  return (p_permissions & ~v_permissions) = 0;
end;
$$;

create or replace function public.sekai_can_create_invite(p_server_id uuid, p_inviter_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select auth.uid() is not null
    and p_inviter_id = auth.uid()
    and (public.is_sekai_admin() or public.is_server_owner(p_server_id)
      or exists (select 1 from public.members m
        where m.server_id = p_server_id and m.user_id = auth.uid() and not m.is_banned))
    and not public.sekai_is_member_timed_out(p_server_id, auth.uid())
    and public.has_permission(p_server_id, 'create_instant_invite');
$$;

create or replace function public.sekai_can_delete_invite(p_server_id uuid, p_inviter_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select auth.uid() is not null and (
    public.is_sekai_admin()
    or public.is_server_owner(p_server_id)
    or (p_inviter_id = auth.uid() and public.sekai_can_create_invite(p_server_id, p_inviter_id))
  );
$$;

create or replace function public.sekai_can_manage_ban(p_server_id uuid, p_user_id uuid, p_delete boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_target_position integer;
begin
  if v_actor is null or p_server_id is null or p_user_id is null or p_user_id = v_actor then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_server_id::text, 9173));
  if not public.has_permission(p_server_id, 'ban_members') then return false; end if;
  if public.is_sekai_admin() then return true; end if;
  if public.sekai_is_member_timed_out(p_server_id, v_actor) then return false; end if;
  if not public.is_server_owner(p_server_id) and not exists (select 1 from public.members m
      where m.server_id = p_server_id and m.user_id = v_actor and not coalesce(m.is_banned, false)) then return false; end if;
  if public.is_server_owner(p_server_id) then return true; end if;
  if p_delete then
    select b.target_role_position into v_target_position
    from public.guild_bans b where b.server_id = p_server_id and b.user_id = p_user_id;
    if not found then return false; end if;
    return public.sekai_actor_role_position(p_server_id) > v_target_position;
  end if;
  return public.sekai_can_manage_member(p_server_id, p_user_id, 'ban_members');
end;
$$;

create or replace function public.sekai_record_moderation_dispatch(
  p_server_id uuid, p_user_id uuid, p_action text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
begin
  if auth.uid() is null or p_action not in ('kick', 'ban', 'timeout') then
    raise exception 'Acao de moderacao invalida' using errcode = '22023';
  end if;
  insert into public.sekai_moderation_dispatches(server_id, target_id, actor_id, action)
  values (p_server_id, p_user_id, auth.uid(), p_action);
end;
$$;

create or replace function public.consume_server_moderation_dispatch(
  p_server_id uuid, p_user_id uuid, p_action text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or p_action not in ('kick', 'ban', 'timeout') then return false; end if;
  delete from public.sekai_moderation_dispatches d
   where d.id = (
     select pending.id from public.sekai_moderation_dispatches pending
      where pending.server_id = p_server_id and pending.target_id = p_user_id
        and pending.actor_id = auth.uid() and pending.action = p_action
        and pending.created_at > clock_timestamp() - interval '2 minutes'
      order by pending.created_at desc
      for update skip locked
      limit 1
   )
   returning d.id into v_id;
  return v_id is not null;
end;
$$;

create or replace function public.authorize_server_voice_disconnect(p_server_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
begin
  if not public.sekai_can_manage_member(p_server_id, p_user_id, 'move_members') then
    raise exception 'Sem permissao para desconectar este membro' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assign_server_member_role(
  p_server_id uuid, p_user_id uuid, p_role_id uuid, p_assign boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_role_name text;
  v_target_name text;
begin
  if auth.uid() is null or p_server_id is null or p_user_id is null or p_role_id is null or p_assign is null then
    raise exception 'Autenticacao necessaria' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_server_id::text, 9173));
  if p_user_id = auth.uid() then raise exception 'Nao e permitido alterar os proprios cargos' using errcode = '42501'; end if;
  if not public.sekai_can_manage_member(p_server_id, p_user_id, 'manage_roles')
     or not public.sekai_can_manage_role(p_server_id, p_role_id) then
    raise exception 'Sem permissao para alterar este cargo ou membro' using errcode = '42501';
  end if;
  if not exists (select 1 from public.members m where m.server_id = p_server_id and m.user_id = p_user_id) then
    raise exception 'Membro nao encontrado neste servidor' using errcode = 'P0002';
  end if;
  select r.name into v_role_name from public.roles r
   where r.id = p_role_id and r.server_id = p_server_id and not coalesce(r.is_default, false);
  if v_role_name is null then raise exception 'Cargo invalido' using errcode = '22023'; end if;
  select coalesce(nullif(p.display_name, ''), p.username, p_user_id::text)
    into v_target_name from public.profiles p where p.id = p_user_id;
  if p_assign then
    insert into public.member_roles(server_id, user_id, role_id)
    values (p_server_id, p_user_id, p_role_id) on conflict do nothing;
  else
    delete from public.member_roles mr
     where mr.server_id = p_server_id and mr.user_id = p_user_id and mr.role_id = p_role_id;
  end if;
  if found then
    insert into public.server_audit_logs(server_id, actor_id, action, target, details)
    values (p_server_id, auth.uid(), case when p_assign then 'member.role.add' else 'member.role.remove' end,
      coalesce(v_target_name, p_user_id::text), jsonb_build_object('user_id', p_user_id, 'role_id', p_role_id, 'role_name', v_role_name));
  end if;
end;
$$;

create or replace function public.moderate_server_member(
  p_server_id uuid, p_user_id uuid, p_action text, p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_target_name text;
  v_permission text;
  v_position integer;
begin
  if auth.uid() is null or p_server_id is null or p_user_id is null or p_action not in ('kick', 'ban') then
    raise exception 'Acao de moderacao invalida' using errcode = '22023';
  end if;
  if char_length(coalesce(p_reason, '')) > 200 then raise exception 'Motivo muito longo' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_server_id::text, 9173));
  v_permission := case p_action when 'kick' then 'kick_members' else 'ban_members' end;
  if not public.sekai_can_manage_member(p_server_id, p_user_id, v_permission) then
    raise exception 'Sem permissao para moderar este membro' using errcode = '42501';
  end if;
  if exists (select 1 from public.servers s where s.id = p_server_id and s.owner_id = p_user_id)
     and not public.is_sekai_admin() then
    raise exception 'Nao e permitido moderar o dono do servidor' using errcode = '42501';
  end if;
  v_position := public.sekai_target_role_position(p_server_id, p_user_id);
  select coalesce(nullif(p.display_name, ''), p.username, p_user_id::text)
    into v_target_name from public.profiles p where p.id = p_user_id;
  if p_action = 'ban' then
    insert into public.guild_bans(server_id, user_id, executor_id, reason, target_role_position)
    values (p_server_id, p_user_id, auth.uid(), nullif(p_reason, ''), v_position)
    on conflict (server_id, user_id) do update
      set executor_id = excluded.executor_id, reason = excluded.reason,
          target_role_position = excluded.target_role_position, created_at = clock_timestamp();
  end if;
  delete from public.member_roles mr where mr.server_id = p_server_id and mr.user_id = p_user_id;
  delete from public.members m where m.server_id = p_server_id and m.user_id = p_user_id;
  insert into public.server_audit_logs(server_id, actor_id, action, target, details)
  values (p_server_id, auth.uid(), 'member.' || p_action, coalesce(v_target_name, p_user_id::text),
    jsonb_build_object('user_id', p_user_id, 'reason', nullif(p_reason, '')));
  perform public.sekai_record_moderation_dispatch(p_server_id, p_user_id, p_action);
end;
$$;

create or replace function public.set_server_member_timeout(
  p_server_id uuid, p_user_id uuid, p_until timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_target_position integer;
  v_target_name text;
  v_member_exists boolean;
begin
  if auth.uid() is null or p_server_id is null or p_user_id is null or p_user_id = auth.uid() then
    raise exception 'Autenticacao necessaria' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_server_id::text, 9173));
  if p_until is not null and (p_until <= clock_timestamp() or p_until > clock_timestamp() + interval '28 days') then
    raise exception 'Duracao de timeout invalida' using errcode = '22023';
  end if;
  select exists (select 1 from public.members m where m.server_id = p_server_id and m.user_id = p_user_id)
    into v_member_exists;
  if v_member_exists then
    if exists (select 1 from public.servers s where s.id = p_server_id and s.owner_id = p_user_id)
       and not public.is_sekai_admin() then
      raise exception 'Nao e permitido aplicar timeout ao dono do servidor' using errcode = '42501';
    end if;
    if not (public.sekai_can_manage_member(p_server_id, p_user_id, 'moderate_members')
            or public.sekai_can_manage_member(p_server_id, p_user_id, 'mute_members')) then
      raise exception 'Sem permissao para silenciar este membro' using errcode = '42501';
    end if;
    v_target_position := public.sekai_target_role_position(p_server_id, p_user_id);
  else
    if p_until is not null then raise exception 'Membro nao encontrado neste servidor' using errcode = 'P0002'; end if;
    if not (public.has_permission(p_server_id, 'moderate_members') or public.has_permission(p_server_id, 'mute_members'))
       or public.sekai_is_member_timed_out(p_server_id, auth.uid())
       or (not public.is_sekai_admin() and not public.is_server_owner(p_server_id)
         and not exists (select 1 from public.members m where m.server_id = p_server_id
           and m.user_id = auth.uid() and not coalesce(m.is_banned, false))) then
      raise exception 'Sem permissao para revogar este timeout' using errcode = '42501';
    end if;
    select t.target_role_position into v_target_position from public.guild_timeouts t
     where t.server_id = p_server_id and t.user_id = p_user_id;
    if not found then raise exception 'Membro nao encontrado neste servidor' using errcode = 'P0002'; end if;
    if not public.is_sekai_admin() and not public.is_server_owner(p_server_id)
       and public.sekai_actor_role_position(p_server_id) <= v_target_position then
      raise exception 'Nao e possivel moderar um membro com cargo igual ou superior' using errcode = '42501';
    end if;
  end if;

  if p_until is null then
    delete from public.guild_timeouts t where t.server_id = p_server_id and t.user_id = p_user_id;
  else
    insert into public.guild_timeouts(server_id, user_id, executor_id, until_at, target_role_position)
    values (p_server_id, p_user_id, auth.uid(), p_until, v_target_position)
    on conflict (server_id, user_id) do update
      set executor_id = excluded.executor_id, until_at = excluded.until_at,
          target_role_position = excluded.target_role_position, created_at = clock_timestamp();
  end if;
  update public.members m set communication_disabled_until = p_until, is_muted = false
   where m.server_id = p_server_id and m.user_id = p_user_id;
  select coalesce(nullif(p.display_name, ''), p.username, p_user_id::text) into v_target_name
    from public.profiles p where p.id = p_user_id;
  insert into public.server_audit_logs(server_id, actor_id, action, target, details)
  values (p_server_id, auth.uid(), case when p_until is null then 'member.timeout.remove' else 'member.timeout' end,
    coalesce(v_target_name, p_user_id::text), jsonb_build_object('user_id', p_user_id, 'until', p_until));
  if p_until is not null then perform public.sekai_record_moderation_dispatch(p_server_id, p_user_id, 'timeout'); end if;
end;
$$;

create or replace function public.set_server_member_nickname(
  p_server_id uuid, p_user_id uuid, p_nickname text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_nickname text := nullif(btrim(coalesce(p_nickname, '')), '');
  v_target_name text;
begin
  if auth.uid() is null or p_server_id is null or p_user_id is null or p_user_id = auth.uid() then raise exception 'Autenticacao necessaria' using errcode = '42501'; end if;
  if char_length(coalesce(p_nickname, '')) > 32 then raise exception 'Apelido muito longo' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_server_id::text, 9173));
  if not public.sekai_can_manage_member(p_server_id, p_user_id, 'manage_nicknames') then
    raise exception 'Sem permissao para alterar o apelido deste membro' using errcode = '42501';
  end if;
  select coalesce(nullif(p.display_name, ''), p.username, p_user_id::text) into v_target_name
    from public.profiles p where p.id = p_user_id;
  update public.members m set nickname = v_nickname where m.server_id = p_server_id and m.user_id = p_user_id;
  if not found then raise exception 'Membro nao encontrado neste servidor' using errcode = 'P0002'; end if;
  insert into public.server_audit_logs(server_id, actor_id, action, target, details)
  values (p_server_id, auth.uid(), 'member.nickname.update', coalesce(v_target_name, p_user_id::text),
    jsonb_build_object('user_id', p_user_id, 'nickname', v_nickname));
end;
$$;

create table if not exists public.sekai_invite_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  attempts integer not null check (attempts >= 1)
);
alter table public.sekai_invite_attempts enable row level security;
revoke all on public.sekai_invite_attempts from public, anon, authenticated;

create or replace function public.sekai_consume_invite_attempt()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_attempts integer;
begin
  if v_user_id is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 6221));
  insert into public.sekai_invite_attempts(user_id, window_started_at, attempts)
  values (v_user_id, clock_timestamp(), 1)
  on conflict (user_id) do update set
    window_started_at = case
      when public.sekai_invite_attempts.window_started_at < clock_timestamp() - interval '15 minutes'
      then clock_timestamp() else public.sekai_invite_attempts.window_started_at end,
    attempts = case
      when public.sekai_invite_attempts.window_started_at < clock_timestamp() - interval '15 minutes'
      then 1 else least(public.sekai_invite_attempts.attempts + 1, 11) end
  returning attempts into v_attempts;
  return v_attempts <= 10;
end;
$$;
revoke all on function public.sekai_consume_invite_attempt() from public, anon, authenticated;

create index if not exists invites_normalized_code_idx on public.invites ((upper(btrim(code))));
create index if not exists servers_normalized_invite_code_idx on public.servers ((upper(btrim(invite_code))));

create or replace function public.preview_invite(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth, extensions, pg_temp
as $$
declare
  v_code text;
  v_server_id uuid;
  v_name text;
  v_icon text;
  v_banner text;
  v_created timestamptz;
  v_members bigint;
  v_online bigint;
begin
  if not public.sekai_consume_invite_attempt() then return null; end if;
  if p_code is null or char_length(p_code) > 128 then return null; end if;
  v_code := upper(btrim(p_code));
  if v_code = '' or v_code !~ '^[A-Z0-9]{6,16}$' then return null; end if;
  select i.server_id into v_server_id from public.invites i
   where upper(btrim(i.code)) = v_code
     and (i.expires_at is null or i.expires_at > clock_timestamp())
     and (coalesce(i.max_uses, 0) = 0 or coalesce(i.uses, 0) < i.max_uses)
     and (coalesce(i.max_age, 0) = 0 or i.created_at + make_interval(secs => i.max_age) > clock_timestamp())
   limit 1;
  if v_server_id is null then
    select s.id into v_server_id from public.servers s where upper(btrim(s.invite_code)) = v_code limit 1;
  end if;
  if v_server_id is null then return null; end if;
  select s.name, s.icon_url, s.banner_url, s.created_at into v_name, v_icon, v_banner, v_created
    from public.servers s where s.id = v_server_id;
  if v_name is null then return null; end if;
  select count(*) into v_members from public.members m
   where m.server_id = v_server_id and not coalesce(m.is_banned, false);
  select count(*) into v_online from public.members m join public.profiles p on p.id = m.user_id
   where m.server_id = v_server_id and not coalesce(m.is_banned, false)
     and p.status in ('online', 'idle', 'dnd');
  return jsonb_build_object('name', v_name, 'iconUrl', v_icon, 'bannerUrl', v_banner,
    'createdAt', v_created, 'online', v_online, 'members', v_members);
end;
$$;
revoke all on function public.preview_invite(text) from public, anon;
grant execute on function public.preview_invite(text) to authenticated;

create or replace function public.redeem_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.invites%rowtype;
  v_code text;
  v_server_id uuid;
  v_role_id uuid;
  v_timeout_until timestamptz;
  v_new_member boolean := false;
  v_inserted_count integer := 0;
begin
  if v_user_id is null then return null; end if;
  if not public.sekai_consume_invite_attempt() then return null; end if;
  if p_code is null or char_length(p_code) > 128 then return null; end if;
  v_code := upper(btrim(p_code));
  if char_length(v_code) < 6 or char_length(v_code) > 16 or v_code !~ '^[A-Z0-9]+$' then return null; end if;

  select i.* into v_invite from public.invites i
   where upper(btrim(i.code)) = v_code
   for update;
  if found then
    if (v_invite.expires_at is not null and v_invite.expires_at <= clock_timestamp())
       or (v_invite.max_age > 0 and v_invite.created_at + make_interval(secs => v_invite.max_age) <= clock_timestamp())
       or (coalesce(v_invite.max_uses, 0) > 0 and coalesce(v_invite.uses, 0) >= v_invite.max_uses) then return null; end if;
    v_server_id := v_invite.server_id;
  else
    select s.id into v_server_id from public.servers s where upper(btrim(s.invite_code)) = v_code limit 1;
    if v_server_id is null then return null; end if;
  end if;
  if v_server_id is null then return null; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_server_id::text, 9173));
  if exists (select 1 from public.guild_bans b where b.server_id = v_server_id and b.user_id = v_user_id)
     or exists (select 1 from public.members m where m.server_id = v_server_id and m.user_id = v_user_id and m.is_banned) then
    return null;
  end if;
  select r.id into v_role_id from public.roles r
   where r.server_id = v_server_id and coalesce(r.is_default, false) limit 1;
  if v_role_id is null then return null; end if;
  select t.until_at into v_timeout_until from public.guild_timeouts t
   where t.server_id = v_server_id and t.user_id = v_user_id and t.until_at > clock_timestamp();
  insert into public.members(server_id, user_id, role_id, communication_disabled_until, is_banned)
  values (v_server_id, v_user_id, v_role_id, v_timeout_until, false)
  on conflict (server_id, user_id) do nothing;
  get diagnostics v_inserted_count = row_count;
  v_new_member := v_inserted_count > 0;
  if not v_new_member then
    if exists (select 1 from public.members m where m.server_id = v_server_id and m.user_id = v_user_id and m.is_banned) then return null; end if;
    return v_server_id;
  end if;
  insert into public.member_roles(server_id, user_id, role_id)
  values (v_server_id, v_user_id, v_role_id) on conflict do nothing;
  -- O bloqueio da linha de invite acima torna o limite max_uses atomico.
  if v_invite.code is not null then
    update public.invites i set uses = coalesce(i.uses, 0) + 1 where i.code = v_invite.code;
  end if;
  return v_server_id;
end;
$$;

-- Remove policies permissivas sobrepostas: PostgreSQL combina policies permissivas com OR.
drop policy if exists channels_write_manage_channels on public.channels;
create policy channels_write_manage_channels on public.channels to authenticated
  using (public.sekai_actor_can_manage_server(server_id, 'manage_channels'))
  with check (public.sekai_actor_can_manage_server(server_id, 'manage_channels'));

drop policy if exists categories_write_manage_channels on public.channel_categories;
drop policy if exists channel_categories_manage on public.channel_categories;
create policy channel_categories_manage on public.channel_categories to authenticated
  using (public.sekai_actor_can_manage_server(server_id, 'manage_channels'))
  with check (public.sekai_actor_can_manage_server(server_id, 'manage_channels'));

drop policy if exists roles_write_manage_roles on public.roles;
create policy roles_write_manage_roles on public.roles for update to authenticated
  using (public.sekai_can_manage_role(server_id, id))
  with check (public.sekai_can_update_role(server_id, id, position, permissions, is_default));
drop policy if exists roles_insert_manage_roles on public.roles;
create policy roles_insert_manage_roles on public.roles for insert to authenticated
  with check (not coalesce(is_default, false) and public.sekai_can_create_role(server_id, position, permissions));
drop policy if exists roles_delete_manage_roles on public.roles;
create policy roles_delete_manage_roles on public.roles for delete to authenticated
  using (public.sekai_can_manage_role(server_id, id));
revoke update on public.roles from public, anon, authenticated;
grant update (name, color, hoist, mentionable, position, permissions, icon_url, insignia_url)
  on public.roles to authenticated;

drop policy if exists member_roles_assign_manage_roles on public.member_roles;
drop policy if exists member_roles_remove_manage_roles on public.member_roles;
drop policy if exists member_roles_write_manage_roles on public.member_roles;
create policy member_roles_assign_manage_roles on public.member_roles for insert to authenticated
  with check (user_id <> auth.uid()
    and public.sekai_can_manage_member(server_id, user_id, 'manage_roles')
    and public.sekai_can_manage_role(server_id, role_id));
create policy member_roles_remove_manage_roles on public.member_roles for delete to authenticated
  using (user_id <> auth.uid()
    and public.sekai_can_manage_member(server_id, user_id, 'manage_roles')
    and public.sekai_can_manage_role(server_id, role_id));

drop policy if exists members_delete_self_or_kick on public.members;
create policy members_delete_self_or_kick on public.members for delete to authenticated
  using ((user_id = auth.uid() and not public.is_server_owner(server_id))
    or public.sekai_can_manage_member(server_id, user_id, 'kick_members'));
drop policy if exists members_insert_self on public.members;
-- A associação só nasce ao criar o servidor (trigger) ou por redeem_invite().
drop policy if exists members_update on public.members;
drop policy if exists members_update_own_nickname on public.members;
create policy members_update_own_profile_fields on public.members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.members from public, anon, authenticated;
grant update (
  nickname, avatar_url, banner_url,
  avatar_position_x, avatar_position_y, avatar_zoom,
  banner_position_x, banner_position_y, banner_zoom,
  member_list_banner_url, member_list_banner_position_x,
  member_list_banner_position_y, member_list_banner_zoom
) on public.members to authenticated;

drop policy if exists bans_write on public.guild_bans;
drop policy if exists guild_bans_insert_mods on public.guild_bans;
drop policy if exists guild_bans_delete_mods on public.guild_bans;
create policy guild_bans_delete_mods on public.guild_bans for delete to authenticated
  using (public.sekai_can_manage_ban(server_id, user_id, true));
-- INSERT/UPDATE de bans ficam exclusivos da RPC SECURITY DEFINER moderada acima.

drop policy if exists invites_create_member on public.invites;
drop policy if exists invites_insert on public.invites;
create policy invites_create_member on public.invites for insert to authenticated
  with check (inviter_id = auth.uid() and public.sekai_can_create_invite(server_id, inviter_id));
drop policy if exists invites_delete on public.invites;
drop policy if exists invites_delete_creator_or_owner on public.invites;
create policy invites_delete on public.invites for delete to authenticated
  using (public.sekai_can_delete_invite(server_id, inviter_id));

-- Evita que convites de amigos sirvam para convidar alguém sem relação aceita.
drop policy if exists friend_server_invites_create_friend on public.friend_server_invites;
create policy friend_server_invites_create_friend on public.friend_server_invites for insert to authenticated
  with check (sender_id = auth.uid() and exists (select 1 from public.members own_member
    where own_member.server_id = friend_server_invites.server_id and own_member.user_id = auth.uid() and not own_member.is_banned)
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.sender_id = auth.uid() and f.receiver_id = friend_server_invites.receiver_id)
          or (f.receiver_id = auth.uid() and f.sender_id = friend_server_invites.receiver_id))
    ));

grant execute on function public.sekai_actor_role_position(uuid) to authenticated;
grant execute on function public.sekai_target_role_position(uuid, uuid) to authenticated;
grant execute on function public.sekai_can_manage_member(uuid, uuid, text) to authenticated;
grant execute on function public.sekai_can_manage_role(uuid, uuid) to authenticated;
grant execute on function public.sekai_can_create_role(uuid, integer, bigint) to authenticated;
grant execute on function public.sekai_can_update_role(uuid, uuid, integer, bigint, boolean) to authenticated;
grant execute on function public.sekai_can_create_invite(uuid, uuid) to authenticated;
grant execute on function public.sekai_can_delete_invite(uuid, uuid) to authenticated;
grant execute on function public.sekai_can_manage_ban(uuid, uuid, boolean) to authenticated;
grant execute on function public.sekai_actor_can_manage_server(uuid, text) to authenticated;
grant execute on function public.consume_server_moderation_dispatch(uuid, uuid, text) to authenticated;
grant execute on function public.authorize_server_voice_disconnect(uuid, uuid) to authenticated;
revoke all on function public.sekai_record_moderation_dispatch(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;

commit;
