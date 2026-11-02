// Notificações push (Web Push). As chaves VAPID são criadas sozinhas na primeira vez
// e guardadas no Redis, então não precisa configurar nada na Vercel.
const crypto = require("crypto");
const webpush = require("web-push");
const { cmd, lerJSON } = require("./banco.js");

const CHAVE_VAPID = "cna:vapid";
const CHAVE_INSCRITOS = "cna:push";
const MODOS = ["grandes", "diario"];

async function chavesVapid() {
  let k = await lerJSON(CHAVE_VAPID);
  if (!k) {
    const novas = webpush.generateVAPIDKeys();
    await cmd(["SET", CHAVE_VAPID, JSON.stringify(novas), "NX"]); // se dois criarem juntos, vale o primeiro
    k = await lerJSON(CHAVE_VAPID);
  }
  return k;
}

const idDe = (endpoint) => crypto.createHash("sha256").update(String(endpoint)).digest("hex").slice(0, 32);

async function listarInscritos() {
  const plano = (await cmd(["HGETALL", CHAVE_INSCRITOS])) || [];
  const pares = Array.isArray(plano) ? plano : Object.entries(plano).flat();
  const lista = [];
  for (let i = 0; i < pares.length; i += 2) {
    try { lista.push({ id: pares[i], ...JSON.parse(pares[i + 1]) }); } catch {}
  }
  return lista;
}

async function salvarInscrito(id, dados) {
  const { id: _, ...resto } = dados;
  await cmd(["HSET", CHAVE_INSCRITOS, id, JSON.stringify(resto)]);
}
const removerInscrito = (id) => cmd(["HDEL", CHAVE_INSCRITOS, id]);

// Envia e devolve "ok", "expirada" (inscrição morta, pode apagar) ou "erro".
async function enviar(sub, payload, origem) {
  const k = await chavesVapid();
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), {
      TTL: 12 * 60 * 60,
      vapidDetails: { subject: origem, publicKey: k.publicKey, privateKey: k.privateKey }
    });
    return "ok";
  } catch (e) {
    return e && (e.statusCode === 404 || e.statusCode === 410) ? "expirada" : "erro";
  }
}

module.exports = { chavesVapid, idDe, listarInscritos, salvarInscrito, removerInscrito, enviar, MODOS };
