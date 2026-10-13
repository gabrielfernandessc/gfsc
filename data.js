// Placar oficial. Atualize aqui quando o grupo validar novos pontos
// (o que for lançado pelo site fica salvo só no navegador de quem lançou).
window.CNA = {
  atualizadoEm: "2026-10-13",

  jogadores: [
    { id: "julio",   nome: "Julio",   pontos: 16, emoji: "🦅", cor: "#ffd60a", apelido: "O Abutre-Mor" },
    { id: "beatriz", nome: "Beatriz", pontos: 12, emoji: "📡", cor: "#ff5d8f", apelido: "Plantão Ambulante" },
    { id: "gabriel", nome: "Gabriel", pontos: 11, emoji: "🤠", cor: "#4cc9f0", apelido: "Dedo Mais Rápido do Oeste" },
    { id: "melinny", nome: "Melinny", pontos: 9,  emoji: "🔮", cor: "#b388ff", apelido: "Médium Oficial do Grupo" },
    { id: "jg",      nome: "JG",      pontos: 6,  emoji: "🐢", cor: "#5ef38c", apelido: "Sabe Primeiro, Avisa Depois" },
    { id: "jv",      nome: "JV",      pontos: 6,  emoji: "🦥", cor: "#ff9f1c", apelido: "Viu no Twitter Ontem" }
  ],

  regras: [
    { id: "estratosferica", nome: "Morte estratosférica", pontos: 5,  emoji: "🚀", desc: "Aquela que derruba a internet e vira capa no mundo inteiro." },
    { id: "famoso",         nome: "Morte de famoso",      pontos: 3,  emoji: "⚰️", desc: "Teve Plantão, nota de pesar e foto em preto e branco? Conta." },
    { id: "prisao",         nome: "Prisão importante",    pontos: 2,  emoji: "🚔", desc: "Algemado em rede nacional, de preferência às 6h da manhã." },
    { id: "evento",         nome: "Evento importante",    pontos: 2,  emoji: "🌊", desc: "Tragédia ou acontecimento histórico. Ex: Barragem de Mariana." },
    { id: "politico",       nome: "Evento político importante", pontos: 1, emoji: "🏛️", desc: "Brasília sendo Brasília. Renúncia, impeachment, delação..." },
    { id: "faustao",        nome: "Missão especial: Faustão", pontos: 6, emoji: "🎯", desc: "Ô loco, meu! Só pode ser cumprida uma vez.", especial: true },
    { id: "previsao",       nome: "Previsão fracassada",  pontos: -2, emoji: "🤡", desc: "Profetizou, errou, pagou. Nostradamus de araque.", penalidade: true }
  ]
};
