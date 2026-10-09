-- !bankai: sorteia uma Bankai por pessoa. A insígnia e o tema
-- secreto ficam com ela; um segundo sorteio não entrega outra.

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

-- Insígnias de Bankai são do sistema, então não têm um autor obrigatório.
alter table public.custom_badges alter column created_by drop not null;

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

-- Cada pessoa fica com a primeira Bankai que recebeu.
alter table public.user_badges add column if not exists created_at timestamptz not null default now();

delete from public.user_badges ub
using (
  select
    user_id,
    badge_id,
    row_number() over (
      partition by user_id
      order by created_at asc nulls last, badge_id asc
    ) as rn
  from public.user_badges
  where badge_id in (
    'b0000001-0000-4000-8000-000000000001'::uuid,
    'b0000001-0000-4000-8000-000000000002'::uuid,
    'b0000001-0000-4000-8000-000000000003'::uuid,
    'b0000001-0000-4000-8000-000000000004'::uuid,
    'b0000001-0000-4000-8000-000000000005'::uuid,
    'b0000001-0000-4000-8000-000000000006'::uuid,
    'b0000001-0000-4000-8000-000000000007'::uuid,
    'b0000001-0000-4000-8000-000000000008'::uuid,
    'b0000001-0000-4000-8000-000000000009'::uuid,
    'b0000001-0000-4000-8000-00000000000a'::uuid,
    'b0000001-0000-4000-8000-00000000000b'::uuid,
    'b0000001-0000-4000-8000-00000000000c'::uuid,
    'b0000001-0000-4000-8000-00000000000d'::uuid,
    'b0000001-0000-4000-8000-00000000000e'::uuid,
    'b0000001-0000-4000-8000-00000000000f'::uuid
  )
) ranked
where ub.user_id = ranked.user_id
  and ub.badge_id = ranked.badge_id
  and ranked.rn > 1;

insert into public.user_theme_unlocks (user_id, theme_id)
select ub.user_id, b.slug
from public.user_badges ub
join public.custom_badges b on b.id = ub.badge_id
where b.slug like 'bankai-%'
on conflict (user_id, theme_id) do nothing;

delete from public.user_theme_unlocks ut
where ut.theme_id like 'bankai-%'
  and not exists (
    select 1
    from public.user_badges ub
    join public.custom_badges b on b.id = ub.badge_id
    where ub.user_id = ut.user_id
      and b.slug = ut.theme_id
  );

create unique index if not exists user_badges_one_bankai_idx
  on public.user_badges (user_id)
  where badge_id in (
    'b0000001-0000-4000-8000-000000000001'::uuid,
    'b0000001-0000-4000-8000-000000000002'::uuid,
    'b0000001-0000-4000-8000-000000000003'::uuid,
    'b0000001-0000-4000-8000-000000000004'::uuid,
    'b0000001-0000-4000-8000-000000000005'::uuid,
    'b0000001-0000-4000-8000-000000000006'::uuid,
    'b0000001-0000-4000-8000-000000000007'::uuid,
    'b0000001-0000-4000-8000-000000000008'::uuid,
    'b0000001-0000-4000-8000-000000000009'::uuid,
    'b0000001-0000-4000-8000-00000000000a'::uuid,
    'b0000001-0000-4000-8000-00000000000b'::uuid,
    'b0000001-0000-4000-8000-00000000000c'::uuid,
    'b0000001-0000-4000-8000-00000000000d'::uuid,
    'b0000001-0000-4000-8000-00000000000e'::uuid,
    'b0000001-0000-4000-8000-00000000000f'::uuid
  );

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
  v_owned_slug text;
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

  perform pg_advisory_xact_lock(hashtext('sekai-bankai'), hashtext(v_user::text));

  select b.slug into v_owned_slug
  from public.user_badges ub
  join public.custom_badges b on b.id = ub.badge_id
  where ub.user_id = v_user
    and b.slug = any (v_slugs)
  order by ub.badge_id
  limit 1;

  if v_owned_slug is not null then
    v_pick := array_position(v_slugs, v_owned_slug);
    v_slug := v_owned_slug;
    v_bankai := v_bankais[v_pick];
    v_character := v_characters[v_pick];
    v_theme_id := v_themes[v_pick];
    v_theme_name := v_theme_names[v_pick];
    v_message := format('Você já tem a insígnia de %s (%s). Ela permanece com você.', v_character, v_bankai);

    insert into public.messages (channel_id, author_id, content)
    values (p_channel_id, v_user, v_message);

    return jsonb_build_object(
      'message', v_message,
      'themeId', v_theme_id,
      'slug', v_slug,
      'unlockedTheme', false,
      'grantedBadge', false
    );
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

  begin
    insert into public.user_badges (user_id, badge_id, assigned_by)
    values (v_user, v_badge_id, v_user);
  exception
    when unique_violation then
      v_message := 'Você já tem uma insígnia de Bankai. Ela permanece com você.';
      insert into public.messages (channel_id, author_id, content)
      values (p_channel_id, v_user, v_message);
      return jsonb_build_object(
        'message', v_message,
        'themeId', v_theme_id,
        'slug', v_slug,
        'unlockedTheme', false,
        'grantedBadge', false
      );
  end;

  select exists (
    select 1 from public.user_theme_unlocks where user_id = v_user and theme_id = v_theme_id
  ) into v_had_theme;

  if not v_had_theme then
    insert into public.user_theme_unlocks (user_id, theme_id)
    values (v_user, v_theme_id)
    on conflict (user_id, theme_id) do nothing;
  end if;

  v_message := format('Bankai liberada: %s! Você ganhou a insígnia de %s e desbloqueou o tema secreto %s.', v_bankai, v_character, v_theme_name);

  insert into public.messages (channel_id, author_id, content)
  values (p_channel_id, v_user, v_message);

  return jsonb_build_object(
    'message', v_message,
    'themeId', v_theme_id,
    'slug', v_slug,
    'unlockedTheme', not v_had_theme,
    'grantedBadge', true
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

notify pgrst, 'reload schema';
