-- Execute SOMENTE em staging depois de revisar/aplicar manualmente as migrations pendentes.
-- Substitua os UUIDs abaixo por fixtures existentes. USER_B deve ter cargo igual ou
-- superior a USER_A; USER_C deve ser um terceiro participante de DM sem relacao com A.
-- Rode como database owner no SQL Editor para poder alternar SET ROLE. Tudo termina em ROLLBACK.

begin;

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  if exists (select 1 from public.custom_badges) then raise exception 'RLS anon: custom_badges vazou linhas'; end if;
  if exists (select 1 from public.user_badges) then raise exception 'RLS anon: user_badges vazou linhas'; end if;
  if exists (select 1 from public.user_now_playing) then raise exception 'RLS anon: user_now_playing vazou linhas'; end if;
end;
$$;

reset role;
do $$
begin
  if not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000a')
     or not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000b')
     or not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000c') then
    raise exception 'Preencha USER_A_UUID, USER_B_UUID e USER_C_UUID com usuarios staging existentes';
  end if;
  if not exists (select 1 from public.user_settings where user_id = '00000000-0000-0000-0000-00000000000b') then
    raise exception 'Crie antes uma linha user_settings para USER_B_UUID';
  end if;
  if not exists (select 1 from public.sekai_direct_messages where id = '00000000-0000-0000-0000-00000000000f'
    and ((sender_id = '00000000-0000-0000-0000-00000000000b' and receiver_id = '00000000-0000-0000-0000-00000000000c')
      or (sender_id = '00000000-0000-0000-0000-00000000000c' and receiver_id = '00000000-0000-0000-0000-00000000000b'))) then
    raise exception 'Preencha DM_B_C_MESSAGE_UUID com uma DM existente entre B e C';
  end if;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true); -- USER_A_UUID

do $$
declare
  v_a uuid := '00000000-0000-0000-0000-00000000000a'; -- USER_A_UUID
  v_b uuid := '00000000-0000-0000-0000-00000000000b'; -- USER_B_UUID
  v_c uuid := '00000000-0000-0000-0000-00000000000c'; -- USER_C_UUID
  v_server uuid := '00000000-0000-0000-0000-00000000000d'; -- SERVER_UUID
  v_member_role uuid := '00000000-0000-0000-0000-00000000000e'; -- ROLE_B_UUID (existing)
  v_private_dm uuid := '00000000-0000-0000-0000-00000000000f'; -- DM_B_C_MESSAGE_UUID (B/C only)
begin
  if exists (select 1 from public.user_settings s where s.user_id = v_b) then
    raise exception 'RLS A/B: usuario A leu user_settings de B';
  end if;
  if exists (select 1 from public.sekai_direct_messages m where m.id = v_private_dm) then
    raise exception 'RLS A/B: usuario A leu DM exclusiva entre B e C';
  end if;
  if public.sekai_can_manage_member(v_server, v_b, 'kick_members') then
    raise exception 'Hierarquia: A recebeu autorizacao sobre membro de cargo igual/superior B';
  end if;
  if not public.has_permission(v_server, 'kick_members') then
    raise exception 'Fixture invalida: A precisa ter kick_members para testar o bloqueio hierarquico';
  end if;
  if public.sekai_actor_role_position(v_server) > public.sekai_target_role_position(v_server, v_b) then
    raise exception 'Fixture invalida: B precisa ter cargo igual ou superior a A';
  end if;

  -- Nao pode se atribuir cargo por RPC nem por UPDATE direto de members.role_id.
  begin
    perform public.assign_server_member_role(v_server, v_a, v_member_role, true);
    raise exception using errcode = 'ZX001', message = 'autoatribuicao foi aceita';
  exception
    when sqlstate '42501' then null;
    when sqlstate 'ZX001' then raise exception 'Hierarquia: autoatribuicao de cargo foi aceita';
  end;
  begin
    update public.members set role_id = v_member_role where server_id = v_server and user_id = v_a;
    if found then raise exception using errcode = 'ZX001', message = 'UPDATE role_id foi aceito'; end if;
  exception
    when insufficient_privilege then null;
    when sqlstate 'ZX001' then raise exception 'RLS: UPDATE direto de role_id foi aceito';
  end;
end;
$$;

rollback;
