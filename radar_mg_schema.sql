-- ============================================================================
-- RADAR MG — Schema Supabase (PostgreSQL)
-- Inteligência de Oportunidades por Cidade — Minas Gerais
-- ============================================================================
-- Modelo: n8n ingere as 6 fontes -> grava em raw_signals / news_items ->
-- função calculate_score() recalcula scores por município+persona ->
-- dashboard lê apenas as tabelas "de leitura" (scores, raw_signals, news_items)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ENUMS
-- ----------------------------------------------------------------------------

create type persona_type as enum (
  'deputado',      -- Pré-Candidato a Deputado Federal/Estadual
  'prefeito',      -- Prefeito
  'secretario',    -- Secretário de Desenvolvimento Econômico
  'investidor',    -- Investidor / Exportador Internacional
  'logistica'      -- Transportadora / Logística
);

create type source_type as enum (
  'pncp',          -- Portal Nacional de Contratações Públicas (licitações/contratos)
  'cempre',        -- IBGE SIDRA/CEMPRE (empresas ativas por CNAE)
  'comexstat',     -- Comex Stat/MDIC (exportação/importação por município)
  'caged',         -- Novo CAGED (admissões/demissões formais)
  'idsc',          -- IDSC-BR (índice de desenvolvimento sustentável)
  'g1'             -- G1 RSS regional (notícias/repercussão)
);

create type potential_band as enum ('alto', 'medio', 'baixo');

-- ----------------------------------------------------------------------------
-- 2. MUNICÍPIOS (tabela de referência — carga única via IBGE)
-- ----------------------------------------------------------------------------

create table municipios (
  id            uuid primary key default gen_random_uuid(),
  ibge_code     char(7) not null unique,        -- código IBGE de 7 dígitos
  name          text not null,
  region        text not null,                   -- mesorregião (ex: "Triângulo")
  population    integer,
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  created_at    timestamptz not null default now()
);

create index idx_municipios_region on municipios(region);

-- ----------------------------------------------------------------------------
-- 3. RAW_SIGNALS — todo dado bruto ingerido pelo n8n (PNCP/CEMPRE/ComexStat/CAGED)
-- ----------------------------------------------------------------------------
-- Uma linha por sinal captado. O n8n grava aqui a cada rodada de ingestão.
-- IDSC entra como signal_type='diagnostico_estrutural' (baixa frequência).

create table raw_signals (
  id              uuid primary key default gen_random_uuid(),
  municipio_id    uuid not null references municipios(id) on delete cascade,
  source          source_type not null,
  signal_type     text not null,        -- ex: 'edital_aberto', 'emenda_aprovada',
                                          -- 'cnpj_ativo', 'exportacao_sh4',
                                          -- 'admissao_caged', 'idsc_score'
  title           text,                  -- descrição curta legível (usada na UI)
  value_numeric   numeric,               -- valor quando aplicável (R$, nº empresas, kg, etc.)
  value_json      jsonb,                 -- payload bruto original da API (auditoria/debug)
  published_at    date,                  -- data de referência do dado na fonte
  captured_at     timestamptz not null default now(),  -- quando o n8n coletou
  external_id     text,                  -- id do registro na fonte (evita duplicar)
  unique (source, external_id)
);

create index idx_raw_signals_municipio on raw_signals(municipio_id);
create index idx_raw_signals_source_type on raw_signals(source, signal_type);
create index idx_raw_signals_published on raw_signals(published_at desc);

-- ----------------------------------------------------------------------------
-- 4. NEWS_ITEMS — feed do G1 (e outras fontes de notícia futuras)
-- ----------------------------------------------------------------------------
-- Guardamos só título + link + fonte, nunca o corpo da matéria (direito autoral).

create table news_items (
  id              uuid primary key default gen_random_uuid(),
  municipio_id    uuid references municipios(id) on delete cascade,
  source          text not null default 'G1',
  headline        text not null,
  url             text not null,
  published_at    timestamptz,
  captured_at     timestamptz not null default now(),
  comment_count   integer default 0,
  unique (url)
);

create index idx_news_municipio on news_items(municipio_id, published_at desc);

-- ----------------------------------------------------------------------------
-- 5. SCORING_WEIGHTS — configuração do peso de cada fonte por persona
-- ----------------------------------------------------------------------------
-- Isso é o que faz o mesmo dado bruto virar "oportunidade" diferente
-- para cada persona. Ajustável sem mexer em código.

create table scoring_weights (
  id            uuid primary key default gen_random_uuid(),
  persona       persona_type not null,
  source        source_type not null,
  signal_type   text not null,
  weight        numeric not null default 1.0,   -- multiplicador no score final
  unique (persona, source, signal_type)
);

-- Exemplo de seed (ajustar depois de validar com dado real):
insert into scoring_weights (persona, source, signal_type, weight) values
  ('deputado',   'pncp',      'ausencia_emenda',    2.0),
  ('deputado',   'idsc',      'idsc_score',         -1.0),  -- score baixo = oportunidade política
  ('prefeito',   'pncp',      'edital_aberto',       1.5),
  ('prefeito',   'cempre',    'cnpj_ativo',          1.0),
  ('secretario', 'cempre',    'cnpj_ativo',          2.0),
  ('secretario', 'caged',     'admissao_caged',      1.5),
  ('investidor', 'comexstat', 'exportacao_sh4',      2.0),
  ('investidor', 'idsc',      'idsc_score',          1.0),
  ('logistica',  'comexstat', 'exportacao_sh4',      1.5),
  ('logistica',  'pncp',      'obra_rodoviaria',     2.0);

-- ----------------------------------------------------------------------------
-- 6. SCORES — tabela de leitura consumida pelo dashboard
-- ----------------------------------------------------------------------------
-- Recalculada pela função calculate_scores() a cada rodada de ingestão do n8n.

create table scores (
  id              uuid primary key default gen_random_uuid(),
  municipio_id    uuid not null references municipios(id) on delete cascade,
  persona         persona_type not null,
  score           numeric not null,          -- 0-100
  band            potential_band not null,
  top_signal      text,                       -- texto do sinal de maior peso, pra UI
  computed_at     timestamptz not null default now(),
  unique (municipio_id, persona)
);

create index idx_scores_persona_band on scores(persona, band);
create index idx_scores_persona_score on scores(persona, score desc);

-- ----------------------------------------------------------------------------
-- 7. FUNÇÃO DE SCORING
-- ----------------------------------------------------------------------------
-- Chamada pelo n8n (via RPC) ao fim de cada rodada de ingestão.
-- Estratégia simples: soma ponderada dos sinais dos últimos 180 dias,
-- normalizada em 0-100 por persona (min-max entre todos os municípios).

create or replace function calculate_scores()
returns void
language plpgsql
as $$
declare
  p persona_type;
  raw_max numeric;
  raw_min numeric;
begin
  foreach p in array enum_range(null::persona_type) loop

    -- soma ponderada bruta por município para esta persona
    create temporary table tmp_raw as
    select
      rs.municipio_id,
      sum(coalesce(rs.value_numeric, 1) * sw.weight) as raw_score,
      (array_agg(rs.title order by sw.weight desc))[1] as top_signal
    from raw_signals rs
    join scoring_weights sw
      on sw.persona = p
     and sw.source = rs.source
     and sw.signal_type = rs.signal_type
    where rs.published_at >= (current_date - interval '180 days')
    group by rs.municipio_id;

    select max(raw_score), min(raw_score) into raw_max, raw_min from tmp_raw;

    -- normaliza para 0-100 e grava/atualiza scores
    -- (band deriva do MESMO score já calculado, via subquery, em vez de
    -- recalcular a fração separadamente — evita o caso em que raw_max =
    -- raw_min faz score=50 mas a fração recalculada dá NULL e cai em 'baixo')
    insert into scores (municipio_id, persona, score, band, top_signal, computed_at)
    select
      s.municipio_id,
      p,
      s.score,
      case
        when s.score >= 70 then 'alto'::potential_band
        when s.score >= 40 then 'medio'::potential_band
        else 'baixo'::potential_band
      end as band,
      s.top_signal,
      now()
    from (
      select
        t.municipio_id,
        round(
          case when raw_max = raw_min then 50
          else ((t.raw_score - raw_min) / (raw_max - raw_min)) * 100 end
        , 1) as score,
        t.top_signal
      from tmp_raw t
    ) s
    on conflict (municipio_id, persona)
    do update set
      score = excluded.score,
      band = excluded.band,
      top_signal = excluded.top_signal,
      computed_at = excluded.computed_at;

    drop table tmp_raw;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
-- Leitura pública (dashboard), escrita só via service_role (n8n).

alter table municipios enable row level security;
alter table raw_signals enable row level security;
alter table news_items enable row level security;
alter table scores enable row level security;
alter table scoring_weights enable row level security;

create policy "leitura publica" on municipios for select using (true);
create policy "leitura publica" on raw_signals for select using (true);
create policy "leitura publica" on news_items for select using (true);
create policy "leitura publica" on scores for select using (true);
create policy "leitura publica" on scoring_weights for select using (true);

-- Escrita: apenas service_role (chave usada pelo n8n), nunca a chave anon.
-- Não é necessário criar policy de insert/update para anon — RLS já bloqueia
-- por padrão qualquer operação não coberta por uma policy explícita.

-- ----------------------------------------------------------------------------
-- 9. COMO O N8N USA ISSO (resumo do fluxo)
-- ----------------------------------------------------------------------------
-- 1. Workflow por fonte (PNCP, CEMPRE, ComexStat, CAGED, IDSC, G1) roda na
--    cadência dela (PNCP/G1 diário, CEMPRE/IDSC mensal-anual, ComexStat/CAGED mensal).
-- 2. Cada workflow faz upsert em raw_signals (ou news_items, no caso do G1)
--    usando (source, external_id) como chave de deduplicação.
-- 3. Ao final de cada rodada, o n8n chama a função via RPC:
--       supabase.rpc('calculate_scores')
-- 4. O dashboard (frontend) só faz SELECT em `scores`, `raw_signals` e
--    `news_items` — nunca recalcula nada no cliente.
-- ============================================================================
