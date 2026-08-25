import { useState, useEffect, useMemo, useRef } from "react";
import {
  Radio, MapPin, TrendingUp, Building2, Ship, Landmark, Users, Search, ChevronRight,
  Radar as RadarIcon, Newspaper, MessageCircle, ThumbsUp, ThumbsDown, HelpCircle,
  ExternalLink, AlertTriangle, FileDown, Hash, Play, Pause,
} from "lucide-react";
import { supabase } from "./supabaseClient";

// Ecossistema = agrupamento de negócio (o que se vende); persona = papel
// específico dentro do ecossistema (o filtro fino).
const ECOSYSTEMS = [
  { id: "publico", label: "Público", sublabel: "Governo e política" },
  { id: "privado", label: "Privado", sublabel: "Empresas locais" },
  { id: "investidores", label: "Investidores", sublabel: "Capital e exportação" },
];

const PERSONAS = [
  { id: "prefeito", ecosystem: "publico", label: "Prefeito", icon: Building2, focus: "captação de investimento e benchmarking regional" },
  { id: "secretario", ecosystem: "publico", label: "Secretário Dev. Econômico", icon: Users, focus: "vocação econômica e mão de obra disponível" },
  { id: "deputado", ecosystem: "publico", label: "Pré-Candidato Deputado", icon: Landmark, focus: "vácuo político e comparativo de emendas" },
  { id: "logistica", ecosystem: "privado", label: "Transportadora / Logística", icon: TrendingUp, focus: "fluxo de carga e obras rodoviárias" },
  { id: "investidor", ecosystem: "investidores", label: "Investidor / Exportador", icon: Ship, focus: "infraestrutura, incentivo fiscal e logística" },
];

const SENTIMENTS = [
  { id: "apoio", label: "Apoio", icon: ThumbsUp, color: "#3DD6C4" },
  { id: "critica", label: "Crítica", icon: ThumbsDown, color: "#FF8A3D" },
  { id: "duvida", label: "Dúvida", icon: HelpCircle, color: "#8A96A6" },
  { id: "alerta", label: "Alerta", icon: AlertTriangle, color: "#E24B4A" },
];

// "Tipo de raciocínio a seguir" = linha de leitura do comentário.
// Simulado no cliente por enquanto — sem fonte real de comentário ainda
// (vira real quando existir um workflow de escuta social/G1 gravando no Supabase).
const COMMENT_TEMPLATES = [
  { category: "apoio", text: c => `Já era hora de ${c.name} receber esse tipo de investimento. Região precisa disso há anos.` },
  { category: "apoio", text: c => `Trabalho na região e confirmo, movimento de obras aumentou muito esse ano.` },
  { category: "duvida", text: c => `Alguém sabe se esse incentivo vale pra empresa de fora do estado também?` },
  { category: "duvida", text: c => `Isso vale só pra sede ou os distritos de ${c.name} também entram?` },
  { category: "alerta", text: c => `Espero que dessa vez o dinheiro chegue mesmo na ponta e não fique só no anúncio.` },
  { category: "alerta", text: c => `Já vi promessa parecida em ${c.name} há 2 anos que não saiu do papel.` },
  { category: "critica", text: c => `Isso vai gerar emprego de verdade ou só mais um anúncio de prefeitura?` },
  { category: "critica", text: c => `Falta transparência em como esse valor vai ser dividido entre os setores.` },
];
const NAMES = ["Marcos T.", "Fernanda A.", "Ricardo S.", "Juliana M.", "Paulo H.", "Camila R.", "Eduardo V.", "Beatriz L."];

function makeLiveMessage(city) {
  const template = COMMENT_TEMPLATES[Math.floor(Math.random() * COMMENT_TEMPLATES.length)];
  const name = NAMES[Math.floor(Math.random() * NAMES.length)];
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    text: template.text(city),
    category: template.category,
  };
}

const HASHTAG_POOL = ["#InvesteMG", "#ObraJá", "#EmpregoAgora", "#IncentivoFiscal", "#ExportaMG", "#CresceMG", "#OportunidadeMG", "#DesenvolvimentoRegional"];

function seedInt(str, mod) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 29 + str.charCodeAt(i)) >>> 0;
  return h % mod;
}

function hashtagsFor(city) {
  if (!city) return [];
  const base = seedInt(city.name + "h", 997);
  const picks = new Set();
  let i = 0;
  while (picks.size < 3 && i < HASHTAG_POOL.length) {
    picks.add(HASHTAG_POOL[(base + i * 7) % HASHTAG_POOL.length]);
    i++;
  }
  return Array.from(picks);
}

function summarize(text, max) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

function scoreColor(score) {
  if (score >= 80) return "#FF8A3D";
  if (score >= 60) return "#3DD6C4";
  return "#5B6675";
}

function potentialBand(score) {
  if (score >= 70) return { key: "alto", label: "Alto Potencial", color: "#FF8A3D" };
  if (score >= 40) return { key: "medio", label: "Potencial Médio", color: "#3DD6C4" };
  return { key: "baixo", label: "Baixo Potencial", color: "#5B6675" };
}

export default function App() {
  const [ecosystem, setEcosystem] = useState(ECOSYSTEMS[2]); // Investidores por padrão
  const [persona, setPersona] = useState(PERSONAS.find(p => p.id === "investidor"));
  const [search, setSearch] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [region, setRegion] = useState("Todas");
  const [bandFilter, setBandFilter] = useState("todas");
  const [selectedCity, setSelectedCity] = useState(null);
  const [newsQuery, setNewsQuery] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState("todos");
  const [liveMessages, setLiveMessages] = useState([]);
  const [feedPaused, setFeedPaused] = useState(false);
  const feedRef = useRef(null);

  const [scoresData, setScoresData] = useState([]);
  const [ticker, setTicker] = useState([]);
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [envMissing] = useState(!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY);
  const [errorMsg, setErrorMsg] = useState(null);
  const [exportState, setExportState] = useState("idle"); // idle | gerando | erro

  const personasInEcosystem = PERSONAS.filter(p => p.ecosystem === ecosystem.id);

  function handleEcosystemChange(eco) {
    setEcosystem(eco);
    const firstPersona = PERSONAS.find(p => p.ecosystem === eco.id);
    if (firstPersona) setPersona(firstPersona);
  }

  async function exportarRelatorio(cidade) {
    if (!cidade) return;
    setExportState("gerando");
    try {
      const resp = await fetch(`/api/relatorio?municipio_id=${cidade.id}&persona=${persona.id}`);
      const contentType = resp.headers.get("content-type") || "";
      if (!resp.ok || !contentType.includes("application/pdf")) {
        let detail = `HTTP ${resp.status}`;
        if (contentType.includes("application/json")) {
          const body = await resp.json().catch(() => null);
          if (body?.error) detail = body.error;
        }
        throw new Error(`Falha ao gerar relatório (${detail})`);
      }
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio_${cidade.name.replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setExportState("idle");
    } catch (err) {
      console.error(err);
      setExportState("erro");
      setTimeout(() => setExportState("idle"), 3000);
    }
  }

  // --- Busca os scores da persona ativa ---
  useEffect(() => {
    if (envMissing) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);

    supabase
      .from("scores")
      .select("score, band, top_signal, municipios(id, name, region, population, ibge_code)")
      .eq("persona", persona.id)
      .order("score", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setErrorMsg(error.message); setScoresData([]); }
        else {
          setScoresData(
            (data || [])
              .filter(r => r.municipios)
              .map(r => ({
                id: r.municipios.id,
                name: r.municipios.name,
                region: r.municipios.region,
                pop: r.municipios.population,
                score: Number(r.score),
                topSignal: r.top_signal,
              }))
          );
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [persona, envMissing]);

  // --- Ticker: sinal mais recente de várias cidades diferentes (1 por cidade, resumido) ---
  useEffect(() => {
    if (envMissing) return;
    supabase
      .from("raw_signals")
      .select("title, source, captured_at, municipios(name)")
      .order("captured_at", { ascending: false })
      .limit(150)
      .then(({ data }) => {
        const seenCities = new Set();
        const items = [];
        for (const s of data || []) {
          const city = s.municipios?.name || "MG";
          if (seenCities.has(city)) continue;
          seenCities.add(city);
          items.push({ city, msg: summarize(s.title, 70), source: s.source });
          if (items.length >= 15) break;
        }
        setTicker(items);
      });
  }, [envMissing]);

  const regions = useMemo(
    () => ["Todas", ...Array.from(new Set(scoresData.map(c => c.region).filter(Boolean)))],
    [scoresData]
  );

  const filtered = scoresData.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) &&
    c.score >= minScore &&
    (region === "Todas" || c.region === region) &&
    (bandFilter === "todas" || potentialBand(c.score).key === bandFilter)
  );

  const activeCity = scoresData.find(c => c.name === selectedCity) || filtered[0] || scoresData[0];

  // --- Notícias reais da cidade ativa (Supabase) ---
  useEffect(() => {
    if (envMissing || !activeCity) { setNews([]); return; }
    supabase
      .from("news_items")
      .select("headline, source, url, published_at, comment_count")
      .eq("municipio_id", activeCity.id)
      .order("published_at", { ascending: false })
      .limit(6)
      .then(({ data }) => setNews(data || []));
  }, [activeCity, envMissing]);

  const filteredNews = news.filter(n => n.headline.toLowerCase().includes(newsQuery.toLowerCase()));

  // --- Feed ao vivo simulado (reseta ao trocar de cidade, tick a cada ~3s) ---
  useEffect(() => {
    if (!activeCity) return;
    setLiveMessages(Array.from({ length: 3 }, () => makeLiveMessage(activeCity)));
  }, [activeCity?.name]);

  useEffect(() => {
    if (!activeCity || feedPaused) return;
    const interval = setInterval(() => {
      setLiveMessages(prev => [...prev, makeLiveMessage(activeCity)].slice(-40));
    }, 3200);
    return () => clearInterval(interval);
  }, [activeCity?.name, feedPaused]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [liveMessages]);

  const filteredLiveMessages = liveMessages.filter(m =>
    sentimentFilter === "todos" || m.category === sentimentFilter
  );
  const sentimentCounts = useMemo(() => {
    const counts = { apoio: 0, critica: 0, duvida: 0, alerta: 0 };
    liveMessages.forEach(m => { counts[m.category]++; });
    return counts;
  }, [liveMessages]);
  const hashtags = useMemo(() => hashtagsFor(activeCity), [activeCity]);

  const diagCounts = useMemo(() => {
    const counts = { alto: 0, medio: 0, baixo: 0 };
    scoresData.forEach(c => { counts[potentialBand(c.score).key]++; });
    return counts;
  }, [scoresData]);

  if (envMissing) {
    return (
      <div style={{ background: "#0C1015", color: "#E9EDF2", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", padding: 24 }}>
        <div style={{ maxWidth: 480, textAlign: "center", border: "1px solid #2A3441", borderRadius: 6, padding: 28 }}>
          <AlertTriangle size={28} color="#FF8A3D" style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Configuração pendente</div>
          <div style={{ fontSize: 13, color: "#8A96A6", lineHeight: 1.6 }}>
            Copie <code>.env.example</code> para <code>.env</code> e preencha <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> com os dados do seu projeto Supabase. Reinicie <code>npm run dev</code> depois.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#0C1015", color: "#E9EDF2", minHeight: "100vh", fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .display { font-family: 'Space Grotesk', sans-serif; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes feedIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes tickerScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .pulse-dot { animation: pulse 2s ease-in-out infinite; }
        .feed-item { animation: feedIn 0.35s ease-out; }
        .ticker-track { animation: tickerScroll 210s linear infinite; }
        .ticker-track:hover { animation-play-state: paused; }
      `}</style>

      <div style={{ borderBottom: "1px solid #2A3441", padding: "18px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, border: "1.5px solid #3DD6C4", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <RadarIcon size={18} color="#3DD6C4" />
          </div>
          <div>
            <div className="display" style={{ fontSize: 18, fontWeight: 700 }}>RADAR MG</div>
            <div className="mono" style={{ fontSize: 10, color: "#8A96A6", letterSpacing: 1 }}>INTELIGÊNCIA DE DESENVOLVIMENTO ECONÔMICO REGIONAL</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="pulse-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "#3DD6C4", display: "inline-block" }} />
          <span className="mono" style={{ fontSize: 11, color: "#8A96A6" }}>
            {loading ? "CARREGANDO..." : `${scoresData.length} MUNICÍPIOS COM DADO`}
          </span>
        </div>
      </div>

      {/* Ecossistema (nível 1) */}
      <div style={{ borderBottom: "1px solid #2A3441", padding: "14px 28px 0", display: "flex", gap: 10, flexWrap: "wrap" }}>
        {ECOSYSTEMS.map(eco => {
          const active = eco.id === ecosystem.id;
          return (
            <button key={eco.id} onClick={() => handleEcosystemChange(eco)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
                background: "transparent", border: "none",
                borderBottom: `2px solid ${active ? "#FF8A3D" : "transparent"}`,
                color: active ? "#E9EDF2" : "#8A96A6",
                padding: "4px 4px 10px", fontSize: 14, cursor: "pointer",
                fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, marginBottom: -1,
              }}>
              {eco.label}
              <span className="mono" style={{ fontSize: 9.5, fontWeight: 400, color: "#5B6675", letterSpacing: 0.5 }}>{eco.sublabel.toUpperCase()}</span>
            </button>
          );
        })}
      </div>

      {/* Persona (nível 2, dentro do ecossistema ativo) */}
      <div style={{ borderBottom: "1px solid #2A3441", padding: "12px 28px", display: "flex", gap: 8, flexWrap: "wrap", background: "#0A0D11" }}>
        {personasInEcosystem.map(p => {
          const Icon = p.icon;
          const active = p.id === persona.id;
          return (
            <button key={p.id} onClick={() => setPersona(p)}
              style={{ display: "flex", alignItems: "center", gap: 7, background: active ? "#1C2430" : "transparent", border: `1px solid ${active ? "#3DD6C4" : "#2A3441"}`, color: active ? "#E9EDF2" : "#8A96A6", borderRadius: 3, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>
              <Icon size={13} color={active ? "#3DD6C4" : "#8A96A6"} />
              {p.label}
            </button>
          );
        })}
        {personasInEcosystem.length === 1 && (
          <span className="mono" style={{ fontSize: 10, color: "#5B6675", alignSelf: "center", marginLeft: 4 }}>+ mais personas em breve neste ecossistema</span>
        )}
      </div>

      {errorMsg && (
        <div style={{ background: "#2A1418", color: "#FF8A3D", padding: "10px 28px", fontSize: 12.5 }}>
          Erro ao consultar Supabase: {errorMsg}
        </div>
      )}

      {!loading && scoresData.length === 0 && !errorMsg && (
        <div style={{ background: "#151B23", color: "#8A96A6", padding: "12px 28px", fontSize: 12.5, borderBottom: "1px solid #2A3441" }}>
          Nenhum score encontrado ainda para essa persona. Rode o workflow n8n do PNCP pelo menos uma vez e execute <code className="mono">select calculate_scores();</code> no Supabase.
        </div>
      )}

      <div style={{ borderBottom: "1px solid #2A3441", background: "#0F141A", padding: "10px 0", overflow: "hidden", display: "flex", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 16px", borderRight: "1px solid #2A3441", flexShrink: 0 }}>
          <Radio size={13} color="#FF8A3D" />
          <span className="mono" style={{ fontSize: 10.5, color: "#FF8A3D", letterSpacing: 1, fontWeight: 600 }}>SINAIS</span>
        </div>
        <div style={{ overflow: "hidden", flex: 1, padding: "0 16px" }}>
          {ticker.length === 0 ? (
            <span style={{ fontSize: 12, color: "#5B6675" }}>Sem sinais captados ainda — rode o n8n.</span>
          ) : (
            <div className="ticker-track" style={{ display: "flex", gap: 24, width: "max-content" }}>
              {[...ticker, ...ticker].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{item.city}</span>
                  <span style={{ fontSize: 12.5, color: "#8A96A6" }}>{item.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 0 }}>
        <div style={{ width: 240, flexShrink: 0, borderRight: "1px solid #2A3441", padding: "22px 20px" }}>
          <div className="mono" style={{ fontSize: 10, color: "#5B6675", letterSpacing: 1.2, marginBottom: 14 }}>FILTROS · {persona.focus.toUpperCase()}</div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11.5, color: "#8A96A6", display: "block", marginBottom: 6 }}>Buscar cidade</label>
            <div style={{ display: "flex", alignItems: "center", border: "1px solid #2A3441", borderRadius: 3, padding: "7px 10px", background: "#151B23" }}>
              <Search size={13} color="#5B6675" style={{ marginRight: 7 }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ex: Uberlândia"
                style={{ background: "transparent", border: "none", color: "#E9EDF2", fontSize: 13, width: "100%" }} />
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11.5, color: "#8A96A6", display: "block", marginBottom: 6 }}>Região</label>
            <select value={region} onChange={e => setRegion(e.target.value)}
              style={{ width: "100%", background: "#151B23", border: "1px solid #2A3441", borderRadius: 3, color: "#E9EDF2", fontSize: 13, padding: "7px 10px" }}>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11.5, color: "#8A96A6", display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span>Score mínimo</span>
              <span className="mono" style={{ color: scoreColor(minScore) }}>{minScore}</span>
            </label>
            <input type="range" min="0" max="95" value={minScore} onChange={e => setMinScore(Number(e.target.value))} style={{ width: "100%", accentColor: "#FF8A3D" }} />
          </div>
        </div>

        <div style={{ flex: 1, padding: "22px 28px", display: "flex", gap: 26, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 340 }}>
            <div style={{ border: "1px solid #2A3441", borderRadius: 4, padding: 16, background: "#0F141A", marginBottom: 16 }}>
              <div className="mono" style={{ fontSize: 10, color: "#5B6675", letterSpacing: 1, marginBottom: 12 }}>DIAGNÓSTICO DE POTENCIAL — {persona.label.toUpperCase()}</div>
              <div style={{ display: "flex", gap: 10 }}>
                {[
                  { key: "alto", label: "Alto Potencial", color: "#FF8A3D", count: diagCounts.alto },
                  { key: "medio", label: "Potencial Médio", color: "#3DD6C4", count: diagCounts.medio },
                  { key: "baixo", label: "Baixo Potencial", color: "#5B6675", count: diagCounts.baixo },
                ].map(band => {
                  const active = bandFilter === band.key;
                  return (
                    <button key={band.key} onClick={() => setBandFilter(active ? "todas" : band.key)}
                      style={{ flex: 1, textAlign: "left", cursor: "pointer", background: active ? "#1C2430" : "#151B23", border: `1px solid ${active ? band.color : "#2A3441"}`, borderRadius: 3, padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 3 }}>
                        <span className="mono" style={{ fontSize: 20, fontWeight: 600, color: band.color }}>{band.count}</span>
                        <span style={{ fontSize: 11.5, fontWeight: 600 }}>{band.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map((c, i) => {
                const isActive = activeCity && c.name === activeCity.name;
                const band = potentialBand(c.score);
                return (
                  <div key={i} onClick={() => setSelectedCity(c.name)}
                    style={{ border: `1px solid ${isActive ? "#3DD6C4" : "#2A3441"}`, borderRadius: 4, padding: "14px 16px", background: isActive ? "#132022" : "#0F141A", display: "flex", alignItems: "center", gap: 16, cursor: "pointer" }}>
                    <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: scoreColor(c.score), width: 52, textAlign: "right" }}>{c.score.toFixed(0)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <MapPin size={12} color="#5B6675" />
                        <span className="display" style={{ fontWeight: 600, fontSize: 14.5 }}>{c.name}</span>
                        <span style={{ fontSize: 11, color: "#5B6675" }}>· {c.region}{c.pop ? ` · ${c.pop.toLocaleString("pt-BR")}` : ""}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: band.color, border: `1px solid ${band.color}40`, padding: "2px 7px", borderRadius: 2 }}>{band.label}</span>
                        {c.topSignal && <span style={{ fontSize: 10.5, color: "#3DD6C4" }}>{c.topSignal}</span>}
                      </div>
                    </div>
                    <ChevronRight size={16} color={isActive ? "#3DD6C4" : "#5B6675"} />
                  </div>
                );
              })}
              {!loading && filtered.length === 0 && scoresData.length > 0 && (
                <div style={{ padding: 40, textAlign: "center", color: "#5B6675", fontSize: 13, border: "1px dashed #2A3441", borderRadius: 4 }}>
                  Nenhuma cidade encontrada com esses filtros.
                </div>
              )}
            </div>
          </div>

          <div style={{ width: 320, flexShrink: 0 }}>
            {/* Relatório executivo (PDF real via /api/relatorio) */}
            <div style={{ border: "1px solid #2A3441", borderRadius: 4, padding: 16, background: "#0F141A", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                <FileDown size={13} color="#3DD6C4" />
                <div className="mono" style={{ fontSize: 10, color: "#5B6675", letterSpacing: 1 }}>RELATÓRIO EXECUTIVO</div>
              </div>
              <div style={{ fontSize: 12, color: "#8A96A6", margin: "6px 0 12px", lineHeight: 1.4 }}>
                Diagnóstico completo de <b style={{ color: "#E9EDF2" }}>{activeCity?.name || "—"}</b> em PDF.
              </div>
              <button onClick={() => exportarRelatorio(activeCity)}
                disabled={!activeCity || exportState === "gerando"}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  background: exportState === "gerando" ? "#1C2430" : "#1a2e2a",
                  border: `1px solid ${exportState === "erro" ? "#E24B4A" : "#3DD6C4"}`, borderRadius: 3, padding: "9px 12px",
                  fontSize: 12.5, fontWeight: 600, color: exportState === "erro" ? "#E24B4A" : "#3DD6C4",
                  cursor: !activeCity || exportState === "gerando" ? "default" : "pointer",
                }}>
                {exportState === "gerando" ? "Gerando PDF..." : exportState === "erro" ? "Erro ao gerar — tente de novo" : (<><FileDown size={14} /> Exportar Relatório (PDF)</>)}
              </button>
            </div>

            {/* Hashtags em alta (simulado — pronto pra receber dado real de escuta social) */}
            <div style={{ border: "1px solid #2A3441", borderRadius: 4, padding: 14, background: "#0F141A", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                <Hash size={13} color="#FF8A3D" />
                <div className="mono" style={{ fontSize: 10, color: "#5B6675", letterSpacing: 1 }}>HASHTAGS EM ALTA — {activeCity?.name?.toUpperCase() || "—"}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {hashtags.map(h => (
                  <span key={h} style={{ fontSize: 11, color: "#FF8A3D", border: "1px solid #FF8A3D40", background: "#241a10", padding: "4px 9px", borderRadius: 3 }}>{h}</span>
                ))}
              </div>
            </div>

            {/* Notícias reais (Supabase news_items) */}
            <div style={{ border: "1px solid #2A3441", borderRadius: 4, padding: 14, background: "#0F141A", marginBottom: 16 }}>
              <div className="mono" style={{ fontSize: 10, color: "#5B6675", letterSpacing: 1, marginBottom: 10 }}>FILTRAR NOTÍCIAS</div>
              <div style={{ display: "flex", alignItems: "center", border: "1px solid #2A3441", borderRadius: 3, padding: "7px 10px", background: "#151B23" }}>
                <Search size={12} color="#5B6675" style={{ marginRight: 7 }} />
                <input value={newsQuery} onChange={e => setNewsQuery(e.target.value)} placeholder="Buscar palavra-chave..."
                  style={{ background: "transparent", border: "none", color: "#E9EDF2", fontSize: 12.5, width: "100%" }} />
              </div>
            </div>

            <div style={{ border: "1px solid #2A3441", borderRadius: 4, padding: 16, background: "#0F141A", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                <Newspaper size={13} color="#FF8A3D" />
                <div className="mono" style={{ fontSize: 10, color: "#5B6675", letterSpacing: 1 }}>NOTÍCIAS — {activeCity?.name?.toUpperCase() || "—"}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
                {filteredNews.map((n, i) => (
                  <a key={i} href={n.url} target="_blank" rel="noreferrer" style={{ paddingBottom: 12, borderBottom: i < filteredNews.length - 1 ? "1px solid #1E2530" : "none", textDecoration: "none", color: "inherit", display: "block" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.4, color: "#E9EDF2", marginBottom: 5 }}>{n.headline}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span className="mono" style={{ fontSize: 10, color: "#3DD6C4" }}>{n.source}</span>
                      <ExternalLink size={10} color="#5B6675" />
                    </div>
                  </a>
                ))}
                {filteredNews.length === 0 && (
                  <div style={{ fontSize: 11.5, color: "#5B6675", padding: "8px 0" }}>
                    {news.length === 0
                      ? "Nenhuma notícia captada ainda para essa cidade pelo workflow do G1 (RSS)."
                      : "Nenhuma notícia bate com essa busca."}
                  </div>
                )}
              </div>
            </div>

            {/* Feed ao vivo — comentários simulados, rolando automaticamente */}
            <div style={{ border: "1px solid #2A3441", borderRadius: 4, padding: 16, background: "#0F141A" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: feedPaused ? "#5B6675" : "#E24B4A", display: "inline-block" }} />
                  <span className="mono" style={{ fontSize: 10.5, color: feedPaused ? "#5B6675" : "#E24B4A", letterSpacing: 1, fontWeight: 600 }}>
                    {feedPaused ? "PAUSADO" : "AO VIVO"}
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, marginLeft: 4 }}>Feed de comentários</span>
                </div>
                <button onClick={() => setFeedPaused(p => !p)}
                  style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "1px solid #2A3441", borderRadius: 3, padding: "4px 9px", fontSize: 10.5, color: "#8A96A6", cursor: "pointer" }}>
                  {feedPaused ? <Play size={11} /> : <Pause size={11} />}
                  {feedPaused ? "Retomar" : "Pausar"}
                </button>
              </div>

              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #1E2530" }}>
                <button onClick={() => setSentimentFilter("todos")}
                  style={{
                    fontSize: 10.5, padding: "4px 9px", borderRadius: 3, cursor: "pointer",
                    background: sentimentFilter === "todos" ? "#1C2430" : "transparent",
                    border: `1px solid ${sentimentFilter === "todos" ? "#3DD6C4" : "#2A3441"}`,
                    color: sentimentFilter === "todos" ? "#E9EDF2" : "#8A96A6",
                  }}>
                  Todos ({liveMessages.length})
                </button>
                {SENTIMENTS.map(s => {
                  const Icon = s.icon;
                  const active = sentimentFilter === s.id;
                  return (
                    <button key={s.id} onClick={() => setSentimentFilter(active ? "todos" : s.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        fontSize: 10.5, padding: "4px 9px", borderRadius: 3, cursor: "pointer",
                        background: active ? "#1C2430" : "transparent",
                        border: `1px solid ${active ? s.color : "#2A3441"}`,
                        color: active ? s.color : "#8A96A6",
                      }}>
                      <Icon size={11} color={active ? s.color : "#8A96A6"} />
                      {s.label} ({sentimentCounts[s.id]})
                    </button>
                  );
                })}
              </div>

              <div ref={feedRef} style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 320, overflowY: "auto", scrollBehavior: "smooth" }}>
                {filteredLiveMessages.map((m) => {
                  const sent = SENTIMENTS.find(s => s.id === m.category);
                  return (
                    <div key={m.id} className="feed-item" style={{ display: "flex", gap: 9 }}>
                      <div className="mono" style={{
                        width: 24, height: 24, borderRadius: "50%", background: "#1C2430", border: "1px solid #2A3441",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, flexShrink: 0, color: "#3DD6C4",
                      }}>
                        {m.name.split(" ").map(p => p[0]).join("")}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                          <span style={{ fontSize: 11.5, fontWeight: 600 }}>{m.name}</span>
                          {sent && <span style={{ fontSize: 9, color: sent.color, border: `1px solid ${sent.color}40`, padding: "1px 5px", borderRadius: 2 }}>{sent.label}</span>}
                        </div>
                        <div style={{ fontSize: 11.5, color: "#B5BCC7", lineHeight: 1.4, margin: "2px 0 0" }}>{m.text}</div>
                      </div>
                    </div>
                  );
                })}
                {filteredLiveMessages.length === 0 && (
                  <div style={{ fontSize: 11.5, color: "#5B6675", padding: "8px 0" }}>Nenhuma mensagem dessa categoria ainda — aguardando o feed.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
