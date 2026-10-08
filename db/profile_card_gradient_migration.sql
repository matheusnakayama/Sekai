-- Permite salvar cor sólida ou gradiente de 2 a 3 cores no cartão do perfil.
-- O cliente envia valores como:
--   #202127
--   linear-gradient(135deg, #202127, #5865f2)
--   linear-gradient(135deg, #202127, #5865f2, #20b8a6)

alter table public.profiles
  drop constraint if exists profiles_profile_card_color_hex;

alter table public.profiles
  add constraint profiles_profile_card_color_hex
  check (
    profile_card_color is null
    or profile_card_color ~ '^#[0-9A-Fa-f]{6}$'
    or profile_card_color ~ '^linear-gradient\(135deg, #[0-9A-Fa-f]{6}, #[0-9A-Fa-f]{6}(, #[0-9A-Fa-f]{6})?\)$'
  );
