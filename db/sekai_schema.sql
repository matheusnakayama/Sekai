-- =========================================================
-- SEKAI — Schema v2 (Supabase / PostgreSQL)
-- Segurança (RLS), Cargos com hierarquia, Perfil customizável
-- =========================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------
-- PROFILES (dados públicos do usuário — ligado ao Supabase Auth)
-- Customização: avatar, banner, bio, status customizado
-- ---------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  avatar_url text,
  banner_url text,
  bio text check (char_length(bio) <= 190),
  custom_status text check (char_length(custom_status) <= 128),
  status text default 'offline' check (status in ('online','idle','dnd','offline')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- SERVERS (Guilds)
-- ---------------------------------------------------------
create table public.servers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  icon_url text,
  owner_id uuid references public.profiles(id) on delete cascade,
  invite_code text unique default substr(md5(random()::text), 1, 8),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- ROLES — hierarquia via "position" (maior = mais poder, dono sempre acima)
-- Chaves de permissão padronizadas dentro de "permissions" (jsonb boolean map):
--   manage_server, manage_roles, manage_channels, manage_messages,
--   kick_members, ban_members, mute_members, send_messages, connect_voice
-- ---------------------------------------------------------
create table public.roles (
  id uuid primary key default uuid_generate_v4(),
  server_id uuid references public.servers(id) on delete cascade,
  name text not null,
  color text default '#99aab5',
  permissions jsonb not null default '{
    "manage_server": false, "manage_roles": false, "manage_channels": false,
    "manage_messages": false, "kick_members": false, "ban_members": false,
    "mute_members": false, "send_messages": true, "connect_voice": true
  }',
  is_default boolean default false,   -- cargo "@everyone", 1 por servidor
  position int not null default 0,    -- hierarquia: maior número = mais permissões
  created_at timestamptz default now(),
  unique (server_id, name)
);

-- Garante um único cargo default por servidor
create unique index one_default_role_per_server
  on public.roles (server_id) where (is_default = true);

-- ---------------------------------------------------------
-- MEMBERS
-- ---------------------------------------------------------
create table public.members (
  id uuid primary key default uuid_generate_v4(),
  server_id uuid references public.servers(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role_id uuid references public.roles(id) on delete set null,
  nickname text,
  is_muted boolean default false,
  is_banned boolean default false,
  joined_at timestamptz default now(),
  unique (server_id, user_id)
);

-- ---------------------------------------------------------
-- CHANNELS
-- ---------------------------------------------------------
create table public.channels (
  id uuid primary key default uuid_generate_v4(),
  server_id uuid references public.servers(id) on delete cascade,
  name text not null,
  type text not null check (type in ('text','voice')),
  category text default 'GERAL',
  position int default 0,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- MESSAGES
-- ---------------------------------------------------------
create table public.messages (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid references public.channels(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete cascade,
  content text,
  attachment_url text,
  edited boolean default false,
  created_at timestamptz default now()
);

create table public.message_reactions (
  id uuid primary key default uuid_generate_v4(),
  message_id uuid references public.messages(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  unique (message_id, user_id, emoji)
);

-- ---------------------------------------------------------
-- ÍNDICES
-- ---------------------------------------------------------
create index idx_messages_channel_created on public.messages (channel_id, created_at desc);
create index idx_members_server on public.members (server_id);
create index idx_channels_server on public.channels (server_id);
create index idx_roles_server_position on public.roles (server_id, position desc);

-- ---------------------------------------------------------
-- REALTIME
-- ---------------------------------------------------------
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.members;
alter publication supabase_realtime add table public.profiles;

-- =========================================================
-- FUNÇÕES AUXILIARES DE SEGURANÇA (usadas pelas policies RLS)
-- =========================================================

-- O usuário é membro do servidor?
create or replace function public.is_server_member(p_server_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.members
    where server_id = p_server_id and user_id = auth.uid()
  );
$$;

-- O usuário é dono do servidor?
create or replace function public.is_server_owner(p_server_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.servers
    where id = p_server_id and owner_id = auth.uid()
  );
$$;

-- O usuário tem uma permissão específica no servidor? (dono sempre tem tudo)
create or replace function public.has_permission(p_server_id uuid, p_permission text)
returns boolean language sql security definer stable as $$
  select
    public.is_server_owner(p_server_id) or exists (
      select 1
      from public.members m
      join public.roles r on r.id = m.role_id
      where m.server_id = p_server_id
        and m.user_id = auth.uid()
        and (r.permissions ->> p_permission)::boolean is true
    );
$$;

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
alter table public.profiles enable row level security;
alter table public.servers enable row level security;
alter table public.roles enable row level security;
alter table public.members enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;

-- PROFILES: qualquer autenticado pode ver perfis; só o dono edita o próprio
create policy "profiles_select_authenticated" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());

-- SERVERS: visível só para membros; criação livre (o criador vira owner); update/delete só owner
create policy "servers_select_member" on public.servers
  for select using (public.is_server_member(id) or owner_id = auth.uid());
create policy "servers_insert_own" on public.servers
  for insert with check (owner_id = auth.uid());
create policy "servers_update_owner" on public.servers
  for update using (owner_id = auth.uid());
create policy "servers_delete_owner" on public.servers
  for delete using (owner_id = auth.uid());

-- ROLES: visível para membros; alterar exige manage_roles (ou ser dono)
create policy "roles_select_member" on public.roles
  for select using (public.is_server_member(server_id));
create policy "roles_write_manage_roles" on public.roles
  for all using (public.has_permission(server_id, 'manage_roles'))
  with check (public.has_permission(server_id, 'manage_roles'));

-- MEMBERS: visível para membros; entrada própria; remoção própria (sair) ou kick_members;
-- alterar cargo de outros exige manage_roles
create policy "members_select_member" on public.members
  for select using (public.is_server_member(server_id));
create policy "members_insert_self" on public.members
  for insert with check (user_id = auth.uid());
create policy "members_update_own_nickname" on public.members
  for update using (
    user_id = auth.uid()
    or public.has_permission(server_id, 'manage_roles')
    or public.has_permission(server_id, 'mute_members')
  );
create policy "members_delete_self_or_kick" on public.members
  for delete using (user_id = auth.uid() or public.has_permission(server_id, 'kick_members'));

-- CHANNELS: visível para membros; criar/editar/apagar exige manage_channels
create policy "channels_select_member" on public.channels
  for select using (public.is_server_member(server_id));
create policy "channels_write_manage_channels" on public.channels
  for all using (public.has_permission(server_id, 'manage_channels'))
  with check (public.has_permission(server_id, 'manage_channels'));

-- MESSAGES: visível para membros do servidor do canal; enviar exige send_messages
-- e não estar mutado; editar/apagar próprias, ou manage_messages
create policy "messages_select_member" on public.messages
  for select using (
    public.is_server_member((select server_id from public.channels where id = channel_id))
  );
create policy "messages_insert_own" on public.messages
  for insert with check (
    author_id = auth.uid()
    and public.has_permission((select server_id from public.channels where id = channel_id), 'send_messages')
    and not exists (
      select 1 from public.members
      where server_id = (select server_id from public.channels where id = channel_id)
        and user_id = auth.uid() and is_muted = true
    )
  );
create policy "messages_update_own" on public.messages
  for update using (
    author_id = auth.uid()
    or public.has_permission((select server_id from public.channels where id = channel_id), 'manage_messages')
  );
create policy "messages_delete_own_or_mod" on public.messages
  for delete using (
    author_id = auth.uid()
    or public.has_permission((select server_id from public.channels where id = channel_id), 'manage_messages')
  );

-- REACTIONS: visível para quem vê a mensagem; só o próprio usuário adiciona/remove sua reação
create policy "reactions_select_member" on public.message_reactions
  for select using (
    public.is_server_member((
      select c.server_id from public.messages m
      join public.channels c on c.id = m.channel_id
      where m.id = message_id
    ))
  );
create policy "reactions_insert_own" on public.message_reactions
  for insert with check (user_id = auth.uid());
create policy "reactions_delete_own" on public.message_reactions
  for delete using (user_id = auth.uid());

-- =========================================================
-- TRIGGER: cria automaticamente o cargo @everyone ao criar um servidor
-- =========================================================
create or replace function public.create_default_role()
returns trigger language plpgsql security definer as $$
declare
  v_default_role_id uuid;
begin
  insert into public.roles (server_id, name, is_default, position, permissions)
  values (new.id, '@everyone', true, 0, '{
    "manage_server": false, "manage_roles": false, "manage_channels": false,
    "manage_messages": false, "kick_members": false, "ban_members": false,
    "mute_members": false, "send_messages": true, "connect_voice": true
  }')
  returning id into v_default_role_id;

  -- BUGFIX: o dono precisa existir em "members" para passar nas policies de
  -- RLS de members/channels/messages/reactions, que checam is_server_member.
  insert into public.members (server_id, user_id, role_id)
  values (new.id, new.owner_id, v_default_role_id);

  return new;
end;
$$;

create trigger trg_create_default_role
  after insert on public.servers
  for each row execute function public.create_default_role();

-- Cria automaticamente um canal de texto e um de voz padrão em todo servidor novo
create or replace function public.create_default_channels()
returns trigger language plpgsql security definer as $$
begin
  insert into public.channels (server_id, name, type, category, position)
  values
    (new.id, 'geral', 'text', 'CANAIS DE TEXTO', 0),
    (new.id, 'Sala de Voz', 'voice', 'CANAIS DE VOZ', 0);
  return new;
end;
$$;

create trigger trg_create_default_channels
  after insert on public.servers
  for each row execute function public.create_default_channels();

-- =========================================================
-- STORAGE (Supabase) — buckets para fotos de perfil, banners e ícones
-- Rode isso no painel do Supabase ou via API de Storage
-- =========================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('banners', 'banners', true), ('server-icons', 'server-icons', true)
on conflict (id) do nothing;

-- Cada usuário só pode subir/alterar arquivos dentro da sua própria pasta (avatars/{user_id}/...)
create policy "avatar_upload_own" on storage.objects
  for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar_update_own" on storage.objects
  for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar_public_read" on storage.objects
  for select using (bucket_id in ('avatars', 'banners', 'server-icons'));
