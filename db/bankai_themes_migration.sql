-- !bankai: sorteia uma Bankai, entrega a insígnia uma única vez
-- e desbloqueia o tema secreto correspondente.

create table if not exists public.custom_badges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null default '✦',
  background_color text not null default '#4f46e5',
  foreground_color text not null default '#ffffff',
  image_url text
);

create table if not exists public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.custom_badges(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

alter table public.custom_badges add column if not exists slug text;
alter table public.custom_badges add column if not exists image_path text;
alter table public.custom_badges add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.custom_badges add column if not exists created_at timestamptz not null default now();

create unique index if not exists custom_badges_slug_key on public.custom_badges (slug) where slug is not null;

alter table public.custom_badges enable row level security;
alter table public.user_badges enable row level security;
grant select on public.custom_badges to authenticated, anon;
grant select on public.user_badges to authenticated, anon;
drop policy if exists custom_badges_read on public.custom_badges;
create policy custom_badges_read on public.custom_badges for select to authenticated, anon using (true);
drop policy if exists user_badges_read on public.user_badges;
create policy user_badges_read on public.user_badges for select to authenticated, anon using (true);

create table if not exists public.user_theme_unlocks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  theme_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, theme_id)
);

alter table public.user_theme_unlocks enable row level security;
grant select on public.user_theme_unlocks to authenticated;
drop policy if exists user_theme_unlocks_read_own on public.user_theme_unlocks;
create policy user_theme_unlocks_read_own on public.user_theme_unlocks
  for select to authenticated
  using (user_id = auth.uid());

insert into public.custom_badges (id, slug, name, icon, background_color, foreground_color, image_url)
values
  ('b0000001-0000-4000-8000-000000000001', 'bankai-byakuya', 'Byakuya Kuchiki', '🌸', '#111118', '#F4A7C5', '/bankai/byakuya.svg'),
  ('b0000001-0000-4000-8000-000000000002', 'bankai-renji', 'Renji', '🐍', '#771A2B', '#C89D43', '/bankai/renji.svg'),
  ('b0000001-0000-4000-8000-000000000003', 'bankai-rukia', 'Rukia', '❄', '#F3FBFF', '#8B8CEB', '/bankai/rukia.svg'),
  ('b0000001-0000-4000-8000-000000000004', 'bankai-toshiro', 'Tōshirō', '❄', '#071A33', '#A8E8FF', '/bankai/toshiro.svg'),
  ('b0000001-0000-4000-8000-000000000005', 'bankai-yamamoto', 'Yamamoto', '☀', '#171411', '#E25525', '/bankai/yamamoto.svg'),
  ('b0000001-0000-4000-8000-000000000006', 'bankai-shunsui', 'Shunsui', '🌸', '#17131C', '#E0CDB0', '/bankai/shunsui.svg'),
  ('b0000001-0000-4000-8000-000000000007', 'bankai-mayuri', 'Mayuri', '⚗', '#4C288C', '#A7DF4B', '/bankai/mayuri.svg'),
  ('b0000001-0000-4000-8000-000000000008', 'bankai-soi-fon', 'Soi Fon', '⚡', '#14191D', '#F0C449', '/bankai/soi-fon.svg'),
  ('b0000001-0000-4000-8000-000000000009', 'bankai-urahara', 'Urahara', '✂', '#202027', '#8F2638', '/bankai/urahara.svg'),
  ('b0000001-0000-4000-8000-00000000000a', 'bankai-ichigo', 'Ichigo', '🌙', '#0A0C12', '#C8313E', '/bankai/ichigo.svg'),
  ('b0000001-0000-4000-8000-00000000000b', 'bankai-komamura', 'Komamura', '🛡', '#17151A', '#D7C8B5', '/bankai/komamura.svg'),
  ('b0000001-0000-4000-8000-00000000000c', 'bankai-gin', 'Gin', '⚔', '#17191E', '#D9DCE3', '/bankai/gin.svg'),
  ('b0000001-0000-4000-8000-00000000000d', 'bankai-tosen', 'Tōsen', '◉', '#101427', '#8EA5C2', '/bankai/tosen.svg'),
  ('b0000001-0000-4000-8000-00000000000e', 'bankai-kensei', 'Kensei', '✊', '#343A43', '#B94C46', '/bankai/kensei.svg'),
  ('b0000001-0000-4000-8000-00000000000f', 'bankai-rose', 'Rōjūrō “Rose”', '♪', '#2C1B2C', '#CEAA63', '/bankai/rose.svg')
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  icon = excluded.icon,
  background_color = excluded.background_color,
  foreground_color = excluded.foreground_color,
  image_url = excluded.image_url;

create or replace function public.sekai_roll_bankai(p_channel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_server uuid;
  v_type text;
  v_pick int;
  v_slugs text[] := array[
    'bankai-byakuya', 'bankai-renji', 'bankai-rukia', 'bankai-toshiro', 'bankai-yamamoto',
    'bankai-shunsui', 'bankai-mayuri', 'bankai-soi-fon', 'bankai-urahara', 'bankai-ichigo',
    'bankai-komamura', 'bankai-gin', 'bankai-tosen', 'bankai-kensei', 'bankai-rose'
  ];
  v_bankais text[] := array[
    'Senbonzakura Kageyoshi', 'Sōō Zabimaru', 'Hakka no Togame', 'Daiguren Hyōrinmaru', 'Zanka no Tachi',
    'Katen Kyōkotsu: Karamatsu Shinjū', 'Konjiki Ashisogi Jizō', 'Jakuhō Raikōben', 'Kannonbiraki Benihime Aratame', 'Tensa Zangetsu',
    'Kokujō Tengen Myō''ō: Dangai Jōe', 'Kamishini no Yari', 'Suzumushi Tsuishiki: Enma Kōrogi', 'Tekken Tachikaze', 'Kinshara Butōdan'
  ];
  v_characters text[] := array[
    'Byakuya Kuchiki', 'Renji', 'Rukia', 'Tōshirō', 'Yamamoto',
    'Shunsui', 'Mayuri', 'Soi Fon', 'Urahara', 'Ichigo',
    'Komamura', 'Gin', 'Tōsen', 'Kensei', 'Rōjūrō “Rose”'
  ];
  v_themes text[] := array[
    'bankai-byakuya', 'bankai-renji', 'bankai-rukia', 'bankai-toshiro', 'bankai-yamamoto',
    'bankai-shunsui', 'bankai-mayuri', 'bankai-soi-fon', 'bankai-urahara', 'bankai-ichigo',
    'bankai-komamura', 'bankai-gin', 'bankai-tosen', 'bankai-kensei', 'bankai-rose'
  ];
  v_theme_names text[] := array[
    'Jardim das Mil Pétalas', 'Reis Serpentes', 'Elegia de Gelo', 'Dragão Boreal', 'Cinzas do Sol',
    'Palco da Tragédia', 'Crisálida Dourada', 'Ferrão Relâmpago', 'Costura Carmesim', 'Lua Negra',
    'Armadura do Voto', 'Lâmina Prateada', 'Silêncio Índigo', 'Punho da Tempestade', 'Orquestra Dourada'
  ];
  v_slug text;
  v_bankai text;
  v_character text;
  v_theme_id text;
  v_theme_name text;
  v_badge_id uuid;
  v_had_badge boolean;
  v_had_theme boolean;
  v_message text;
begin
  if v_user is null then
    raise exception 'Faça login para usar !bankai.';
  end if;

  select c.server_id, c.type into v_server, v_type
  from public.channels c
  where c.id = p_channel_id;

  if v_server is null or v_type <> 'text' then
    raise exception 'Use !bankai em um canal de texto.';
  end if;

  if not public.has_permission(v_server, 'send_messages') then
    raise exception 'Sem permissão para enviar mensagens neste canal.';
  end if;

  if exists (
    select 1 from public.members m
    where m.server_id = v_server
      and m.user_id = v_user
      and (m.is_muted = true or m.communication_disabled_until > now())
  ) then
    raise exception 'Você não pode usar comandos enquanto estiver silenciado.';
  end if;

  if exists (
    select 1
    from public.server_preferences p
    join public.messages recent on recent.channel_id = p_channel_id and recent.author_id = v_user
    where p.server_id = v_server
      and coalesce((p.settings->>'slowmodeSeconds')::integer, 0) > 0
      and recent.created_at > now() - make_interval(secs => (p.settings->>'slowmodeSeconds')::integer)
  ) then
    raise exception 'Aguarde o modo lento antes de usar !bankai.';
  end if;

  v_pick := 1 + floor(random() * 15)::int;
  v_slug := v_slugs[v_pick];
  v_bankai := v_bankais[v_pick];
  v_character := v_characters[v_pick];
  v_theme_id := v_themes[v_pick];
  v_theme_name := v_theme_names[v_pick];

  select id into v_badge_id from public.custom_badges where slug = v_slug;
  if v_badge_id is null then
    raise exception 'As Bankais ainda não foram preparadas.';
  end if;

  select exists (
    select 1 from public.user_badges where user_id = v_user and badge_id = v_badge_id
  ) into v_had_badge;
  select exists (
    select 1 from public.user_theme_unlocks where user_id = v_user and theme_id = v_theme_id
  ) into v_had_theme;

  if not v_had_badge then
    insert into public.user_badges (user_id, badge_id, assigned_by)
    values (v_user, v_badge_id, v_user)
    on conflict (user_id, badge_id) do nothing;
  end if;

  if not v_had_theme then
    insert into public.user_theme_unlocks (user_id, theme_id)
    values (v_user, v_theme_id)
    on conflict (user_id, theme_id) do nothing;
  end if;

  if not v_had_badge and not v_had_theme then
    v_message := format('Bankai liberada: %s! Você ganhou a insígnia de %s e desbloqueou o tema secreto %s.', v_bankai, v_character, v_theme_name);
  elsif v_had_badge and not v_had_theme then
    v_message := format('Bankai liberada: %s! Você já tinha a insígnia de %s e desbloqueou o tema secreto %s.', v_bankai, v_character, v_theme_name);
  elsif not v_had_badge and v_had_theme then
    v_message := format('Bankai liberada: %s! Você ganhou a insígnia de %s. O tema secreto %s já estava desbloqueado.', v_bankai, v_character, v_theme_name);
  else
    v_message := format('Bankai: %s. Você já tem a insígnia de %s e o tema secreto %s.', v_bankai, v_character, v_theme_name);
  end if;

  insert into public.messages (channel_id, author_id, content)
  values (p_channel_id, v_user, v_message);

  return jsonb_build_object(
    'message', v_message,
    'themeId', v_theme_id,
    'slug', v_slug,
    'unlockedTheme', not v_had_theme,
    'grantedBadge', not v_had_badge
  );
end;
$function$;

revoke all on function public.sekai_roll_bankai(uuid) from public, anon, authenticated;
grant execute on function public.sekai_roll_bankai(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_badges'
     ) then
    alter publication supabase_realtime add table public.user_badges;
  end if;
end $$;
