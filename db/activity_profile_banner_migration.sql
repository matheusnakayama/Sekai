-- Imagem/GIF exclusiva para o fundo superior do painel de atividade do perfil.
-- Independente do banner principal do perfil e da cor do cartão.

alter table public.profiles
  add column if not exists activity_banner_url text;
