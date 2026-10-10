-- Banner do servidor e cartão público do convite.
-- Cole este arquivo no SQL Editor do Supabase e execute uma vez.

alter table public.servers add column if not exists banner_url text;

create or replace function public.set_server_banner(p_server_id uuid, p_banner_url text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

revoke all on function public.set_server_banner(uuid, text) from public;
grant execute on function public.set_server_banner(uuid, text) to authenticated;

create or replace function public.preview_invite(p_code text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.preview_invite(text) from public;
grant execute on function public.preview_invite(text) to authenticated;
