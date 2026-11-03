// Roda 1x por dia (vercel.json → crons). Manda no máximo UMA notificação por aparelho:
//  - modo "diario":  resumo com quantas notícias saíram e a principal
//  - modo "grandes": só se apareceu notícia grande desde o último aviso
// Mesmo se for chamado várias vezes, ninguém recebe mais de um aviso a cada 20h.
const { TIPO } = require("../lib/banco.js");
const { buscarNoticias } = require("../lib/noticias.js");
const push = require("../lib/push.js");

const INTERVALO_MIN = 20 * 60 * 60 * 1000;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ erro: "não autorizado" });
  }
  if (!TIPO) return res.status(501).json({ erro: "banco não configurado" });

  const agora = Date.now();
  const origem = `https://${req.headers.host}`;
  const resumo = { inscritos: 0, enviados: 0, pulados: 0, removidos: 0, erros: 0 };

  try {
    const itens = await buscarNoticias();
    const inscritos = await push.listarInscritos();
    resumo.inscritos = inscritos.length;

    for (const s of inscritos) {
      if (agora - (s.ultimoEnvio || 0) < INTERVALO_MIN) { resumo.pulados++; continue; }
      const desde = Math.max(s.ultimoVisto || 0, agora - 36 * 60 * 60 * 1000);
      const novos = itens.filter((i) => i.ts > desde);
      const grandes = novos.filter((i) => i.grande);
      const lista = s.modo === "grandes" ? grandes : novos;
      if (!lista.length) { resumo.pulados++; await push.salvarInscrito(s.id, { ...s, ultimoVisto: agora }); continue; }

      const mundo = (i) => i.origem === "mundo";
      const destaque = grandes.find(mundo) || grandes[0] || lista.find(mundo) || lista[0];
      const payload = s.modo === "grandes"
        ? { title: "🔥 Radar Irã: notícia grande", body: destaque.titulo + (lista.length > 1 ? ` (+${lista.length - 1} outras)` : ""), url: "/#radar" }
        : { title: "🇮🇷 Radar Irã: resumo do dia", body: `${lista.length} notícia${lista.length > 1 ? "s" : ""} nova${lista.length > 1 ? "s" : ""}. Destaque: ${destaque.titulo}`, url: "/#radar" };

      const r = await push.enviar(s.sub, { ...payload, tag: "cna-radar" }, origem);
      if (r === "expirada") { resumo.removidos++; await push.removerInscrito(s.id); continue; }
      if (r === "erro") { resumo.erros++; continue; }
      resumo.enviados++;
      await push.salvarInscrito(s.id, { ...s, ultimoEnvio: agora, ultimoVisto: agora });
    }
    return res.status(200).json(resumo);
  } catch (e) {
    return res.status(500).json({ ...resumo, erro: String(e.message || e).slice(0, 200) });
  }
};
