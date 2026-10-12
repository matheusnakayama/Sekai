-- PENDENTE DE APROVAÇÃO DO DONO. NÃO APLICAR EM PRODUÇÃO.
-- Esta migration altera funções SECURITY DEFINER, a verificação de admins e o trigger de auth.users.
-- Veja docs/PENDENCIAS.md antes de qualquer aplicação.

begin;
set local search_path = pg_catalog, public;

-- Lista controlada pelo dono. Nenhum usuário pode ler nem modificar esta tabela via API.
create table if not exists public.sekai_platform_admin_allowlist (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.sekai_security_settings (
  singleton boolean primary key default true check (singleton),
  require_admin_mfa boolean not null default true
);

insert into public.sekai_security_settings (singleton, require_admin_mfa)
values (true, true)
on conflict (singleton) do nothing;

alter table public.sekai_platform_admin_allowlist enable row level security;
alter table public.sekai_security_settings enable row level security;
revoke all on table public.sekai_platform_admin_allowlist from public, anon, authenticated;
revoke all on table public.sekai_security_settings from public, anon, authenticated;

-- A lista começa vazia de propósito: o dono deve conferir e inserir os UUIDs dos admins atuais.
-- Sem essa etapa, a função abaixo negará privilégios administrativos a todos.
create or replace function public.is_sekai_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.sekai_platform_admin_allowlist a
      where a.user_id = auth.uid()
    )
    and (
      not coalesce((
        select s.require_admin_mfa
        from public.sekai_security_settings s
        where s.singleton = true
      ), true)
      or auth.jwt() ->> 'aal' = 'aal2'
    );
$$;
alter function public.is_sekai_admin() owner to postgres;
revoke all on function public.is_sekai_admin() from public, anon;
grant execute on function public.is_sekai_admin() to authenticated, service_role;

-- Cria um perfil seguro e idempotente sem confiar em metadados de privilégio enviados pelo cliente.
create or replace function public.sekai_create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raw_metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_base_username text;
  v_username text;
  v_display_name text;
  v_suffix text := substr(replace(new.id::text, '-', ''), 1, 10);
  v_attempt integer;
begin
  v_base_username := lower(regexp_replace(
    coalesce(
      nullif(left(v_raw_metadata ->> 'username', 64), ''),
      nullif(left(split_part(coalesce(new.email, ''), '@', 1), 64), ''),
      'user'
    ),
    '[^a-z0-9_.-]', '_', 'g'
  ));
  v_base_username := trim(both '._-' from v_base_username);
  if char_length(v_base_username) < 2 then v_base_username := 'user'; end if;
  v_base_username := left(v_base_username, 32);
  v_display_name := coalesce(nullif(btrim(left(v_raw_metadata ->> 'display_name', 50)), ''), left(v_base_username, 50));

  for v_attempt in 0..7 loop
    v_username := case
      when v_attempt = 0 then v_base_username
      else left(v_base_username, 18) || '_' || v_suffix || '_' || v_attempt::text
    end;
    insert into public.profiles (id, username, display_name)
    values (new.id, v_username, v_display_name)
    on conflict do nothing;
    if exists (select 1 from public.profiles p where p.id = new.id) then return new; end if;
  end loop;

  -- Fallback determinístico de 32 caracteres para colisões extremas de nomes.
  v_username := 'u_' || left(replace(new.id::text, '-', ''), 30);
  insert into public.profiles (id, username, display_name)
  values (new.id, v_username, v_display_name)
  on conflict do nothing;
  if not exists (select 1 from public.profiles p where p.id = new.id) then
    raise exception 'Não foi possível criar o perfil inicial';
  end if;
  return new;
end;
$$;
alter function public.sekai_create_profile_for_auth_user() owner to postgres;
revoke all on function public.sekai_create_profile_for_auth_user() from public, anon, authenticated;

drop trigger if exists sekai_on_auth_user_created_profile on auth.users;
create trigger sekai_on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.sekai_create_profile_for_auth_user();

-- Torna o search_path explícito em todas as funções SECURITY DEFINER de public.
-- O comando usa apenas identidades OID convertidas a regprocedure pelo catálogo; não usa dados de requisição.
do $$
declare
  v_function record;
begin
  for v_function in
    select p.oid::regprocedure as signature
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute pg_catalog.format(
      'alter function %s set search_path = pg_catalog, public, pg_temp',
      v_function.signature
    );
  end loop;
end;
$$;

-- Substitui o uso de object_identity como SQL. Identificadores vêm de pg_class e são citados com %I.
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_command record;
  v_schema text;
  v_table text;
begin
  for v_command in
    select *
    from pg_catalog.pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    select n.nspname, c.relname
      into v_schema, v_table
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where c.oid = v_command.objid
       and c.relkind in ('r', 'p');

    if v_schema = 'public' and v_table is not null then
      begin
        execute pg_catalog.format('alter table %I.%I enable row level security', v_schema, v_table);
        raise log 'rls_auto_enable: enabled RLS on %.%', v_schema, v_table;
      exception when others then
        raise log 'rls_auto_enable: failed to enable RLS on %.%', v_schema, v_table;
      end;
    end if;
  end loop;
end;
$$;
alter function public.rls_auto_enable() owner to postgres;

commit;
