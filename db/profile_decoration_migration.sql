-- Decoração escolhida no perfil. O cliente envia um destes ids, ou null:
-- solara, vigilia, sakura, neon, loto, brasa, aurora, estrelas, geada, realeza

alter table public.profiles
  add column if not exists profile_decoration text;

alter table public.profiles
  drop constraint if exists profiles_profile_decoration_known;

alter table public.profiles
  add constraint profiles_profile_decoration_known
  check (
    profile_decoration is null
    or profile_decoration in (
      'solara',
      'vigilia',
      'sakura',
      'neon',
      'loto',
      'brasa',
      'aurora',
      'estrelas',
      'geada',
      'realeza'
    )
  );
