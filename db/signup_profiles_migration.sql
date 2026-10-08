-- Cria automaticamente o perfil do Sekai quando uma conta é criada no Supabase Auth.
-- Execute uma vez no SQL Editor do projeto Supabase.

create or replace function public.sekai_create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_username text;
  v_username text;
  v_suffix text := substr(replace(new.id::text, '-', ''), 1, 10);
  v_attempt integer := 0;
begin
  v_base_username := lower(regexp_replace(
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      split_part(coalesce(new.email, 'user'), '@', 1),
      'user'
    ),
    '[^a-z0-9_.-]',
    '_',
    'g'
  ));
  v_base_username := trim(both '._-' from v_base_username);

  if char_length(v_base_username) < 2 then
    v_base_username := 'user';
  end if;

  v_username := left(v_base_username, 32);
  loop
    insert into public.profiles (id, username, display_name)
    values (
      new.id,
      v_username,
      coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), v_base_username)
    )
    on conflict do nothing;

    exit when found or exists (select 1 from public.profiles p where p.id = new.id);

    -- Se dois cadastros tentarem o mesmo nome ao mesmo tempo, tenta uma variante única.
    v_attempt := v_attempt + 1;
    v_username := left(v_base_username, 18) || '_' || v_suffix || '_' || v_attempt::text;
  end loop;

  return new;
end;
$$;

drop trigger if exists sekai_on_auth_user_created_profile on auth.users;
create trigger sekai_on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.sekai_create_profile_for_auth_user();

revoke all on function public.sekai_create_profile_for_auth_user() from public;
