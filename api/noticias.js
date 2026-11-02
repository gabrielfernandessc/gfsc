// Manchetes sobre a guerra do Irã. A CDN da Vercel guarda a resposta por 10 min,
// então o Google Notícias é consultado poucas vezes, não importa quantos abram o app.
const { buscarNoticias } = require("../lib/noticias.js");

module.exports = async (req, res) => {
  try {
    const itens = await buscarNoticias();
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=600, stale-while-revalidate=1800");
    return res.status(200).json({ atualizado: Date.now(), itens });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ erro: "não consegui buscar as notícias agora" });
  }
};
