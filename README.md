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

1. Execute `radar_mg_schema.sql` no SQL Editor do Supabase (cria tabelas + função `calculate_scores()`).
2. Popule a tabela `municipios` com os municípios de MG que você quer monitorar.
3. Importe e rode pelo menos uma vez o workflow n8n do PNCP (`radar_mg_n8n_pncp_workflow.json`).
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

## O que ainda é mock/pendente

- **Comentários estilo G1** — a UI de comentários da versão anterior (mockup) foi removida
  desta versão conectada porque ainda não existe fonte real de comentário. Reintroduzir
  quando o workflow de scraping/RSS do G1 estiver pronto.
- **Notícias** — a tabela `news_items` existe no schema mas só é populada quando o
  workflow do G1 for construído (próxima fase, ainda não fizemos).
- **Radar de proximidade (visualização SVG)** — não veio nesta versão pra manter o
  arquivo enxuto; dá pra trazer de volta do mockup original (`radar_mg_dashboard.jsx`)
  se quiser.
