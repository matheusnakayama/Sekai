-- Sekai: amizades e convites compartilháveis para servidor/canal de voz.
-- Execute uma vez no SQL Editor do Supabase, além do schema principal.
create extension if not exists pgcrypto;

-- O app armazena permissões como uma máscara numérica em roles.permissions.
-- Defina a função usada pela policy dos convites caso ela ainda não exista no banco.
create or replace function public.has_permission(p_server_id uuid, p_permission text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select public.is_server_owner(p_server_id) or exists (
    select 1
    from public.member_roles mr
    join public.roles r on r.id = mr.role_id
    where mr.server_id = p_server_id
      and mr.user_id = auth.uid()
      and (coalesce(r.permissions, 0)::bigint &
        case lower(p_permission)
          when 'create_invite' then 1::bigint
          when 'create_instant_invite' then 1::bigint
          else 0::bigint
        end) <> 0
  );
$$;
revoke all on function public.has_permission(uuid, text) from public;
grant execute on function public.has_permission(uuid, text) to authenticated;

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  constraint friendships_not_self check (sender_id <> receiver_id)
);
create unique index if not exists friendships_one_per_pair
  on public.friendships (least(sender_id, receiver_id), greatest(sender_id, receiver_id));
create index if not exists friendships_receiver_status on public.friendships (receiver_id, status);
grant select, insert, update, delete on public.friendships to authenticated;
alter table public.friendships enable row level security;
drop policy if exists friendships_select_participant on public.friendships;
create policy friendships_select_participant on public.friendships
  for select to authenticated using (sender_id = auth.uid() or receiver_id = auth.uid());
drop policy if exists friendships_request on public.friendships;
create policy friendships_request on public.friendships
  for insert to authenticated with check (sender_id = auth.uid() and receiver_id <> auth.uid() and status = 'pending');
drop policy if exists friendships_accept on public.friendships;
create policy friendships_accept on public.friendships
  for update to authenticated using (receiver_id = auth.uid() and status = 'pending')
  with check (receiver_id = auth.uid() and status = 'accepted');
drop policy if exists friendships_cancel on public.friendships;
create policy friendships_cancel on public.friendships
  for delete to authenticated using (sender_id = auth.uid() or receiver_id = auth.uid());

create table if not exists public.invites (
  code text primary key default upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8)),
  server_id uuid not null references public.servers(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete set null,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  uses integer not null default 0 check (uses >= 0),
  max_uses integer not null default 0 check (max_uses >= 0),
  max_age integer not null default 0 check (max_age >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invites_server_created on public.invites (server_id, created_at desc);
grant select, insert, delete on public.invites to authenticated;
alter table public.invites enable row level security;
drop policy if exists invites_select_member on public.invites;
create policy invites_select_member on public.invites
  for select to authenticated using (public.is_server_member(server_id));
drop policy if exists invites_create_member on public.invites;
create policy invites_create_member on public.invites
  for insert to authenticated with check (
    inviter_id = auth.uid()
    and public.is_server_member(server_id)
    and (public.is_server_owner(server_id) or public.has_permission(server_id, 'create_invite'))
  );
drop policy if exists invites_delete_creator_or_owner on public.invites;
create policy invites_delete_creator_or_owner on public.invites
  for delete to authenticated using (inviter_id = auth.uid() or public.is_server_owner(server_id));

create or replace function public.redeem_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invite public.invites%rowtype;
  v_code text;
  v_server_id uuid;
  v_role_id uuid;
  v_is_new_invite boolean := false;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  v_code := upper(btrim(coalesce(p_code, '')));
  if v_code = '' then raise exception 'Convite inválido'; end if;

  select * into v_invite from public.invites
   where upper(btrim(code)) = v_code
   for update;

  if found then
    v_is_new_invite := true;
    if v_invite.expires_at is not null and v_invite.expires_at <= now() then raise exception 'Convite expirado'; end if;
    if v_invite.max_age > 0 and v_invite.created_at + make_interval(secs => v_invite.max_age) <= now() then raise exception 'Convite expirado'; end if;
    if v_invite.max_uses > 0 and v_invite.uses >= v_invite.max_uses then raise exception 'Convite esgotado'; end if;
    v_server_id := v_invite.server_id;
  else
    -- Compatibilidade com os códigos antigos guardados diretamente em servers.invite_code.
    select s.id into v_server_id
      from public.servers s
     where upper(btrim(s.invite_code)) = v_code
     limit 1;
    if v_server_id is null then raise exception 'Convite inválido'; end if;
  end if;

  select id into v_role_id from public.roles where server_id = v_server_id and is_default limit 1;
  if v_role_id is null then raise exception 'Servidor sem cargo padrão'; end if;
  insert into public.members (server_id, user_id, role_id)
  values (v_server_id, auth.uid(), v_role_id)
  on conflict (server_id, user_id) do nothing;
  if v_is_new_invite then
    update public.invites set uses = uses + 1 where code = v_invite.code;
  end if;
  return v_server_id;
end;
$$;
revoke all on function public.redeem_invite(text) from public;
grant execute on function public.redeem_invite(text) to authenticated;

create table if not exists public.friend_server_invites (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  server_id uuid not null references public.servers(id) on delete cascade,
  server_name text not null,
  channel_id uuid references public.channels(id) on delete set null,
  invite_code text not null references public.invites(code) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  constraint friend_server_invites_not_self check (sender_id <> receiver_id)
);
create index if not exists friend_server_invites_receiver on public.friend_server_invites (receiver_id, status, created_at desc);
grant select, insert, delete on public.friend_server_invites to authenticated;
alter table public.friend_server_invites enable row level security;
drop policy if exists friend_server_invites_select_participant on public.friend_server_invites;
create policy friend_server_invites_select_participant on public.friend_server_invites
  for select to authenticated using (sender_id = auth.uid() or receiver_id = auth.uid());
drop policy if exists friend_server_invites_create_friend on public.friend_server_invites;
create policy friend_server_invites_create_friend on public.friend_server_invites
  for insert to authenticated with check (
    sender_id = auth.uid()
    and public.is_server_member(server_id)
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.sender_id = auth.uid() and f.receiver_id = receiver_id)
          or (f.receiver_id = auth.uid() and f.sender_id = receiver_id))
    )
  );
drop policy if exists friend_server_invites_delete_participant on public.friend_server_invites;
create policy friend_server_invites_delete_participant on public.friend_server_invites
  for delete to authenticated using (sender_id = auth.uid() or receiver_id = auth.uid());

create or replace function public.accept_friend_server_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
revoke all on function public.accept_friend_server_invite(uuid) from public;
grant execute on function public.accept_friend_server_invite(uuid) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.friend_server_invites;
exception when duplicate_object then null;
end $$;
