


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."accept_friend_server_invite"("p_invite_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_friend_invite public.friend_server_invites%rowtype;
  v_server_id uuid;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  select * into v_friend_invite from public.friend_server_invites
   where id = p_invite_id and receiver_id = auth.uid() and status = 'pending'
   for update;
  if not found then raise exception 'Convite não encontrado ou já usado'; end if;
  v_server_id := public.redeem_invite(v_friend_invite.invite_code);
  update public.friend_server_invites set status = 'accepted' where id = v_friend_invite.id;
  return v_server_id;
end;
$$;


ALTER FUNCTION "public"."accept_friend_server_invite"("p_invite_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_server_member_role"("p_server_id" "uuid", "p_user_id" "uuid", "p_role_id" "uuid", "p_assign" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_role_name text;
  v_target_name text;
  v_changed integer;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if p_user_id = auth.uid()
     and not public.is_server_owner(p_server_id)
     and not public.is_sekai_admin() then
    raise exception 'Somente o dono do servidor ou um CEO pode alterar os próprios cargos';
  end if;
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


ALTER FUNCTION "public"."assign_server_member_role"("p_server_id" "uuid", "p_user_id" "uuid", "p_role_id" "uuid", "p_assign" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cast_channel_poll_vote"("p_poll_id" "uuid", "p_option_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_channel_id uuid;
begin
  select channel_id into v_channel_id from public.chat_polls where id = p_poll_id for update;
  if v_channel_id is null or not public.sekai_chat_can_access_channel(v_channel_id) then
    raise exception 'Esta enquete não está disponível para você.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.chat_poll_options where id = p_option_id and poll_id = p_poll_id) then
    raise exception 'A opção escolhida não pertence a esta enquete.' using errcode = '22023';
  end if;
  insert into public.chat_poll_votes(poll_id, option_id, user_id)
  values (p_poll_id, p_option_id, auth.uid())
  on conflict (poll_id, user_id) do update
    set option_id = excluded.option_id, created_at = now();
  update public.chat_polls set votes_updated_at = now() where id = p_poll_id;
end;
$$;


ALTER FUNCTION "public"."cast_channel_poll_vote"("p_poll_id" "uuid", "p_option_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."channel_effective_permissions"("p_channel_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS bigint
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
declare
  v_server_id uuid;
  v_base bigint;
  v_everyone_role_id uuid;
  v_allow bigint;
  v_deny bigint;
  v_role_allow bigint;
  v_role_deny bigint;
begin
  select server_id into v_server_id from public.channels where id = p_channel_id;
  v_base := public.member_base_permissions(v_server_id, p_user_id);

  if (v_base & public.perm('ADMINISTRATOR')) <> 0 then
    return (-1)::bigint;
  end if;

  select id into v_everyone_role_id from public.roles where server_id = v_server_id and is_default = true;

  select allow_permissions, deny_permissions into v_allow, v_deny
  from public.channel_permission_overwrites
  where channel_id = p_channel_id and target_type = 'role' and target_id = v_everyone_role_id;
  v_base := (v_base & ~coalesce(v_deny, 0::bigint)) | coalesce(v_allow, 0::bigint);

  select coalesce(bit_or(o.deny_permissions), 0::bigint), coalesce(bit_or(o.allow_permissions), 0::bigint)
  into v_role_deny, v_role_allow
  from public.member_roles mr
  join public.channel_permission_overwrites o
    on o.channel_id = p_channel_id and o.target_type = 'role' and o.target_id = mr.role_id
  where mr.server_id = v_server_id and mr.user_id = p_user_id and mr.role_id <> v_everyone_role_id;
  v_base := (v_base & ~v_role_deny) | v_role_allow;

  select allow_permissions, deny_permissions into v_allow, v_deny
  from public.channel_permission_overwrites
  where channel_id = p_channel_id and target_type = 'member' and target_id = p_user_id;
  v_base := (v_base & ~coalesce(v_deny, 0::bigint)) | coalesce(v_allow, 0::bigint);

  return v_base;
end;
$$;


ALTER FUNCTION "public"."channel_effective_permissions"("p_channel_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_channel_poll"("p_channel_id" "uuid", "p_question" "text", "p_options" "text"[]) RETURNS TABLE("poll_id" "uuid", "message_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_poll_id uuid;
  v_message_id uuid;
  v_options text[];
begin
  if length(trim(p_question)) not between 1 and 200 then
    raise exception 'A pergunta deve ter entre 1 e 200 caracteres.' using errcode = '22023';
  end if;
  if not public.sekai_chat_can_send_to_channel(p_channel_id, trim(p_question))
     or not public.sekai_chat_topic_slowmode_clear(p_channel_id) then
    raise exception 'Você não pode criar mensagens neste canal agora.' using errcode = '42501';
  end if;
  select array_agg(trim(option_text) order by option_position) into v_options
  from unnest(p_options) with ordinality as options(option_text, option_position)
  where length(trim(option_text)) > 0;
  if coalesce(array_length(v_options, 1), 0) not between 2 and 10 then
    raise exception 'A enquete precisa ter de 2 a 10 opções.' using errcode = '22023';
  end if;

  insert into public.chat_polls(channel_id, question, created_by)
  values (p_channel_id, trim(p_question), auth.uid())
  returning id into v_poll_id;

  insert into public.chat_poll_options(poll_id, label, position)
  select v_poll_id, option_text, position
  from unnest(v_options) with ordinality as options(option_text, position);

  insert into public.messages(channel_id, author_id, content, poll_id)
  values (p_channel_id, auth.uid(), trim(p_question), v_poll_id)
  returning id into v_message_id;

  return query select v_poll_id, v_message_id;
end;
$$;


ALTER FUNCTION "public"."create_channel_poll"("p_channel_id" "uuid", "p_question" "text", "p_options" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_channel_topic"("p_channel_id" "uuid", "p_title" "text", "p_content" "text" DEFAULT NULL::"text") RETURNS TABLE("topic_id" "uuid", "message_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_topic_id uuid;
  v_message_id uuid;
  v_initial_content text;
  v_moderation_content text;
begin
  if length(trim(p_title)) not between 1 and 100 then
    raise exception 'O título do tópico deve ter entre 1 e 100 caracteres.' using errcode = '22023';
  end if;
  if p_content is not null and length(trim(p_content)) > 4000 then
    raise exception 'A mensagem inicial deve ter até 4000 caracteres.' using errcode = '22023';
  end if;
  v_initial_content := nullif(trim(p_content), '');
  v_moderation_content := concat_ws(' ', trim(p_title), v_initial_content);
  if not public.sekai_chat_can_send_to_channel(p_channel_id, v_moderation_content)
     or not public.sekai_chat_topic_slowmode_clear(p_channel_id) then
    raise exception 'Você não pode enviar mensagens neste canal agora.' using errcode = '42501';
  end if;

  insert into public.chat_topics(channel_id, title, created_by)
  values (p_channel_id, trim(p_title), auth.uid())
  returning id into v_topic_id;

  insert into public.messages(channel_id, author_id, content, topic_id)
  values (p_channel_id, auth.uid(), trim(p_title), v_topic_id)
  returning id into v_message_id;

  if v_initial_content is not null then
    insert into public.chat_topic_messages(topic_id, author_id, content)
    values (v_topic_id, auth.uid(), v_initial_content);
  end if;

  return query select v_topic_id, v_message_id;
end;
$$;


ALTER FUNCTION "public"."create_channel_topic"("p_channel_id" "uuid", "p_title" "text", "p_content" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_default_channels"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."create_default_channels"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_default_role"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."create_default_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_default_server_data"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_role_id uuid;
  v_cat_texto uuid;
  v_cat_voz uuid;
  v_everyone_perms bigint;
begin
  v_everyone_perms :=
    public.perm('VIEW_CHANNEL') | public.perm('SEND_MESSAGES') | public.perm('READ_MESSAGE_HISTORY') |
    public.perm('ADD_REACTIONS') | public.perm('CONNECT') | public.perm('SPEAK') |
    public.perm('CHANGE_NICKNAME') | public.perm('USE_EXTERNAL_EMOJIS') | public.perm('EMBED_LINKS') |
    public.perm('ATTACH_FILES') | public.perm('CREATE_INSTANT_INVITE');

  insert into public.roles (server_id, name, is_default, position, permissions)
  values (new.id, '@everyone', true, 0, v_everyone_perms)
  returning id into v_role_id;

  insert into public.members (server_id, user_id) values (new.id, new.owner_id);
  insert into public.member_roles (server_id, user_id, role_id) values (new.id, new.owner_id, v_role_id);

  insert into public.channel_categories (server_id, name, position) values (new.id, 'CANAIS DE TEXTO', 0) returning id into v_cat_texto;
  insert into public.channel_categories (server_id, name, position) values (new.id, 'CANAIS DE VOZ', 1) returning id into v_cat_voz;

  insert into public.channels (server_id, category_id, name, type, position)
  values (new.id, v_cat_texto, 'geral', 'text', 0);
  insert into public.channels (server_id, category_id, name, type, position)
  values (new.id, v_cat_voz, 'Sala de Voz', 'voice', 0);

  return new;
end;
$$;


ALTER FUNCTION "public"."create_default_server_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_channel_poll_results"("p_poll_id" "uuid") RETURNS TABLE("option_id" "uuid", "vote_count" bigint, "voted_by_me" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select o.id,
         count(v.user_id),
         coalesce(bool_or(v.user_id = auth.uid()), false)
  from public.chat_polls p
  join public.chat_poll_options o on o.poll_id = p.id
  left join public.chat_poll_votes v on v.option_id = o.id and v.poll_id = p.id
  where p.id = p_poll_id and public.sekai_chat_can_access_channel(p.channel_id)
  group by o.id, o.position
  order by o.position;
$$;


ALTER FUNCTION "public"."get_channel_poll_results"("p_poll_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, username, display_name)
  values (new.id, split_part(new.email, '@', 1), split_part(new.email, '@', 1))
  on conflict (id) do nothing;

  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_channel_permission"("p_channel_id" "uuid", "p_bit" bigint, "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select (public.channel_effective_permissions(p_channel_id, p_user_id) & p_bit) <> 0;
$$;


ALTER FUNCTION "public"."has_channel_permission"("p_channel_id" "uuid", "p_bit" bigint, "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_permission"("p_server_id" "uuid", "p_permission" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.is_sekai_admin() or public.is_server_owner(p_server_id) or exists (
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


ALTER FUNCTION "public"."has_permission"("p_server_id" "uuid", "p_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_server_permission"("p_server_id" "uuid", "p_bit" bigint, "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select
    (public.member_base_permissions(p_server_id, p_user_id) & public.perm('ADMINISTRATOR')) <> 0
    or (public.member_base_permissions(p_server_id, p_user_id) & p_bit) <> 0;
$$;


ALTER FUNCTION "public"."has_server_permission"("p_server_id" "uuid", "p_bit" bigint, "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_badge_manager"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1 from public.badge_managers
    where user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_badge_manager"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_sekai_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
      and lower(u.email) in ('teo.titotto@gmail.com', 'matheushideo10@gmail.com')
  );
$$;


ALTER FUNCTION "public"."is_sekai_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_server_member"("p_server_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.is_sekai_admin() or exists (
    select 1 from public.members
    where server_id = p_server_id and user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_server_member"("p_server_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_server_member"("p_server_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select exists (select 1 from public.members where server_id = p_server_id and user_id = p_user_id);
$$;


ALTER FUNCTION "public"."is_server_member"("p_server_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_server_owner"("p_server_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select exists (select 1 from public.servers where id = p_server_id and owner_id = p_user_id);
$$;


ALTER FUNCTION "public"."is_server_owner"("p_server_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."member_base_permissions"("p_server_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS bigint
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select case
    when exists (select 1 from public.servers where id = p_server_id and owner_id = p_user_id) then (-1)::bigint
    else coalesce((
      select bit_or(r.permissions) from public.member_roles mr
      join public.roles r on r.id = mr.role_id
      where mr.server_id = p_server_id and mr.user_id = p_user_id
    ), 0::bigint)
  end;
$$;


ALTER FUNCTION "public"."member_base_permissions"("p_server_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."moderate_server_member"("p_server_id" "uuid", "p_user_id" "uuid", "p_action" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_target_name text;
  v_action text;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if p_user_id = auth.uid() then raise exception 'Não é permitido moderar a própria conta'; end if;
  if exists (select 1 from public.servers s where s.id = p_server_id and s.owner_id = p_user_id)
     and not public.is_sekai_admin() then
    raise exception 'Não é permitido moderar o dono do servidor';
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


ALTER FUNCTION "public"."moderate_server_member"("p_server_id" "uuid", "p_user_id" "uuid", "p_action" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."perm"("p_name" "text") RETURNS bigint
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case p_name
    when 'CREATE_INSTANT_INVITE' then 1::bigint
    when 'KICK_MEMBERS'          then 2::bigint
    when 'BAN_MEMBERS'           then 4::bigint
    when 'ADMINISTRATOR'         then 8::bigint
    when 'MANAGE_CHANNELS'       then 16::bigint
    when 'MANAGE_GUILD'          then 32::bigint
    when 'ADD_REACTIONS'         then 64::bigint
    when 'VIEW_AUDIT_LOG'        then 128::bigint
    when 'VIEW_CHANNEL'          then 1024::bigint
    when 'SEND_MESSAGES'         then 2048::bigint
    when 'MANAGE_MESSAGES'       then 8192::bigint
    when 'EMBED_LINKS'           then 16384::bigint
    when 'ATTACH_FILES'          then 32768::bigint
    when 'READ_MESSAGE_HISTORY'  then 65536::bigint
    when 'MENTION_EVERYONE'      then 131072::bigint
    when 'USE_EXTERNAL_EMOJIS'   then 262144::bigint
    when 'CONNECT'               then 1048576::bigint
    when 'SPEAK'                 then 2097152::bigint
    when 'MUTE_MEMBERS'          then 4194304::bigint
    when 'DEAFEN_MEMBERS'        then 8388608::bigint
    when 'MOVE_MEMBERS'          then 16777216::bigint
    when 'CHANGE_NICKNAME'       then 67108864::bigint
    when 'MANAGE_NICKNAMES'      then 134217728::bigint
    when 'MANAGE_ROLES'          then 268435456::bigint
    when 'MODERATE_MEMBERS'      then 1099511627776::bigint
    else 0::bigint
  end;
$$;


ALTER FUNCTION "public"."perm"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."preview_invite"("p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
  if auth.uid() is null then return null; end if;
  if v_code = '' or v_code !~ '^[A-Z0-9]{6,16}$' then return null; end if;

  select i.server_id into v_server_id
    from public.invites i
   where upper(btrim(i.code)) = v_code
     and (i.expires_at is null or i.expires_at > now())
     and (i.max_uses = 0 or i.uses < i.max_uses)
     and (i.max_age = 0 or i.created_at + make_interval(secs => i.max_age) > now())
   limit 1;

  if v_server_id is null then
    select s.id into v_server_id
      from public.servers s
     where upper(btrim(s.invite_code)) = v_code
     limit 1;
  end if;
  if v_server_id is null then return null; end if;

  select s.name, s.icon_url, s.banner_url, s.created_at
    into v_name, v_icon, v_banner, v_created
    from public.servers s
   where s.id = v_server_id;

  if v_name is null then return null; end if;

  select count(*) into v_members
    from public.members m
   where m.server_id = v_server_id
     and coalesce(m.is_banned, false) = false;

  select count(*) into v_online
    from public.members m
    join public.profiles p on p.id = m.user_id
   where m.server_id = v_server_id
     and coalesce(m.is_banned, false) = false
     and p.status in ('online', 'idle', 'dnd');

  return jsonb_build_object(
    'name', v_name,
    'iconUrl', v_icon,
    'bannerUrl', v_banner,
    'createdAt', v_created,
    'online', v_online,
    'members', v_members
  );
end;
$_$;


ALTER FUNCTION "public"."preview_invite"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_invite"("p_code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."redeem_invite"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sekai_can_access_chat_image"("p_name" "text", "p_for_upload" boolean) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case
    when auth.uid() is null or array_length(string_to_array(p_name, '/'), 1) <> 4 then false
    when split_part(p_name, '/', 1) = 'channels' then
      (not p_for_upload or split_part(p_name, '/', 3) = auth.uid()::text)
      and exists (
        select 1
        from public.channels c
        join public.members m on m.server_id = c.server_id
        where c.id::text = split_part(p_name, '/', 2)
          and m.user_id = auth.uid()
      )
    when split_part(p_name, '/', 1) = 'dm' then
      (
        (p_for_upload and split_part(p_name, '/', 3) = auth.uid()::text)
        or (not p_for_upload and auth.uid()::text in (split_part(p_name, '/', 2), split_part(p_name, '/', 3)))
      )
      and exists (
        select 1
        from public.profiles recipient
        join public.profiles sender on sender.id::text = split_part(p_name, '/', 3)
        where recipient.id::text = split_part(p_name, '/', 2)
          and recipient.id <> sender.id
          and (
            exists (
              select 1 from public.friendships f
              where f.status = 'accepted'
                and (
                  (f.sender_id = recipient.id and f.receiver_id = sender.id)
                  or (f.receiver_id = recipient.id and f.sender_id = sender.id)
                )
            )
            or exists (
              select 1 from public.members a
              join public.members b using (server_id)
              where a.user_id = recipient.id
                and b.user_id = sender.id
            )
          )
      )
    else false
  end;
$$;


ALTER FUNCTION "public"."sekai_can_access_chat_image"("p_name" "text", "p_for_upload" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sekai_chat_can_access_channel"("p_channel_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.channels c
    join public.members m on m.server_id = c.server_id
    where c.id = p_channel_id and m.user_id = auth.uid() and coalesce(m.is_banned, false) = false
  );
$$;


ALTER FUNCTION "public"."sekai_chat_can_access_channel"("p_channel_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sekai_chat_can_send_to_channel"("p_channel_id" "uuid", "p_content" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
      select 1
      from public.channels c
      join public.members m on m.server_id = c.server_id and m.user_id = auth.uid()
      where c.id = p_channel_id
        and c.type = 'text'
        and coalesce(m.is_muted, false) = false
        and coalesce(m.is_banned, false) = false
        and (m.communication_disabled_until is null or m.communication_disabled_until <= now())
        and public.has_permission(c.server_id, 'send_messages')
    )
    and not exists (
      select 1 from public.channels c
      join public.server_preferences p on p.server_id = c.server_id
      where c.id = p_channel_id
        and coalesce((p.settings->>'autoModEnabled')::boolean, false)
        and (
          (coalesce((p.settings->>'mentionLimit')::integer, 0) > 0
            and length(coalesce(p_content, '')) - length(replace(coalesce(p_content, ''), '@', '')) > (p.settings->>'mentionLimit')::integer)
          or (coalesce((p.settings->>'blockInviteLinks')::boolean, false)
            and coalesce(p_content, '') ~* '(discord[.]gg|discord(app)?[.]com/invite|https?://[^ ]+/(invite|convite)/)')
        )
    )
    and not exists (
      select 1 from public.channels c
      join public.server_preferences p on p.server_id = c.server_id
      join public.messages recent on recent.channel_id = c.id and recent.author_id = auth.uid()
      where c.id = p_channel_id
        and coalesce((p.settings->>'slowmodeSeconds')::integer, 0) > 0
        and recent.created_at > now() - make_interval(secs => (p.settings->>'slowmodeSeconds')::integer)
    );
$$;


ALTER FUNCTION "public"."sekai_chat_can_send_to_channel"("p_channel_id" "uuid", "p_content" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sekai_chat_topic_slowmode_clear"("p_channel_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select not exists (
    select 1
    from public.channels c
    join public.server_preferences p on p.server_id = c.server_id
    join public.chat_topics t on t.channel_id = c.id
    join public.chat_topic_messages tm on tm.topic_id = t.id
    where c.id = p_channel_id
      and tm.author_id = auth.uid()
      and coalesce((p.settings->>'slowmodeSeconds')::integer, 0) > 0
      and tm.created_at > now() - make_interval(secs => (p.settings->>'slowmodeSeconds')::integer)
  );
$$;


ALTER FUNCTION "public"."sekai_chat_topic_slowmode_clear"("p_channel_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sekai_create_profile_for_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_base_username text;
  v_username text;
  v_suffix text := substr(replace(new.id::text, '-', ''), 1, 10);
  v_attempt integer := 0;
begin
  v_base_username := lower(regexp_replace(
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      split_part(coalesce(new.email, 'user'), '@', 1),
      'user'
    ),
    '[^a-z0-9_.-]',
    '_',
    'g'
  ));
  v_base_username := trim(both '._-' from v_base_username);

  if char_length(v_base_username) < 2 then
    v_base_username := 'user';
  end if;

  v_username := left(v_base_username, 32);
  loop
    insert into public.profiles (id, username, display_name)
    values (
      new.id,
      v_username,
      coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), v_base_username)
    )
    on conflict do nothing;

    exit when found or exists (select 1 from public.profiles p where p.id = new.id);

    -- Se dois cadastros tentarem o mesmo nome ao mesmo tempo, tenta uma variante única.
    v_attempt := v_attempt + 1;
    v_username := left(v_base_username, 18) || '_' || v_suffix || '_' || v_attempt::text;
  end loop;

  return new;
end;
$$;


ALTER FUNCTION "public"."sekai_create_profile_for_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sekai_is_server_member"("p_server_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1 from public.members m
    where m.server_id::text = p_server_id
      and m.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."sekai_is_server_member"("p_server_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sekai_post_member_ban_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform public.sekai_post_server_system_message(new.server_id, new.user_id, 'member_banned');
  return new;
end;
$$;


ALTER FUNCTION "public"."sekai_post_member_ban_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sekai_post_member_departure_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_event text;
begin
  -- Ignora cascatas de exclusão de conta/servidor; só processa ações de sessão autenticada.
  if auth.uid() is null or not exists (select 1 from public.servers s where s.id = old.server_id) then
    return old;
  end if;

  -- O gatilho de banimento publica o aviso próprio antes da remoção do membro.
  if exists (
    select 1 from public.guild_bans b
     where b.server_id = old.server_id and b.user_id = old.user_id
  ) then
    return old;
  end if;

  v_event := case when auth.uid() = old.user_id then 'member_left' else 'member_kicked' end;
  perform public.sekai_post_server_system_message(old.server_id, old.user_id, v_event);
  return old;
end;
$$;


ALTER FUNCTION "public"."sekai_post_member_departure_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sekai_post_member_welcome_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform public.sekai_post_server_system_message(new.server_id, new.user_id, 'member_joined');
  return new;
end;
$$;


ALTER FUNCTION "public"."sekai_post_member_welcome_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sekai_post_server_system_message"("p_server_id" "uuid", "p_user_id" "uuid", "p_event" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_settings jsonb;
  v_channel_text text;
  v_channel_id uuid;
  v_setting_key text;
begin
  v_setting_key := case p_event
    when 'member_joined' then 'welcomeMessagesEnabled'
    when 'member_left' then 'memberLeaveMessagesEnabled'
    when 'member_kicked' then 'memberKickMessagesEnabled'
    when 'member_banned' then 'memberBanMessagesEnabled'
    else null
  end;
  if v_setting_key is null then return; end if;

  begin
    select p.settings
      into v_settings
      from public.server_preferences p
     where p.server_id = p_server_id;

    if not found or v_settings->>v_setting_key is distinct from 'true' then
      return;
    end if;

    v_channel_text := nullif(btrim(v_settings->>'welcomeChannelId'), '');
    if v_channel_text is null or v_channel_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return;
    end if;
    v_channel_id := v_channel_text::uuid;

    -- A preferência pode apontar para um canal excluído ou para outro servidor.
    if not exists (
      select 1
        from public.channels c
       where c.id = v_channel_id
         and c.server_id = p_server_id
         and c.type = 'text'
    ) then
      return;
    end if;

    insert into public.messages (channel_id, author_id, content)
    values (v_channel_id, p_user_id, '[sekai-system:' || p_event || ']');
  exception when others then
    -- Uma falha ao publicar o aviso não deve impedir a entrada ou saída do membro.
    raise warning 'Sekai: não foi possível publicar o evento % para o servidor %: %', p_event, p_server_id, sqlerrm;
  end;
end;
$_$;


ALTER FUNCTION "public"."sekai_post_server_system_message"("p_server_id" "uuid", "p_user_id" "uuid", "p_event" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sekai_roll_bankai"("p_channel_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := auth.uid();
  v_server uuid;
  v_type text;
  v_pick int;
  v_slugs text[] := array[
    'bankai-byakuya', 'bankai-renji', 'bankai-rukia', 'bankai-toshiro', 'bankai-yamamoto',
    'bankai-shunsui', 'bankai-mayuri', 'bankai-soi-fon', 'bankai-urahara', 'bankai-ichigo',
    'bankai-komamura', 'bankai-gin', 'bankai-tosen', 'bankai-kensei', 'bankai-rose'
  ];
  v_bankais text[] := array[
    'Senbonzakura Kageyoshi', 'Sōō Zabimaru', 'Hakka no Togame', 'Daiguren Hyōrinmaru', 'Zanka no Tachi',
    'Katen Kyōkotsu: Karamatsu Shinjū', 'Konjiki Ashisogi Jizō', 'Jakuhō Raikōben', 'Kannonbiraki Benihime Aratame', 'Tensa Zangetsu',
    'Kokujō Tengen Myō''ō: Dangai Jōe', 'Kamishini no Yari', 'Suzumushi Tsuishiki: Enma Kōrogi', 'Tekken Tachikaze', 'Kinshara Butōdan'
  ];
  v_characters text[] := array[
    'Byakuya Kuchiki', 'Renji', 'Rukia', 'Tōshirō', 'Yamamoto',
    'Shunsui', 'Mayuri', 'Soi Fon', 'Urahara', 'Ichigo',
    'Komamura', 'Gin', 'Tōsen', 'Kensei', 'Rōjūrō “Rose”'
  ];
  v_themes text[] := array[
    'bankai-byakuya', 'bankai-renji', 'bankai-rukia', 'bankai-toshiro', 'bankai-yamamoto',
    'bankai-shunsui', 'bankai-mayuri', 'bankai-soi-fon', 'bankai-urahara', 'bankai-ichigo',
    'bankai-komamura', 'bankai-gin', 'bankai-tosen', 'bankai-kensei', 'bankai-rose'
  ];
  v_theme_names text[] := array[
    'Jardim das Mil Pétalas', 'Reis Serpentes', 'Elegia de Gelo', 'Dragão Boreal', 'Cinzas do Sol',
    'Palco da Tragédia', 'Crisálida Dourada', 'Ferrão Relâmpago', 'Costura Carmesim', 'Lua Negra',
    'Armadura do Voto', 'Lâmina Prateada', 'Silêncio Índigo', 'Punho da Tempestade', 'Orquestra Dourada'
  ];
  v_slug text;
  v_bankai text;
  v_character text;
  v_theme_id text;
  v_theme_name text;
  v_badge_id uuid;
  v_owned_slug text;
  v_had_theme boolean;
  v_message text;
begin
  if v_user is null then
    raise exception 'Faça login para usar !bankai.';
  end if;

  select c.server_id, c.type into v_server, v_type
  from public.channels c
  where c.id = p_channel_id;

  if v_server is null or v_type <> 'text' then
    raise exception 'Use !bankai em um canal de texto.';
  end if;

  if not public.has_permission(v_server, 'send_messages') then
    raise exception 'Sem permissão para enviar mensagens neste canal.';
  end if;

  if exists (
    select 1 from public.members m
    where m.server_id = v_server
      and m.user_id = v_user
      and (m.is_muted = true or m.communication_disabled_until > now())
  ) then
    raise exception 'Você não pode usar comandos enquanto estiver silenciado.';
  end if;

  if exists (
    select 1
    from public.server_preferences p
    join public.messages recent on recent.channel_id = p_channel_id and recent.author_id = v_user
    where p.server_id = v_server
      and coalesce((p.settings->>'slowmodeSeconds')::integer, 0) > 0
      and recent.created_at > now() - make_interval(secs => (p.settings->>'slowmodeSeconds')::integer)
  ) then
    raise exception 'Aguarde o modo lento antes de usar !bankai.';
  end if;

  perform pg_advisory_xact_lock(hashtext('sekai-bankai'), hashtext(v_user::text));

  select b.slug into v_owned_slug
  from public.user_badges ub
  join public.custom_badges b on b.id = ub.badge_id
  where ub.user_id = v_user
    and b.slug = any (v_slugs)
  order by ub.badge_id
  limit 1;

  if v_owned_slug is not null then
    v_pick := array_position(v_slugs, v_owned_slug);
    v_slug := v_owned_slug;
    v_bankai := v_bankais[v_pick];
    v_character := v_characters[v_pick];
    v_theme_id := v_themes[v_pick];
    v_theme_name := v_theme_names[v_pick];
    v_message := format('Você já tem a insígnia de %s (%s). Ela permanece com você.', v_character, v_bankai);

    insert into public.messages (channel_id, author_id, content)
    values (p_channel_id, v_user, v_message);

    return jsonb_build_object(
      'message', v_message,
      'themeId', v_theme_id,
      'slug', v_slug,
      'unlockedTheme', false,
      'grantedBadge', false
    );
  end if;

  v_pick := 1 + floor(random() * 15)::int;
  v_slug := v_slugs[v_pick];
  v_bankai := v_bankais[v_pick];
  v_character := v_characters[v_pick];
  v_theme_id := v_themes[v_pick];
  v_theme_name := v_theme_names[v_pick];

  select id into v_badge_id from public.custom_badges where slug = v_slug;
  if v_badge_id is null then
    raise exception 'As Bankais ainda não foram preparadas.';
  end if;

  begin
    insert into public.user_badges (user_id, badge_id, assigned_by)
    values (v_user, v_badge_id, v_user);
  exception
    when unique_violation then
      v_message := 'Você já tem uma insígnia de Bankai. Ela permanece com você.';
      insert into public.messages (channel_id, author_id, content)
      values (p_channel_id, v_user, v_message);
      return jsonb_build_object(
        'message', v_message,
        'themeId', v_theme_id,
        'slug', v_slug,
        'unlockedTheme', false,
        'grantedBadge', false
      );
  end;

  select exists (
    select 1 from public.user_theme_unlocks where user_id = v_user and theme_id = v_theme_id
  ) into v_had_theme;

  if not v_had_theme then
    insert into public.user_theme_unlocks (user_id, theme_id)
    values (v_user, v_theme_id)
    on conflict (user_id, theme_id) do nothing;
  end if;

  v_message := format('Bankai liberada: %s! Você ganhou a insígnia de %s e desbloqueou o tema secreto %s.', v_bankai, v_character, v_theme_name);

  insert into public.messages (channel_id, author_id, content)
  values (p_channel_id, v_user, v_message);

  return jsonb_build_object(
    'message', v_message,
    'themeId', v_theme_id,
    'slug', v_slug,
    'unlockedTheme', not v_had_theme,
    'grantedBadge', true
  );
end;
$$;


ALTER FUNCTION "public"."sekai_roll_bankai"("p_channel_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_invite_expiration"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.max_age = 0 then
    new.expires_at := null;
  else
    new.expires_at := new.created_at + make_interval(secs => new.max_age);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_invite_expiration"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_server_banner"("p_server_id" "uuid", "p_banner_url" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if not public.has_permission(p_server_id, 'manage_guild') then
    raise exception 'Sem permissão para alterar o banner';
  end if;
  if p_banner_url is not null and (char_length(btrim(p_banner_url)) > 800 or btrim(p_banner_url) !~ '^https?://') then
    raise exception 'Banner inválido';
  end if;
  update public.servers
     set banner_url = nullif(btrim(p_banner_url), '')
   where id = p_server_id;
end;
$$;


ALTER FUNCTION "public"."set_server_banner"("p_server_id" "uuid", "p_banner_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_server_member_nickname"("p_server_id" "uuid", "p_user_id" "uuid", "p_nickname" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_nickname text := nullif(btrim(coalesce(p_nickname, '')), '');
  v_target_name text;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;

  if v_nickname is not null and char_length(v_nickname) > 32 then
    raise exception 'O apelido deve ter no máximo 32 caracteres';
  end if;

  if not exists (
    select 1 from public.members
    where server_id = p_server_id and user_id = p_user_id
  ) then
    raise exception 'Membro não encontrado neste servidor';
  end if;

  if exists (
    select 1 from public.servers
    where id = p_server_id and owner_id = p_user_id and owner_id <> auth.uid()
  ) then
    raise exception 'Não é permitido alterar o apelido do dono do servidor';
  end if;

  if not public.is_server_owner(p_server_id) and not (
    exists (
      select 1
      from public.members m
      join public.roles r on r.id = m.role_id and r.server_id = m.server_id
      where m.server_id = p_server_id
        and m.user_id = auth.uid()
        and (coalesce(r.permissions, 0)::bigint & 134217736::bigint) <> 0
    )
    or exists (
      select 1
      from public.member_roles mr
      join public.roles r on r.id = mr.role_id and r.server_id = mr.server_id
      where mr.server_id = p_server_id
        and mr.user_id = auth.uid()
        and (coalesce(r.permissions, 0)::bigint & 134217736::bigint) <> 0
    )
  ) then
    raise exception 'Sem permissão para gerenciar apelidos';
  end if;

  select coalesce(nullif(p.display_name, ''), p.username, p_user_id::text)
    into v_target_name
    from public.profiles p
    where p.id = p_user_id;
  v_target_name := coalesce(v_target_name, p_user_id::text);

  update public.members
    set nickname = v_nickname
    where server_id = p_server_id and user_id = p_user_id;

  insert into public.server_audit_logs (server_id, actor_id, action, target, details)
  values (
    p_server_id,
    auth.uid(),
    'member.nickname.update',
    v_target_name,
    jsonb_build_object('user_id', p_user_id, 'nickname', v_nickname)
  );
end;
$$;


ALTER FUNCTION "public"."set_server_member_nickname"("p_server_id" "uuid", "p_user_id" "uuid", "p_nickname" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_server_member_timeout"("p_server_id" "uuid", "p_user_id" "uuid", "p_until" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."set_server_member_timeout"("p_server_id" "uuid", "p_user_id" "uuid", "p_until" timestamp with time zone) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "server_id" "uuid",
    "actor_id" "uuid",
    "target_id" "uuid",
    "action_type" "text" NOT NULL,
    "changes" "jsonb",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."badge_managers" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."badge_managers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."channel_categories" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "server_id" "uuid",
    "name" "text" NOT NULL,
    "position" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."channel_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."channel_permission_overwrites" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "channel_id" "uuid",
    "target_type" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "allow_permissions" bigint DEFAULT 0 NOT NULL,
    "deny_permissions" bigint DEFAULT 0 NOT NULL,
    CONSTRAINT "channel_permission_overwrites_target_type_check" CHECK (("target_type" = ANY (ARRAY['role'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."channel_permission_overwrites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."channels" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "server_id" "uuid",
    "category_id" "uuid",
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "topic" "text",
    "position" integer DEFAULT 0,
    "nsfw" boolean DEFAULT false,
    "rate_limit_per_user" integer DEFAULT 0,
    "bitrate" integer DEFAULT 64000,
    "user_limit" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "channels_type_check" CHECK (("type" = ANY (ARRAY['text'::"text", 'voice'::"text", 'announcement'::"text"])))
);


ALTER TABLE "public"."channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_poll_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "poll_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "position" integer NOT NULL,
    CONSTRAINT "chat_poll_options_label_check" CHECK ((("length"("label") >= 1) AND ("length"("label") <= 100)))
);


ALTER TABLE "public"."chat_poll_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_poll_votes" (
    "poll_id" "uuid" NOT NULL,
    "option_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chat_poll_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_polls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "question" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "votes_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chat_polls_question_check" CHECK ((("length"("question") >= 1) AND ("length"("question") <= 200)))
);


ALTER TABLE "public"."chat_polls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_topic_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chat_topic_messages_content_check" CHECK ((("length"("content") >= 1) AND ("length"("content") <= 4000)))
);


ALTER TABLE "public"."chat_topic_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chat_topics_title_check" CHECK ((("length"("title") >= 1) AND ("length"("title") <= 100)))
);


ALTER TABLE "public"."chat_topics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_badges" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text" NOT NULL,
    "background_color" "text" DEFAULT '#4f46e5'::"text" NOT NULL,
    "foreground_color" "text" DEFAULT '#ffffff'::"text" NOT NULL,
    "image_url" "text",
    "image_path" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "slug" "text",
    CONSTRAINT "custom_badges_background_color_check" CHECK (("background_color" ~ '^#[0-9A-Fa-f]{6}$'::"text")),
    CONSTRAINT "custom_badges_foreground_color_check" CHECK (("foreground_color" ~ '^#[0-9A-Fa-f]{6}$'::"text")),
    CONSTRAINT "custom_badges_icon_check" CHECK ((("char_length"("icon") >= 1) AND ("char_length"("icon") <= 12))),
    CONSTRAINT "custom_badges_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 32)))
);


ALTER TABLE "public"."custom_badges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."direct_messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "dm_channel_id" "uuid",
    "author_id" "uuid",
    "content" "text",
    "attachment_url" "text",
    "reply_to_id" "uuid",
    "edited_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."direct_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dm_channels" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "type" smallint DEFAULT 1 NOT NULL,
    "name" "text",
    "icon_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "dm_channels_type_check" CHECK (("type" = ANY (ARRAY[1, 2])))
);


ALTER TABLE "public"."dm_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dm_members" (
    "dm_channel_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "last_read_message_id" "uuid"
);


ALTER TABLE "public"."dm_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friend_server_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "receiver_id" "uuid" NOT NULL,
    "server_id" "uuid" NOT NULL,
    "server_name" "text" NOT NULL,
    "channel_id" "uuid",
    "invite_code" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "friend_server_invites_not_self" CHECK (("sender_id" <> "receiver_id")),
    CONSTRAINT "friend_server_invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text"])))
);


ALTER TABLE "public"."friend_server_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "receiver_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "friendships_not_self" CHECK (("sender_id" <> "receiver_id")),
    CONSTRAINT "friendships_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text"])))
);


ALTER TABLE "public"."friendships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guild_bans" (
    "server_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "executor_id" "uuid",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."guild_bans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invites" (
    "code" "text" DEFAULT "substr"("md5"(("random"())::"text"), 1, 8) NOT NULL,
    "server_id" "uuid",
    "channel_id" "uuid",
    "inviter_id" "uuid",
    "uses" integer DEFAULT 0,
    "max_uses" integer DEFAULT 0,
    "max_age" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member_roles" (
    "server_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL
);


ALTER TABLE "public"."member_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."members" (
    "server_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "nickname" "text",
    "communication_disabled_until" timestamp with time zone,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "avatar_url" "text",
    "banner_url" "text",
    "is_muted" boolean DEFAULT false NOT NULL,
    "role_id" "uuid",
    "banner_position_x" integer DEFAULT 50 NOT NULL,
    "banner_position_y" integer DEFAULT 50 NOT NULL,
    "avatar_position_x" integer DEFAULT 50 NOT NULL,
    "avatar_position_y" integer DEFAULT 50 NOT NULL,
    "avatar_zoom" integer DEFAULT 100 NOT NULL,
    "banner_zoom" integer DEFAULT 100 NOT NULL,
    "is_banned" boolean DEFAULT false NOT NULL,
    "member_list_banner_url" "text",
    "member_list_banner_position_x" double precision DEFAULT 50 NOT NULL,
    "member_list_banner_position_y" double precision DEFAULT 50 NOT NULL,
    "member_list_banner_zoom" double precision DEFAULT 100 NOT NULL,
    CONSTRAINT "members_avatar_position_x_range" CHECK ((("avatar_position_x" >= 0) AND ("avatar_position_x" <= 100))),
    CONSTRAINT "members_avatar_position_y_range" CHECK ((("avatar_position_y" >= 0) AND ("avatar_position_y" <= 100))),
    CONSTRAINT "members_avatar_zoom_range" CHECK ((("avatar_zoom" >= 100) AND ("avatar_zoom" <= 250))),
    CONSTRAINT "members_banner_position_x_range" CHECK ((("banner_position_x" >= 0) AND ("banner_position_x" <= 100))),
    CONSTRAINT "members_banner_position_y_range" CHECK ((("banner_position_y" >= 0) AND ("banner_position_y" <= 100))),
    CONSTRAINT "members_banner_zoom_range" CHECK ((("banner_zoom" >= 100) AND ("banner_zoom" <= 250)))
);


ALTER TABLE "public"."members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_reactions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "message_id" "uuid",
    "user_id" "uuid",
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."message_reactions" REPLICA IDENTITY FULL;


ALTER TABLE "public"."message_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "channel_id" "uuid",
    "author_id" "uuid",
    "content" "text",
    "attachment_url" "text",
    "pinned" boolean DEFAULT false,
    "reply_to_id" "uuid",
    "edited_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "topic_id" "uuid",
    "poll_id" "uuid",
    "attachment_name" "text",
    "attachment_mime_type" "text"
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "display_name" "text",
    "avatar_url" "text",
    "banner_url" "text",
    "accent_color" "text",
    "bio" "text",
    "custom_status" "text",
    "status" "text" DEFAULT 'offline'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "pronouns" "text",
    "profile_card_color" "text" DEFAULT '#202127'::"text" NOT NULL,
    "banner_position_x" integer DEFAULT 50 NOT NULL,
    "banner_position_y" integer DEFAULT 50 NOT NULL,
    "avatar_position_x" integer DEFAULT 50 NOT NULL,
    "avatar_position_y" integer DEFAULT 50 NOT NULL,
    "avatar_zoom" integer DEFAULT 100 NOT NULL,
    "banner_zoom" integer DEFAULT 100 NOT NULL,
    "member_list_banner_url" "text",
    "member_list_banner_position_x" double precision DEFAULT 50 NOT NULL,
    "member_list_banner_position_y" double precision DEFAULT 50 NOT NULL,
    "member_list_banner_zoom" double precision DEFAULT 100 NOT NULL,
    "show_badges_in_member_list" boolean DEFAULT true NOT NULL,
    CONSTRAINT "profiles_avatar_position_x_range" CHECK ((("avatar_position_x" >= 0) AND ("avatar_position_x" <= 100))),
    CONSTRAINT "profiles_avatar_position_y_range" CHECK ((("avatar_position_y" >= 0) AND ("avatar_position_y" <= 100))),
    CONSTRAINT "profiles_avatar_zoom_range" CHECK ((("avatar_zoom" >= 100) AND ("avatar_zoom" <= 250))),
    CONSTRAINT "profiles_banner_position_x_range" CHECK ((("banner_position_x" >= 0) AND ("banner_position_x" <= 100))),
    CONSTRAINT "profiles_banner_position_y_range" CHECK ((("banner_position_y" >= 0) AND ("banner_position_y" <= 100))),
    CONSTRAINT "profiles_banner_zoom_range" CHECK ((("banner_zoom" >= 100) AND ("banner_zoom" <= 250))),
    CONSTRAINT "profiles_bio_check" CHECK (("char_length"("bio") <= 190)),
    CONSTRAINT "profiles_custom_status_check" CHECK (("char_length"("custom_status") <= 128)),
    CONSTRAINT "profiles_profile_card_color_hex" CHECK ((("profile_card_color" IS NULL) OR ("profile_card_color" ~ '^#[0-9A-Fa-f]{6}$'::"text") OR ("profile_card_color" ~ '^linear-gradient\(135deg, #[0-9A-Fa-f]{6}, #[0-9A-Fa-f]{6}(, #[0-9A-Fa-f]{6})?\)$'::"text"))),
    CONSTRAINT "profiles_pronouns_check" CHECK (("char_length"("pronouns") <= 32)),
    CONSTRAINT "profiles_status_check" CHECK (("status" = ANY (ARRAY['online'::"text", 'idle'::"text", 'dnd'::"text", 'offline'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."relationships" (
    "user_id" "uuid" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "type" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "relationships_type_check" CHECK (("type" = ANY (ARRAY[1, 2, 3, 4])))
);


ALTER TABLE "public"."relationships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "server_id" "uuid",
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#99aab5'::"text",
    "hoist" boolean DEFAULT false,
    "mentionable" boolean DEFAULT false,
    "is_default" boolean DEFAULT false,
    "position" integer DEFAULT 0 NOT NULL,
    "permissions" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "icon_url" "text",
    "insignia_url" "text"
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sekai_direct_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "receiver_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attachment_url" "text",
    CONSTRAINT "sekai_direct_messages_content_check" CHECK (((("length"("content") >= 1) AND ("length"("content") <= 4000)) OR (("length"("content") = 0) AND ("attachment_url" IS NOT NULL)))),
    CONSTRAINT "sekai_direct_messages_not_self" CHECK (("sender_id" <> "receiver_id"))
);


ALTER TABLE "public"."sekai_direct_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."server_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "server_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "name" "text" NOT NULL,
    "asset_url" "text" NOT NULL,
    "storage_path" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "server_assets_kind_check" CHECK (("kind" = ANY (ARRAY['emoji'::"text", 'sticker'::"text", 'sound'::"text"])))
);


ALTER TABLE "public"."server_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."server_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "server_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "target" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."server_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."server_preferences" (
    "server_id" "uuid" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."server_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."servers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "icon_url" "text",
    "banner_url" "text",
    "description" "text",
    "owner_id" "uuid",
    "system_channel_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."servers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_badges" (
    "user_id" "uuid" NOT NULL,
    "badge_id" "uuid" NOT NULL,
    "assigned_by" "uuid" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "visible_in_profile" boolean DEFAULT true NOT NULL,
    "visible_in_member_list" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."user_badges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_now_playing" (
    "user_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'spotify'::"text" NOT NULL,
    "track" "text" NOT NULL,
    "artist" "text",
    "album" "text",
    "art_url" "text",
    "track_url" "text",
    "display" "text" DEFAULT 'both'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_now_playing_album_check" CHECK ((("album" IS NULL) OR ("char_length"("album") <= 120))),
    CONSTRAINT "user_now_playing_artist_check" CHECK ((("artist" IS NULL) OR ("char_length"("artist") <= 160))),
    CONSTRAINT "user_now_playing_display_check" CHECK (("display" = ANY (ARRAY['profile'::"text", 'status'::"text", 'both'::"text"]))),
    CONSTRAINT "user_now_playing_provider_check" CHECK (("provider" = 'spotify'::"text")),
    CONSTRAINT "user_now_playing_track_check" CHECK ((("char_length"("track") >= 1) AND ("char_length"("track") <= 120)))
);


ALTER TABLE "public"."user_now_playing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_settings" (
    "user_id" "uuid" NOT NULL,
    "theme" "text" DEFAULT 'dark'::"text",
    "locale" "text" DEFAULT 'pt-BR'::"text",
    "explicit_content_filter" smallint DEFAULT 0,
    "allow_dms_from_server_members" boolean DEFAULT true,
    "compact_mode" boolean DEFAULT false,
    CONSTRAINT "user_settings_theme_check" CHECK (("theme" = ANY (ARRAY['dark'::"text", 'light'::"text", 'amoled'::"text"])))
);


ALTER TABLE "public"."user_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_theme_unlocks" (
    "user_id" "uuid" NOT NULL,
    "theme_id" "text" NOT NULL,
    "unlocked_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_theme_unlocks" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."badge_managers"
    ADD CONSTRAINT "badge_managers_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."channel_categories"
    ADD CONSTRAINT "channel_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."channel_permission_overwrites"
    ADD CONSTRAINT "channel_permission_overwrites_channel_id_target_type_target_key" UNIQUE ("channel_id", "target_type", "target_id");



ALTER TABLE ONLY "public"."channel_permission_overwrites"
    ADD CONSTRAINT "channel_permission_overwrites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_poll_options"
    ADD CONSTRAINT "chat_poll_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_poll_options"
    ADD CONSTRAINT "chat_poll_options_poll_id_position_key" UNIQUE ("poll_id", "position");



ALTER TABLE ONLY "public"."chat_poll_votes"
    ADD CONSTRAINT "chat_poll_votes_pkey" PRIMARY KEY ("poll_id", "user_id");



ALTER TABLE ONLY "public"."chat_polls"
    ADD CONSTRAINT "chat_polls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_topic_messages"
    ADD CONSTRAINT "chat_topic_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_topics"
    ADD CONSTRAINT "chat_topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_badges"
    ADD CONSTRAINT "custom_badges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dm_channels"
    ADD CONSTRAINT "dm_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dm_members"
    ADD CONSTRAINT "dm_members_pkey" PRIMARY KEY ("dm_channel_id", "user_id");



ALTER TABLE ONLY "public"."friend_server_invites"
    ADD CONSTRAINT "friend_server_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guild_bans"
    ADD CONSTRAINT "guild_bans_pkey" PRIMARY KEY ("server_id", "user_id");



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."member_roles"
    ADD CONSTRAINT "member_roles_pkey" PRIMARY KEY ("server_id", "user_id", "role_id");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_pkey" PRIMARY KEY ("server_id", "user_id");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_user_id_emoji_key" UNIQUE ("message_id", "user_id", "emoji");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."relationships"
    ADD CONSTRAINT "relationships_pkey" PRIMARY KEY ("user_id", "target_id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_server_id_name_key" UNIQUE ("server_id", "name");



ALTER TABLE ONLY "public"."sekai_direct_messages"
    ADD CONSTRAINT "sekai_direct_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."server_assets"
    ADD CONSTRAINT "server_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."server_assets"
    ADD CONSTRAINT "server_assets_server_id_kind_name_key" UNIQUE ("server_id", "kind", "name");



ALTER TABLE ONLY "public"."server_audit_logs"
    ADD CONSTRAINT "server_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."server_preferences"
    ADD CONSTRAINT "server_preferences_pkey" PRIMARY KEY ("server_id");



ALTER TABLE ONLY "public"."servers"
    ADD CONSTRAINT "servers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_pkey" PRIMARY KEY ("user_id", "badge_id");



ALTER TABLE ONLY "public"."user_now_playing"
    ADD CONSTRAINT "user_now_playing_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_theme_unlocks"
    ADD CONSTRAINT "user_theme_unlocks_pkey" PRIMARY KEY ("user_id", "theme_id");



CREATE UNIQUE INDEX "channel_categories_server_name_key" ON "public"."channel_categories" USING "btree" ("server_id", "name");



CREATE INDEX "chat_poll_options_poll_position_idx" ON "public"."chat_poll_options" USING "btree" ("poll_id", "position");



CREATE INDEX "chat_polls_channel_created_idx" ON "public"."chat_polls" USING "btree" ("channel_id", "created_at" DESC);



CREATE INDEX "chat_topic_messages_topic_created_idx" ON "public"."chat_topic_messages" USING "btree" ("topic_id", "created_at");



CREATE INDEX "chat_topics_channel_created_idx" ON "public"."chat_topics" USING "btree" ("channel_id", "created_at" DESC);



CREATE UNIQUE INDEX "custom_badges_slug_key" ON "public"."custom_badges" USING "btree" ("slug") WHERE ("slug" IS NOT NULL);



CREATE INDEX "friend_server_invites_receiver" ON "public"."friend_server_invites" USING "btree" ("receiver_id", "status", "created_at" DESC);



CREATE UNIQUE INDEX "friendships_one_per_pair" ON "public"."friendships" USING "btree" (LEAST("sender_id", "receiver_id"), GREATEST("sender_id", "receiver_id"));



CREATE INDEX "friendships_receiver_status" ON "public"."friendships" USING "btree" ("receiver_id", "status");



CREATE INDEX "idx_channels_server" ON "public"."channels" USING "btree" ("server_id");



CREATE INDEX "idx_dm_messages_channel_created" ON "public"."direct_messages" USING "btree" ("dm_channel_id", "created_at" DESC);



CREATE INDEX "idx_member_roles_lookup" ON "public"."member_roles" USING "btree" ("server_id", "user_id");



CREATE INDEX "idx_members_server" ON "public"."members" USING "btree" ("server_id");



CREATE INDEX "idx_messages_channel_created" ON "public"."messages" USING "btree" ("channel_id", "created_at" DESC);



CREATE INDEX "idx_roles_server_position" ON "public"."roles" USING "btree" ("server_id", "position" DESC);



CREATE INDEX "idx_user_badges_badge_id" ON "public"."user_badges" USING "btree" ("badge_id");



CREATE INDEX "invites_server_created" ON "public"."invites" USING "btree" ("server_id", "created_at" DESC);



CREATE UNIQUE INDEX "one_default_role_per_server" ON "public"."roles" USING "btree" ("server_id") WHERE ("is_default" = true);



CREATE INDEX "sekai_direct_messages_pair_created" ON "public"."sekai_direct_messages" USING "btree" (LEAST("sender_id", "receiver_id"), GREATEST("sender_id", "receiver_id"), "created_at");



CREATE INDEX "server_audit_logs_server_created" ON "public"."server_audit_logs" USING "btree" ("server_id", "created_at" DESC);



CREATE UNIQUE INDEX "user_badges_one_bankai_idx" ON "public"."user_badges" USING "btree" ("user_id") WHERE ("badge_id" = ANY (ARRAY['b0000001-0000-4000-8000-000000000001'::"uuid", 'b0000001-0000-4000-8000-000000000002'::"uuid", 'b0000001-0000-4000-8000-000000000003'::"uuid", 'b0000001-0000-4000-8000-000000000004'::"uuid", 'b0000001-0000-4000-8000-000000000005'::"uuid", 'b0000001-0000-4000-8000-000000000006'::"uuid", 'b0000001-0000-4000-8000-000000000007'::"uuid", 'b0000001-0000-4000-8000-000000000008'::"uuid", 'b0000001-0000-4000-8000-000000000009'::"uuid", 'b0000001-0000-4000-8000-00000000000a'::"uuid", 'b0000001-0000-4000-8000-00000000000b'::"uuid", 'b0000001-0000-4000-8000-00000000000c'::"uuid", 'b0000001-0000-4000-8000-00000000000d'::"uuid", 'b0000001-0000-4000-8000-00000000000e'::"uuid", 'b0000001-0000-4000-8000-00000000000f'::"uuid"]));



CREATE OR REPLACE TRIGGER "sekai_member_ban_message" AFTER INSERT OR UPDATE ON "public"."guild_bans" FOR EACH ROW EXECUTE FUNCTION "public"."sekai_post_member_ban_message"();



CREATE OR REPLACE TRIGGER "sekai_member_departure_message" AFTER DELETE ON "public"."members" FOR EACH ROW EXECUTE FUNCTION "public"."sekai_post_member_departure_message"();



CREATE OR REPLACE TRIGGER "sekai_member_welcome_message" AFTER INSERT ON "public"."members" FOR EACH ROW EXECUTE FUNCTION "public"."sekai_post_member_welcome_message"();



CREATE OR REPLACE TRIGGER "trg_create_default_server_data" AFTER INSERT ON "public"."servers" FOR EACH ROW EXECUTE FUNCTION "public"."create_default_server_data"();



CREATE OR REPLACE TRIGGER "trg_set_invite_expiration" BEFORE INSERT ON "public"."invites" FOR EACH ROW EXECUTE FUNCTION "public"."set_invite_expiration"();



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."badge_managers"
    ADD CONSTRAINT "badge_managers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channel_categories"
    ADD CONSTRAINT "channel_categories_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channel_permission_overwrites"
    ADD CONSTRAINT "channel_permission_overwrites_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."channel_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_poll_options"
    ADD CONSTRAINT "chat_poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "public"."chat_polls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_poll_votes"
    ADD CONSTRAINT "chat_poll_votes_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "public"."chat_poll_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_poll_votes"
    ADD CONSTRAINT "chat_poll_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "public"."chat_polls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_poll_votes"
    ADD CONSTRAINT "chat_poll_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_polls"
    ADD CONSTRAINT "chat_polls_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_polls"
    ADD CONSTRAINT "chat_polls_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_topic_messages"
    ADD CONSTRAINT "chat_topic_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_topic_messages"
    ADD CONSTRAINT "chat_topic_messages_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."chat_topics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_topics"
    ADD CONSTRAINT "chat_topics_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_topics"
    ADD CONSTRAINT "chat_topics_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."custom_badges"
    ADD CONSTRAINT "custom_badges_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_dm_channel_id_fkey" FOREIGN KEY ("dm_channel_id") REFERENCES "public"."dm_channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "public"."direct_messages"("id");



ALTER TABLE ONLY "public"."dm_members"
    ADD CONSTRAINT "dm_members_dm_channel_id_fkey" FOREIGN KEY ("dm_channel_id") REFERENCES "public"."dm_channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_members"
    ADD CONSTRAINT "dm_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friend_server_invites"
    ADD CONSTRAINT "friend_server_invites_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."friend_server_invites"
    ADD CONSTRAINT "friend_server_invites_invite_code_fkey" FOREIGN KEY ("invite_code") REFERENCES "public"."invites"("code") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friend_server_invites"
    ADD CONSTRAINT "friend_server_invites_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friend_server_invites"
    ADD CONSTRAINT "friend_server_invites_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friend_server_invites"
    ADD CONSTRAINT "friend_server_invites_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."guild_bans"
    ADD CONSTRAINT "guild_bans_executor_id_fkey" FOREIGN KEY ("executor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."guild_bans"
    ADD CONSTRAINT "guild_bans_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."guild_bans"
    ADD CONSTRAINT "guild_bans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_roles"
    ADD CONSTRAINT "member_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_roles"
    ADD CONSTRAINT "member_roles_server_id_user_id_fkey" FOREIGN KEY ("server_id", "user_id") REFERENCES "public"."members"("server_id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "public"."chat_polls"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "public"."messages"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."chat_topics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."relationships"
    ADD CONSTRAINT "relationships_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."relationships"
    ADD CONSTRAINT "relationships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sekai_direct_messages"
    ADD CONSTRAINT "sekai_direct_messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sekai_direct_messages"
    ADD CONSTRAINT "sekai_direct_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."server_assets"
    ADD CONSTRAINT "server_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."server_assets"
    ADD CONSTRAINT "server_assets_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."server_audit_logs"
    ADD CONSTRAINT "server_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."server_audit_logs"
    ADD CONSTRAINT "server_audit_logs_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."server_preferences"
    ADD CONSTRAINT "server_preferences_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."server_preferences"
    ADD CONSTRAINT "server_preferences_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."servers"
    ADD CONSTRAINT "servers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."servers"
    ADD CONSTRAINT "servers_system_channel_fk" FOREIGN KEY ("system_channel_id") REFERENCES "public"."channels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "public"."custom_badges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_now_playing"
    ADD CONSTRAINT "user_now_playing_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_theme_unlocks"
    ADD CONSTRAINT "user_theme_unlocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_select" ON "public"."audit_log" FOR SELECT USING ("public"."has_server_permission"("server_id", "public"."perm"('VIEW_AUDIT_LOG'::"text")));



ALTER TABLE "public"."badge_managers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "badge_managers_read_self" ON "public"."badge_managers" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "badge_managers_select_self" ON "public"."badge_managers" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "bans_select" ON "public"."guild_bans" FOR SELECT USING (("public"."has_server_permission"("server_id", "public"."perm"('BAN_MEMBERS'::"text")) OR "public"."has_server_permission"("server_id", "public"."perm"('VIEW_AUDIT_LOG'::"text"))));



CREATE POLICY "bans_write" ON "public"."guild_bans" USING ("public"."has_server_permission"("server_id", "public"."perm"('BAN_MEMBERS'::"text"))) WITH CHECK ("public"."has_server_permission"("server_id", "public"."perm"('BAN_MEMBERS'::"text")));



CREATE POLICY "categories_select_member" ON "public"."channel_categories" FOR SELECT USING ("public"."is_server_member"("server_id"));



CREATE POLICY "categories_write_manage_channels" ON "public"."channel_categories" USING ("public"."has_server_permission"("server_id", "public"."perm"('MANAGE_CHANNELS'::"text"))) WITH CHECK ("public"."has_server_permission"("server_id", "public"."perm"('MANAGE_CHANNELS'::"text")));



ALTER TABLE "public"."channel_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "channel_categories_manage" ON "public"."channel_categories" TO "authenticated" USING ("public"."has_permission"("server_id", 'manage_channels'::"text")) WITH CHECK ("public"."has_permission"("server_id", 'manage_channels'::"text"));



CREATE POLICY "channel_categories_select_member" ON "public"."channel_categories" FOR SELECT TO "authenticated" USING ("public"."is_server_member"("server_id"));



ALTER TABLE "public"."channel_permission_overwrites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."channels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "channels_select_member" ON "public"."channels" FOR SELECT USING (("public"."is_server_member"("server_id") AND "public"."has_channel_permission"("id", "public"."perm"('VIEW_CHANNEL'::"text"))));



CREATE POLICY "channels_write_manage_channels" ON "public"."channels" USING ("public"."has_server_permission"("server_id", "public"."perm"('MANAGE_CHANNELS'::"text"))) WITH CHECK ("public"."has_server_permission"("server_id", "public"."perm"('MANAGE_CHANNELS'::"text")));



ALTER TABLE "public"."chat_poll_options" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_poll_options_select_members" ON "public"."chat_poll_options" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."chat_polls" "p"
  WHERE (("p"."id" = "chat_poll_options"."poll_id") AND "public"."sekai_chat_can_access_channel"("p"."channel_id")))));



ALTER TABLE "public"."chat_poll_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_polls" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_polls_select_members" ON "public"."chat_polls" FOR SELECT TO "authenticated" USING ("public"."sekai_chat_can_access_channel"("channel_id"));



ALTER TABLE "public"."chat_topic_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_topic_messages_insert_members" ON "public"."chat_topic_messages" FOR INSERT TO "authenticated" WITH CHECK ((("author_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."chat_topics" "t"
  WHERE (("t"."id" = "chat_topic_messages"."topic_id") AND "public"."sekai_chat_can_send_to_channel"("t"."channel_id", "chat_topic_messages"."content")))) AND (EXISTS ( SELECT 1
   FROM "public"."chat_topics" "t"
  WHERE (("t"."id" = "chat_topic_messages"."topic_id") AND "public"."sekai_chat_topic_slowmode_clear"("t"."channel_id"))))));



CREATE POLICY "chat_topic_messages_select_members" ON "public"."chat_topic_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."chat_topics" "t"
  WHERE (("t"."id" = "chat_topic_messages"."topic_id") AND "public"."sekai_chat_can_access_channel"("t"."channel_id")))));



ALTER TABLE "public"."chat_topics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_topics_select_members" ON "public"."chat_topics" FOR SELECT TO "authenticated" USING ("public"."sekai_chat_can_access_channel"("channel_id"));



ALTER TABLE "public"."custom_badges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "custom_badges_delete_managers" ON "public"."custom_badges" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."badge_managers" "manager"
  WHERE ("manager"."user_id" = "auth"."uid"()))));



CREATE POLICY "custom_badges_insert_managers" ON "public"."custom_badges" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."badge_managers" "manager"
  WHERE ("manager"."user_id" = "auth"."uid"()))));



CREATE POLICY "custom_badges_manage_badges" ON "public"."custom_badges" TO "authenticated" USING ("public"."is_badge_manager"()) WITH CHECK ("public"."is_badge_manager"());



CREATE POLICY "custom_badges_read" ON "public"."custom_badges" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "custom_badges_select_authenticated" ON "public"."custom_badges" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "custom_badges_update_managers" ON "public"."custom_badges" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."badge_managers" "manager"
  WHERE ("manager"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."badge_managers" "manager"
  WHERE ("manager"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."direct_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dm_channels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dm_channels_insert_any_authenticated" ON "public"."dm_channels" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "dm_channels_select_member" ON "public"."dm_channels" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."dm_members"
  WHERE (("dm_members"."dm_channel_id" = "dm_channels"."id") AND ("dm_members"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."dm_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dm_members_insert" ON "public"."dm_members" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."dm_members" "m2"
  WHERE (("m2"."dm_channel_id" = "m2"."dm_channel_id") AND ("m2"."user_id" = "auth"."uid"()))))));



CREATE POLICY "dm_members_select_same_dm" ON "public"."dm_members" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."dm_members" "m2"
  WHERE (("m2"."dm_channel_id" = "m2"."dm_channel_id") AND ("m2"."user_id" = "auth"."uid"())))));



CREATE POLICY "dms_delete_own" ON "public"."direct_messages" FOR DELETE USING (("author_id" = "auth"."uid"()));



CREATE POLICY "dms_insert_own" ON "public"."direct_messages" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."dm_members"
  WHERE (("dm_members"."dm_channel_id" = "direct_messages"."dm_channel_id") AND ("dm_members"."user_id" = "auth"."uid"()))))));



CREATE POLICY "dms_select_member" ON "public"."direct_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."dm_members"
  WHERE (("dm_members"."dm_channel_id" = "direct_messages"."dm_channel_id") AND ("dm_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "dms_update_own" ON "public"."direct_messages" FOR UPDATE USING (("author_id" = "auth"."uid"()));



ALTER TABLE "public"."friend_server_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "friend_server_invites_create_friend" ON "public"."friend_server_invites" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND "public"."is_server_member"("server_id") AND (EXISTS ( SELECT 1
   FROM "public"."friendships" "f"
  WHERE (("f"."status" = 'accepted'::"text") AND ((("f"."sender_id" = "auth"."uid"()) AND ("f"."receiver_id" = "f"."receiver_id")) OR (("f"."receiver_id" = "auth"."uid"()) AND ("f"."sender_id" = "f"."receiver_id"))))))));



CREATE POLICY "friend_server_invites_delete_participant" ON "public"."friend_server_invites" FOR DELETE TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"())));



CREATE POLICY "friend_server_invites_select_participant" ON "public"."friend_server_invites" FOR SELECT TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"())));



ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "friendships_accept" ON "public"."friendships" FOR UPDATE TO "authenticated" USING ((("receiver_id" = "auth"."uid"()) AND ("status" = 'pending'::"text"))) WITH CHECK ((("receiver_id" = "auth"."uid"()) AND ("status" = 'accepted'::"text")));



CREATE POLICY "friendships_cancel" ON "public"."friendships" FOR DELETE TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"())));



CREATE POLICY "friendships_request" ON "public"."friendships" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND ("receiver_id" <> "auth"."uid"()) AND ("status" = 'pending'::"text")));



CREATE POLICY "friendships_select_participant" ON "public"."friendships" FOR SELECT TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"())));



ALTER TABLE "public"."guild_bans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "guild_bans_delete_mods" ON "public"."guild_bans" FOR DELETE TO "authenticated" USING ("public"."has_permission"("server_id", 'ban_members'::"text"));



CREATE POLICY "guild_bans_insert_mods" ON "public"."guild_bans" FOR INSERT TO "authenticated" WITH CHECK ((("executor_id" = "auth"."uid"()) AND ("user_id" <> "auth"."uid"()) AND "public"."has_permission"("server_id", 'ban_members'::"text")));



CREATE POLICY "guild_bans_select_mods" ON "public"."guild_bans" FOR SELECT TO "authenticated" USING ("public"."has_permission"("server_id", 'ban_members'::"text"));



ALTER TABLE "public"."invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invites_create_member" ON "public"."invites" FOR INSERT TO "authenticated" WITH CHECK ((("inviter_id" = "auth"."uid"()) AND "public"."is_server_member"("server_id") AND ("public"."is_server_owner"("server_id") OR "public"."has_permission"("server_id", 'create_invite'::"text"))));



CREATE POLICY "invites_delete" ON "public"."invites" FOR DELETE USING ((("inviter_id" = "auth"."uid"()) OR "public"."has_server_permission"("server_id", "public"."perm"('MANAGE_CHANNELS'::"text"))));



CREATE POLICY "invites_delete_creator_or_owner" ON "public"."invites" FOR DELETE TO "authenticated" USING ((("inviter_id" = "auth"."uid"()) OR "public"."is_server_owner"("server_id")));



CREATE POLICY "invites_insert" ON "public"."invites" FOR INSERT WITH CHECK ("public"."has_server_permission"("server_id", "public"."perm"('CREATE_INSTANT_INVITE'::"text")));



CREATE POLICY "invites_select_member" ON "public"."invites" FOR SELECT TO "authenticated" USING ("public"."is_server_member"("server_id"));



ALTER TABLE "public"."member_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_roles_assign_manage_roles" ON "public"."member_roles" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"("server_id", 'manage_roles'::"text"));



CREATE POLICY "member_roles_remove_manage_roles" ON "public"."member_roles" FOR DELETE TO "authenticated" USING ("public"."has_permission"("server_id", 'manage_roles'::"text"));



CREATE POLICY "member_roles_select" ON "public"."member_roles" FOR SELECT USING ("public"."is_server_member"("server_id"));



CREATE POLICY "member_roles_select_member" ON "public"."member_roles" FOR SELECT TO "authenticated" USING ("public"."is_server_member"("server_id"));



CREATE POLICY "member_roles_write_manage_roles" ON "public"."member_roles" USING ("public"."has_server_permission"("server_id", "public"."perm"('MANAGE_ROLES'::"text"))) WITH CHECK ("public"."has_server_permission"("server_id", "public"."perm"('MANAGE_ROLES'::"text")));



ALTER TABLE "public"."members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members_delete_self_or_kick" ON "public"."members" FOR DELETE USING ((("user_id" = "auth"."uid"()) OR "public"."has_server_permission"("server_id", "public"."perm"('KICK_MEMBERS'::"text"))));



CREATE POLICY "members_insert_self" ON "public"."members" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "members_select_member" ON "public"."members" FOR SELECT USING ("public"."is_server_member"("server_id"));



CREATE POLICY "members_update" ON "public"."members" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR "public"."has_server_permission"("server_id", "public"."perm"('MANAGE_NICKNAMES'::"text")) OR "public"."has_server_permission"("server_id", "public"."perm"('MODERATE_MEMBERS'::"text"))));



CREATE POLICY "members_update_own_nickname" ON "public"."members" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."has_permission"("server_id", 'manage_roles'::"text"))) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."has_permission"("server_id", 'manage_roles'::"text")));



ALTER TABLE "public"."message_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_block_system_marker_insert" ON "public"."messages" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((COALESCE("content", ''::"text") !~~ '[sekai-system:%'::"text"));



CREATE POLICY "messages_block_system_marker_update" ON "public"."messages" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING (true) WITH CHECK ((COALESCE("content", ''::"text") !~~ '[sekai-system:%'::"text"));



CREATE POLICY "messages_delete_own_or_manage" ON "public"."messages" FOR DELETE USING ((("author_id" = "auth"."uid"()) OR "public"."has_channel_permission"("channel_id", "public"."perm"('MANAGE_MESSAGES'::"text"))));



CREATE POLICY "messages_insert_own" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("author_id" = "auth"."uid"()) AND "public"."has_permission"(( SELECT "channels"."server_id"
   FROM "public"."channels"
  WHERE ("channels"."id" = "messages"."channel_id")), 'send_messages'::"text") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."members" "m"
  WHERE (("m"."server_id" = ( SELECT "channels"."server_id"
           FROM "public"."channels"
          WHERE ("channels"."id" = "messages"."channel_id"))) AND ("m"."user_id" = "auth"."uid"()) AND (("m"."is_muted" = true) OR ("m"."communication_disabled_until" > "now"())))))) AND (NOT (EXISTS ( SELECT 1
   FROM "public"."server_preferences" "p"
  WHERE (("p"."server_id" = ( SELECT "channels"."server_id"
           FROM "public"."channels"
          WHERE ("channels"."id" = "messages"."channel_id"))) AND COALESCE((("p"."settings" ->> 'autoModEnabled'::"text"))::boolean, false) AND (((COALESCE((("p"."settings" ->> 'mentionLimit'::"text"))::integer, 0) > 0) AND (("length"(COALESCE("messages"."content", ''::"text")) - "length"("replace"(COALESCE("messages"."content", ''::"text"), '@'::"text", ''::"text"))) > (("p"."settings" ->> 'mentionLimit'::"text"))::integer)) OR (COALESCE((("p"."settings" ->> 'blockInviteLinks'::"text"))::boolean, false) AND (COALESCE("messages"."content", ''::"text") ~* '(discord[.]gg|discord(app)?[.]com/invite|https?://[^ ]+/(invite|convite)/)'::"text"))))))) AND (NOT (EXISTS ( SELECT 1
   FROM ("public"."server_preferences" "p"
     JOIN "public"."messages" "recent" ON ((("recent"."channel_id" = "messages"."channel_id") AND ("recent"."author_id" = "auth"."uid"()))))
  WHERE (("p"."server_id" = ( SELECT "channels"."server_id"
           FROM "public"."channels"
          WHERE ("channels"."id" = "recent"."channel_id"))) AND (COALESCE((("p"."settings" ->> 'slowmodeSeconds'::"text"))::integer, 0) > 0) AND ("recent"."created_at" > ("now"() - "make_interval"("secs" => ((("p"."settings" ->> 'slowmodeSeconds'::"text"))::integer)::double precision)))))))));



CREATE POLICY "messages_select_member" ON "public"."messages" FOR SELECT USING ("public"."has_channel_permission"("channel_id", "public"."perm"('VIEW_CHANNEL'::"text")));



CREATE POLICY "messages_update_own_or_manage" ON "public"."messages" FOR UPDATE USING ((("author_id" = "auth"."uid"()) OR "public"."has_channel_permission"("channel_id", "public"."perm"('MANAGE_MESSAGES'::"text"))));



CREATE POLICY "overwrites_select_member" ON "public"."channel_permission_overwrites" FOR SELECT USING ("public"."is_server_member"(( SELECT "channels"."server_id"
   FROM "public"."channels"
  WHERE ("channels"."id" = "channel_permission_overwrites"."channel_id"))));



CREATE POLICY "overwrites_write_manage_roles" ON "public"."channel_permission_overwrites" USING ("public"."has_server_permission"(( SELECT "channels"."server_id"
   FROM "public"."channels"
  WHERE ("channels"."id" = "channel_permission_overwrites"."channel_id")), "public"."perm"('MANAGE_ROLES'::"text"))) WITH CHECK ("public"."has_server_permission"(( SELECT "channels"."server_id"
   FROM "public"."channels"
  WHERE ("channels"."id" = "channel_permission_overwrites"."channel_id")), "public"."perm"('MANAGE_ROLES'::"text")));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_select_authenticated" ON "public"."profiles" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "profiles_update_badges_manager_visibility" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."badge_managers" "manager"
  WHERE ("manager"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."badge_managers" "manager"
  WHERE ("manager"."user_id" = "auth"."uid"()))));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"()));



CREATE POLICY "reactions_delete_own" ON "public"."message_reactions" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "reactions_insert_own" ON "public"."message_reactions" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."has_channel_permission"(( SELECT "messages"."channel_id"
   FROM "public"."messages"
  WHERE ("messages"."id" = "message_reactions"."message_id")), "public"."perm"('ADD_REACTIONS'::"text"))));



CREATE POLICY "reactions_select" ON "public"."message_reactions" FOR SELECT USING ("public"."has_channel_permission"(( SELECT "messages"."channel_id"
   FROM "public"."messages"
  WHERE ("messages"."id" = "message_reactions"."message_id")), "public"."perm"('VIEW_CHANNEL'::"text")));



ALTER TABLE "public"."relationships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "relationships_delete_own" ON "public"."relationships" FOR DELETE USING ((("user_id" = "auth"."uid"()) OR ("target_id" = "auth"."uid"())));



CREATE POLICY "relationships_insert_own" ON "public"."relationships" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "relationships_select_own" ON "public"."relationships" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("target_id" = "auth"."uid"())));



CREATE POLICY "relationships_update_own" ON "public"."relationships" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR ("target_id" = "auth"."uid"())));



ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roles_select_member" ON "public"."roles" FOR SELECT USING ("public"."is_server_member"("server_id"));



CREATE POLICY "roles_write_manage_roles" ON "public"."roles" USING ("public"."has_server_permission"("server_id", "public"."perm"('MANAGE_ROLES'::"text"))) WITH CHECK ("public"."has_server_permission"("server_id", "public"."perm"('MANAGE_ROLES'::"text")));



ALTER TABLE "public"."sekai_direct_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sekai_direct_messages_insert_participants" ON "public"."sekai_direct_messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM "public"."friendships" "f"
  WHERE (("f"."status" = 'accepted'::"text") AND ((("f"."sender_id" = "auth"."uid"()) AND ("f"."receiver_id" = "sekai_direct_messages"."receiver_id")) OR (("f"."receiver_id" = "auth"."uid"()) AND ("f"."sender_id" = "sekai_direct_messages"."receiver_id")))))) OR (EXISTS ( SELECT 1
   FROM ("public"."members" "a"
     JOIN "public"."members" "b" USING ("server_id"))
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("b"."user_id" = "sekai_direct_messages"."receiver_id")))))));



CREATE POLICY "sekai_direct_messages_select_participants" ON "public"."sekai_direct_messages" FOR SELECT TO "authenticated" USING (((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "receiver_id")) AND ((EXISTS ( SELECT 1
   FROM "public"."friendships" "f"
  WHERE (("f"."status" = 'accepted'::"text") AND ((("f"."sender_id" = "sekai_direct_messages"."sender_id") AND ("f"."receiver_id" = "sekai_direct_messages"."receiver_id")) OR (("f"."sender_id" = "sekai_direct_messages"."receiver_id") AND ("f"."receiver_id" = "sekai_direct_messages"."sender_id")))))) OR (EXISTS ( SELECT 1
   FROM ("public"."members" "a"
     JOIN "public"."members" "b" USING ("server_id"))
  WHERE (("a"."user_id" = "sekai_direct_messages"."sender_id") AND ("b"."user_id" = "sekai_direct_messages"."receiver_id")))))));



ALTER TABLE "public"."server_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "server_assets_delete_manage" ON "public"."server_assets" FOR DELETE TO "authenticated" USING ("public"."has_permission"("server_id", 'manage_guild'::"text"));



CREATE POLICY "server_assets_insert_manage" ON "public"."server_assets" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_permission"("server_id", 'manage_guild'::"text") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "server_assets_select_member" ON "public"."server_assets" FOR SELECT TO "authenticated" USING ("public"."is_server_member"("server_id"));



ALTER TABLE "public"."server_audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "server_audit_logs_insert_manage" ON "public"."server_audit_logs" FOR INSERT TO "authenticated" WITH CHECK ((("actor_id" = "auth"."uid"()) AND ("public"."has_permission"("server_id", 'manage_guild'::"text") OR (("action" ~~ 'role.%'::"text") AND "public"."has_permission"("server_id", 'manage_roles'::"text")))));



CREATE POLICY "server_audit_logs_select_manage" ON "public"."server_audit_logs" FOR SELECT TO "authenticated" USING ("public"."has_permission"("server_id", 'view_audit_log'::"text"));



ALTER TABLE "public"."server_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "server_preferences_insert_manage" ON "public"."server_preferences" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"("server_id", 'manage_guild'::"text"));



CREATE POLICY "server_preferences_select_member" ON "public"."server_preferences" FOR SELECT TO "authenticated" USING ("public"."is_server_member"("server_id"));



CREATE POLICY "server_preferences_update_manage" ON "public"."server_preferences" FOR UPDATE TO "authenticated" USING ("public"."has_permission"("server_id", 'manage_guild'::"text")) WITH CHECK ("public"."has_permission"("server_id", 'manage_guild'::"text"));



ALTER TABLE "public"."servers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "servers_delete_owner" ON "public"."servers" FOR DELETE TO "authenticated" USING ((("owner_id" = "auth"."uid"()) OR "public"."is_sekai_admin"()));



CREATE POLICY "servers_insert_own" ON "public"."servers" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "servers_select_member" ON "public"."servers" FOR SELECT USING (("public"."is_server_member"("id") OR ("owner_id" = "auth"."uid"())));



CREATE POLICY "servers_update_manage_guild" ON "public"."servers" FOR UPDATE USING ("public"."has_server_permission"("id", "public"."perm"('MANAGE_GUILD'::"text")));



CREATE POLICY "servers_update_owner" ON "public"."servers" FOR UPDATE TO "authenticated" USING ((("owner_id" = "auth"."uid"()) OR "public"."is_sekai_admin"())) WITH CHECK ((("owner_id" = "auth"."uid"()) OR "public"."is_sekai_admin"()));



CREATE POLICY "settings_select_own" ON "public"."user_settings" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "settings_write_own" ON "public"."user_settings" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_badges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_badges_assign_manager" ON "public"."user_badges" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_badge_manager"());



CREATE POLICY "user_badges_delete_manager" ON "public"."user_badges" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."badge_managers" "manager"
  WHERE ("manager"."user_id" = "auth"."uid"()))));



CREATE POLICY "user_badges_insert_manager" ON "public"."user_badges" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."badge_managers" "manager"
  WHERE ("manager"."user_id" = "auth"."uid"()))));



CREATE POLICY "user_badges_read" ON "public"."user_badges" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "user_badges_remove_manager" ON "public"."user_badges" FOR DELETE TO "authenticated" USING ("public"."is_badge_manager"());



CREATE POLICY "user_badges_select_authenticated" ON "public"."user_badges" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "user_badges_update_manager_member_list" ON "public"."user_badges" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."badge_managers" "manager"
  WHERE ("manager"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."badge_managers" "manager"
  WHERE ("manager"."user_id" = "auth"."uid"()))));



CREATE POLICY "user_badges_update_own_member_list" ON "public"."user_badges" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_now_playing" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_now_playing_delete" ON "public"."user_now_playing" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_now_playing_insert" ON "public"."user_now_playing" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_now_playing_select" ON "public"."user_now_playing" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "user_now_playing_update" ON "public"."user_now_playing" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_theme_unlocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_theme_unlocks_read_own" ON "public"."user_theme_unlocks" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chat_poll_options";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chat_poll_votes";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chat_polls";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chat_topic_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chat_topics";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."direct_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."friend_server_invites";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."friendships";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."members";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."message_reactions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."sekai_direct_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."user_badges";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."user_now_playing";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."accept_friend_server_invite"("p_invite_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_friend_server_invite"("p_invite_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_friend_server_invite"("p_invite_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_friend_server_invite"("p_invite_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."assign_server_member_role"("p_server_id" "uuid", "p_user_id" "uuid", "p_role_id" "uuid", "p_assign" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_server_member_role"("p_server_id" "uuid", "p_user_id" "uuid", "p_role_id" "uuid", "p_assign" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."assign_server_member_role"("p_server_id" "uuid", "p_user_id" "uuid", "p_role_id" "uuid", "p_assign" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_server_member_role"("p_server_id" "uuid", "p_user_id" "uuid", "p_role_id" "uuid", "p_assign" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."cast_channel_poll_vote"("p_poll_id" "uuid", "p_option_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cast_channel_poll_vote"("p_poll_id" "uuid", "p_option_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cast_channel_poll_vote"("p_poll_id" "uuid", "p_option_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cast_channel_poll_vote"("p_poll_id" "uuid", "p_option_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."channel_effective_permissions"("p_channel_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."channel_effective_permissions"("p_channel_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."channel_effective_permissions"("p_channel_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_channel_poll"("p_channel_id" "uuid", "p_question" "text", "p_options" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_channel_poll"("p_channel_id" "uuid", "p_question" "text", "p_options" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."create_channel_poll"("p_channel_id" "uuid", "p_question" "text", "p_options" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_channel_poll"("p_channel_id" "uuid", "p_question" "text", "p_options" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_channel_topic"("p_channel_id" "uuid", "p_title" "text", "p_content" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_channel_topic"("p_channel_id" "uuid", "p_title" "text", "p_content" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_channel_topic"("p_channel_id" "uuid", "p_title" "text", "p_content" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_channel_topic"("p_channel_id" "uuid", "p_title" "text", "p_content" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_default_channels"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_default_channels"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_default_channels"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_default_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_default_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_default_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_default_server_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_default_server_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_default_server_data"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_channel_poll_results"("p_poll_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_channel_poll_results"("p_poll_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_channel_poll_results"("p_poll_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_channel_poll_results"("p_poll_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_channel_permission"("p_channel_id" "uuid", "p_bit" bigint, "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_channel_permission"("p_channel_id" "uuid", "p_bit" bigint, "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_channel_permission"("p_channel_id" "uuid", "p_bit" bigint, "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_permission"("p_server_id" "uuid", "p_permission" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_permission"("p_server_id" "uuid", "p_permission" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_permission"("p_server_id" "uuid", "p_permission" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_permission"("p_server_id" "uuid", "p_permission" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_server_permission"("p_server_id" "uuid", "p_bit" bigint, "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_server_permission"("p_server_id" "uuid", "p_bit" bigint, "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_server_permission"("p_server_id" "uuid", "p_bit" bigint, "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_badge_manager"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_badge_manager"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_badge_manager"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_badge_manager"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_sekai_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_sekai_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_sekai_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_sekai_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_server_member"("p_server_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_server_member"("p_server_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_server_member"("p_server_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_server_member"("p_server_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_server_member"("p_server_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_server_member"("p_server_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_server_member"("p_server_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_server_owner"("p_server_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_server_owner"("p_server_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_server_owner"("p_server_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."member_base_permissions"("p_server_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."member_base_permissions"("p_server_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."member_base_permissions"("p_server_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."moderate_server_member"("p_server_id" "uuid", "p_user_id" "uuid", "p_action" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."moderate_server_member"("p_server_id" "uuid", "p_user_id" "uuid", "p_action" "text", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."moderate_server_member"("p_server_id" "uuid", "p_user_id" "uuid", "p_action" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."moderate_server_member"("p_server_id" "uuid", "p_user_id" "uuid", "p_action" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."perm"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."perm"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."perm"("p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."preview_invite"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."preview_invite"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."preview_invite"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."preview_invite"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."redeem_invite"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_invite"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."redeem_invite"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_invite"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sekai_can_access_chat_image"("p_name" "text", "p_for_upload" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sekai_can_access_chat_image"("p_name" "text", "p_for_upload" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sekai_can_access_chat_image"("p_name" "text", "p_for_upload" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sekai_can_access_chat_image"("p_name" "text", "p_for_upload" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."sekai_chat_can_access_channel"("p_channel_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sekai_chat_can_access_channel"("p_channel_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sekai_chat_can_access_channel"("p_channel_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sekai_chat_can_access_channel"("p_channel_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sekai_chat_can_send_to_channel"("p_channel_id" "uuid", "p_content" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sekai_chat_can_send_to_channel"("p_channel_id" "uuid", "p_content" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sekai_chat_can_send_to_channel"("p_channel_id" "uuid", "p_content" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sekai_chat_can_send_to_channel"("p_channel_id" "uuid", "p_content" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sekai_chat_topic_slowmode_clear"("p_channel_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sekai_chat_topic_slowmode_clear"("p_channel_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sekai_chat_topic_slowmode_clear"("p_channel_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sekai_chat_topic_slowmode_clear"("p_channel_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sekai_create_profile_for_auth_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sekai_create_profile_for_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."sekai_create_profile_for_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sekai_create_profile_for_auth_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sekai_is_server_member"("p_server_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sekai_is_server_member"("p_server_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sekai_is_server_member"("p_server_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sekai_is_server_member"("p_server_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sekai_post_member_ban_message"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sekai_post_member_ban_message"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sekai_post_member_departure_message"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sekai_post_member_departure_message"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sekai_post_member_welcome_message"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sekai_post_member_welcome_message"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sekai_post_server_system_message"("p_server_id" "uuid", "p_user_id" "uuid", "p_event" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sekai_post_server_system_message"("p_server_id" "uuid", "p_user_id" "uuid", "p_event" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sekai_roll_bankai"("p_channel_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sekai_roll_bankai"("p_channel_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."sekai_roll_bankai"("p_channel_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."set_invite_expiration"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_invite_expiration"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_invite_expiration"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_server_banner"("p_server_id" "uuid", "p_banner_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_server_banner"("p_server_id" "uuid", "p_banner_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_server_banner"("p_server_id" "uuid", "p_banner_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_server_banner"("p_server_id" "uuid", "p_banner_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_server_member_nickname"("p_server_id" "uuid", "p_user_id" "uuid", "p_nickname" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_server_member_nickname"("p_server_id" "uuid", "p_user_id" "uuid", "p_nickname" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_server_member_nickname"("p_server_id" "uuid", "p_user_id" "uuid", "p_nickname" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_server_member_nickname"("p_server_id" "uuid", "p_user_id" "uuid", "p_nickname" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_server_member_timeout"("p_server_id" "uuid", "p_user_id" "uuid", "p_until" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_server_member_timeout"("p_server_id" "uuid", "p_user_id" "uuid", "p_until" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."set_server_member_timeout"("p_server_id" "uuid", "p_user_id" "uuid", "p_until" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_server_member_timeout"("p_server_id" "uuid", "p_user_id" "uuid", "p_until" timestamp with time zone) TO "service_role";


















GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."badge_managers" TO "service_role";
GRANT SELECT ON TABLE "public"."badge_managers" TO "authenticated";



GRANT ALL ON TABLE "public"."channel_categories" TO "anon";
GRANT ALL ON TABLE "public"."channel_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."channel_categories" TO "service_role";



GRANT ALL ON TABLE "public"."channel_permission_overwrites" TO "anon";
GRANT ALL ON TABLE "public"."channel_permission_overwrites" TO "authenticated";
GRANT ALL ON TABLE "public"."channel_permission_overwrites" TO "service_role";



GRANT ALL ON TABLE "public"."channels" TO "anon";
GRANT ALL ON TABLE "public"."channels" TO "authenticated";
GRANT ALL ON TABLE "public"."channels" TO "service_role";



GRANT ALL ON TABLE "public"."chat_poll_options" TO "anon";
GRANT ALL ON TABLE "public"."chat_poll_options" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_poll_options" TO "service_role";



GRANT ALL ON TABLE "public"."chat_poll_votes" TO "service_role";



GRANT ALL ON TABLE "public"."chat_polls" TO "anon";
GRANT ALL ON TABLE "public"."chat_polls" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_polls" TO "service_role";



GRANT ALL ON TABLE "public"."chat_topic_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_topic_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_topic_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_topics" TO "anon";
GRANT ALL ON TABLE "public"."chat_topics" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_topics" TO "service_role";



GRANT ALL ON TABLE "public"."custom_badges" TO "anon";
GRANT ALL ON TABLE "public"."custom_badges" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_badges" TO "service_role";



GRANT INSERT("name"),UPDATE("name") ON TABLE "public"."custom_badges" TO "authenticated";



GRANT INSERT("icon"),UPDATE("icon") ON TABLE "public"."custom_badges" TO "authenticated";



GRANT INSERT("background_color") ON TABLE "public"."custom_badges" TO "authenticated";



GRANT INSERT("foreground_color") ON TABLE "public"."custom_badges" TO "authenticated";



GRANT INSERT("image_url") ON TABLE "public"."custom_badges" TO "authenticated";



GRANT INSERT("image_path") ON TABLE "public"."custom_badges" TO "authenticated";



GRANT INSERT("created_by") ON TABLE "public"."custom_badges" TO "authenticated";



GRANT ALL ON TABLE "public"."direct_messages" TO "anon";
GRANT ALL ON TABLE "public"."direct_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."direct_messages" TO "service_role";



GRANT ALL ON TABLE "public"."dm_channels" TO "anon";
GRANT ALL ON TABLE "public"."dm_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_channels" TO "service_role";



GRANT ALL ON TABLE "public"."dm_members" TO "anon";
GRANT ALL ON TABLE "public"."dm_members" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_members" TO "service_role";



GRANT ALL ON TABLE "public"."friend_server_invites" TO "anon";
GRANT ALL ON TABLE "public"."friend_server_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."friend_server_invites" TO "service_role";



GRANT ALL ON TABLE "public"."friendships" TO "anon";
GRANT ALL ON TABLE "public"."friendships" TO "authenticated";
GRANT ALL ON TABLE "public"."friendships" TO "service_role";



GRANT ALL ON TABLE "public"."guild_bans" TO "anon";
GRANT ALL ON TABLE "public"."guild_bans" TO "authenticated";
GRANT ALL ON TABLE "public"."guild_bans" TO "service_role";



GRANT ALL ON TABLE "public"."invites" TO "anon";
GRANT ALL ON TABLE "public"."invites" TO "authenticated";
GRANT ALL ON TABLE "public"."invites" TO "service_role";



GRANT ALL ON TABLE "public"."member_roles" TO "anon";
GRANT ALL ON TABLE "public"."member_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."member_roles" TO "service_role";



GRANT ALL ON TABLE "public"."members" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."members" TO "authenticated";
GRANT ALL ON TABLE "public"."members" TO "service_role";



GRANT UPDATE("nickname") ON TABLE "public"."members" TO "authenticated";



GRANT UPDATE("avatar_url") ON TABLE "public"."members" TO "authenticated";



GRANT UPDATE("banner_url") ON TABLE "public"."members" TO "authenticated";



GRANT UPDATE("banner_position_x") ON TABLE "public"."members" TO "authenticated";



GRANT UPDATE("banner_position_y") ON TABLE "public"."members" TO "authenticated";



GRANT UPDATE("avatar_position_x") ON TABLE "public"."members" TO "authenticated";



GRANT UPDATE("avatar_position_y") ON TABLE "public"."members" TO "authenticated";



GRANT UPDATE("avatar_zoom") ON TABLE "public"."members" TO "authenticated";



GRANT UPDATE("banner_zoom") ON TABLE "public"."members" TO "authenticated";



GRANT UPDATE("member_list_banner_url") ON TABLE "public"."members" TO "authenticated";



GRANT UPDATE("member_list_banner_position_x") ON TABLE "public"."members" TO "authenticated";



GRANT UPDATE("member_list_banner_position_y") ON TABLE "public"."members" TO "authenticated";



GRANT UPDATE("member_list_banner_zoom") ON TABLE "public"."members" TO "authenticated";



GRANT ALL ON TABLE "public"."message_reactions" TO "anon";
GRANT ALL ON TABLE "public"."message_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT UPDATE("show_badges_in_member_list") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."relationships" TO "anon";
GRANT ALL ON TABLE "public"."relationships" TO "authenticated";
GRANT ALL ON TABLE "public"."relationships" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."sekai_direct_messages" TO "anon";
GRANT ALL ON TABLE "public"."sekai_direct_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."sekai_direct_messages" TO "service_role";



GRANT ALL ON TABLE "public"."server_assets" TO "anon";
GRANT ALL ON TABLE "public"."server_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."server_assets" TO "service_role";



GRANT ALL ON TABLE "public"."server_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."server_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."server_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."server_preferences" TO "anon";
GRANT ALL ON TABLE "public"."server_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."server_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."servers" TO "anon";
GRANT ALL ON TABLE "public"."servers" TO "authenticated";
GRANT ALL ON TABLE "public"."servers" TO "service_role";



GRANT ALL ON TABLE "public"."user_badges" TO "anon";
GRANT ALL ON TABLE "public"."user_badges" TO "authenticated";
GRANT ALL ON TABLE "public"."user_badges" TO "service_role";



GRANT INSERT("user_id") ON TABLE "public"."user_badges" TO "authenticated";



GRANT INSERT("badge_id") ON TABLE "public"."user_badges" TO "authenticated";



GRANT INSERT("assigned_by") ON TABLE "public"."user_badges" TO "authenticated";



GRANT UPDATE("visible_in_profile") ON TABLE "public"."user_badges" TO "authenticated";



GRANT UPDATE("visible_in_member_list") ON TABLE "public"."user_badges" TO "authenticated";



GRANT ALL ON TABLE "public"."user_now_playing" TO "anon";
GRANT ALL ON TABLE "public"."user_now_playing" TO "authenticated";
GRANT ALL ON TABLE "public"."user_now_playing" TO "service_role";



GRANT ALL ON TABLE "public"."user_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_settings" TO "service_role";



GRANT ALL ON TABLE "public"."user_theme_unlocks" TO "anon";
GRANT ALL ON TABLE "public"."user_theme_unlocks" TO "authenticated";
GRANT ALL ON TABLE "public"."user_theme_unlocks" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































