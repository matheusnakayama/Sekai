-- PENDENTE DE APROVACAO DO DONO. Nao aplicar sem staging e aprovacao.
-- Corrige policies USING (true), a sobrecarga ambigua de is_server_member,
-- policies de DMs antigas e ACL/search_path das 38 SECURITY DEFINER do snapshot.

begin;
set local search_path = pg_catalog, public, auth, extensions, storage, realtime, pg_temp;

-- Resolve a ambiguidade sem DROP: remove o DEFAULT da sobrecarga de 2 argumentos.
-- Chamadas antigas explicitas com dois UUIDs continuam resolvendo a assinatura,
-- mas so podem consultar a propria associacao (ou ser feitas por admin).

create or replace function public.is_server_member(p_server_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select auth.uid() is not null and (
    public.is_sekai_admin()
    or exists (
      select 1 from public.members m
      where m.server_id = p_server_id and m.user_id = auth.uid() and not m.is_banned
    )
  );
$$;
revoke all on function public.is_server_member(uuid) from public, anon;
grant execute on function public.is_server_member(uuid) to authenticated;

create or replace function public.is_server_member(p_server_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select auth.uid() is not null and (
    public.is_sekai_admin()
    or (p_user_id = auth.uid() and exists (
      select 1 from public.members m
      where m.server_id = p_server_id and m.user_id = auth.uid() and not m.is_banned
    ))
  );
$$;
revoke all on function public.is_server_member(uuid, uuid) from public, anon;
grant execute on function public.is_server_member(uuid, uuid) to authenticated;

-- A tabela legada precisa de um predicado SECURITY DEFINER para evitar recursao
-- RLS ao verificar participacao dentro de dm_members e direct_messages.
create or replace function public.sekai_is_dm_participant(p_dm_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.dm_members m
    where m.dm_channel_id = p_dm_channel_id and m.user_id = auth.uid()
  );
$$;
revoke all on function public.sekai_is_dm_participant(uuid) from public, anon;
grant execute on function public.sekai_is_dm_participant(uuid) to authenticated;

-- Consultas de permissao nunca revelam dados calculados para outro usuario.
create or replace function public.is_server_owner(p_server_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select auth.uid() is not null and (
    public.is_sekai_admin()
    or (p_user_id = auth.uid() and exists (
      select 1 from public.servers s where s.id = p_server_id and s.owner_id = auth.uid()
    ))
  );
$$;

create or replace function public.has_permission(p_server_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select auth.uid() is not null and (
    public.is_sekai_admin()
    or (
      not public.sekai_is_member_timed_out(p_server_id, auth.uid())
      and (
        public.is_server_owner(p_server_id)
        or exists (
          select 1 from public.members m
          left join public.member_roles mr on mr.server_id = m.server_id and mr.user_id = m.user_id
          join public.roles r on r.id = coalesce(mr.role_id, m.role_id) and r.server_id = m.server_id
          where m.server_id = p_server_id and m.user_id = auth.uid() and not coalesce(m.is_banned, false)
            and ((coalesce(r.permissions, 0)::bigint & 8::bigint) <> 0
              or (coalesce(r.permissions, 0)::bigint & case lower(p_permission)
                when 'create_invite' then 1::bigint when 'create_instant_invite' then 1::bigint
                when 'kick_members' then 2::bigint when 'ban_members' then 4::bigint
                when 'administrator' then 8::bigint when 'manage_channels' then 16::bigint
                when 'manage_guild' then 32::bigint when 'add_reactions' then 64::bigint
                when 'view_audit_log' then 128::bigint when 'view_channel' then 1024::bigint
                when 'send_messages' then 2048::bigint when 'manage_messages' then 8192::bigint
                when 'connect' then 1048576::bigint when 'speak' then 2097152::bigint
                when 'mute_members' then 4194304::bigint when 'deafen_members' then 8388608::bigint
                when 'move_members' then 16777216::bigint when 'manage_roles' then 268435456::bigint
                when 'moderate_members' then 1099511627776::bigint else 0::bigint end) <> 0)
        )
      )
    )
  );
$$;

create or replace function public.has_server_permission(
  p_server_id uuid, p_bit bigint, p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select auth.uid() is not null and (
    public.is_sekai_admin()
    or (p_user_id = auth.uid()
      and not public.sekai_is_member_timed_out(p_server_id, auth.uid())
      and ((public.member_base_permissions(p_server_id, p_user_id) & public.perm('ADMINISTRATOR')) <> 0
        or (public.member_base_permissions(p_server_id, p_user_id) & p_bit) <> 0))
  );
$$;

create or replace function public.member_base_permissions(p_server_id uuid, p_user_id uuid default auth.uid())
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select case
    when auth.uid() is null or (p_user_id <> auth.uid() and not public.is_sekai_admin()) then 0::bigint
    when public.is_sekai_admin() then (-1)::bigint
    when exists (select 1 from public.servers s where s.id = p_server_id and s.owner_id = p_user_id) then (-1)::bigint
    when not exists (select 1 from public.members m where m.server_id = p_server_id
      and m.user_id = p_user_id and not coalesce(m.is_banned, false)) then 0::bigint
    when p_user_id = auth.uid() and public.sekai_is_member_timed_out(p_server_id, auth.uid()) then 0::bigint
    else coalesce((
      select bit_or(r.permissions) from public.member_roles mr
      join public.roles r on r.id = mr.role_id and r.server_id = mr.server_id
      where mr.server_id = p_server_id and mr.user_id = p_user_id
    ), 0::bigint)
  end;
$$;

create or replace function public.channel_effective_permissions(p_channel_id uuid, p_user_id uuid default auth.uid())
returns bigint
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_server_id uuid;
  v_base bigint;
  v_everyone_role_id uuid;
  v_allow bigint;
  v_deny bigint;
  v_role_allow bigint;
  v_role_deny bigint;
begin
  if auth.uid() is null or p_user_id is null
     or (p_user_id <> auth.uid() and not public.is_sekai_admin()) then return 0; end if;
  select c.server_id into v_server_id from public.channels c where c.id = p_channel_id;
  if v_server_id is null then return 0; end if;
  if not public.is_sekai_admin()
     and not exists (select 1 from public.servers s where s.id = v_server_id and s.owner_id = p_user_id)
     and (not exists (select 1 from public.members m where m.server_id = v_server_id
          and m.user_id = p_user_id and not coalesce(m.is_banned, false))
       or (p_user_id = auth.uid() and public.sekai_is_member_timed_out(v_server_id, auth.uid()))) then return 0; end if;
  v_base := public.member_base_permissions(v_server_id, p_user_id);
  if (v_base & public.perm('ADMINISTRATOR')) <> 0 then return (-1)::bigint; end if;
  select r.id into v_everyone_role_id from public.roles r
   where r.server_id = v_server_id and r.is_default = true;
  select o.allow_permissions, o.deny_permissions into v_allow, v_deny
    from public.channel_permission_overwrites o
   where o.channel_id = p_channel_id and o.target_type = 'role' and o.target_id = v_everyone_role_id;
  v_base := (v_base & ~coalesce(v_deny, 0::bigint)) | coalesce(v_allow, 0::bigint);
  select coalesce(bit_or(o.deny_permissions), 0::bigint), coalesce(bit_or(o.allow_permissions), 0::bigint)
    into v_role_deny, v_role_allow
    from public.member_roles mr
    join public.channel_permission_overwrites o
      on o.channel_id = p_channel_id and o.target_type = 'role' and o.target_id = mr.role_id
   where mr.server_id = v_server_id and mr.user_id = p_user_id and mr.role_id <> v_everyone_role_id;
  v_base := (v_base & ~v_role_deny) | v_role_allow;
  select o.allow_permissions, o.deny_permissions into v_allow, v_deny
    from public.channel_permission_overwrites o
   where o.channel_id = p_channel_id and o.target_type = 'member' and o.target_id = p_user_id;
  v_base := (v_base & ~coalesce(v_deny, 0::bigint)) | coalesce(v_allow, 0::bigint);
  return v_base;
end;
$$;

-- Preserve membership visibility while removing the public/anon shortcuts.
drop policy if exists custom_badges_read on public.custom_badges;
drop policy if exists custom_badges_select_authenticated on public.custom_badges;
create policy custom_badges_select_authenticated on public.custom_badges for select to authenticated
  using (auth.uid() is not null);

drop policy if exists user_badges_read on public.user_badges;
drop policy if exists user_badges_select_authenticated on public.user_badges;
create policy user_badges_select_authenticated on public.user_badges for select to authenticated
  using (auth.uid() = user_id or (auth.uid() is not null and (visible_in_profile or visible_in_member_list)));

drop policy if exists user_now_playing_select on public.user_now_playing;
create policy user_now_playing_select on public.user_now_playing for select to authenticated
  using (auth.uid() = user_id or (
    display in ('profile', 'status', 'both') and (
      exists (select 1 from public.friendships f where f.status = 'accepted'
        and ((f.sender_id = auth.uid() and f.receiver_id = user_now_playing.user_id)
          or (f.receiver_id = auth.uid() and f.sender_id = user_now_playing.user_id)))
      or exists (select 1 from public.members mine join public.members theirs using (server_id)
        where mine.user_id = auth.uid() and theirs.user_id = user_now_playing.user_id
          and not mine.is_banned and not theirs.is_banned)
    )
  ));

-- A policy restritiva tambem pode ser ampla, mas agora repete a autorizacao
-- de update e bloqueia marcadores de sistema no USING e no WITH CHECK.
drop policy if exists messages_block_system_marker_update on public.messages;
create policy messages_block_system_marker_update on public.messages as restrictive for update to authenticated
  using (author_id = auth.uid()
    or public.has_channel_permission(channel_id, public.perm('MANAGE_MESSAGES')))
  with check ((author_id = auth.uid()
    or public.has_channel_permission(channel_id, public.perm('MANAGE_MESSAGES')))
    and coalesce(content, '') not like '[sekai-system:%');

-- Corrige o tautologico dm_members.dm_channel_id = dm_members.dm_channel_id.
drop policy if exists dm_channels_insert_any_authenticated on public.dm_channels;
drop policy if exists dm_members_insert on public.dm_members;
drop policy if exists dm_members_select_same_dm on public.dm_members;
create policy dm_members_select_same_dm on public.dm_members for select to authenticated
  using (public.sekai_is_dm_participant(dm_channel_id));
-- A aplicacao usa sekai_direct_messages; a tabela DM legada nao tem owner
-- persistido para validar a criacao/entrada de participantes. Sem policy INSERT,
-- nao e possivel adicionar terceiros nem entrar em conversas antigas via API.

drop policy if exists dms_insert_own on public.direct_messages;
create policy dms_insert_own on public.direct_messages for insert to authenticated
  with check (author_id = auth.uid() and public.sekai_is_dm_participant(dm_channel_id));
drop policy if exists dms_select_member on public.direct_messages;
create policy dms_select_member on public.direct_messages for select to authenticated
  using (public.sekai_is_dm_participant(dm_channel_id));
drop policy if exists dms_delete_own on public.direct_messages;
create policy dms_delete_own on public.direct_messages for delete to authenticated
  using (author_id = auth.uid() and public.sekai_is_dm_participant(dm_channel_id));
drop policy if exists dms_update_own on public.direct_messages;
create policy dms_update_own on public.direct_messages for update to authenticated
  using (author_id = auth.uid() and public.sekai_is_dm_participant(dm_channel_id))
  with check (author_id = auth.uid() and public.sekai_is_dm_participant(dm_channel_id));

-- Para SECURITY DEFINER existentes, a identidade da funcao vem do catalogo
-- (regprocedure imprime schema e assinatura com quoting); nenhum dado de entrada
-- e interpolado no SQL. EXECUTE de anon/PUBLIC e retirado sem mudar o grant de auth.
do $$
declare
  v_function record;
  v_policy_function record;
begin
  for v_function in
    select p.oid::regprocedure as identity
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
  loop
    execute pg_catalog.format(
      'alter function %s set search_path = pg_catalog, public, auth, extensions, storage, realtime, pg_temp',
      v_function.identity
    );
    execute pg_catalog.format('revoke execute on function %s from public, anon', v_function.identity);
  end loop;

  -- RLS continua a chamar seus predicados sob a role efetiva da policy. Concede
  -- EXECUTE explicitamente apenas as SECURITY DEFINER referenciadas por policies,
  -- e somente para os roles listados nessas policies. PUBLIC permanece revogado.
  for v_policy_function in
    select distinct proc.oid::regprocedure as identity,
      bool_or(role_item.role_oid = 0 or role_item.role_oid = auth_role.oid) as needs_authenticated,
      bool_or(role_item.role_oid = 0 or role_item.role_oid = anon_role.oid) as needs_anon
    from pg_catalog.pg_depend dep
    join pg_catalog.pg_policy policy on policy.oid = dep.objid
    join pg_catalog.pg_proc proc on proc.oid = dep.refobjid and proc.prosecdef
    cross join lateral unnest(policy.polroles) as role_item(role_oid)
    cross join pg_catalog.pg_roles auth_role
    cross join pg_catalog.pg_roles anon_role
    where dep.classid = 'pg_catalog.pg_policy'::regclass
      and dep.refclassid = 'pg_catalog.pg_proc'::regclass
      and auth_role.rolname = 'authenticated'
      and anon_role.rolname = 'anon'
    group by proc.oid
  loop
    if v_policy_function.needs_authenticated then
      execute pg_catalog.format('grant execute on function %s to authenticated', v_policy_function.identity);
    end if;
    if v_policy_function.needs_anon then
      execute pg_catalog.format('grant execute on function %s to anon', v_policy_function.identity);
    end if;
  end loop;
end;
$$;

-- As funcoes chamadas por policies precisam ser executaveis por authenticated.
-- SECURITY DEFINER tipo trigger/event_trigger continua sem EXECUTE de anon/public.
grant execute on function public.is_server_owner(uuid, uuid) to authenticated;
grant execute on function public.member_base_permissions(uuid, uuid) to authenticated;
grant execute on function public.channel_effective_permissions(uuid, uuid) to authenticated;
grant execute on function public.is_server_member(uuid) to authenticated;
grant execute on function public.is_server_member(uuid, uuid) to authenticated;
grant execute on function public.sekai_is_dm_participant(uuid) to authenticated;

-- Preserve explicit authenticated RPCs after removing their inherited PUBLIC grant.
-- Trigger/event-trigger entry points remain non-callable through PostgREST.
grant execute on function public.accept_friend_server_invite(uuid) to authenticated;
grant execute on function public.assign_server_member_role(uuid, uuid, uuid, boolean) to authenticated;
grant execute on function public.cast_channel_poll_vote(uuid, uuid) to authenticated;
grant execute on function public.create_channel_poll(uuid, text, text[]) to authenticated;
grant execute on function public.create_channel_topic(uuid, text, text) to authenticated;
grant execute on function public.get_channel_poll_results(uuid) to authenticated;
grant execute on function public.is_sekai_admin() to authenticated;
grant execute on function public.moderate_server_member(uuid, uuid, text, text) to authenticated;
grant execute on function public.preview_invite(text) to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.set_server_banner(uuid, text) to authenticated;
grant execute on function public.set_server_member_nickname(uuid, uuid, text) to authenticated;
grant execute on function public.set_server_member_timeout(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.sekai_roll_bankai(uuid) to authenticated;

commit;
