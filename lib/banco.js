// Acesso ao Redis conectado ao projeto na Vercel (aba Storage).
// Funciona com Upstash (variáveis *_REST_API_URL/TOKEN, com qualquer prefixo)
// ou com qualquer Redis que forneça REDIS_URL / KV_URL.

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

// Executa um comando Redis, ex: cmd(["GET", "chave"]).
async function cmd(args) {
  args = args.map(String);
  if (TIPO === "upstash-rest") {
    const r = await fetch(REST_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${REST_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(args)
    });
    if (!r.ok) throw new Error(`redis rest ${r.status}`);
    return (await r.json()).result;
  }
  if (TIPO === "redis-url") return (await tcp()).sendCommand(args);
  throw new Error("banco não configurado");
}

async function lerJSON(chave) {
  const bruto = await cmd(["GET", chave]);
  return bruto ? JSON.parse(bruto) : null;
}
const gravarJSON = (chave, valor) => cmd(["SET", chave, JSON.stringify(valor)]);

function corpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

module.exports = { TIPO, cmd, lerJSON, gravarJSON, corpo };
