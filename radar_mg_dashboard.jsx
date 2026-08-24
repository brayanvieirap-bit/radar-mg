import { useState, useMemo } from "react";
import { Radio, MapPin, TrendingUp, Building2, Ship, Landmark, Users, Search, ChevronRight, Radar as RadarIcon, Newspaper, MessageCircle, ThumbsUp, ExternalLink } from "lucide-react";

const PERSONAS = [
  { id: "deputado", label: "Pré-Candidato Deputado", icon: Landmark, focus: "vácuo político e comparativo de emendas" },
  { id: "prefeito", label: "Prefeito", icon: Building2, focus: "captação de investimento e benchmarking regional" },
  { id: "secretario", label: "Secretário Dev. Econômico", icon: Users, focus: "vocação econômica e mão de obra disponível" },
  { id: "investidor", label: "Investidor / Exportador", icon: Ship, focus: "infraestrutura, incentivo fiscal e logística" },
  { id: "logistica", label: "Transportadora / Logística", icon: TrendingUp, focus: "fluxo de carga e obras rodoviárias" },
];

const TAGS = ["Incentivo Fiscal", "Emenda Aprovada", "Terreno Disponível", "Exportação em Alta", "Obra Rodoviária", "CNPJ Industrial +", "Edital Aberto", "Mão de Obra"];

const CITIES = [
  { name: "Belo Horizonte", region: "Central", pop: "2.3M" },
  { name: "Uberlândia", region: "Triângulo", pop: "699k" },
  { name: "Juiz de Fora", region: "Zona da Mata", pop: "573k" },
  { name: "Contagem", region: "Central", pop: "668k" },
  { name: "Montes Claros", region: "Norte", pop: "413k" },
  { name: "Uberaba", region: "Triângulo", pop: "340k" },
  { name: "Governador Valadares", region: "Vale do Rio Doce", pop: "281k" },
  { name: "Varginha", region: "Sul de Minas", pop: "141k" },
  { name: "Poços de Caldas", region: "Sul de Minas", pop: "170k" },
  { name: "Três Corações", region: "Sul de Minas", pop: "82k" },
  { name: "Divinópolis", region: "Centro-Oeste", pop: "251k" },
  { name: "Ipatinga", region: "Vale do Aço", pop: "266k" },
  { name: "Patos de Minas", region: "Alto Paranaíba", pop: "162k" },
  { name: "Sete Lagoas", region: "Central", pop: "244k" },
  { name: "Passos", region: "Sudoeste", pop: "121k" },
];

// deterministic pseudo-random so scores stay stable per persona+city
function seedScore(str, salt) {
  let h = 0;
  const s = str + salt;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 35 + (h % 65); // 35–99
}

function seedAngle(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 17 + str.charCodeAt(i)) >>> 0;
  return (h % 360);
}

function tagsFor(city, persona) {
  let h = 0;
  const s = city + persona;
  for (let i = 0; i < s.length; i++) h = (h * 13 + s.charCodeAt(i)) >>> 0;
  const first = TAGS[h % TAGS.length];
  const second = TAGS[(h >> 3) % TAGS.length];
  return first === second ? [first] : [first, second];
}

const TICKER = [
  { t: "há 4 min", city: "Uberaba", msg: "Edital de incentivo fiscal publicado — setor agroindustrial" },
  { t: "há 12 min", city: "Governador Valadares", msg: "Emenda federal de R$ 8,2M aprovada para infraestrutura viária" },
  { t: "há 19 min", city: "Poços de Caldas", msg: "+18% em CNPJs de exportação abertos no trimestre" },
  { t: "há 27 min", city: "Divinópolis", msg: "Novo terreno industrial cadastrado — 45 mil m²" },
  { t: "há 41 min", city: "Sete Lagoas", msg: "Licitação de obra rodoviária aberta — TCE-MG" },
  { t: "há 58 min", city: "Três Corações", msg: "Vácuo de investimento identificado — sem emenda há 3 anos" },
];

const SOURCES = ["G1 Minas", "Estado de Minas", "Diário Regional", "Valor Econômico", "O Tempo"];
const NEWS_TEMPLATES = [
  c => `Prefeitura de ${c.name} anuncia pacote de incentivos para novas empresas`,
  c => `${c.name} registra alta em abertura de CNPJs no último trimestre`,
  c => `Governo de Minas libera recursos para obra de infraestrutura em ${c.name}`,
  c => `Investidores de olho em ${c.name} após anúncio de novo polo industrial`,
  c => `Câmara de ${c.name} aprova projeto de lei de incentivo fiscal`,
  c => `Setor produtivo de ${c.name} cresce acima da média estadual`,
];

function seedInt(str, mod) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 29 + str.charCodeAt(i)) >>> 0;
  return h % mod;
}

function newsFor(city) {
  const base = seedInt(city.name, 999);
  return [0, 1, 2].map(i => {
    const tIdx = (base + i * 7) % NEWS_TEMPLATES.length;
    const sIdx = (base + i * 3) % SOURCES.length;
    return {
      headline: NEWS_TEMPLATES[tIdx](city),
      source: SOURCES[sIdx],
      time: `${2 + i * 5}h atrás`,
      comments: 8 + ((base + i * 11) % 40),
    };
  });
}

const NAMES = ["Marcos T.", "Fernanda A.", "Ricardo S.", "Juliana M.", "Paulo H.", "Camila R.", "Eduardo V.", "Beatriz L."];
const COMMENT_TEMPLATES = [
  c => `Já era hora de ${c.name} receber esse tipo de investimento. Região precisa disso há anos.`,
  c => `Alguém sabe se esse incentivo vale pra empresa de fora do estado também?`,
  c => `Trabalho na região e confirmo, movimento de obras aumentou muito esse ano.`,
  c => `Espero que dessa vez o dinheiro chegue mesmo na ponta e não fique só no anúncio.`,
  c => `Isso vai gerar emprego de verdade ou só mais um anúncio de prefeitura?`,
];

function commentsFor(city) {
  const base = seedInt(city.name + "c", 999);
  return [0, 1, 2].map(i => {
    const n = NAMES[(base + i * 5) % NAMES.length];
    const txt = COMMENT_TEMPLATES[(base + i * 9) % COMMENT_TEMPLATES.length](city);
    return { name: n, text: txt, time: `${5 + i * 12} min`, likes: 3 + ((base + i * 4) % 25) };
  });
}

function scoreColor(score) {
  if (score >= 80) return "#FF8A3D";
  if (score >= 60) return "#3DD6C4";
  return "#5B6675";
}

export default function RadarMG() {
  const [persona, setPersona] = useState(PERSONAS[3]);
  const [search, setSearch] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [region, setRegion] = useState("Todas");
  const [hovered, setHovered] = useState(null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [commentSort, setCommentSort] = useState("relevantes");
  const [newsSource, setNewsSource] = useState("Todas");
  const [newsQuery, setNewsQuery] = useState("");

  const regions = useMemo(() => ["Todas", ...Array.from(new Set(CITIES.map(c => c.region)))], []);

  const data = useMemo(() => {
    return CITIES.map(c => ({
      ...c,
      score: seedScore(c.name, persona.id),
      angle: seedAngle(c.name + persona.id),
      tags: tagsFor(c.name, persona.id),
    })).sort((a, b) => b.score - a.score);
  }, [persona]);

  const filtered = data.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) &&
    c.score >= minScore &&
    (region === "Todas" || c.region === region)
  );

  const activeCity = data.find(c => c.name === selectedCity) || filtered[0] || data[0];
  const news = useMemo(() => newsFor(activeCity), [activeCity]);
  const filteredNews = news.filter(n =>
    (newsSource === "Todas" || n.source === newsSource) &&
    n.headline.toLowerCase().includes(newsQuery.toLowerCase())
  );
  const comments = useMemo(() => {
    const list = commentsFor(activeCity);
    return commentSort === "recentes" ? list : [...list].sort((a, b) => b.likes - a.likes);
  }, [activeCity, commentSort]);
  const filteredComments = comments.filter(c => c.text.toLowerCase().includes(newsQuery.toLowerCase()));

  return (
    <div style={{
      background: "#0C1015",
      color: "#E9EDF2",
      minHeight: "100vh",
      fontFamily: "'IBM Plex Sans', sans-serif",
      padding: "0",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .display { font-family: 'Space Grotesk', sans-serif; }
        .corner-card { position: relative; }
        .corner-card::before, .corner-card::after {
          content: ''; position: absolute; width: 10px; height: 10px;
          border-color: #3DD6C4; opacity: 0.5;
        }
        .corner-card::before { top: -1px; left: -1px; border-top: 1.5px solid; border-left: 1.5px solid; }
        .corner-card::after { bottom: -1px; right: -1px; border-bottom: 1.5px solid; border-right: 1.5px solid; }
        @keyframes sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .radar-sweep { animation: sweep 8s linear infinite; transform-origin: center; }
        .ticker-track { animation: ticker 40s linear infinite; display: flex; width: max-content; }
        .pulse-dot { animation: pulse 2s ease-in-out infinite; }
        select, input { outline: none; }
        ::selection { background: #FF8A3D; color: #0C1015; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #2A3441", padding: "18px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, border: "1.5px solid #3DD6C4", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <RadarIcon size={18} color="#3DD6C4" />
          </div>
          <div>
            <div className="display" style={{ fontSize: 18, fontWeight: 700, letterSpacing: 0.3 }}>RADAR MG</div>
            <div className="mono" style={{ fontSize: 10, color: "#8A96A6", letterSpacing: 1 }}>INTELIGÊNCIA DE OPORTUNIDADES · MINAS GERAIS</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="pulse-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "#3DD6C4", display: "inline-block" }} />
          <span className="mono" style={{ fontSize: 11, color: "#8A96A6" }}>ÚLTIMA VARREDURA: HÁ 4 MIN · 15 MUNICÍPIOS MONITORADOS</span>
        </div>
      </div>

      {/* Persona selector */}
      <div style={{ borderBottom: "1px solid #2A3441", padding: "14px 28px", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {PERSONAS.map(p => {
          const Icon = p.icon;
          const active = p.id === persona.id;
          return (
            <button
              key={p.id}
              onClick={() => setPersona(p)}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                background: active ? "#1C2430" : "transparent",
                border: `1px solid ${active ? "#3DD6C4" : "#2A3441"}`,
                color: active ? "#E9EDF2" : "#8A96A6",
                borderRadius: 3, padding: "8px 13px", fontSize: 12.5,
                cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 500,
                transition: "all 0.15s",
              }}
            >
              <Icon size={14} color={active ? "#3DD6C4" : "#8A96A6"} />
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Ticker */}
      <div style={{ borderBottom: "1px solid #2A3441", background: "#0F141A", padding: "10px 0", overflow: "hidden", display: "flex", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 16px", borderRight: "1px solid #2A3441", flexShrink: 0 }}>
          <Radio size={13} color="#FF8A3D" />
          <span className="mono" style={{ fontSize: 10.5, color: "#FF8A3D", letterSpacing: 1, fontWeight: 600 }}>SINAIS</span>
        </div>
        <div className="ticker-track">
          {[...TICKER, ...TICKER].map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 24px", flexShrink: 0 }}>
              <span className="mono" style={{ fontSize: 11, color: "#5B6675" }}>{item.t}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "#E9EDF2" }}>{item.city}</span>
              <span style={{ fontSize: 12.5, color: "#8A96A6" }}>{item.msg}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 0 }}>
        {/* Filters sidebar */}
        <div style={{ width: 240, flexShrink: 0, borderRight: "1px solid #2A3441", padding: "22px 20px", minHeight: "calc(100vh - 172px)" }}>
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

          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11.5, color: "#8A96A6", display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span>Score mínimo</span>
              <span className="mono" style={{ color: scoreColor(minScore) }}>{minScore}</span>
            </label>
            <input type="range" min="0" max="95" value={minScore} onChange={e => setMinScore(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#FF8A3D" }} />
          </div>

          <div style={{ marginTop: 26, paddingTop: 18, borderTop: "1px solid #2A3441" }}>
            <div className="mono" style={{ fontSize: 10, color: "#5B6675", letterSpacing: 1.2, marginBottom: 10 }}>TIPOS DE SINAL</div>
            {TAGS.map(t => (
              <div key={t} style={{ fontSize: 12, color: "#8A96A6", padding: "5px 0", display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#3DD6C4", display: "inline-block" }} />
                {t}
              </div>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: "22px 28px", display: "flex", gap: 26, flexWrap: "wrap" }}>

          {/* Radar visualization */}
          <div className="corner-card" style={{ width: 280, flexShrink: 0, border: "1px solid #2A3441", borderRadius: 4, padding: 16, background: "#0F141A" }}>
            <div className="mono" style={{ fontSize: 10, color: "#5B6675", letterSpacing: 1, marginBottom: 10 }}>MAPA DE PROXIMIDADE — {persona.label.toUpperCase()}</div>
            <svg viewBox="0 0 260 260" style={{ width: "100%", height: "auto" }}>
              {[110, 80, 50, 20].map((r, i) => (
                <circle key={i} cx="130" cy="130" r={r} fill="none" stroke="#2A3441" strokeWidth="1" />
              ))}
              <line x1="20" y1="130" x2="240" y2="130" stroke="#2A3441" strokeWidth="1" />
              <line x1="130" y1="20" x2="130" y2="240" stroke="#2A3441" strokeWidth="1" />
              <g className="radar-sweep" style={{ transformBox: "fill-box" }}>
                <path d="M130,130 L130,20 A110,110 0 0,1 207,53 Z" fill="url(#sweepGrad)" opacity="0.5" />
              </g>
              <defs>
                <linearGradient id="sweepGrad" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0%" stopColor="#3DD6C4" stopOpacity="0" />
                  <stop offset="100%" stopColor="#3DD6C4" stopOpacity="0.5" />
                </linearGradient>
              </defs>
              {data.map((c, i) => {
                const radius = 118 - (c.score / 100) * 95;
                const rad = (c.angle * Math.PI) / 180;
                const x = 130 + radius * Math.cos(rad);
                const y = 130 + radius * Math.sin(rad);
                const isHover = hovered === c.name;
                return (
                  <g key={i} onMouseEnter={() => setHovered(c.name)} onMouseLeave={() => setHovered(null)} style={{ cursor: "pointer" }}>
                    <circle cx={x} cy={y} r={isHover ? 7 : 5} fill={scoreColor(c.score)} opacity={isHover ? 1 : 0.85} />
                    {isHover && (
                      <text x={x} y={y - 11} textAnchor="middle" fontSize="9" fill="#E9EDF2" fontFamily="IBM Plex Mono">{c.name}</text>
                    )}
                  </g>
                );
              })}
              <circle cx="130" cy="130" r="2.5" fill="#FF8A3D" />
            </svg>
            <div style={{ fontSize: 10.5, color: "#5B6675", marginTop: 6 }}>Quanto mais próximo do centro, maior a prioridade do sinal.</div>
          </div>

          {/* City list */}
          <div style={{ flex: 1, minWidth: 340 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <div className="mono" style={{ fontSize: 10, color: "#5B6675", letterSpacing: 1 }}>{filtered.length} OPORTUNIDADES ENCONTRADAS</div>
              <div className="mono" style={{ fontSize: 10, color: "#5B6675" }}>ORDENADO POR SCORE</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map((c, i) => {
                const isActive = activeCity && c.name === activeCity.name;
                return (
                <div key={i} className="corner-card" onClick={() => setSelectedCity(c.name)}
                  style={{ border: `1px solid ${isActive ? "#3DD6C4" : "#2A3441"}`, borderRadius: 4, padding: "14px 16px", background: isActive ? "#132022" : "#0F141A", display: "flex", alignItems: "center", gap: 16, cursor: "pointer", transition: "all 0.15s" }}>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: scoreColor(c.score), width: 52, textAlign: "right" }}>
                    {c.score}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <MapPin size={12} color="#5B6675" />
                      <span className="display" style={{ fontWeight: 600, fontSize: 14.5 }}>{c.name}</span>
                      <span style={{ fontSize: 11, color: "#5B6675" }}>· {c.region} · {c.pop}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {c.tags.map(t => (
                        <span key={t} style={{ fontSize: 10.5, color: "#3DD6C4", border: "1px solid #24424040", background: "#132022", padding: "2px 7px", borderRadius: 2 }}>{t}</span>
                      ))}
                    </div>
                  </div>
                  <ChevronRight size={16} color={isActive ? "#3DD6C4" : "#5B6675"} />
                </div>
              );})}
              {filtered.length === 0 && (
                <div style={{ padding: 40, textAlign: "center", color: "#5B6675", fontSize: 13, border: "1px dashed #2A3441", borderRadius: 4 }}>
                  Nenhum sinal encontrado com esses filtros. Ajuste o score mínimo ou a região.
                </div>
              )}
            </div>
          </div>

          {/* News & repercussion panel */}
          <div style={{ width: 320, flexShrink: 0 }}>

            {/* Shared filter bar for news + comments */}
            <div className="corner-card" style={{ border: "1px solid #2A3441", borderRadius: 4, padding: 14, background: "#0F141A", marginBottom: 16 }}>
              <div className="mono" style={{ fontSize: 10, color: "#5B6675", letterSpacing: 1, marginBottom: 10 }}>FILTRAR NOTÍCIAS E COMENTÁRIOS</div>
              <div style={{ display: "flex", alignItems: "center", border: "1px solid #2A3441", borderRadius: 3, padding: "7px 10px", background: "#151B23", marginBottom: 10 }}>
                <Search size={12} color="#5B6675" style={{ marginRight: 7 }} />
                <input value={newsQuery} onChange={e => setNewsQuery(e.target.value)} placeholder="Buscar palavra-chave..."
                  style={{ background: "transparent", border: "none", color: "#E9EDF2", fontSize: 12.5, width: "100%" }} />
              </div>
              <select value={newsSource} onChange={e => setNewsSource(e.target.value)}
                style={{ width: "100%", background: "#151B23", border: "1px solid #2A3441", borderRadius: 3, color: "#E9EDF2", fontSize: 12.5, padding: "7px 10px" }}>
                <option value="Todas">Todas as fontes</option>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="corner-card" style={{ border: "1px solid #2A3441", borderRadius: 4, padding: 16, background: "#0F141A", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                <Newspaper size={13} color="#FF8A3D" />
                <div className="mono" style={{ fontSize: 10, color: "#5B6675", letterSpacing: 1 }}>NOTÍCIAS — {activeCity?.name?.toUpperCase()}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
                {filteredNews.map((n, i) => (
                  <div key={i} style={{ paddingBottom: 12, borderBottom: i < filteredNews.length - 1 ? "1px solid #1E2530" : "none" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.4, color: "#E9EDF2", marginBottom: 5 }}>{n.headline}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span className="mono" style={{ fontSize: 10, color: "#3DD6C4" }}>{n.source}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 10, color: "#5B6675" }}>{n.time}</span>
                        <span style={{ fontSize: 10, color: "#5B6675", display: "flex", alignItems: "center", gap: 3 }}>
                          <MessageCircle size={10} /> {n.comments}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredNews.length === 0 && (
                  <div style={{ fontSize: 11.5, color: "#5B6675", padding: "8px 0" }}>Nenhuma notícia encontrada com esse filtro.</div>
                )}
              </div>
            </div>

            {/* G1-style comments window */}
            <div className="corner-card" style={{ border: "1px solid #2A3441", borderRadius: 4, padding: 16, background: "#0F141A" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <MessageCircle size={13} color="#3DD6C4" />
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>Comentários</span>
                  <span className="mono" style={{ fontSize: 10, color: "#5B6675" }}>({filteredComments.length})</span>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {["relevantes", "recentes"].map(s => (
                    <button key={s} onClick={() => setCommentSort(s)}
                      style={{
                        fontSize: 10, padding: "3px 8px", borderRadius: 2, cursor: "pointer",
                        background: commentSort === s ? "#1C2430" : "transparent",
                        border: `1px solid ${commentSort === s ? "#3DD6C4" : "#2A3441"}`,
                        color: commentSort === s ? "#E9EDF2" : "#5B6675",
                      }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {filteredComments.map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: 10 }}>
                    <div className="mono" style={{
                      width: 26, height: 26, borderRadius: "50%", background: "#1C2430", border: "1px solid #2A3441",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0, color: "#3DD6C4",
                    }}>
                      {c.name.split(" ").map(p => p[0]).join("")}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</span>
                        <span style={{ fontSize: 10, color: "#5B6675" }}>há {c.time}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#B5BCC7", lineHeight: 1.45, margin: "3px 0 5px" }}>{c.text}</div>
                      <div style={{ display: "flex", gap: 14 }}>
                        <span style={{ fontSize: 10.5, color: "#5B6675", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                          <ThumbsUp size={10} /> {c.likes}
                        </span>
                        <span style={{ fontSize: 10.5, color: "#5B6675", cursor: "pointer" }}>Responder</span>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredComments.length === 0 && (
                  <div style={{ fontSize: 11.5, color: "#5B6675", padding: "8px 0" }}>Nenhum comentário encontrado com esse filtro.</div>
                )}
              </div>

              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #1E2530", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "#5B6675", cursor: "pointer" }}>Ver todos os comentários</span>
                <ExternalLink size={11} color="#5B6675" />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
