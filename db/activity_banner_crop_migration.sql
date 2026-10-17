-- Recorte do GIF do painel de atividade. O cliente envia posição e zoom.

alter table public.profiles
  add column if not exists activity_banner_position_x smallint not null default 50,
  add column if not exists activity_banner_position_y smallint not null default 50,
  add column if not exists activity_banner_zoom smallint not null default 100;
