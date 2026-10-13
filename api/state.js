// Placar compartilhado, guardado num Redis conectado ao projeto na Vercel (aba Storage).
// Funciona com Upstash (variáveis *KV_REST_API_URL/TOKEN ou UPSTASH_REDIS_REST_URL/TOKEN)
// ou com qualquer Redis que forneça REDIS_URL / KV_URL.
// Sem nenhum deles, responde 501 e o site funciona em modo local.
const { registrar, aparelhoDe } = require("../registro.js");
const { regras } = require("../data.js");

const CHAVE = "cna:estado";
const LIMITE = 3 * 1024 * 1024; // ~3 MB (fotos já chegam reduzidas pra 256px)

// Aceita variáveis com qualquer prefixo escolhido na Vercel
// (ex: KV_REST_API_URL, STORAGE_REST_API_URL, UPSTASH_REDIS_REST_URL).
function env(nomes, sufixos) {
  for (const n of nomes) if (process.env[n]) return process.env[n];
  const chave = Object.keys(process.env).sort().find((k) => process.env[k] && !/READ_ONLY/.test(k) && sufixos.some((s) => k.endsWith(s)));
  return chave ? process.env[chave] : "";
}

const REST_URL = env(["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL"], ["_REST_API_URL", "_REDIS_REST_URL"]);
const REST_TOKEN = env(["KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN"], ["_REST_API_TOKEN", "_REDIS_REST_TOKEN"]);
const REDIS_URL = env(["REDIS_URL", "KV_URL"], ["_REDIS_URL"]);
const TIPO = REST_URL && REST_TOKEN ? "upstash-rest" : REDIS_URL ? "redis-url" : "";

async function rest(comando) {
  const r = await fetch(REST_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(comando)
  });
  if (!r.ok) throw new Error(`redis rest ${r.status}`);
  return (await r.json()).result;
}

let cliente = null;
async function tcp() {
  if (!cliente) {
    const { createClient } = require("redis");
    cliente = createClient({ url: REDIS_URL, socket: { connectTimeout: 5000 } });
    cliente.on("error", () => {});
    await cliente.connect();
  }
  return cliente;
}

async function lerBruto() {
  if (TIPO === "upstash-rest") return rest(["GET", CHAVE]);
  return (await tcp()).get(CHAVE);
}
async function gravarBruto(texto) {
  if (TIPO === "upstash-rest") return rest(["SET", CHAVE, texto]);
  return (await tcp()).set(CHAVE, texto);
}
async function lerEstado() {
  const bruto = await lerBruto();
  return bruto ? JSON.parse(bruto) : null;
}

function corpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  // /api/state?diag=1 mostra se o banco está configurado (sem expor segredos).
  if (req.method === "GET" && /[?&]diag=1/.test(req.url || "")) {
    const info = { banco: TIPO || "nenhum" };
    if (TIPO) {
      try { const e = await lerEstado(); info.conectou = true; info.temPlacar = !!e; info.versao = e ? e.versao : null; }
      catch (e) { info.conectou = false; info.erro = String(e.message || e).slice(0, 200); }
    } else {
      info.dica = "Conecte um Redis em Storage no projeto da Vercel e faça Redeploy.";
    }
    return res.status(200).json(info);
  }

  if (!TIPO) return res.status(501).json({ erro: "banco não configurado" });

  try {
    if (req.method === "GET") {
      return res.status(200).json({ estado: await lerEstado() });
    }

    if (req.method === "PUT") {
      const { base, estado, autor, motivo } = corpo(req);
      if (!estado || !Array.isArray(estado.jogadores) || !Array.isArray(estado.eventos)) {
        return res.status(400).json({ erro: "estado inválido" });
      }

      // Controle de versão simples: se alguém salvou antes, devolve o placar atual.
      const atual = await lerEstado();
      const versaoAtual = atual ? atual.versao : null;
      if (versaoAtual !== (base ?? null)) return res.status(409).json({ estado: atual });

      // O registro é sempre gerado aqui, comparando com o que está salvo.
      // O que o navegador manda em "registros" é ignorado (só vale na primeira gravação).
      const salvo = { ...estado };
      salvo.registros = atual
        ? registrar(atual, estado, { autor, motivo, regras, aparelho: aparelhoDe(req.headers["user-agent"]) })
        : (Array.isArray(estado.registros) ? estado.registros : []);

      const texto = JSON.stringify(salvo);
      if (texto.length > LIMITE) return res.status(413).json({ erro: "grande demais" });

      await gravarBruto(texto);
      return res.status(200).json({ ok: true, estado: salvo });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ erro: "método não permitido" });
  } catch (e) {
    return res.status(500).json({ erro: "falha no banco" });
  }
};
