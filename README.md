# RADAR MG

Dashboard de inteligência de oportunidades por cidade — Minas Gerais.

## Setup local

```bash
npm install
cp .env.example .env
# preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env
npm run dev
```

Abre em `http://localhost:5173`.

## Antes de rodar

1. Execute `radar_mg_schema.sql` no SQL Editor do Supabase (cria tabelas + função `calculate_scores()`), e depois `add_social_comments.sql` (cria a tabela de comentários reais).
2. Popule a tabela `municipios` com os municípios de MG que você quer monitorar.
3. Importe e rode pelo menos uma vez os workflows n8n: PNCP (`radar_mg_n8n_pncp_workflow.json`), G1 (`radar_mg_n8n_g1_workflow.json`) e YouTube (`radar_mg_n8n_youtube_workflow.json`).
4. Se a tela mostrar "Nenhum score encontrado", rode manualmente no SQL Editor:
   ```sql
   select calculate_scores();
   ```

## Se aparecer "Configuração pendente"

Significa que o `.env` não foi criado ou está sem as variáveis. Sem isso o app não quebra,
mas também não busca dado nenhum — é intencional, pra você não confundir "sem dado" com "bug".

## Relatório executivo em PDF

O botão "Exportar Relatório" no dashboard chama `/api/relatorio.js`, uma Serverless
Function da Vercel que roda em Node (nunca no navegador) e gera o PDF direto dos
dados reais do Supabase.

**Variável de ambiente adicional, só no backend (nunca com prefixo `VITE_`):**

```
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role-aqui
```

Cadastre essas duas na Vercel em **Project Settings → Environment Variables**,
separadas das `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` que já existem.
**Nunca** coloque a `service_role` numa variável `VITE_*` — isso a exporia no
navegador e destruiria a proteção do RLS.

Localmente, pra testar a função (`vercel dev`, não `npm run dev` sozinho), crie
essas mesmas duas variáveis no `.env`.

## Agente de pesquisa aprofundada (relatório)

Ao gerar o Relatório Executivo, `/api/relatorio.js` aciona um agente (OpenAI
GPT, com busca na web) que pesquisa dados atuais sobre o município — economia,
investimentos, infraestrutura — e adiciona uma seção "Pesquisa aprofundada"
ao PDF. **Esse agente só roda nesse momento**, sob demanda; não há nenhum
processo em segundo plano.

Precisa de mais uma variável de ambiente no backend (nunca com prefixo `VITE_`):

```
OPENAI_API_KEY=sua-chave-da-api-da-openai-aqui
```

Gere a chave em [platform.openai.com](https://platform.openai.com/api-keys)
e cadastre na Vercel junto das outras. Sem essa variável, o relatório continua
sendo gerado normalmente — só que sem a seção de pesquisa aprofundada.

## Deploy (Vercel)

```bash
git init
git add .
git commit -m "radar mg inicial"
# cria o repo no GitHub e faz push
```

Depois:
1. Conecta o repositório em vercel.com (New Project → Import).
2. A Vercel detecta Vite sozinha (build command `npm run build`, output `dist`).
3. Em **Environment Variables**, cadastra `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. Deploy. A cada push na branch principal, atualiza sozinho.

## Workflow n8n do G1 (notícias)

`radar_mg_n8n_g1_workflow.json` popula a tabela `news_items`: busca o RSS geral de
Minas Gerais do G1 e **filtra só matérias de política, desenvolvimento
econômico/infraestrutura ou tecnologia** (por palavra-chave no título — descarta
crime, clima, trânsito comum, entretenimento etc.). Se o título também citar uma
cidade cadastrada, ela é anexada à notícia; senão a notícia fica geral de MG (sem
cidade específica) — não é mais exigido que a matéria cite uma cidade pra entrar,
o que aumentou bastante o volume (de ~1 notícia/dia pra ~15-20/dia). Importe no
n8n, configure a credencial Supabase no node "Listar municípios" e no node
"Gravar em news_items", e leia a sticky note "LEIA ANTES DE USAR" dentro do
próprio workflow — ela explica as limitações:

- A URL do feed RSS (`https://g1.globo.com/rss/g1/mg/`) foi testada ao vivo em
  25/08/2026 (via execução de teste no n8n) e retornou matérias reais e recentes
  de MG — não deveria precisar de ajuste.
- A lista de palavras-chave de tópico é aproximada (por palavra inteira no
  título) — ajuste o array `PALAVRAS_RELEVANTES` no node "Casar notícias com
  municípios" se estiver deixando passar lixo ou descartando matéria relevante.
- Só grava `headline`, `url`, `published_at`, `source` e `municipio_id` (pode
  ser null). Não faz scraping de comentários — `comment_count` fica sempre 0.
- Não chama `calculate_scores()`: `news_items` não entra na fórmula de score
  (só `raw_signals` entra).

## Workflow n8n do YouTube (comentários reais)

O "Feed de comentários" do dashboard era 100% simulado no cliente (nomes e frases
geradas aleatoriamente). `radar_mg_n8n_youtube_workflow.json` substitui isso por
comentários **reais**: pra cada município, busca no YouTube um vídeo recente
(últimos 30 dias) sobre prefeitura/investimento/eleição/obra/emprego na cidade,
e grava os comentários reais de topo desse vídeo na tabela `social_comments`
(criada por `add_social_comments.sql`), classificados por sentimento
(apoio/crítica/dúvida/alerta) via palavra-chave no texto do comentário. Importe
no n8n e leia a sticky note "LEIA ANTES DE USAR" dentro do próprio workflow:

- Precisa de uma credencial nova: **YouTube Data API (query key)**, tipo Custom
  Auth, aplicando `?key=SUA_CHAVE` na query string das 2 chamadas HTTP ao
  YouTube. Gere a chave ativando a "YouTube Data API v3" num projeto no
  [Google Cloud Console](https://console.cloud.google.com/) — grátis até
  10.000 unidades/dia (cada rodada gasta ~100 unidades por município).
- Não existe seção de comentários pública no G1 (foi verificado ao vivo em
  26/08/2026 — o G1 descontinuou comentário nativo), por isso a fonte real
  escolhida foi o YouTube, que já é tematicamente ligado ao que o dashboard
  monitora (notícia de política/desenvolvimento regional).
- Sem vídeo recente sobre a cidade, ela simplesmente não gera comentário
  nessa rodada — normal, nem toda cidade tem vídeo toda semana.
- A classificação de sentimento é uma heurística simples por palavra-chave
  (mesmo espírito da classificação de `signal_type` no workflow do PNCP) —
  ajuste as listas `PALAVRAS_APOIO`/`PALAVRAS_CRITICA`/`PALAVRAS_ALERTA` no
  node "Classificar sentimento dos comentários" se quiser refinar.

## O que ainda é mock/pendente

- **Radar de proximidade (visualização SVG)** — não veio nesta versão pra manter o
  arquivo enxuto; dá pra trazer de volta do mockup original (`radar_mg_dashboard.jsx`)
  se quiser.
