-- Permite que cada membro personalize nome, avatar e banners de forma independente
-- em cada servidor. Valores nulos continuam usando os dados do perfil global.
alter table public.members
  add column if not exists avatar_url text,
  add column if not exists avatar_position_x double precision not null default 50,
  add column if not exists avatar_position_y double precision not null default 50,
  add column if not exists avatar_zoom double precision not null default 100,
  add column if not exists banner_url text,
  add column if not exists banner_position_x double precision not null default 50,
  add column if not exists banner_position_y double precision not null default 50,
  add column if not exists banner_zoom double precision not null default 100,
  add column if not exists member_list_banner_url text,
  add column if not exists member_list_banner_position_x double precision not null default 50,
  add column if not exists member_list_banner_position_y double precision not null default 50,
  add column if not exists member_list_banner_zoom double precision not null default 100;

-- RLS já limita estas alterações ao próprio membro e aos moderadores autorizados.
-- A permissão por coluna impede que clientes comuns alterem cargos ou estado de moderação.
revoke update on public.members from authenticated;
grant update (
  nickname,
  avatar_url, avatar_position_x, avatar_position_y, avatar_zoom,
  banner_url, banner_position_x, banner_position_y, banner_zoom,
  member_list_banner_url, member_list_banner_position_x, member_list_banner_position_y, member_list_banner_zoom
) on public.members to authenticated;
