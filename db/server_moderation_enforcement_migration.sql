-- Enforce kick, ban, timeout and voice moderation on the database and call layer.
-- Execute in Supabase SQL Editor after project_integrity_upgrade.sql,
-- server_member_actions_audit.sql, server_banner_invite.sql,
-- social_invites_migration.sql, chat_composer_features_migration.sql and
-- chat_images_and_soundboard_migration.sql.

begin;

alter table public.members
  add column if not exists is_banned boolean not null default false,
  add column if not exists communication_disabled_until timestamptz;

create table if not exists public.guild_timeouts (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  executor_id uuid references public.profiles(id) on delete set null,
  until_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (server_id, user_id)
);
alter table public.guild_timeouts enable row level security;
grant select on public.guild_timeouts to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.guild_timeouts from anon, authenticated;
drop policy if exists guild_timeouts_select_self on public.guild_timeouts;
create policy guild_timeouts_select_self on public.guild_timeouts for select to authenticated
  using (user_id = auth.uid());

create or replace function public.sekai_is_member_timed_out(p_server_id uuid, p_user_id uuid)
returns boolean language sql security definer stable set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.guild_timeouts t
    where t.server_id = p_server_id and t.user_id = p_user_id and t.until_at > now()
  ) or exists (
    select 1 from public.members m
    where m.server_id = p_server_id and m.user_id = p_user_id
      and m.communication_disabled_until > now()
  );
$$;
revoke all on function public.sekai_is_member_timed_out(uuid, uuid) from public;

create or replace function public.sekai_current_user_timed_out(p_server_id text)
returns boolean language sql security definer stable set search_path = public, pg_temp as $$
  select case
    when auth.uid() is null or p_server_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
    else public.sekai_is_member_timed_out(p_server_id::uuid, auth.uid())
  end;
$$;
revoke all on function public.sekai_current_user_timed_out(text) from public;
grant execute on function public.sekai_current_user_timed_out(text) to authenticated;

create or replace function public.sekai_user_is_server_banned(p_server_id uuid, p_user_id uuid)
returns boolean language sql security definer stable set search_path = public, pg_temp as $$
  select p_user_id = auth.uid() and (
    exists (select 1 from public.guild_bans b where b.server_id = p_server_id and b.user_id = p_user_id)
    or exists (select 1 from public.members m where m.server_id = p_server_id and m.user_id = p_user_id and m.is_banned)
  );
$$;
revoke all on function public.sekai_user_is_server_banned(uuid, uuid) from public;
grant execute on function public.sekai_user_is_server_banned(uuid, uuid) to authenticated;

create or replace function public.has_permission(p_server_id uuid, p_permission text)
returns boolean language sql security definer stable set search_path = public, pg_temp as $$
  select not public.sekai_is_member_timed_out(p_server_id, auth.uid()) and (
    public.is_server_owner(p_server_id) or exists (
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
               when 'embed_links' then 16384::bigint when 'attach_files' then 32768::bigint
               when 'read_message_history' then 65536::bigint when 'mention_everyone' then 131072::bigint
               when 'use_external_emojis' then 262144::bigint when 'connect' then 1048576::bigint
               when 'connect_voice' then 1048576::bigint when 'speak' then 2097152::bigint
               when 'mute_members' then 4194304::bigint when 'deafen_members' then 8388608::bigint
               when 'move_members' then 16777216::bigint when 'change_nickname' then 67108864::bigint
               when 'manage_nicknames' then 134217728::bigint when 'manage_roles' then 268435456::bigint
               when 'moderate_members' then 1099511627776::bigint else 0::bigint end) <> 0)
    )
  );
$$;
revoke all on function public.has_permission(uuid, text) from public;
grant execute on function public.has_permission(uuid, text) to authenticated;

-- A timeout survives leaving and rejoining. Ban checks are not bypassable by direct member inserts.
drop policy if exists members_insert_self on public.members;
create policy members_insert_self on public.members for insert to authenticated
  with check (user_id = auth.uid() and not public.sekai_user_is_server_banned(server_id, auth.uid()));

drop policy if exists members_update_own_nickname on public.members;
create policy members_update_own_nickname on public.members for update to authenticated
  using (
    (user_id = auth.uid() and not public.sekai_current_user_timed_out(server_id::text))
    or public.has_permission(server_id, 'manage_roles')
    or public.has_permission(server_id, 'mute_members')
  )
  with check (
    (user_id = auth.uid() and not public.sekai_current_user_timed_out(server_id::text))
    or public.has_permission(server_id, 'manage_roles')
    or public.has_permission(server_id, 'mute_members')
  );

drop policy if exists members_delete_self_or_kick on public.members;
create policy members_delete_self_or_kick on public.members for delete to authenticated
  using (user_id = auth.uid());
revoke insert on public.guild_bans from anon, authenticated;

drop policy if exists messages_update_own on public.messages;
create policy messages_update_own on public.messages for update to authenticated
  using (
    not exists (select 1 from public.channels c where c.id = channel_id and public.sekai_current_user_timed_out(c.server_id::text))
    and (author_id = auth.uid() or public.has_permission((select server_id from public.channels where id = channel_id), 'manage_messages'))
  )
  with check (
    not exists (select 1 from public.channels c where c.id = channel_id and public.sekai_current_user_timed_out(c.server_id::text))
    and (author_id = auth.uid() or public.has_permission((select server_id from public.channels where id = channel_id), 'manage_messages'))
  );
drop policy if exists messages_delete_own_or_mod on public.messages;
create policy messages_delete_own_or_mod on public.messages for delete to authenticated
  using (
    not exists (select 1 from public.channels c where c.id = channel_id and public.sekai_current_user_timed_out(c.server_id::text))
    and (author_id = auth.uid() or public.has_permission((select server_id from public.channels where id = channel_id), 'manage_messages'))
  );

drop policy if exists reactions_insert_own on public.message_reactions;
create policy reactions_insert_own on public.message_reactions for insert to authenticated
  with check (
    user_id = auth.uid() and exists (
      select 1 from public.messages m join public.channels c on c.id = m.channel_id
      where m.id = message_id and public.is_server_member(c.server_id)
        and not public.sekai_current_user_timed_out(c.server_id::text)
    )
  );
drop policy if exists reactions_delete_own on public.message_reactions;
create policy reactions_delete_own on public.message_reactions for delete to authenticated
  using (
    user_id = auth.uid() and exists (
      select 1 from public.messages m join public.channels c on c.id = m.channel_id
      where m.id = message_id and not public.sekai_current_user_timed_out(c.server_id::text)
    )
  );

-- Invite creation and all server-management writes inherit the timed-out permission check.
drop policy if exists friend_server_invites_create_friend on public.friend_server_invites;
create policy friend_server_invites_create_friend on public.friend_server_invites for insert to authenticated
  with check (
    sender_id = auth.uid() and public.is_server_member(server_id)
    and not public.sekai_current_user_timed_out(server_id::text)
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.sender_id = auth.uid() and f.receiver_id = receiver_id)
          or (f.receiver_id = auth.uid() and f.sender_id = receiver_id))
    )
  );

-- Timeout disconnects the current session and remains enforceable after rejoin.
create or replace function public.set_server_member_timeout(p_server_id uuid, p_user_id uuid, p_until timestamptz default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner_id uuid;
  v_actor_position integer := 0;
  v_target_position integer := 0;
  v_target_name text;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if p_user_id = auth.uid() then raise exception 'Não é permitido alterar o próprio timeout'; end if;
  if not (public.has_permission(p_server_id, 'moderate_members') or public.has_permission(p_server_id, 'mute_members')) then
    raise exception 'Sem permissão para silenciar membros';
  end if;
  if p_until is not null and (p_until <= now() or p_until > now() + interval '28 days') then
    raise exception 'A duração do timeout deve ser de até 28 dias';
  end if;
  select owner_id into v_owner_id from public.servers where id = p_server_id;
  if v_owner_id is null then raise exception 'Servidor não encontrado'; end if;
  if p_user_id = v_owner_id then raise exception 'O dono do servidor não pode receber timeout'; end if;
  if not exists (select 1 from public.members where server_id = p_server_id and user_id = p_user_id)
     and (p_until is not null or not exists (
       select 1 from public.guild_timeouts where server_id = p_server_id and user_id = p_user_id
     )) then
    raise exception 'Membro não encontrado neste servidor';
  end if;
  if auth.uid() <> v_owner_id and exists (select 1 from public.members where server_id = p_server_id and user_id = p_user_id) then
    select coalesce(max(r.position), 0) into v_actor_position
      from public.members m left join public.member_roles mr on mr.server_id = m.server_id and mr.user_id = m.user_id
      join public.roles r on r.id = coalesce(mr.role_id, m.role_id)
      where m.server_id = p_server_id and m.user_id = auth.uid();
    select coalesce(max(r.position), 0) into v_target_position
      from public.members m left join public.member_roles mr on mr.server_id = m.server_id and mr.user_id = m.user_id
      join public.roles r on r.id = coalesce(mr.role_id, m.role_id)
      where m.server_id = p_server_id and m.user_id = p_user_id;
    if v_actor_position <= v_target_position then raise exception 'Não é possível moderar um membro com cargo igual ou superior'; end if;
  end if;

  if p_until is null then
    delete from public.guild_timeouts where server_id = p_server_id and user_id = p_user_id;
  else
    insert into public.guild_timeouts(server_id, user_id, executor_id, until_at)
      values (p_server_id, p_user_id, auth.uid(), p_until)
      on conflict (server_id, user_id) do update
        set executor_id = excluded.executor_id, until_at = excluded.until_at, created_at = now();
  end if;
  update public.members set communication_disabled_until = p_until, is_muted = false
    where server_id = p_server_id and user_id = p_user_id;
  select coalesce(nullif(display_name, ''), username, p_user_id::text)
    into v_target_name from public.profiles where id = p_user_id;
  insert into public.server_audit_logs(server_id, actor_id, action, target, details)
    values (p_server_id, auth.uid(), case when p_until is null then 'member.timeout.remove' else 'member.timeout' end,
      coalesce(v_target_name, p_user_id::text), jsonb_build_object('user_id', p_user_id, 'until', p_until));
end;
$$;
revoke all on function public.set_server_member_timeout(uuid, uuid, timestamptz) from public;
grant execute on function public.set_server_member_timeout(uuid, uuid, timestamptz) to authenticated;

create or replace function public.moderate_server_member(
  p_server_id uuid, p_user_id uuid, p_action text, p_reason text default null
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_target_name text;
  v_action text;
  v_owner_id uuid;
  v_actor_position integer := 0;
  v_target_position integer := 0;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if p_user_id = auth.uid() then raise exception 'Não é permitido moderar a própria conta'; end if;
  select owner_id into v_owner_id from public.servers where id = p_server_id;
  if v_owner_id is null then raise exception 'Servidor não encontrado'; end if;
  if p_user_id = v_owner_id then raise exception 'Não é permitido moderar o dono do servidor'; end if;
  if not exists (select 1 from public.members where server_id = p_server_id and user_id = p_user_id) then
    raise exception 'Membro não encontrado neste servidor';
  end if;
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
  if auth.uid() <> v_owner_id then
    select coalesce(max(r.position), 0) into v_actor_position
      from public.members m left join public.member_roles mr on mr.server_id = m.server_id and mr.user_id = m.user_id
      join public.roles r on r.id = coalesce(mr.role_id, m.role_id)
      where m.server_id = p_server_id and m.user_id = auth.uid();
    select coalesce(max(r.position), 0) into v_target_position
      from public.members m left join public.member_roles mr on mr.server_id = m.server_id and mr.user_id = m.user_id
      join public.roles r on r.id = coalesce(mr.role_id, m.role_id)
      where m.server_id = p_server_id and m.user_id = p_user_id;
    if v_actor_position <= v_target_position then raise exception 'Não é possível moderar um membro com cargo igual ou superior'; end if;
  end if;

  select coalesce(nullif(p.display_name, ''), p.username, p_user_id::text)
    into v_target_name from public.profiles p where p.id = p_user_id;
  v_target_name := coalesce(v_target_name, p_user_id::text);
  delete from public.member_roles where server_id = p_server_id and user_id = p_user_id;
  delete from public.members where server_id = p_server_id and user_id = p_user_id;
  insert into public.server_audit_logs (server_id, actor_id, action, target, details)
    values (p_server_id, auth.uid(), v_action, v_target_name,
      jsonb_build_object('user_id', p_user_id, 'reason', nullif(left(p_reason, 200), '')));
end;
$$;
revoke all on function public.moderate_server_member(uuid, uuid, text, text) from public;
grant execute on function public.moderate_server_member(uuid, uuid, text, text) to authenticated;

create or replace function public.authorize_server_voice_disconnect(p_server_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner_id uuid;
  v_actor_position integer := 0;
  v_target_position integer := 0;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if p_user_id = auth.uid() then raise exception 'Não é possível desconectar a própria conta por este menu'; end if;
  if not public.has_permission(p_server_id, 'move_members') then raise exception 'Sem permissão para mover membros'; end if;
  select owner_id into v_owner_id from public.servers where id = p_server_id;
  if v_owner_id is null then raise exception 'Servidor não encontrado'; end if;
  if not exists (select 1 from public.members where server_id = p_server_id and user_id = p_user_id) then
    raise exception 'Membro não encontrado neste servidor';
  end if;
  if p_user_id = v_owner_id then raise exception 'O dono do servidor não pode ser desconectado'; end if;
  if auth.uid() <> v_owner_id then
    select coalesce(max(r.position), 0) into v_actor_position
      from public.members m left join public.member_roles mr on mr.server_id = m.server_id and mr.user_id = m.user_id
      join public.roles r on r.id = coalesce(mr.role_id, m.role_id)
      where m.server_id = p_server_id and m.user_id = auth.uid();
    select coalesce(max(r.position), 0) into v_target_position
      from public.members m left join public.member_roles mr on mr.server_id = m.server_id and mr.user_id = m.user_id
      join public.roles r on r.id = coalesce(mr.role_id, m.role_id)
      where m.server_id = p_server_id and m.user_id = p_user_id;
    if v_actor_position <= v_target_position then raise exception 'Não é possível desconectar um membro com cargo igual ou superior'; end if;
  end if;
  return true;
end;
$$;
revoke all on function public.authorize_server_voice_disconnect(uuid, uuid) from public;
grant execute on function public.authorize_server_voice_disconnect(uuid, uuid) to authenticated;

-- Both invite preview and redemption reject an active ban. Timeout state follows the user across rejoin.
create or replace function public.preview_invite(p_code text)
returns jsonb language plpgsql security definer stable set search_path = public, pg_temp as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_server_id uuid;
  v_name text;
  v_icon text;
  v_banner text;
  v_created timestamptz;
  v_members bigint;
  v_online bigint;
begin
  if auth.uid() is null or v_code = '' or v_code !~ '^[A-Z0-9]{6,16}$' then return null; end if;
  select i.server_id into v_server_id from public.invites i
   where upper(btrim(i.code)) = v_code
     and (i.expires_at is null or i.expires_at > now())
     and (i.max_uses = 0 or i.uses < i.max_uses)
     and (i.max_age = 0 or i.created_at + make_interval(secs => i.max_age) > now())
   limit 1;
  if v_server_id is null then
    select s.id into v_server_id from public.servers s where upper(btrim(s.invite_code)) = v_code limit 1;
  end if;
  if v_server_id is null or public.sekai_user_is_server_banned(v_server_id, auth.uid()) then return null; end if;
  select s.name, s.icon_url, s.banner_url, s.created_at into v_name, v_icon, v_banner, v_created
    from public.servers s where s.id = v_server_id;
  if v_name is null then return null; end if;
  select count(*) into v_members from public.members m where m.server_id = v_server_id and not m.is_banned;
  select count(*) into v_online from public.members m join public.profiles p on p.id = m.user_id
    where m.server_id = v_server_id and not m.is_banned and p.status in ('online', 'idle', 'dnd');
  return jsonb_build_object('name', v_name, 'iconUrl', v_icon, 'bannerUrl', v_banner,
    'createdAt', v_created, 'online', v_online, 'members', v_members);
end;
$$;
revoke all on function public.preview_invite(text) from public;
grant execute on function public.preview_invite(text) to authenticated;

create or replace function public.redeem_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_invite public.invites%rowtype;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_server_id uuid;
  v_role_id uuid;
  v_new_invite boolean := false;
  v_timeout_until timestamptz;
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
  if public.sekai_user_is_server_banned(v_server_id, auth.uid()) then raise exception 'Você foi banido deste servidor'; end if;
  select id into v_role_id from public.roles where server_id = v_server_id and is_default limit 1;
  if v_role_id is null then raise exception 'Servidor sem cargo padrão'; end if;
  select until_at into v_timeout_until from public.guild_timeouts
    where server_id = v_server_id and user_id = auth.uid() and until_at > now();
  insert into public.members as existing_member(server_id, user_id, role_id, communication_disabled_until, is_banned)
    values (v_server_id, auth.uid(), v_role_id, v_timeout_until, false)
    on conflict (server_id, user_id) do update set
      role_id = coalesce(existing_member.role_id, excluded.role_id),
      communication_disabled_until = case
        when existing_member.communication_disabled_until > now() then existing_member.communication_disabled_until
        else excluded.communication_disabled_until end,
      is_banned = false;
  insert into public.member_roles(server_id, user_id, role_id) values (v_server_id, auth.uid(), v_role_id)
    on conflict do nothing;
  if v_new_invite then update public.invites set uses = uses + 1 where code = v_invite.code; end if;
  return v_server_id;
end;
$$;
revoke all on function public.redeem_invite(text) from public;
grant execute on function public.redeem_invite(text) to authenticated;

-- Topic/poll reads remain available, but every write path and message edit is blocked during timeout.
create or replace function public.cast_channel_poll_vote(p_poll_id uuid, p_option_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_channel_id uuid; v_server_id uuid;
begin
  select channel_id into v_channel_id from public.chat_polls where id = p_poll_id for update;
  select server_id into v_server_id from public.channels where id = v_channel_id;
  if v_channel_id is null or not public.sekai_chat_can_access_channel(v_channel_id) then
    raise exception 'Esta enquete não está disponível para você.' using errcode = '42501';
  end if;
  if public.sekai_current_user_timed_out(v_server_id::text) then
    raise exception 'Sua conta está em timeout neste servidor.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.chat_poll_options where id = p_option_id and poll_id = p_poll_id) then
    raise exception 'A opção escolhida não pertence a esta enquete.' using errcode = '22023';
  end if;
  insert into public.chat_poll_votes(poll_id, option_id, user_id)
    values (p_poll_id, p_option_id, auth.uid())
    on conflict (poll_id, user_id) do update set option_id = excluded.option_id, created_at = now();
  update public.chat_polls set votes_updated_at = now() where id = p_poll_id;
end;
$$;
revoke all on function public.cast_channel_poll_vote(uuid, uuid) from public;
grant execute on function public.cast_channel_poll_vote(uuid, uuid) to authenticated;

drop policy if exists chat_poll_votes_write_timeout on public.chat_poll_votes;
create policy chat_poll_votes_write_timeout on public.chat_poll_votes for all to authenticated
  using (user_id = auth.uid() and exists (
    select 1 from public.chat_polls p join public.channels c on c.id = p.channel_id
    where p.id = poll_id and not public.sekai_current_user_timed_out(c.server_id::text)
  ))
  with check (user_id = auth.uid() and exists (
    select 1 from public.chat_polls p join public.channels c on c.id = p.channel_id
    where p.id = poll_id and not public.sekai_current_user_timed_out(c.server_id::text)
  ));

-- The private soundboard and channel-file upload are server actions too.
create or replace function public.sekai_can_access_chat_image(p_name text, p_for_upload boolean)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when auth.uid() is null or array_length(string_to_array(p_name, '/'), 1) <> 4 then false
    when split_part(p_name, '/', 1) = 'channels' then
      (not p_for_upload or split_part(p_name, '/', 3) = auth.uid()::text)
      and exists (
        select 1 from public.channels c join public.members m on m.server_id = c.server_id
        where c.id::text = split_part(p_name, '/', 2) and m.user_id = auth.uid()
          and (not p_for_upload or not public.sekai_is_member_timed_out(c.server_id, auth.uid()))
      )
    when split_part(p_name, '/', 1) = 'dm' then
      ((p_for_upload and split_part(p_name, '/', 3) = auth.uid()::text)
       or (not p_for_upload and auth.uid()::text in (split_part(p_name, '/', 2), split_part(p_name, '/', 3))))
      and exists (
        select 1 from public.profiles recipient
        join public.profiles sender on sender.id::text = split_part(p_name, '/', 3)
        where recipient.id::text = split_part(p_name, '/', 2) and recipient.id <> sender.id
          and (exists (select 1 from public.friendships f where f.status = 'accepted'
            and ((f.sender_id = recipient.id and f.receiver_id = sender.id) or (f.receiver_id = recipient.id and f.sender_id = sender.id)))
            or exists (select 1 from public.members a join public.members b using (server_id)
              where a.user_id = recipient.id and b.user_id = sender.id))
      )
    else false
  end;
$$;
revoke all on function public.sekai_can_access_chat_image(text, boolean) from public;
grant execute on function public.sekai_can_access_chat_image(text, boolean) to authenticated;

drop policy if exists sekai_soundboard_members_receive on realtime.messages;
create policy sekai_soundboard_members_receive on realtime.messages for select to authenticated
using (
  extension = 'broadcast' and realtime.topic() like 'sekai-soundboard:%'
  and public.sekai_is_server_member(split_part(realtime.topic(), ':', 2))
  and not public.sekai_current_user_timed_out(split_part(realtime.topic(), ':', 2))
);
drop policy if exists sekai_soundboard_members_send on realtime.messages;
create policy sekai_soundboard_members_send on realtime.messages for insert to authenticated
with check (
  extension = 'broadcast' and realtime.topic() like 'sekai-soundboard:%'
  and public.sekai_is_server_member(split_part(realtime.topic(), ':', 2))
  and not public.sekai_current_user_timed_out(split_part(realtime.topic(), ':', 2))
);

commit;
