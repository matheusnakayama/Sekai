-- Execute SOMENTE em staging depois de revisar/aplicar manualmente as migrations pendentes.
-- Substitua USER_A_UUID e USER_B_UUID. Rode como database owner; tudo termina em ROLLBACK.
-- A insercao direta em storage.objects verifica RLS/policy, nao transfere arquivo nem
-- substitui testes HTTP reais pelo endpoint Storage (incluindo validacao de MIME real).

begin;
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  if exists (select 1 from storage.objects where bucket_id = 'chat-images') then
    raise exception 'Storage anon: metadados do bucket privado chat-images foram expostos';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true); -- USER_A_UUID

do $$
declare
  v_b uuid := '00000000-0000-0000-0000-00000000000b'; -- USER_B_UUID
begin
  -- Escrita sob a pasta de outro usuario deve ser negada mesmo com JWT autenticado.
  begin
    insert into storage.objects(bucket_id, name, metadata)
    values ('avatars', v_b::text || '/rls-cross-user.png', '{"mimetype":"image/png"}'::jsonb);
    raise exception using errcode = 'ZX001', message = 'upload cruzado foi aceito';
  exception
    when insufficient_privilege then null;
    when sqlstate 'ZX001' then raise exception 'Storage RLS: upload na pasta B foi aceito';
  end;

  -- A pasta propria nao libera SVG/HTML nem metadata MIME fora da allowlist.
  begin
    insert into storage.objects(bucket_id, name, metadata)
    values ('avatars', auth.uid()::text || '/rls-test.svg', '{"mimetype":"image/svg+xml"}'::jsonb);
    raise exception using errcode = 'ZX001', message = 'SVG foi aceito';
  exception
    when insufficient_privilege or check_violation then null;
    when sqlstate 'ZX001' then raise exception 'Storage RLS: SVG foi aceito';
  end;
end;
$$;

rollback;
