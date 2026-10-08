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

drop policy if exists sekai_chat_images_read on storage.objects;
create policy sekai_chat_images_read
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-images'
  and (
    (
      split_part(name, '/', 1) = 'channels'
      and exists (
        select 1 from public.channels c
        where c.id::text = split_part(name, '/', 2)
          and public.is_server_member(c.server_id)
      )
    )
    or
    (
      split_part(name, '/', 1) = 'dm'
      and auth.uid()::text in (split_part(name, '/', 2), split_part(name, '/', 3))
      and exists (
        select 1 from public.profiles recipient
        where recipient.id::text = split_part(name, '/', 2)
          and recipient.id::text <> split_part(name, '/', 3)
          and (
            exists (
              select 1 from public.friendships f
              where f.status = 'accepted'
                and (
                  (f.sender_id::text = split_part(name, '/', 2) and f.receiver_id::text = split_part(name, '/', 3))
                  or (f.receiver_id::text = split_part(name, '/', 2) and f.sender_id::text = split_part(name, '/', 3))
                )
            )
            or exists (
              select 1 from public.members a
              join public.members b using (server_id)
              where a.user_id::text = split_part(name, '/', 2)
                and b.user_id::text = split_part(name, '/', 3)
            )
          )
      )
    )
  )
);

drop policy if exists sekai_chat_images_upload on storage.objects;
create policy sekai_chat_images_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-images'
  and split_part(name, '/', 3) = auth.uid()::text
  and (
    (
      split_part(name, '/', 1) = 'channels'
      and exists (
        select 1 from public.channels c
        where c.id::text = split_part(name, '/', 2)
          and public.is_server_member(c.server_id)
      )
    )
    or
    (
      split_part(name, '/', 1) = 'dm'
      and exists (
        select 1 from public.profiles recipient
        where recipient.id::text = split_part(name, '/', 2)
          and recipient.id <> auth.uid()
          and (
            exists (
              select 1 from public.friendships f
              where f.status = 'accepted'
                and (
                  (f.sender_id = auth.uid() and f.receiver_id = recipient.id)
                  or (f.receiver_id = auth.uid() and f.sender_id = recipient.id)
                )
            )
            or exists (
              select 1 from public.members mine
              join public.members theirs using (server_id)
              where mine.user_id = auth.uid()
                and theirs.user_id = recipient.id
            )
          )
      )
    )
  )
);

-- Soundboard uses private Realtime channels. Only current server members can
-- subscribe to them or broadcast a sound event.
drop policy if exists sekai_soundboard_members_receive on realtime.messages;
create policy sekai_soundboard_members_receive
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and realtime.topic() like 'sekai-soundboard:%'
  and exists (
    select 1 from public.members m
    where m.server_id::text = split_part(realtime.topic(), ':', 2)
      and m.user_id = auth.uid()
  )
);

drop policy if exists sekai_soundboard_members_send on realtime.messages;
create policy sekai_soundboard_members_send
on realtime.messages for insert to authenticated
with check (
  extension = 'broadcast'
  and realtime.topic() like 'sekai-soundboard:%'
  and exists (
    select 1 from public.members m
    where m.server_id::text = split_part(realtime.topic(), ':', 2)
      and m.user_id = auth.uid()
  )
);

commit;
