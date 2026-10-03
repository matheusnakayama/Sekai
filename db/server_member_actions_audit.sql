-- Execute no SQL Editor do Supabase depois de project_integrity_upgrade.sql.
-- Faz expulsões/banimentos e atribuições de cargos registrarem auditoria no servidor.

create or replace function public.moderate_server_member(
  p_server_id uuid,
  p_user_id uuid,
  p_action text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target_name text;
  v_action text;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if p_user_id = auth.uid() or exists (
    select 1 from public.servers s where s.id = p_server_id and s.owner_id = p_user_id
  ) then
    raise exception 'Não é permitido moderar o dono do servidor ou a própria conta';
  end if;
  if not exists (select 1 from public.members where server_id = p_server_id and user_id = p_user_id) then
    raise exception 'Membro não encontrado neste servidor';
  end if;

  select coalesce(nullif(p.display_name, ''), p.username, p_user_id::text)
    into v_target_name from public.profiles p where p.id = p_user_id;
  v_target_name := coalesce(v_target_name, p_user_id::text);

  if p_action = 'kick' then
    if not public.has_permission(p_server_id, 'kick_members') then raise exception 'Sem permissão para expulsar'; end if;
    v_action := 'member.kick';
  elsif p_action = 'ban' then
    if not public.has_permission(p_server_id, 'ban_members') then raise exception 'Sem permissão para banir'; end if;
    insert into public.guild_bans (server_id, user_id, executor_id, reason)
    values (p_server_id, p_user_id, auth.uid(), left(p_reason, 200))
    on conflict (server_id, user_id) do update
      set executor_id = excluded.executor_id, reason = excluded.reason, created_at = now();
    v_action := 'member.ban';
  else
    raise exception 'Ação de moderação inválida';
  end if;

  delete from public.member_roles where server_id = p_server_id and user_id = p_user_id;
  delete from public.members where server_id = p_server_id and user_id = p_user_id;
  insert into public.server_audit_logs (server_id, actor_id, action, target, details)
  values (p_server_id, auth.uid(), v_action, v_target_name,
    jsonb_build_object('user_id', p_user_id, 'reason', nullif(left(p_reason, 200), '')));
end;
$$;
revoke all on function public.moderate_server_member(uuid, uuid, text, text) from public;
grant execute on function public.moderate_server_member(uuid, uuid, text, text) to authenticated;

create or replace function public.assign_server_member_role(
  p_server_id uuid,
  p_user_id uuid,
  p_role_id uuid,
  p_assign boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role_name text;
  v_target_name text;
  v_changed integer;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if p_user_id = auth.uid() then raise exception 'Não é possível alterar os próprios cargos por este menu'; end if;
  if not public.has_permission(p_server_id, 'manage_roles') then raise exception 'Sem permissão para gerenciar cargos'; end if;
  if not exists (select 1 from public.members where server_id = p_server_id and user_id = p_user_id) then
    raise exception 'Membro não encontrado neste servidor';
  end if;

  select name into v_role_name from public.roles
    where id = p_role_id and server_id = p_server_id and coalesce(is_default, false) = false;
  if v_role_name is null then raise exception 'Cargo inválido ou cargo padrão não pode ser atribuído'; end if;
  select coalesce(nullif(display_name, ''), username, p_user_id::text) into v_target_name
    from public.profiles where id = p_user_id;
  v_target_name := coalesce(v_target_name, p_user_id::text);

  if p_assign then
    insert into public.member_roles (server_id, user_id, role_id)
    values (p_server_id, p_user_id, p_role_id) on conflict do nothing;
    get diagnostics v_changed = row_count;
  else
    delete from public.member_roles where server_id = p_server_id and user_id = p_user_id and role_id = p_role_id;
    get diagnostics v_changed = row_count;
  end if;

  if v_changed > 0 then
    insert into public.server_audit_logs (server_id, actor_id, action, target, details)
    values (p_server_id, auth.uid(), case when p_assign then 'member.role.add' else 'member.role.remove' end,
      v_target_name, jsonb_build_object('user_id', p_user_id, 'role_id', p_role_id, 'role_name', v_role_name));
  end if;
end;
$$;
revoke all on function public.assign_server_member_role(uuid, uuid, uuid, boolean) from public;
grant execute on function public.assign_server_member_role(uuid, uuid, uuid, boolean) to authenticated;

-- Permite que edições de cargos usem o registro já existente; ações sobre
-- membros são gravadas pelas funções SECURITY DEFINER acima.
drop policy if exists server_audit_logs_insert_manage on public.server_audit_logs;
create policy server_audit_logs_insert_manage on public.server_audit_logs for insert to authenticated
  with check (
    actor_id = auth.uid()
    and (
      public.has_permission(server_id, 'manage_guild')
      or (action like 'role.%' and public.has_permission(server_id, 'manage_roles'))
    )
  );
