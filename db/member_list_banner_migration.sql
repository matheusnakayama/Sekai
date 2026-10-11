-- Banner transparente independente, exibido apenas no fundo do item da lista de membros.
-- O banner padrão vem do perfil; a coluna em members permite sobrescrever por servidor.

alter table public.profiles
  add column if not exists member_list_banner_url text,
  add column if not exists member_list_banner_position_x double precision not null default 50,
  add column if not exists member_list_banner_position_y double precision not null default 50,
  add column if not exists member_list_banner_zoom double precision not null default 100;

alter table public.members
  add column if not exists member_list_banner_url text,
  add column if not exists member_list_banner_position_x double precision not null default 50,
  add column if not exists member_list_banner_position_y double precision not null default 50,
  add column if not exists member_list_banner_zoom double precision not null default 100;
