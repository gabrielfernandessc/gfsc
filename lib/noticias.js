// Busca manchetes sobre a guerra do Irã no Google Notícias (RSS em português, sem chave)
// e marca as "grandes", que são as únicas que podem virar notificação no modo "só grandes".
const BUSCA = '(Irã OR Irão OR Teerã) (guerra OR ataque OR míssil OR mísseis OR bombardeio OR Israel OR EUA OR nuclear) when:3d';
const FEED = `https://news.google.com/rss/search?q=${encodeURIComponent(BUSCA)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

const GRANDE = /\b(ataca|ataque|ataques|atacou|bombarde\w*|m[ií]sse(?:l|is)|explos\w*|invas[ãa]o|invade\w*|nuclear|ur[âa]nio|ogiva|cessar-fogo|tr[ée]gua|acordo de paz|declara(?:ção de)? guerra|guerra total|retalia\w*|ofensiva|Khamenei|Ormuz|mort[oa]s?|mata\w*|v[ií]timas)\b/i;

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

function parse(xml) {
  const vistos = new Set();
  const itens = [];
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const bloco = m[1];
    const fonte = tag(bloco, "source");
    let titulo = tag(bloco, "title");
    if (fonte && titulo.endsWith(` - ${fonte}`)) titulo = titulo.slice(0, -(fonte.length + 3));
    const link = tag(bloco, "link");
    const ts = Date.parse(tag(bloco, "pubDate")) || 0;
    const k = chave(titulo);
    if (!titulo || !/^https:\/\//.test(link) || vistos.has(k)) continue;
    vistos.add(k);
    itens.push({ id: k.replace(/ /g, "-").slice(0, 60), titulo, link, fonte, ts, grande: GRANDE.test(titulo) });
  }
  return itens.sort((a, b) => b.ts - a.ts).slice(0, 40);
}

async function buscarNoticias() {
  const r = await fetch(FEED, { headers: { "User-Agent": "Mozilla/5.0 (CNA radar)" } });
  if (!r.ok) throw new Error(`feed ${r.status}`);
  return parse(await r.text());
}

module.exports = { buscarNoticias, parse, GRANDE };
