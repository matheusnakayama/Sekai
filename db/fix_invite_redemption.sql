-- Atualiza a validação de convites sem recriar as tabelas. Execute no SQL Editor do Supabase.

create or replace function public.redeem_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invite public.invites%rowtype;
  v_code text;
  v_server_id uuid;
  v_role_id uuid;
  v_is_new_invite boolean := false;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  v_code := upper(btrim(coalesce(p_code, '')));
  if v_code = '' then raise exception 'Convite inválido'; end if;

  select * into v_invite from public.invites
   where upper(btrim(code)) = v_code
   for update;

  if found then
    v_is_new_invite := true;
    if v_invite.expires_at is not null and v_invite.expires_at <= now() then raise exception 'Convite expirado'; end if;
    if v_invite.max_age > 0 and v_invite.created_at + make_interval(secs => v_invite.max_age) <= now() then raise exception 'Convite expirado'; end if;
    if v_invite.max_uses > 0 and v_invite.uses >= v_invite.max_uses then raise exception 'Convite esgotado'; end if;
    v_server_id := v_invite.server_id;
  else
    -- Compatibilidade com os códigos antigos guardados diretamente em servers.invite_code.
    select s.id into v_server_id
      from public.servers s
     where upper(btrim(s.invite_code)) = v_code
     limit 1;
    if v_server_id is null then raise exception 'Convite inválido'; end if;
  end if;

  select id into v_role_id from public.roles where server_id = v_server_id and is_default limit 1;
  if v_role_id is null then raise exception 'Servidor sem cargo padrão'; end if;
  insert into public.members (server_id, user_id)
  values (v_server_id, auth.uid())
  on conflict (server_id, user_id) do nothing;
  -- Cargos são associados pela tabela de junção neste schema.
  insert into public.member_roles (server_id, user_id, role_id)
  values (v_server_id, auth.uid(), v_role_id)
  on conflict do nothing;
  if v_is_new_invite then
    update public.invites set uses = uses + 1 where code = v_invite.code;
  end if;
  return v_server_id;
end;
$$;
revoke all on function public.redeem_invite(text) from public;
grant execute on function public.redeem_invite(text) to authenticated;

