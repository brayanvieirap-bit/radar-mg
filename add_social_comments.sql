-- add_social_comments.sql
-- Adiciona a tabela social_comments — comentários REAIS (YouTube, por enquanto)
-- que substituem o antigo "Feed de comentários" simulado no cliente.
-- Rode este arquivo INTEIRO no SQL Editor do Supabase (depois de já ter rodado
-- radar_mg_schema.sql).

create table social_comments (
  id              uuid primary key default gen_random_uuid(),
  municipio_id    uuid references municipios(id) on delete cascade,
  source          text not null default 'YouTube',
  author_name     text not null,
  comment_text    text not null,
  sentiment       text not null default 'duvida',  -- apoio | critica | duvida | alerta
  video_title     text,
  video_url       text,
  external_id     text not null,        -- id do comentário na fonte (evita duplicar)
  published_at    timestamptz,
  captured_at     timestamptz not null default now(),
  unique (source, external_id)
);

create index idx_social_comments_municipio on social_comments(municipio_id, published_at desc);

alter table social_comments enable row level security;

create policy "leitura publica" on social_comments for select using (true);

-- Escrita: apenas service_role (chave usada pelo n8n), nunca a chave anon —
-- mesmo padrão das outras tabelas de raw_signals/news_items.
