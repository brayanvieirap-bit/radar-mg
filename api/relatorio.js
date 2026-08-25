// api/relatorio.js
// Vercel Serverless Function — roda em Node, nunca no navegador.
// Usa a service_role key (só existe aqui, nunca no frontend) pra ler o Supabase
// sem depender de RLS, já que essa rota é o próprio backend confiável.

import { createClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import React from "react";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

const PERSONA_LABELS = {
  prefeito: "um(a) Prefeito(a) buscando captação de investimento e benchmarking regional",
  secretario: "um(a) Secretário(a) de Desenvolvimento Econômico avaliando vocação econômica e mão de obra",
  deputado: "um(a) pré-candidato(a) a Deputado avaliando vácuo político e comparativo de emendas",
  logistica: "uma Transportadora/empresa de Logística avaliando fluxo de carga e obras rodoviárias",
  investidor: "um(a) Investidor(a)/Exportador(a) avaliando infraestrutura, incentivo fiscal e logística",
};

// Agente de pesquisa: só é acionado aqui, dentro da geração de relatório —
// nunca roda em segundo plano nem é chamado por outra rota.
async function pesquisarDadosAprofundados(municipio, persona) {
  if (!anthropic) return null;
  const foco = PERSONA_LABELS[persona] || `a persona "${persona}"`;
  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 1500,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
      messages: [
        {
          role: "user",
          content:
            `Pesquise informações atuais e relevantes sobre o município de ${municipio.name}, ` +
            `Minas Gerais (Brasil), com foco no que interessaria a ${foco}: economia local, ` +
            `investimentos recentes, infraestrutura, indicadores de desenvolvimento e oportunidades ` +
            `de negócio. Responda em português, em até 4 parágrafos curtos e objetivos, citando as ` +
            `fontes entre parênteses quando possível. Não invente dados — baseie-se apenas no que ` +
            `encontrar nas buscas; se não encontrar nada relevante, diga isso claramente.`,
        },
      ],
    });
    const texto = response.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n\n")
      .trim();
    return texto || null;
  } catch (err) {
    console.error("Pesquisa aprofundada (agente) falhou:", err.message);
    return null;
  }
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#444441" },
  headerBar: { backgroundColor: "#0C1015", padding: 16, marginHorizontal: -40, marginTop: -40, marginBottom: 20 },
  headerTitle: { color: "#FFFFFF", fontSize: 14, fontFamily: "Helvetica-Bold" },
  headerSub: { color: "#9FE1CB", fontSize: 8, marginTop: 3, letterSpacing: 1 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#0C1015", marginBottom: 2 },
  subtitle: { fontSize: 10.5, color: "#5F5E5A", marginBottom: 14 },
  sectionHeading: { fontSize: 12.5, fontFamily: "Helvetica-Bold", color: "#0C1015", marginTop: 16, marginBottom: 8 },
  body: { fontSize: 10, lineHeight: 1.5, color: "#444441" },
  badgeBox: { flexDirection: "row", border: "1pt solid #D3D1C7", backgroundColor: "#FAEEDA", padding: 12, alignItems: "center", marginTop: 6 },
  badgeScore: { fontSize: 26, fontFamily: "Helvetica-Bold", color: "#BA7517", width: 70 },
  badgeLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#444441" },
  badgeCaption: { fontSize: 8, color: "#5F5E5A", marginTop: 2 },
  table: { marginTop: 4, border: "0.5pt solid #D3D1C7" },
  tableRowHeader: { flexDirection: "row", backgroundColor: "#0F6E56" },
  tableRow: { flexDirection: "row", borderTop: "0.5pt solid #D3D1C7" },
  th: { color: "#FFFFFF", fontSize: 9, fontFamily: "Helvetica-Bold", padding: 6, flex: 1 },
  td: { fontSize: 9, padding: 6, flex: 1, color: "#444441" },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 7.5, color: "#5F5E5A", borderTop: "0.5pt solid #D3D1C7", paddingTop: 6 },
  disclaimer: { fontSize: 7.5, color: "#5F5E5A", marginTop: 14, lineHeight: 1.4 },
});

function potentialBand(score) {
  if (score >= 70) return { label: "Alto Potencial", color: "#BA7517" };
  if (score >= 40) return { label: "Potencial Médio", color: "#0F6E56" };
  return { label: "Baixo Potencial", color: "#5F5E5A" };
}

function ReportDocument({ municipio, persona, scoreRow, signals, news, research }) {
  const band = potentialBand(Number(scoreRow?.score || 0));
  return React.createElement(
    Document,
    { title: `Relatório de Diagnóstico Municipal — ${municipio.name} — RADAR MG` },
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        View,
        { style: styles.headerBar },
        React.createElement(Text, { style: styles.headerTitle }, "RADAR MG"),
        React.createElement(Text, { style: styles.headerSub }, "INTELIGÊNCIA DE DESENVOLVIMENTO ECONÔMICO REGIONAL")
      ),
      React.createElement(Text, { style: styles.title }, "Relatório de Diagnóstico Municipal"),
      React.createElement(Text, { style: styles.subtitle }, `${municipio.name} — Minas Gerais · Persona: ${persona}`),

      React.createElement(Text, { style: styles.sectionHeading }, "Diagnóstico"),
      React.createElement(
        View,
        { style: styles.badgeBox },
        React.createElement(Text, { style: styles.badgeScore }, String(Math.round(scoreRow?.score || 0))),
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.badgeLabel }, band.label),
          React.createElement(Text, { style: styles.badgeCaption }, "Índice 0–100, normalizado entre os municípios monitorados")
        )
      ),

      React.createElement(Text, { style: styles.sectionHeading }, "Sinais identificados no período"),
      React.createElement(
        View,
        { style: styles.table },
        React.createElement(
          View,
          { style: styles.tableRowHeader },
          React.createElement(Text, { style: styles.th }, "Fonte"),
          React.createElement(Text, { style: [styles.th, { flex: 3 }] }, "Descrição")
        ),
        signals.length === 0
          ? React.createElement(
              View,
              { style: styles.tableRow },
              React.createElement(Text, { style: [styles.td, { flex: 4 }] }, "Nenhum sinal registrado ainda para este município.")
            )
          : signals.map((s, i) =>
              React.createElement(
                View,
                { style: styles.tableRow, key: i },
                React.createElement(Text, { style: styles.td }, s.source),
                React.createElement(Text, { style: [styles.td, { flex: 3 }] }, s.title || s.signal_type)
              )
            )
      ),

      React.createElement(Text, { style: styles.sectionHeading }, "Repercussão recente"),
      news.length === 0
        ? React.createElement(Text, { style: styles.body }, "Nenhuma notícia registrada ainda para este município.")
        : news.map((n, i) => React.createElement(Text, { style: styles.body, key: i }, `• ${n.headline} (${n.source})`)),

      React.createElement(Text, { style: styles.sectionHeading }, "Pesquisa aprofundada (agente de IA)"),
      research
        ? research
            .split("\n\n")
            .map((par, i) => React.createElement(Text, { style: [styles.body, { marginBottom: 6 }], key: i }, par))
        : React.createElement(
            Text,
            { style: styles.body },
            "Pesquisa aprofundada indisponível para este relatório (agente não configurado ou sem resultados)."
          ),
      research && React.createElement(
        Text,
        { style: styles.disclaimer },
        "A seção acima foi gerada por um agente de IA com busca na web no momento da emissão deste relatório. Pode conter imprecisões — trate como ponto de partida, não como fonte definitiva."
      ),

      React.createElement(
        Text,
        { style: styles.disclaimer },
        "Este relatório foi gerado automaticamente a partir de fontes públicas de dados e não constitui recomendação de investimento, aconselhamento financeiro ou jurídico."
      ),

      React.createElement(
        Text,
        { style: styles.footer, fixed: true },
        "Fontes: PNCP · IBGE SIDRA/CEMPRE · Comex Stat/MDIC · Novo CAGED · IDSC-BR · G1 (repercussão)"
      )
    )
  );
}

export default async function handler(req, res) {
  try {
    const { municipio_id, persona } = req.query;
    if (!municipio_id || !persona) {
      res.status(400).json({ error: "Parâmetros obrigatórios: municipio_id e persona" });
      return;
    }

    const { data: municipio, error: errMun } = await supabaseAdmin
      .from("municipios")
      .select("*")
      .eq("id", municipio_id)
      .single();
    if (errMun || !municipio) {
      res.status(404).json({ error: "Município não encontrado" });
      return;
    }

    const { data: scoreRow } = await supabaseAdmin
      .from("scores")
      .select("score, band, top_signal")
      .eq("municipio_id", municipio_id)
      .eq("persona", persona)
      .single();

    const { data: signals } = await supabaseAdmin
      .from("raw_signals")
      .select("source, title, signal_type, published_at")
      .eq("municipio_id", municipio_id)
      .order("published_at", { ascending: false })
      .limit(8);

    const { data: news } = await supabaseAdmin
      .from("news_items")
      .select("headline, source, published_at")
      .eq("municipio_id", municipio_id)
      .order("published_at", { ascending: false })
      .limit(5);

    // Agente de pesquisa aprofundada — acionado só aqui, sob demanda, ao gerar o relatório.
    const research = await pesquisarDadosAprofundados(municipio, persona);

    const buffer = await renderToBuffer(
      React.createElement(ReportDocument, {
        municipio,
        persona,
        scoreRow: scoreRow || {},
        signals: signals || [],
        news: news || [],
        research,
      })
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="relatorio_${municipio.name.replace(/\s+/g, "_")}.pdf"`
    );
    res.status(200).send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao gerar relatório", detail: err.message });
  }
}
