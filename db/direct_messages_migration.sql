-- Execute no SQL Editor do Supabase depois de social_invites_migration.sql.
create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  constraint direct_messages_not_self check (sender_id <> receiver_id)
);
create index if not exists direct_messages_pair_created on public.direct_messages
  (least(sender_id, receiver_id), greatest(sender_id, receiver_id), created_at);
alter table public.direct_messages enable row level security;
grant select, insert on public.direct_messages to authenticated;
drop policy if exists direct_messages_select_friends on public.direct_messages;
drop policy if exists direct_messages_select_participants on public.direct_messages;
create policy direct_messages_select_participants on public.direct_messages for select to authenticated using (
  (auth.uid() = sender_id or auth.uid() = receiver_id) and (
    exists (select 1 from public.friendships f where f.status = 'accepted' and
      ((f.sender_id = direct_messages.sender_id and f.receiver_id = direct_messages.receiver_id) or
       (f.sender_id = direct_messages.receiver_id and f.receiver_id = direct_messages.sender_id)))
    or exists (select 1 from public.members a join public.members b using (server_id)
      where a.user_id = direct_messages.sender_id and b.user_id = direct_messages.receiver_id)
  )
);
drop policy if exists direct_messages_insert_friends on public.direct_messages;
create policy direct_messages_insert_friends on public.direct_messages for insert to authenticated with check (
  sender_id = auth.uid() and (exists (
    select 1 from public.friendships f where f.status = 'accepted' and
      ((f.sender_id = auth.uid() and f.receiver_id = direct_messages.receiver_id) or
       (f.receiver_id = auth.uid() and f.sender_id = direct_messages.receiver_id))
  ) or exists (select 1 from public.members a join public.members b using (server_id)
    where a.user_id = auth.uid() and b.user_id = direct_messages.receiver_id))
);
do $$ begin
  alter publication supabase_realtime add table public.direct_messages;
exception when duplicate_object then null;
end $$;
