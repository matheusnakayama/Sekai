-- Recursos do compositor: anexos, tópicos e enquetes nos canais de texto.
-- Execute após sekai_schema.sql, project_integrity_upgrade.sql e chat_images_and_soundboard_migration.sql.

begin;

-- Mantém compatibilidade com bancos que ainda não receberam essas colunas.
alter table public.members
  add column if not exists is_banned boolean not null default false,
  add column if not exists communication_disabled_until timestamptz;

create or replace function public.sekai_chat_can_access_channel(p_channel_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.channels c
    join public.members m on m.server_id = c.server_id
    where c.id = p_channel_id and m.user_id = auth.uid() and coalesce(m.is_banned, false) = false
  );
$$;

create or replace function public.sekai_chat_can_send_to_channel(p_channel_id uuid, p_content text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
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

create table if not exists public.chat_topics (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  title text not null check (length(title) between 1 and 100),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_topic_messages (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.chat_topics(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);

create or replace function public.sekai_chat_topic_slowmode_clear(p_channel_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
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

create table if not exists public.chat_polls (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  question text not null check (length(question) between 1 and 200),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  votes_updated_at timestamptz not null default now()
);
alter table public.chat_polls add column if not exists votes_updated_at timestamptz not null default now();

create table if not exists public.chat_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.chat_polls(id) on delete cascade,
  label text not null check (length(label) between 1 and 100),
  position integer not null,
  unique (poll_id, position)
);

create table if not exists public.chat_poll_votes (
  poll_id uuid not null references public.chat_polls(id) on delete cascade,
  option_id uuid not null references public.chat_poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

alter table public.messages add column if not exists topic_id uuid references public.chat_topics(id) on delete set null;
alter table public.messages add column if not exists poll_id uuid references public.chat_polls(id) on delete set null;
alter table public.messages add column if not exists attachment_name text;
alter table public.messages add column if not exists attachment_mime_type text;

create index if not exists chat_topics_channel_created_idx on public.chat_topics(channel_id, created_at desc);
create index if not exists chat_topic_messages_topic_created_idx on public.chat_topic_messages(topic_id, created_at);
create index if not exists chat_polls_channel_created_idx on public.chat_polls(channel_id, created_at desc);
create index if not exists chat_poll_options_poll_position_idx on public.chat_poll_options(poll_id, position);

alter table public.chat_topics enable row level security;
alter table public.chat_topic_messages enable row level security;
alter table public.chat_polls enable row level security;
alter table public.chat_poll_options enable row level security;
alter table public.chat_poll_votes enable row level security;

grant select on public.chat_topics, public.chat_topic_messages, public.chat_polls, public.chat_poll_options to authenticated;
grant insert on public.chat_topic_messages to authenticated;
revoke all on public.chat_poll_votes from anon, authenticated;

drop policy if exists chat_topics_select_members on public.chat_topics;
create policy chat_topics_select_members on public.chat_topics for select to authenticated
using (public.sekai_chat_can_access_channel(channel_id));

drop policy if exists chat_topic_messages_select_members on public.chat_topic_messages;
create policy chat_topic_messages_select_members on public.chat_topic_messages for select to authenticated
using (exists (select 1 from public.chat_topics t where t.id = topic_id and public.sekai_chat_can_access_channel(t.channel_id)));

drop policy if exists chat_topic_messages_insert_members on public.chat_topic_messages;
create policy chat_topic_messages_insert_members on public.chat_topic_messages for insert to authenticated
with check (
  author_id = auth.uid()
  and exists (select 1 from public.chat_topics t where t.id = topic_id and public.sekai_chat_can_send_to_channel(t.channel_id, content))
  and exists (select 1 from public.chat_topics t where t.id = topic_id and public.sekai_chat_topic_slowmode_clear(t.channel_id))
);

drop policy if exists chat_polls_select_members on public.chat_polls;
create policy chat_polls_select_members on public.chat_polls for select to authenticated
using (public.sekai_chat_can_access_channel(channel_id));

drop policy if exists chat_poll_options_select_members on public.chat_poll_options;
create policy chat_poll_options_select_members on public.chat_poll_options for select to authenticated
using (exists (select 1 from public.chat_polls p where p.id = poll_id and public.sekai_chat_can_access_channel(p.channel_id)));

drop policy if exists chat_poll_votes_select_members on public.chat_poll_votes;

create or replace function public.create_channel_topic(p_channel_id uuid, p_title text, p_content text default null)
returns table(topic_id uuid, message_id uuid)
language plpgsql security definer
set search_path = public, pg_temp
as $$
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

create or replace function public.create_channel_poll(p_channel_id uuid, p_question text, p_options text[])
returns table(poll_id uuid, message_id uuid)
language plpgsql security definer
set search_path = public, pg_temp
as $$
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

create or replace function public.cast_channel_poll_vote(p_poll_id uuid, p_option_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
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

create or replace function public.get_channel_poll_results(p_poll_id uuid)
returns table(option_id uuid, vote_count bigint, voted_by_me boolean)
language sql stable security definer
set search_path = public, pg_temp
as $$
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

revoke all on function public.sekai_chat_can_access_channel(uuid) from public;
revoke all on function public.sekai_chat_can_send_to_channel(uuid, text) from public;
revoke all on function public.sekai_chat_topic_slowmode_clear(uuid) from public;
revoke all on function public.create_channel_topic(uuid, text, text) from public;
revoke all on function public.create_channel_poll(uuid, text, text[]) from public;
revoke all on function public.cast_channel_poll_vote(uuid, uuid) from public;
revoke all on function public.get_channel_poll_results(uuid) from public;
grant execute on function public.sekai_chat_can_access_channel(uuid) to authenticated;
grant execute on function public.sekai_chat_can_send_to_channel(uuid, text) to authenticated;
grant execute on function public.sekai_chat_topic_slowmode_clear(uuid) to authenticated;
grant execute on function public.create_channel_topic(uuid, text, text) to authenticated;
grant execute on function public.create_channel_poll(uuid, text, text[]) to authenticated;
grant execute on function public.cast_channel_poll_vote(uuid, uuid) to authenticated;
grant execute on function public.get_channel_poll_results(uuid) to authenticated;

-- O bucket privado também passa a armazenar documentos anexados nos canais.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 10485760, null)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = null;

do $$
begin
  alter publication supabase_realtime add table public.chat_topics;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.chat_topic_messages;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.chat_polls;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.chat_poll_options;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.chat_poll_votes;
exception when duplicate_object then null;
end $$;

commit;
