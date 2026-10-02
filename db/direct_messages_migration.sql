-- Execute no SQL Editor do Supabase depois de social_invites_migration.sql.
-- Nome exclusivo para não conflitar com tabelas direct_messages de outros schemas/versões.
create table if not exists public.sekai_direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  constraint sekai_direct_messages_not_self check (sender_id <> receiver_id)
);
alter table public.sekai_direct_messages add column if not exists attachment_url text;
alter table public.sekai_direct_messages drop constraint if exists sekai_direct_messages_content_check;
alter table public.sekai_direct_messages add constraint sekai_direct_messages_content_check
  check (length(content) between 1 and 4000 or (length(content) = 0 and attachment_url is not null));
create index if not exists sekai_direct_messages_pair_created on public.sekai_direct_messages
  (least(sender_id, receiver_id), greatest(sender_id, receiver_id), created_at);
alter table public.sekai_direct_messages enable row level security;
grant select, insert on public.sekai_direct_messages to authenticated;
drop policy if exists sekai_direct_messages_select_participants on public.sekai_direct_messages;
create policy sekai_direct_messages_select_participants on public.sekai_direct_messages for select to authenticated using (
  (auth.uid() = sender_id or auth.uid() = receiver_id) and (
    exists (select 1 from public.friendships f where f.status = 'accepted' and
      ((f.sender_id = sekai_direct_messages.sender_id and f.receiver_id = sekai_direct_messages.receiver_id) or
       (f.sender_id = sekai_direct_messages.receiver_id and f.receiver_id = sekai_direct_messages.sender_id)))
    or exists (select 1 from public.members a join public.members b using (server_id)
      where a.user_id = sekai_direct_messages.sender_id and b.user_id = sekai_direct_messages.receiver_id)
  )
);
drop policy if exists sekai_direct_messages_insert_participants on public.sekai_direct_messages;
create policy sekai_direct_messages_insert_participants on public.sekai_direct_messages for insert to authenticated with check (
  sender_id = auth.uid() and (exists (
    select 1 from public.friendships f where f.status = 'accepted' and
      ((f.sender_id = auth.uid() and f.receiver_id = sekai_direct_messages.receiver_id) or
       (f.receiver_id = auth.uid() and f.sender_id = sekai_direct_messages.receiver_id))
  ) or exists (select 1 from public.members a join public.members b using (server_id)
    where a.user_id = auth.uid() and b.user_id = sekai_direct_messages.receiver_id))
);
do $$ begin
  alter publication supabase_realtime add table public.sekai_direct_messages;
exception when duplicate_object then null;
end $$;

-- Imagens dos chats (servidor e DM), em bucket público para exibir os anexos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];
drop policy if exists sekai_chat_images_read on storage.objects;
create policy sekai_chat_images_read on storage.objects for select to public using (bucket_id = 'chat-images');
drop policy if exists sekai_chat_images_upload on storage.objects;
create policy sekai_chat_images_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'chat-images' and (storage.foldername(name))[3] = auth.uid()::text and (
    ((storage.foldername(name))[1] = 'channels' and exists (
      select 1 from public.channels c join public.members m on m.server_id = c.server_id
      where c.id::text = (storage.foldername(name))[2] and m.user_id = auth.uid()
    )) or
    ((storage.foldername(name))[1] = 'dm' and exists (
      select 1 from public.profiles other_profile
      where other_profile.id::text = (storage.foldername(name))[2]
        and (exists (select 1 from public.friendships f where f.status = 'accepted' and
          ((f.sender_id = auth.uid() and f.receiver_id = other_profile.id) or
           (f.receiver_id = auth.uid() and f.sender_id = other_profile.id)))
          or exists (select 1 from public.members a join public.members b using (server_id)
            where a.user_id = auth.uid() and b.user_id = other_profile.id))
    ))
  )
);
