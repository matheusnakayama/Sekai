-- Sekai: corrige o envio de imagens em canais/DMs e protege o soundboard.
-- Execute no SQL Editor depois das migrações-base do Sekai.

begin;

-- O bucket contém imagens de conversas diretas, portanto deve continuar privado.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-images',
  'chat-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Algumas bases antigas têm overloads conflitantes de is_server_member().
-- Estas funções isolam as verificações e ignoram RLS internamente para evitar
-- recursão ao consultar members/channels dentro de outra policy.
create or replace function public.sekai_is_server_member(p_server_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.members m
    where m.server_id::text = p_server_id
      and m.user_id = auth.uid()
  );
$$;

revoke all on function public.sekai_is_server_member(text) from public;
grant execute on function public.sekai_is_server_member(text) to authenticated;

create or replace function public.sekai_can_access_chat_image(p_name text, p_for_upload boolean)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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

revoke all on function public.sekai_can_access_chat_image(text, boolean) from public;
grant execute on function public.sekai_can_access_chat_image(text, boolean) to authenticated;

drop policy if exists sekai_chat_images_read on storage.objects;
create policy sekai_chat_images_read
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-images'
  and public.sekai_can_access_chat_image(name, false)
);

drop policy if exists sekai_chat_images_upload on storage.objects;
create policy sekai_chat_images_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-images'
  and public.sekai_can_access_chat_image(name, true)
);

-- Soundboard uses private Realtime channels. Only current server members can
-- subscribe to them or broadcast a sound event.
drop policy if exists sekai_soundboard_members_receive on realtime.messages;
create policy sekai_soundboard_members_receive
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and realtime.topic() like 'sekai-soundboard:%'
  and public.sekai_is_server_member(split_part(realtime.topic(), ':', 2))
);

drop policy if exists sekai_soundboard_members_send on realtime.messages;
create policy sekai_soundboard_members_send
on realtime.messages for insert to authenticated
with check (
  extension = 'broadcast'
  and realtime.topic() like 'sekai-soundboard:%'
  and public.sekai_is_server_member(split_part(realtime.topic(), ':', 2))
);

commit;
