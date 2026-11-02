// GET    → chave pública pra assinar notificações
// POST   { sub, modo, nome, teste? } → salva (ou atualiza) a inscrição deste aparelho
// DELETE { endpoint } → cancela
const { TIPO, corpo } = require("../lib/banco.js");
const push = require("../lib/push.js");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!TIPO) return res.status(501).json({ erro: "banco não configurado" });
  const origem = `https://${req.headers.host}`;

  try {
    if (req.method === "GET") {
      return res.status(200).json({ publicKey: (await push.chavesVapid()).publicKey });
    }

    if (req.method === "POST") {
      const { sub, modo, nome, teste } = corpo(req);
      if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys) {
        return res.status(400).json({ erro: "inscrição inválida" });
      }
      if (!push.MODOS.includes(modo)) return res.status(400).json({ erro: "modo inválido" });
      const id = push.idDe(sub.endpoint);
      const antigo = (await push.listarInscritos()).find((x) => x.id === id);
      await push.salvarInscrito(id, {
        sub: { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } },
        modo,
        nome: String(nome || "").slice(0, 24),
        criado: (antigo && antigo.criado) || Date.now(),
        ultimoEnvio: (antigo && antigo.ultimoEnvio) || 0,
        ultimoVisto: (antigo && antigo.ultimoVisto) || Date.now()
      });
      if (teste) {
        const r = await push.enviar(sub, {
          title: "📡 Radar Irã ativado",
          body: modo === "diario" ? "Você vai receber no máximo um resumo por dia, à noite." : "Só aviso quando tiver notícia grande, no máximo uma vez por dia.",
          url: "/#radar"
        }, origem);
        return res.status(200).json({ ok: true, teste: r });
      }
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const { endpoint } = corpo(req);
      if (endpoint) await push.removerInscrito(push.idDe(endpoint));
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ erro: "método não permitido" });
  } catch (e) {
    return res.status(500).json({ erro: "falha nas notificações" });
  }
};
