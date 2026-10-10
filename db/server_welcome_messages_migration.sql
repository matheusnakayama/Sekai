-- Mensagens automáticas quando um novo membro entra em um servidor.
-- Execute este arquivo no SQL Editor do Supabase após publicar o código do Sekai.

create or replace function public.sekai_post_member_welcome_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings jsonb;
  v_channel_text text;
  v_channel_id uuid;
begin
  select p.settings
    into v_settings
    from public.server_preferences p
   where p.server_id = new.server_id;

  if not found or v_settings->>'welcomeMessagesEnabled' is distinct from 'true' then
    return new;
  end if;

  v_channel_text := nullif(btrim(v_settings->>'welcomeChannelId'), '');
  if v_channel_text is null or v_channel_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return new;
  end if;
  v_channel_id := v_channel_text::uuid;

  -- A preferência pode apontar para um canal excluído ou para outro servidor.
  if not exists (
    select 1
      from public.channels c
     where c.id = v_channel_id
       and c.server_id = new.server_id
       and c.type = 'text'
  ) then
    return new;
  end if;

  begin
    insert into public.messages (channel_id, author_id, content)
    values (v_channel_id, new.user_id, '[sekai-system:member_joined]');
  exception when others then
    -- Uma falha ao publicar a saudação não deve impedir a entrada no servidor.
    raise warning 'Sekai: não foi possível publicar a mensagem de boas-vindas para o servidor %: %', new.server_id, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.sekai_post_member_welcome_message() from public, anon, authenticated;

drop trigger if exists sekai_member_welcome_message on public.members;
create trigger sekai_member_welcome_message
  after insert on public.members
  for each row
  execute function public.sekai_post_member_welcome_message();

-- Reserva o marcador para o trigger para ninguém forjar uma mensagem de sistema.
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
