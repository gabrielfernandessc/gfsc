// Placar compartilhado. Usa um Redis da Upstash (Vercel > Storage > Upstash Redis).
// Sem as variáveis de ambiente, responde 501 e o site funciona em modo local.
const CHAVE = "cna:estado";
const LIMITE = 3 * 1024 * 1024; // ~3 MB (fotos já chegam reduzidas pra 256px)

const URL_REDIS = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(comando) {
  const r = await fetch(URL_REDIS, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(comando)
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return (await r.json()).result;
}

async function lerEstado() {
  const bruto = await redis(["GET", CHAVE]);
  return bruto ? JSON.parse(bruto) : null;
}

function corpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_REDIS || !TOKEN) return res.status(501).json({ erro: "banco não configurado" });

  try {
    if (req.method === "GET") {
      return res.status(200).json({ estado: await lerEstado() });
    }

    if (req.method === "PUT") {
      const { base, estado } = corpo(req);
      if (!estado || !Array.isArray(estado.jogadores) || !Array.isArray(estado.eventos)) {
        return res.status(400).json({ erro: "estado inválido" });
      }
      const texto = JSON.stringify(estado);
      if (texto.length > LIMITE) return res.status(413).json({ erro: "grande demais" });

      // Controle de versão simples: se alguém salvou antes, devolve o placar atual.
      const atual = await lerEstado();
      const versaoAtual = atual ? atual.versao : null;
      if (versaoAtual !== (base ?? null)) return res.status(409).json({ estado: atual });

      await redis(["SET", CHAVE, texto]);
      return res.status(200).json({ ok: true, versao: estado.versao });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ erro: "método não permitido" });
  } catch (e) {
    return res.status(500).json({ erro: "falha no banco" });
  }
};
