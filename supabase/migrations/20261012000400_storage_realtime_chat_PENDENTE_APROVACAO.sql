-- PENDENTE DE APROVACAO DO DONO. Requer migrations pendentes 00100, 00200 e 00300.
-- Define buckets/policies de Storage, valida tamanho de mensagens, aplica limite
-- transacional de envio e restringe o broadcast privado do soundboard.

begin;
set local search_path = pg_catalog, public, auth, storage, realtime, pg_temp;

-- Elimina policies antigas e permissivas com predicate explicitamente atrelado
-- a um dos buckets desta aplicacao. Apenas nomes lidos do catalogo sao SQL identifiers.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
      from pg_catalog.pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and concat_ws(' ', qual, with_check) ~* '(avatars|banners|server-icons|server-assets|chat-images)'
  loop
    execute pg_catalog.format('drop policy %I on storage.objects', v_policy.policyname);
  end loop;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 8388608, array['image/jpeg','image/png','image/webp','image/gif']),
  ('banners', 'banners', true, 8388608, array['image/jpeg','image/png','image/webp','image/gif']),
  ('server-icons', 'server-icons', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif']),
  ('server-assets', 'server-assets', true, 8388608, array['image/jpeg','image/png','image/webp','image/gif','audio/mpeg','audio/ogg','audio/wav','audio/webm']),
  ('chat-images', 'chat-images', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy sekai_avatars_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  and coalesce(metadata ->> 'mimetype', '') = any(array['image/jpeg','image/png','image/webp','image/gif'])
  and lower(name) !~ '\.(svg|svgz|html?|xhtml)$');
create policy sekai_avatars_update_own on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  and coalesce(metadata ->> 'mimetype', '') = any(array['image/jpeg','image/png','image/webp','image/gif'])
  and lower(name) !~ '\.(svg|svgz|html?|xhtml)$');
create policy sekai_avatars_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy sekai_banners_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text
  and coalesce(metadata ->> 'mimetype', '') = any(array['image/jpeg','image/png','image/webp','image/gif'])
  and lower(name) !~ '\.(svg|svgz|html?|xhtml)$');
create policy sekai_banners_update_own on storage.objects for update to authenticated
using (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text
  and coalesce(metadata ->> 'mimetype', '') = any(array['image/jpeg','image/png','image/webp','image/gif'])
  and lower(name) !~ '\.(svg|svgz|html?|xhtml)$');
create policy sekai_banners_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text);

create policy sekai_server_icons_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'server-icons'
  and (storage.foldername(name))[2] = auth.uid()::text
  and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.has_permission(((storage.foldername(name))[1])::uuid, 'manage_guild') else false end
  and coalesce(metadata ->> 'mimetype', '') = any(array['image/jpeg','image/png','image/webp','image/gif'])
  and lower(name) !~ '\.(svg|svgz|html?|xhtml)$');
create policy sekai_server_icons_update_own on storage.objects for update to authenticated
using (bucket_id = 'server-icons' and (storage.foldername(name))[2] = auth.uid()::text)
with check (bucket_id = 'server-icons'
  and (storage.foldername(name))[2] = auth.uid()::text
  and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.has_permission(((storage.foldername(name))[1])::uuid, 'manage_guild') else false end
  and coalesce(metadata ->> 'mimetype', '') = any(array['image/jpeg','image/png','image/webp','image/gif'])
  and lower(name) !~ '\.(svg|svgz|html?|xhtml)$');
create policy sekai_server_icons_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'server-icons' and (storage.foldername(name))[2] = auth.uid()::text
  and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.has_permission(((storage.foldername(name))[1])::uuid, 'manage_guild') else false end);

-- server-assets usa /<server UUID>/<uploader UUID>/...; icones de cargo tambem
-- carregam o UUID do cargo no path, para a policy aplicar a hierarquia.
create policy sekai_server_assets_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'server-assets' and (storage.foldername(name))[2] = auth.uid()::text
  and case
    when (storage.foldername(name))[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
    when (storage.foldername(name))[3] in ('role-icons','role-insignias')
      then case when (storage.foldername(name))[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.sekai_can_manage_role(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[4])::uuid) else false end
    else public.has_permission(((storage.foldername(name))[1])::uuid, 'manage_guild')
  end
  and coalesce(metadata ->> 'mimetype', '') = any(case
    when (storage.foldername(name))[3] in ('role-icons','role-insignias','banner')
      then array['image/jpeg','image/png','image/webp','image/gif']
    when (storage.foldername(name))[3] = 'sound'
      then array['audio/mpeg','audio/ogg','audio/wav','audio/webm']
    else array['image/jpeg','image/png','image/webp','image/gif'] end)
  and lower(name) !~ '\.(svg|svgz|html?|xhtml)$');
create policy sekai_server_assets_update_own on storage.objects for update to authenticated
using (bucket_id = 'server-assets' and (storage.foldername(name))[2] = auth.uid()::text)
with check (bucket_id = 'server-assets' and (storage.foldername(name))[2] = auth.uid()::text
  and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then case when (storage.foldername(name))[3] in ('role-icons','role-insignias')
      then case when (storage.foldername(name))[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.sekai_can_manage_role(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[4])::uuid) else false end
      else public.has_permission(((storage.foldername(name))[1])::uuid, 'manage_guild') end
    else false end
  and coalesce(metadata ->> 'mimetype', '') = any(case
    when (storage.foldername(name))[3] in ('role-icons','role-insignias','banner')
      then array['image/jpeg','image/png','image/webp','image/gif']
    when (storage.foldername(name))[3] = 'sound'
      then array['audio/mpeg','audio/ogg','audio/wav','audio/webm']
    else array['image/jpeg','image/png','image/webp','image/gif'] end)
  and lower(name) !~ '\.(svg|svgz|html?|xhtml)$');
create policy sekai_server_assets_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'server-assets' and (storage.foldername(name))[2] = auth.uid()::text
  and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then case when (storage.foldername(name))[3] in ('role-icons','role-insignias')
      then case when (storage.foldername(name))[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.sekai_can_manage_role(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[4])::uuid) else false end
      else public.has_permission(((storage.foldername(name))[1])::uuid, 'manage_guild') end
    else false end);

-- Predicado antes das policies que o referenciam (CREATE POLICY valida a assinatura agora).
create or replace function public.sekai_can_access_chat_image(p_name text, p_for_upload boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_parts text[] := string_to_array(coalesce(p_name, ''), '/');
  v_channel_id uuid;
begin
  if auth.uid() is null or char_length(coalesce(p_name, '')) > 1024 or array_length(v_parts, 1) <> 4 then return false; end if;
  if v_parts[1] = 'channels' then
    if v_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (p_for_upload and v_parts[3] <> auth.uid()::text) then return false; end if;
    v_channel_id := v_parts[2]::uuid;
    return exists (
      select 1 from public.channels c
      join public.members m on m.server_id = c.server_id and m.user_id = auth.uid()
      where c.id = v_channel_id and not coalesce(m.is_banned, false)
        and public.has_channel_permission(c.id, public.perm('VIEW_CHANNEL'))
        and not public.sekai_is_member_timed_out(c.server_id, auth.uid())
    );
  elsif v_parts[1] = 'dm' then
    if v_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or v_parts[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (p_for_upload and v_parts[3] <> auth.uid()::text)
       or (not p_for_upload and auth.uid()::text not in (v_parts[2], v_parts[3])) then return false; end if;
    return exists (
      select 1 from public.profiles recipient
      join public.profiles sender on sender.id::text = v_parts[3]
      where recipient.id::text = v_parts[2] and recipient.id <> sender.id
        and (
          exists (select 1 from public.friendships f where f.status = 'accepted'
            and ((f.sender_id = recipient.id and f.receiver_id = sender.id)
              or (f.receiver_id = recipient.id and f.sender_id = sender.id)))
          or exists (select 1 from public.members a join public.members b using (server_id)
            where a.user_id = recipient.id and b.user_id = sender.id
              and not coalesce(a.is_banned, false) and not coalesce(b.is_banned, false))
        )
    );
  end if;
  return false;
end;
$$;
revoke all on function public.sekai_can_access_chat_image(text, boolean) from public, anon;
grant execute on function public.sekai_can_access_chat_image(text, boolean) to authenticated;

create policy sekai_chat_images_read on storage.objects for select to authenticated
using (bucket_id = 'chat-images' and public.sekai_can_access_chat_image(name, false));
create policy sekai_chat_images_upload on storage.objects for insert to authenticated
with check (bucket_id = 'chat-images' and public.sekai_can_access_chat_image(name, true)
  and coalesce(metadata ->> 'mimetype', '') = any(array['image/jpeg','image/png','image/webp','image/gif'])
  and lower(name) !~ '\.(svg|svgz|html?|xhtml)$');
create policy sekai_chat_images_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'chat-images' and (storage.foldername(name))[3] = auth.uid()::text
  and public.sekai_can_access_chat_image(name, false));

-- O banco continua validando tamanho/ritmo mesmo com gravações diretas do cliente.
-- Garantia de leitura Realtime para DMs: exatamente os dois participantes e
-- apenas enquanto amizade aceita ou servidor compartilhado existir.
drop policy if exists sekai_direct_messages_select_participants on public.sekai_direct_messages;
create policy sekai_direct_messages_select_participants on public.sekai_direct_messages
  for select to authenticated using (
    (auth.uid() = sender_id or auth.uid() = receiver_id)
    and (
      exists (select 1 from public.friendships f where f.status = 'accepted'
        and ((f.sender_id = sekai_direct_messages.sender_id and f.receiver_id = sekai_direct_messages.receiver_id)
          or (f.sender_id = sekai_direct_messages.receiver_id and f.receiver_id = sekai_direct_messages.sender_id)))
      or exists (select 1 from public.members a join public.members b using (server_id)
        where a.user_id = sekai_direct_messages.sender_id and b.user_id = sekai_direct_messages.receiver_id
          and not coalesce(a.is_banned, false) and not coalesce(b.is_banned, false))
    )
  );

create or replace function public.sekai_can_use_soundboard(p_server_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_server_id uuid;
begin
  if auth.uid() is null or p_server_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  v_server_id := p_server_id::uuid;
  return exists (select 1 from public.members m
    where m.server_id = v_server_id and m.user_id = auth.uid() and not coalesce(m.is_banned, false))
    and not public.sekai_is_member_timed_out(v_server_id, auth.uid());
end;
$$;
revoke all on function public.sekai_can_use_soundboard(text) from public, anon;
grant execute on function public.sekai_can_use_soundboard(text) to authenticated;

alter table public.messages drop constraint if exists messages_content_max_length;
alter table public.messages add constraint messages_content_max_length
  check (char_length(coalesce(content, '')) <= 4000) not valid;
alter table public.direct_messages drop constraint if exists direct_messages_content_max_length;
alter table public.direct_messages add constraint direct_messages_content_max_length
  check (char_length(coalesce(content, '')) <= 4000) not valid;

create or replace function public.sekai_limit_chat_send()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_actor uuid;
  v_scope text;
  v_count bigint;
begin
  if char_length(coalesce(new.content, '')) > 4000 then
    raise exception 'Mensagem muito longa' using errcode = '22023';
  end if;
  if tg_op <> 'INSERT' then return new; end if;

  if tg_table_name = 'messages' then
    v_actor := new.author_id;
    v_scope := new.channel_id::text;
    if auth.uid() is null or v_actor <> auth.uid() then return new; end if;
    perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':channel:' || v_scope, 8241));
    select count(*) into v_count from public.messages m
     where m.author_id = v_actor and m.channel_id = new.channel_id
       and m.created_at > clock_timestamp() - interval '10 seconds';
  elsif tg_table_name = 'sekai_direct_messages' then
    v_actor := new.sender_id;
    if auth.uid() is null or v_actor <> auth.uid() then return new; end if;
    perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':dm', 8241));
    select count(*) into v_count from public.sekai_direct_messages m
     where m.sender_id = v_actor and m.created_at > clock_timestamp() - interval '10 seconds';
  elsif tg_table_name = 'direct_messages' then
    v_actor := new.author_id;
    v_scope := new.dm_channel_id::text;
    if auth.uid() is null or v_actor <> auth.uid() then return new; end if;
    perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':legacy-dm:' || coalesce(v_scope, ''), 8241));
    select count(*) into v_count from public.direct_messages m
     where m.author_id = v_actor and m.created_at > clock_timestamp() - interval '10 seconds';
  else
    return new;
  end if;
  if v_count >= 5 then raise exception 'Limite de envio excedido' using errcode = 'P0001'; end if;
  return new;
end;
$$;
drop trigger if exists sekai_limit_chat_messages on public.messages;
create trigger sekai_limit_chat_messages before insert on public.messages
for each row execute function public.sekai_limit_chat_send();
drop trigger if exists sekai_validate_chat_message_length on public.messages;
create trigger sekai_validate_chat_message_length before update of content on public.messages
for each row execute function public.sekai_limit_chat_send();
drop trigger if exists sekai_limit_direct_messages on public.sekai_direct_messages;
create trigger sekai_limit_direct_messages before insert on public.sekai_direct_messages
for each row execute function public.sekai_limit_chat_send();
drop trigger if exists sekai_validate_direct_message_length on public.sekai_direct_messages;
create trigger sekai_validate_direct_message_length before update of content on public.sekai_direct_messages
for each row execute function public.sekai_limit_chat_send();
drop trigger if exists sekai_limit_legacy_direct_messages on public.direct_messages;
create trigger sekai_limit_legacy_direct_messages before insert on public.direct_messages
for each row execute function public.sekai_limit_chat_send();
drop trigger if exists sekai_validate_legacy_direct_message_length on public.direct_messages;
create trigger sekai_validate_legacy_direct_message_length before update of content on public.direct_messages
for each row execute function public.sekai_limit_chat_send();
revoke all on function public.sekai_limit_chat_send() from public, anon, authenticated;

-- Broadcast privado do soundboard: somente membros atuais podem ler/publicar.
drop policy if exists sekai_soundboard_members_receive on realtime.messages;
create policy sekai_soundboard_members_receive on realtime.messages for select to authenticated
using (extension = 'broadcast'
  and realtime.topic() ~ '^sekai-soundboard:[0-9a-fA-F-]{36}$'
  and public.sekai_can_use_soundboard(split_part(realtime.topic(), ':', 2)));
drop policy if exists sekai_soundboard_members_send on realtime.messages;
create policy sekai_soundboard_members_send on realtime.messages for insert to authenticated
with check (extension = 'broadcast'
  and realtime.topic() ~ '^sekai-soundboard:[0-9a-fA-F-]{36}$'
  and public.sekai_can_use_soundboard(split_part(realtime.topic(), ':', 2)));

grant execute on function public.sekai_limit_chat_send() to service_role;
commit;
