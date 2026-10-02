-- Sekai: alinhamento do banco com a aplicação atual.
-- Execute no Supabase SQL Editor depois de sekai_schema.sql e social_invites_migration.sql.
-- Seguro para repetir: objetos/tabelas/colunas usam IF NOT EXISTS e policies são recriadas.

create extension if not exists pgcrypto;

-- Cargos: a aplicação usa máscara bigint para permissões e uma tabela de junção.
create table if not exists public.member_roles (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (server_id, user_id, role_id)
);
alter table public.members add column if not exists role_id uuid references public.roles(id) on delete set null;
insert into public.member_roles (server_id, user_id, role_id)
select server_id, user_id, role_id from public.members where role_id is not null
on conflict do nothing;
insert into public.member_roles (server_id, user_id, role_id)
select m.server_id, m.user_id, r.id
from public.members m join public.roles r on r.server_id = m.server_id and r.is_default = true
on conflict do nothing;

-- Converte as permissões JSON do schema antigo para o bitmask usado pelo app.
do $$
declare v_type text;
begin
  select data_type into v_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'roles' and column_name = 'permissions';
  if v_type = 'jsonb' then
    execute 'alter table public.roles alter column permissions drop default';
    execute $sql$
      alter table public.roles alter column permissions type bigint using (
        (case when coalesce((permissions->>'create_instant_invite')::boolean, false) then 1 else 0 end) |
        (case when coalesce((permissions->>'kick_members')::boolean, false) then 2 else 0 end) |
        (case when coalesce((permissions->>'ban_members')::boolean, false) then 4 else 0 end) |
        (case when coalesce((permissions->>'administrator')::boolean, false) then 8 else 0 end) |
        (case when coalesce((permissions->>'manage_channels')::boolean, false) then 16 else 0 end) |
        (case when coalesce((permissions->>'manage_guild')::boolean, false) then 32 else 0 end) |
        (case when coalesce((permissions->>'add_reactions')::boolean, false) then 64 else 0 end) |
        (case when coalesce((permissions->>'view_audit_log')::boolean, false) then 128 else 0 end) |
        (case when coalesce((permissions->>'view_channel')::boolean, false) then 1024 else 0 end) |
        (case when coalesce((permissions->>'send_messages')::boolean, false) then 2048 else 0 end) |
        (case when coalesce((permissions->>'manage_messages')::boolean, false) then 8192 else 0 end) |
        (case when coalesce((permissions->>'embed_links')::boolean, false) then 16384 else 0 end) |
        (case when coalesce((permissions->>'attach_files')::boolean, false) then 32768 else 0 end) |
        (case when coalesce((permissions->>'read_message_history')::boolean, false) then 65536 else 0 end) |
        (case when coalesce((permissions->>'mention_everyone')::boolean, false) then 131072 else 0 end) |
        (case when coalesce((permissions->>'use_external_emojis')::boolean, false) then 262144 else 0 end) |
        (case when coalesce((permissions->>'connect')::boolean, false) or coalesce((permissions->>'connect_voice')::boolean, false) then 1048576 else 0 end) |
        (case when coalesce((permissions->>'speak')::boolean, false) then 2097152 else 0 end) |
        (case when coalesce((permissions->>'mute_members')::boolean, false) then 4194304 else 0 end) |
        (case when coalesce((permissions->>'deafen_members')::boolean, false) then 8388608 else 0 end) |
        (case when coalesce((permissions->>'move_members')::boolean, false) then 16777216 else 0 end) |
        (case when coalesce((permissions->>'change_nickname')::boolean, false) then 67108864 else 0 end) |
        (case when coalesce((permissions->>'manage_nicknames')::boolean, false) then 134217728 else 0 end) |
        (case when coalesce((permissions->>'manage_roles')::boolean, false) then 268435456 else 0 end) |
        (case when coalesce((permissions->>'moderate_members')::boolean, false) then 1099511627776 else 0 end)
      );
    $sql$;
    execute 'alter table public.roles alter column permissions set default 0';
  end if;
end $$;
alter table public.roles alter column permissions set default 0;

alter table public.members enable row level security;
alter table public.member_roles enable row level security;
grant select, insert, delete on public.member_roles to authenticated;
drop policy if exists member_roles_select_member on public.member_roles;
create policy member_roles_select_member on public.member_roles for select to authenticated
  using (public.is_server_member(server_id));
drop policy if exists member_roles_assign_manage_roles on public.member_roles;
create policy member_roles_assign_manage_roles on public.member_roles for insert to authenticated
  with check (public.has_permission(server_id, 'manage_roles'));
drop policy if exists member_roles_remove_manage_roles on public.member_roles;
create policy member_roles_remove_manage_roles on public.member_roles for delete to authenticated
  using (public.has_permission(server_id, 'manage_roles'));

-- Categorias e relação de canais: migra os nomes antigos sem descartar dados.
create table if not exists public.channel_categories (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (server_id, name)
);
alter table public.channels add column if not exists category_id uuid references public.channel_categories(id) on delete set null;
-- Bancos antigos podem ter a categoria em channels.category (texto) ou somente
-- channels.category_id (UUID). Detecta o formato para a migração servir aos dois.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channels' and column_name = 'category'
  ) then
    execute $sql$
      insert into public.channel_categories (server_id, name, position)
      select distinct c.server_id, coalesce(nullif(c.category, ''), 'GERAL'), 0
      from public.channels c
      where c.server_id is not null
      on conflict (server_id, name) do nothing
    $sql$;
    execute $sql$
      update public.channels c set category_id = cc.id
      from public.channel_categories cc
      where c.category_id is null and cc.server_id = c.server_id
        and cc.name = coalesce(nullif(c.category, ''), 'GERAL')
    $sql$;
  else
    insert into public.channel_categories (server_id, name, position)
    select distinct c.server_id, 'GERAL', 0
    from public.channels c
    where c.server_id is not null
    on conflict (server_id, name) do nothing;
    update public.channels c set category_id = cc.id
    from public.channel_categories cc
    where cc.server_id = c.server_id and cc.name = 'GERAL'
      and (c.category_id is null or not exists (
        select 1 from public.channel_categories existing
        where existing.id = c.category_id and existing.server_id = c.server_id
      ));
  end if;
end $$;
alter table public.channel_categories enable row level security;
grant select, insert, update, delete on public.channel_categories to authenticated;
drop policy if exists channel_categories_select_member on public.channel_categories;
create policy channel_categories_select_member on public.channel_categories for select to authenticated
  using (public.is_server_member(server_id));
drop policy if exists channel_categories_manage on public.channel_categories;
create policy channel_categories_manage on public.channel_categories for all to authenticated
  using (public.has_permission(server_id, 'manage_channels'))
  with check (public.has_permission(server_id, 'manage_channels'));

create or replace function public.create_default_channels()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_text_category uuid; v_voice_category uuid;
begin
  insert into public.channel_categories (server_id, name, position)
    values (new.id, 'CANAIS DE TEXTO', 0) returning id into v_text_category;
  insert into public.channel_categories (server_id, name, position)
    values (new.id, 'CANAIS DE VOZ', 1) returning id into v_voice_category;
  insert into public.channels (server_id, name, type, category_id, position)
    values (new.id, 'geral', 'text', v_text_category, 0),
           (new.id, 'Sala de Voz', 'voice', v_voice_category, 0);
  return new;
end;
$$;

-- Cast universal de permissão compatível com o bitmask do frontend.
create or replace function public.has_permission(p_server_id uuid, p_permission text)
returns boolean language sql security definer stable set search_path = public, pg_temp as $$
  select public.is_server_owner(p_server_id) or exists (
    select 1
    from public.members m
    left join public.member_roles mr on mr.server_id = m.server_id and mr.user_id = m.user_id
    join public.roles r on r.id = coalesce(mr.role_id, m.role_id)
    where m.server_id = p_server_id and m.user_id = auth.uid()
      and ((coalesce(r.permissions, 0)::bigint & 8::bigint) <> 0 or
           (coalesce(r.permissions, 0)::bigint & case lower(p_permission)
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
  );
$$;
revoke all on function public.has_permission(uuid, text) from public;
grant execute on function public.has_permission(uuid, text) to authenticated;

-- Mute temporário e banimentos precisam existir também no banco, não só na UI.
alter table public.members add column if not exists communication_disabled_until timestamptz;
revoke update on public.members from authenticated;
grant update (nickname) on public.members to authenticated;
create table if not exists public.guild_bans (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  executor_id uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (server_id, user_id)
);
alter table public.guild_bans enable row level security;
grant select, insert, delete on public.guild_bans to authenticated;
drop policy if exists guild_bans_select_mods on public.guild_bans;
create policy guild_bans_select_mods on public.guild_bans for select to authenticated
  using (public.has_permission(server_id, 'ban_members'));
drop policy if exists guild_bans_insert_mods on public.guild_bans;
create policy guild_bans_insert_mods on public.guild_bans for insert to authenticated
  with check (executor_id = auth.uid() and user_id <> auth.uid() and public.has_permission(server_id, 'ban_members'));
drop policy if exists guild_bans_delete_mods on public.guild_bans;
create policy guild_bans_delete_mods on public.guild_bans for delete to authenticated
  using (public.has_permission(server_id, 'ban_members'));

create or replace function public.moderate_server_member(
  p_server_id uuid, p_user_id uuid, p_action text, p_reason text default null
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if p_user_id = auth.uid() or exists (select 1 from public.servers s where s.id = p_server_id and s.owner_id = p_user_id) then
    raise exception 'Não é permitido moderar o dono do servidor ou a própria conta';
  end if;
  if p_action = 'kick' then
    if not public.has_permission(p_server_id, 'kick_members') then raise exception 'Sem permissão para expulsar'; end if;
  elsif p_action = 'ban' then
    if not public.has_permission(p_server_id, 'ban_members') then raise exception 'Sem permissão para banir'; end if;
    insert into public.guild_bans (server_id, user_id, executor_id, reason)
    values (p_server_id, p_user_id, auth.uid(), left(p_reason, 200))
    on conflict (server_id, user_id) do update
      set executor_id = excluded.executor_id, reason = excluded.reason, created_at = now();
  else
    raise exception 'Ação de moderação inválida';
  end if;
  delete from public.member_roles where server_id = p_server_id and user_id = p_user_id;
  delete from public.members where server_id = p_server_id and user_id = p_user_id;
end;
$$;
revoke all on function public.moderate_server_member(uuid, uuid, text, text) from public;
grant execute on function public.moderate_server_member(uuid, uuid, text, text) to authenticated;

create or replace function public.set_server_member_timeout(p_server_id uuid, p_user_id uuid, p_until timestamptz default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if p_user_id = auth.uid() then raise exception 'Não é permitido alterar o próprio timeout'; end if;
  if not (public.has_permission(p_server_id, 'moderate_members') or public.has_permission(p_server_id, 'mute_members')) then
    raise exception 'Sem permissão para silenciar membros';
  end if;
  if p_until is not null and (p_until <= now() or p_until > now() + interval '28 days') then
    raise exception 'A duração do timeout deve ser de até 28 dias';
  end if;
  update public.members set communication_disabled_until = p_until, is_muted = false
  where server_id = p_server_id and user_id = p_user_id;
  if not found then raise exception 'Membro não encontrado neste servidor'; end if;
end;
$$;
revoke all on function public.set_server_member_timeout(uuid, uuid, timestamptz) from public;
grant execute on function public.set_server_member_timeout(uuid, uuid, timestamptz) to authenticated;

-- Atualiza o trigger padrão para usar as permissões bigint e a junção de cargos.
create or replace function public.create_default_role()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_default_role_id uuid;
begin
  insert into public.roles (server_id, name, is_default, position, permissions)
  values (new.id, '@everyone', true, 0, 3147776)
  returning id into v_default_role_id;
  insert into public.members (server_id, user_id, role_id) values (new.id, new.owner_id, v_default_role_id);
  insert into public.member_roles (server_id, user_id, role_id) values (new.id, new.owner_id, v_default_role_id);
  return new;
end;
$$;

drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own on public.messages for insert to authenticated with check (
  author_id = auth.uid()
  and public.has_permission((select server_id from public.channels where id = channel_id), 'send_messages')
  and not exists (select 1 from public.members m
    where m.server_id = (select server_id from public.channels where id = channel_id)
      and m.user_id = auth.uid()
      and (m.is_muted = true or m.communication_disabled_until > now()))
);

-- Moderadores podem aplicar timeout, que expira sem deixar o membro preso em mute.
drop policy if exists members_update_own_nickname on public.members;
create policy members_update_own_nickname on public.members for update to authenticated
  using (user_id = auth.uid() or public.has_permission(server_id, 'manage_roles'))
  with check (user_id = auth.uid() or public.has_permission(server_id, 'manage_roles'));

-- Convites nunca devem permitir que um usuário banido entre novamente.
create or replace function public.redeem_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_invite public.invites%rowtype;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_server_id uuid;
  v_role_id uuid;
  v_new_invite boolean := false;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if v_code = '' then raise exception 'Convite inválido'; end if;
  select * into v_invite from public.invites where upper(btrim(code)) = v_code for update;
  if found then
    v_new_invite := true;
    if v_invite.expires_at is not null and v_invite.expires_at <= now() then raise exception 'Convite expirado'; end if;
    if v_invite.max_age > 0 and v_invite.created_at + make_interval(secs => v_invite.max_age) <= now() then raise exception 'Convite expirado'; end if;
    if v_invite.max_uses > 0 and v_invite.uses >= v_invite.max_uses then raise exception 'Convite esgotado'; end if;
    v_server_id := v_invite.server_id;
  else
    select s.id into v_server_id from public.servers s where upper(btrim(s.invite_code)) = v_code limit 1;
    if v_server_id is null then raise exception 'Convite inválido'; end if;
  end if;
  if exists (select 1 from public.guild_bans b where b.server_id = v_server_id and b.user_id = auth.uid()) then
    raise exception 'Você foi banido deste servidor';
  end if;
  select id into v_role_id from public.roles where server_id = v_server_id and is_default limit 1;
  if v_role_id is null then raise exception 'Servidor sem cargo padrão'; end if;
  insert into public.members as existing_member (server_id, user_id, role_id)
    values (v_server_id, auth.uid(), v_role_id)
    on conflict (server_id, user_id) do update set role_id = coalesce(existing_member.role_id, excluded.role_id);
  insert into public.member_roles (server_id, user_id, role_id) values (v_server_id, auth.uid(), v_role_id)
    on conflict do nothing;
  if v_new_invite then update public.invites set uses = uses + 1 where code = v_invite.code; end if;
  return v_server_id;
end;
$$;
revoke all on function public.redeem_invite(text) from public;
grant execute on function public.redeem_invite(text) to authenticated;

-- Storage privado para anexos do chat; URLs assinadas são geradas após a policy liberar leitura.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];
drop policy if exists sekai_chat_images_read on storage.objects;
create policy sekai_chat_images_read on storage.objects for select to authenticated using (
  bucket_id = 'chat-images' and (
    ((storage.foldername(name))[1] = 'channels' and exists (
      select 1 from public.channels c join public.members m on m.server_id = c.server_id
      where c.id::text = (storage.foldername(name))[2] and m.user_id = auth.uid()
    )) or
    ((storage.foldername(name))[1] = 'dm' and auth.uid()::text in ((storage.foldername(name))[2], (storage.foldername(name))[3]) and (
      exists (select 1 from public.friendships f where f.status = 'accepted' and
        ((f.sender_id::text = (storage.foldername(name))[2] and f.receiver_id::text = (storage.foldername(name))[3]) or
         (f.receiver_id::text = (storage.foldername(name))[2] and f.sender_id::text = (storage.foldername(name))[3]))) or
      exists (select 1 from public.members a join public.members b using (server_id)
        where a.user_id::text = (storage.foldername(name))[2] and b.user_id::text = (storage.foldername(name))[3])
    ))
  )
);
drop policy if exists sekai_chat_images_upload on storage.objects;
create policy sekai_chat_images_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'chat-images' and (storage.foldername(name))[3] = auth.uid()::text and (
    ((storage.foldername(name))[1] = 'channels' and exists (
      select 1 from public.channels c join public.members m on m.server_id = c.server_id
      where c.id::text = (storage.foldername(name))[2] and m.user_id = auth.uid()
    )) or
    ((storage.foldername(name))[1] = 'dm' and exists (
      select 1 from public.profiles other_profile where other_profile.id::text = (storage.foldername(name))[2]
        and ((exists (select 1 from public.friendships f where f.status = 'accepted' and
          ((f.sender_id = auth.uid() and f.receiver_id = other_profile.id) or (f.receiver_id = auth.uid() and f.sender_id = other_profile.id)))
          or exists (select 1 from public.members a join public.members b using (server_id)
            where a.user_id = auth.uid() and b.user_id = other_profile.id)))
    ))
  )
);

-- O cliente precisa do registro completo para remover uma reação em tempo real.
alter table public.message_reactions replica identity full;
