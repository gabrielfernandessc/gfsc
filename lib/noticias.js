// Busca manchetes sobre a guerra do Irã no Google Notícias (RSS, sem chave):
//  - "mundo":  grandes veículos internacionais (Reuters, AP, BBC, Al Jazeera...), traduzidos pro português
//  - "brasil": imprensa brasileira
// e marca as "grandes", que são as únicas que viram notificação no modo "só grandes".
const { traduzir } = require("./traducao.js");

const sites = (lista) => "(" + lista.map((v) => "site:" + v).join(" OR ") + ")";
const MUNDO = "hl=en-US&gl=US&ceid=US:en";

const FONTES = [
  { origem: "mundo", regiao: MUNDO, busca: `intitle:Iran ${sites(["reuters.com", "apnews.com", "bbc.com", "aljazeera.com", "theguardian.com"])} when:3d` },
  { origem: "mundo", regiao: MUNDO, busca: `intitle:Iran ${sites(["nytimes.com", "bloomberg.com", "ft.com", "france24.com", "dw.com", "cnn.com", "wsj.com", "axios.com", "bbc.co.uk"])} when:3d` },
  { origem: "brasil", regiao: "hl=pt-BR&gl=BR&ceid=BR:pt-419", busca: "(Irã OR Irão OR Teerã) (guerra OR ataque OR míssil OR mísseis OR bombardeio OR Israel OR EUA OR nuclear) when:3d" }
];
const LIMITE = { mundo: 30, brasil: 20 };
const POR_VEICULO = 6;
// Só entra manchete que fala do Irã no título (a busca por veículo às vezes traz matéria que só cita o Irã no texto).
const SOBRE_IRA = { mundo: /\b(Iran\w*|Tehran|Hormuz|Khamenei|IRGC|Persian Gulf)\b/i, brasil: /(Ir[ãa]|Ir[ãa]o|iranian\w*|Teer[ãa]|Ormuz|Khamenei)/i };
const NOME_VEICULO = { "Bloomberg.com": "Bloomberg", "DW.com": "DW" };

const GRANDE_PT = /\b(ataca|ataque|ataques|atacou|bombarde\w*|m[ií]sse(?:l|is)|explos\w*|invas[ãa]o|invade\w*|nuclear|ur[âa]nio|ogiva|cessar-fogo|tr[ée]gua|acordo de paz|declara(?:ção de)? guerra|guerra total|retalia\w*|ofensiva|Khamenei|Ormuz|mort[oa]s?|mata\w*|v[ií]timas)\b/i;
const GRANDE_EN = /\b(strikes?|struck|attacks?|attacked|missiles?|bomb\w*|explosions?|invasion|invades?|nuclear|uranium|warheads?|ceasefire|truce|peace deal|declares? war|all-out war|retaliat\w*|offensive|Khamenei|Hormuz|killed|kills|dead|casualties)\b/i;

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodifica(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTIDADES[e.toLowerCase()] ?? m;
    })
    .replace(/<[^>]+>/g, "")
    .trim();
}
const tag = (xml, nome) => { const m = xml.match(new RegExp(`<${nome}[^>]*>([\\s\\S]*?)</${nome}>`)); return m ? decodifica(m[1]) : ""; };
const chave = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").slice(0, 70);

function parse(xml, origem = "brasil", limite = 100) {
  const vistos = new Set();
  const itens = [];
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const bloco = m[1];
    const bruto = tag(bloco, "source");
    const fonte = NOME_VEICULO[bruto] || bruto;
    let titulo = tag(bloco, "title");
    if (bruto && titulo.endsWith(` - ${bruto}`)) titulo = titulo.slice(0, -(bruto.length + 3));
    const link = tag(bloco, "link");
    const ts = Date.parse(tag(bloco, "pubDate")) || 0;
    const k = chave(titulo);
    if (!titulo || !/^https:\/\//.test(link) || vistos.has(k)) continue;
    vistos.add(k);
    itens.push({ id: (origem === "mundo" ? "w-" : "") + k.replace(/ /g, "-").slice(0, 60), titulo, link, fonte, ts, origem });
  }
  return itens.sort((a, b) => b.ts - a.ts).slice(0, limite);
}

async function buscarFonte(f) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(f.busca)}&${f.regiao}`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (CNA radar)" }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`feed ${f.origem} ${r.status}`);
  return parse(await r.text(), f.origem);
}

// Junta as buscas de cada origem: tira repetidas e o que não é sobre o Irã, limita por veículo.
function combinar(itens) {
  const vistos = new Set();
  const porVeiculo = {};
  const conta = { mundo: 0, brasil: 0 };
  return itens
    .sort((a, b) => b.ts - a.ts)
    .filter((i) => {
      if (vistos.has(i.id) || !SOBRE_IRA[i.origem].test(i.titulo)) return false;
      const v = i.origem + i.fonte;
      if ((porVeiculo[v] = (porVeiculo[v] || 0) + 1) > POR_VEICULO) return false;
      if (++conta[i.origem] > LIMITE[i.origem]) return false;
      vistos.add(i.id);
      return true;
    });
}

async function buscarNoticias() {
  const resultados = await Promise.allSettled(FONTES.map(buscarFonte));
  const ok = resultados.filter((r) => r.status === "fulfilled");
  if (!ok.length) throw new Error("nenhuma fonte respondeu");
  const itens = combinar(ok.flatMap((r) => r.value));

  // Traduz os internacionais (o original fica guardado pra "ver original").
  const mundo = itens.filter((i) => i.origem === "mundo");
  const traducoes = await traduzir(mundo.map((i) => i.titulo)).catch(() => mundo.map(() => null));
  mundo.forEach((i, k) => {
    i.original = i.titulo;
    i.traduzido = !!traducoes[k];
    if (traducoes[k]) i.titulo = traducoes[k];
  });

  itens.forEach((i) => { i.grande = GRANDE_PT.test(i.titulo) || (!!i.original && GRANDE_EN.test(i.original)); });
  return itens.sort((a, b) => b.ts - a.ts);
}

module.exports = { buscarNoticias, parse, GRANDE_PT, GRANDE_EN };
