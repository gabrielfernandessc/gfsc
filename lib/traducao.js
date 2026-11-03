// Traduz manchetes do inglês pro português.
// 1º tradutor gratuito do Google (várias de uma vez), 2º MyMemory, senão fica em inglês.
// Cada manchete é traduzida uma vez só: o resultado fica guardado no Redis por 7 dias.
const crypto = require("crypto");
const { TIPO, pipeline } = require("./banco.js");

const memoria = new Map();
const PREFIXO = "cna:trad:";
const VALIDADE = 7 * 24 * 60 * 60;
const chave = (t) => crypto.createHash("sha1").update(t).digest("hex").slice(0, 20);

async function google(textos) {
  const corpo = new URLSearchParams();
  textos.forEach((t) => corpo.append("q", t));
  const r = await fetch("https://translate.googleapis.com/translate_a/t?client=gtx&sl=en&tl=pt", {
    method: "POST",
    body: corpo,
    signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) throw new Error(`google ${r.status}`);
  const d = await r.json();
  const lista = Array.isArray(d) ? d.map((x) => (Array.isArray(x) ? x[0] : x)) : [];
  if (lista.length !== textos.length || lista.some((x) => typeof x !== "string")) throw new Error("google formato");
  return lista;
}

async function mymemory(texto) {
  const url = `https://api.mymemory.translated.net/get?langpair=en|pt-BR&q=${encodeURIComponent(texto)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`mymemory ${r.status}`);
  const d = await r.json();
  const t = d && d.responseData && d.responseData.translatedText;
  if (!t || d.responseStatus !== 200 || /MYMEMORY WARNING|QUERY LENGTH/i.test(t)) throw new Error("mymemory cota");
  return t;
}

// O tradutor às vezes responde em português de Portugal; ajusta os termos mais comuns em manchete.
const PT_BR = [
  [/\bIrão\b/g, "Irã"], [/\bTeerão\b/g, "Teerã"], [/\bMédio Oriente\b/g, "Oriente Médio"], [/\bisraelitas?\b/gi, (m) => m.replace(/israelita/i, (x) => (x[0] === "I" ? "Israelense" : "israelense"))],
  [/\bMoscovo\b/g, "Moscou"], [/\bfacto\b/g, "fato"], [/\bregisto\b/g, "registro"], [/\bequipa\b/g, "equipe"], [/\bcontacto\b/g, "contato"],
  [/\bautocarro\b/g, "ônibus"], [/\bcomboio\b/g, "trem"], [/\bACTUAL\b/g, "ATUAL"]
];
const abrasileira = (t) => (t ? PT_BR.reduce((s, [de, para]) => s.replace(de, para), t) : t);

// Devolve um array do mesmo tamanho, com a tradução ou null onde não deu.
async function traduzir(textos) {
  return (await traduzirBruto(textos)).map(abrasileira);
}

async function traduzirBruto(textos) {
  const res = textos.map((t) => memoria.get(t) ?? null);
  let faltam = textos.map((t, i) => i).filter((i) => res[i] === null);

  if (faltam.length && TIPO) {
    try {
      const salvos = await pipeline(faltam.map((i) => ["GET", PREFIXO + chave(textos[i])]));
      faltam.forEach((i, k) => { if (salvos[k]) { res[i] = salvos[k]; memoria.set(textos[i], salvos[k]); } });
    } catch {}
    faltam = faltam.filter((i) => res[i] === null);
  }

  const novos = [];
  for (let k = 0; k < faltam.length; k += 25) {
    const lote = faltam.slice(k, k + 25);
    try {
      const t = await google(lote.map((i) => textos[i]));
      lote.forEach((i, j) => { res[i] = t[j]; novos.push(i); });
    } catch {
      for (const i of lote.slice(0, 12)) {
        try { res[i] = await mymemory(textos[i]); novos.push(i); } catch { break; }
      }
    }
  }

  novos.forEach((i) => memoria.set(textos[i], res[i]));
  if (novos.length && TIPO) {
    try { await pipeline(novos.map((i) => ["SET", PREFIXO + chave(textos[i]), res[i], "EX", VALIDADE])); } catch {}
  }
  return res;
}

module.exports = { traduzir };
