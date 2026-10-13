// Compara o placar antes e depois de uma alteração e descreve o que mudou.
// Roda no navegador (modo local) e na função da Vercel (modo compartilhado),
// onde o servidor gera o registro sozinho pra ninguém conseguir apagar ou forjar.
(function (raiz) {
  "use strict";

  const MAX_REGISTROS = 400;
  const MOTIVOS = {
    reset: { emoji: "♻️", texto: "voltou tudo pro placar oficial" },
    importar: { emoji: "📦", texto: "importou um backup e substituiu o placar" }
  };

  const sinal = (n) => (n > 0 ? `+${n}` : String(n));
  const id = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

  function descreverEvento(e, jogadores, regras) {
    const j = jogadores.find((x) => x.id === e.jogador);
    const r = regras.find((x) => x.id === e.regra);
    return `${j ? j.nome : "alguém"} ${sinal(e.pontos)} (${r ? r.nome : e.regra})${e.nota ? `: “${e.nota}”` : ""}`;
  }

  function comparar(antes, depois, regras) {
    const itens = [];
    const add = (emoji, texto) => itens.push({ emoji, texto });
    const jA = (antes && antes.jogadores) || [];
    const jD = (depois && depois.jogadores) || [];
    const eA = (antes && antes.eventos) || [];
    const eD = (depois && depois.eventos) || [];
    const idsEA = new Set(eA.map((e) => e.id));
    const idsED = new Set(eD.map((e) => e.id));

    eD.filter((e) => !idsEA.has(e.id)).forEach((e) => add(e.pontos < 0 ? "🤡" : "📣", `lançou ${descreverEvento(e, jD, regras)}`));
    eA.filter((e) => !idsED.has(e.id)).forEach((e) => add("↩️", `desfez o anúncio ${descreverEvento(e, jA.concat(jD), regras)}`));

    jD.forEach((d) => {
      const a = jA.find((x) => x.id === d.id);
      if (!a) {
        add("➕", `adicionou ${d.nome} à competição${d.pontos ? ` com ${d.pontos} pts` : ""}`);
        return;
      }
      if (a.nome !== d.nome) add("✏️", `renomeou ${a.nome} para ${d.nome}`);
      if (a.pontos !== d.pontos) add("🧮", `mudou os pontos de ${d.nome} na mão: ${a.pontos} → ${d.pontos} (${sinal(d.pontos - a.pontos)})`);
      if ((a.foto || "") !== (d.foto || "")) add("📷", d.foto ? (a.foto ? `trocou a foto de ${d.nome}` : `colocou foto em ${d.nome}`) : `removeu a foto de ${d.nome}`);
      if ((a.apelido || "") !== (d.apelido || "")) add("🏷️", `mudou o apelido de ${d.nome} para “${d.apelido || "(sem apelido)"}”`);
      if (a.emoji !== d.emoji) add("😶", `trocou o emoji de ${d.nome}: ${a.emoji} → ${d.emoji}`);
      if (a.cor !== d.cor) add("🎨", `trocou a cor de ${d.nome}`);
    });
    jA.filter((a) => !jD.some((d) => d.id === a.id)).forEach((a) => add("🚪", `removeu ${a.nome} da competição`));

    return itens;
  }

  // Devolve a lista de registros já com as novas entradas (mais recentes primeiro).
  function registrar(antes, depois, { autor, aparelho, motivo, regras, ts }) {
    const quando = ts || Date.now();
    const quem = String(autor || "Anônimo").slice(0, 24);
    const onde = String(aparelho || "").slice(0, 24);
    const base = ((antes && antes.registros) || []).slice();
    const novos = MOTIVOS[motivo] ? [MOTIVOS[motivo]] : comparar(antes, depois, regras || []);
    const entradas = novos.map((n) => ({ id: id(), ts: quando, autor: quem, aparelho: onde, emoji: n.emoji, texto: n.texto }));
    return entradas.concat(base).slice(0, MAX_REGISTROS);
  }

  function aparelhoDe(ua) {
    ua = String(ua || "");
    if (/iPhone/i.test(ua)) return "iPhone";
    if (/iPad/i.test(ua)) return "iPad";
    if (/Android/i.test(ua)) return "Android";
    if (/Windows/i.test(ua)) return "Windows";
    if (/Mac OS X|Macintosh/i.test(ua)) return "Mac";
    if (/Linux/i.test(ua)) return "Linux";
    return "";
  }

  const api = { registrar, comparar, aparelhoDe, MAX_REGISTROS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.CNARegistro = api;
})(typeof window !== "undefined" ? window : globalThis);
