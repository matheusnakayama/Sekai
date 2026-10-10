-- Mensagens automáticas para entrada, saída, expulsão e banimento.
-- Execute este arquivo no SQL Editor do Supabase após publicar o código do Sekai.

create or replace function public.sekai_post_server_system_message(
  p_server_id uuid,
  p_user_id uuid,
  p_event text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

create or replace function public.sekai_post_member_welcome_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.sekai_post_server_system_message(new.server_id, new.user_id, 'member_joined');
  return new;
end;
$$;

create or replace function public.sekai_post_member_departure_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

create or replace function public.sekai_post_member_ban_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.sekai_post_server_system_message(new.server_id, new.user_id, 'member_banned');
  return new;
end;
$$;

revoke all on function public.sekai_post_server_system_message(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.sekai_post_member_welcome_message() from public, anon, authenticated;
revoke all on function public.sekai_post_member_departure_message() from public, anon, authenticated;
revoke all on function public.sekai_post_member_ban_message() from public, anon, authenticated;

drop trigger if exists sekai_member_welcome_message on public.members;
create trigger sekai_member_welcome_message
  after insert on public.members
  for each row
  execute function public.sekai_post_member_welcome_message();

drop trigger if exists sekai_member_departure_message on public.members;
create trigger sekai_member_departure_message
  after delete on public.members
  for each row
  execute function public.sekai_post_member_departure_message();

drop trigger if exists sekai_member_ban_message on public.guild_bans;
create trigger sekai_member_ban_message
  after insert or update on public.guild_bans
  for each row
  execute function public.sekai_post_member_ban_message();

-- Reserva os marcadores para os gatilhos, para ninguém forjar eventos do sistema.
-- Essas políticas restritivas mantêm intactas as regras normais de envio do projeto.
drop policy if exists messages_block_system_marker_insert on public.messages;
create policy messages_block_system_marker_insert
  on public.messages as restrictive
  for insert to authenticated
  with check (coalesce(content, '') not like '[sekai-system:%');

drop policy if exists messages_block_system_marker_update on public.messages;
create policy messages_block_system_marker_update
  on public.messages as restrictive
  for update to authenticated
  using (true)
  with check (coalesce(content, '') not like '[sekai-system:%');
