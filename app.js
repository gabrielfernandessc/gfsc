(() => {
  "use strict";

  const BASE = window.CNA;
  const CHAVE = "cna-estado-v2";
  const CHAVE_EU = "cna-eu";
  const API = "/api/state";
  const CORES = ["#ffd60a", "#ff5d8f", "#4cc9f0", "#b388ff", "#5ef38c", "#ff9f1c", "#ff2d3d", "#00f5d4", "#f15bb5", "#9ef01a", "#ffffff", "#7b8cff"];
  const Registro = window.CNARegistro;
  const regraPorId = Object.fromEntries(BASE.regras.map((r) => [r.id, r]));

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const sorteia = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const pts = (n) => `${n} pt${Math.abs(n) === 1 ? "" : "s"}`;
  const corValida = (c) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : "#ffffff");
  const fotoValida = (f) => (/^(data:image\/(png|jpe?g|webp|gif);base64,|https:\/\/|[\w][\w./-]*$)/i.test(f || "") ? f : "");

  // ---------- Estado ----------
  function estadoInicial() {
    return {
      versao: 0,
      jogadores: BASE.jogadores.map((j) => ({ foto: "", ...j })),
      eventos: [],
      registros: []
    };
  }

  function normaliza(e) {
    if (!e || !Array.isArray(e.jogadores) || !Array.isArray(e.eventos)) return null;
    return {
      versao: Number(e.versao) || 0,
      jogadores: e.jogadores
        .filter((j) => j && j.id && j.nome)
        .map((j) => ({
          id: String(j.id),
          nome: String(j.nome).slice(0, 20),
          apelido: String(j.apelido || "").slice(0, 40),
          emoji: String(j.emoji || "🙂").slice(0, 8),
          cor: corValida(j.cor),
          pontos: Number(j.pontos) || 0,
          foto: fotoValida(j.foto)
        })),
      eventos: e.eventos
        .filter((v) => v && v.jogador && v.regra)
        .map((v) => ({
          id: String(v.id || uid()),
          jogador: String(v.jogador),
          regra: String(v.regra),
          pontos: Number(v.pontos) || 0,
          nota: String(v.nota || "").slice(0, 80),
          ts: Number(v.ts) || Date.now()
        })),
      registros: (Array.isArray(e.registros) ? e.registros : [])
        .filter((g) => g && g.texto)
        .slice(0, Registro.MAX_REGISTROS)
        .map((g) => ({
          id: String(g.id || uid()),
          ts: Number(g.ts) || 0,
          autor: String(g.autor || "Anônimo").slice(0, 24),
          aparelho: String(g.aparelho || "").slice(0, 24),
          emoji: String(g.emoji || "•").slice(0, 8),
          texto: String(g.texto).slice(0, 200)
        }))
    };
  }

  function carregarLocal() {
    try { return normaliza(JSON.parse(localStorage.getItem(CHAVE))); } catch { return null; }
  }
  function salvarLocal() {
    try { localStorage.setItem(CHAVE, JSON.stringify(estado)); return true; }
    catch { toast("Memória do celular cheia 😵", "Tente uma foto menor ou remova alguma.", true); return false; }
  }

  let estado = carregarLocal() || estadoInicial();
  let online = false;
  let motivoOffline = ""; // "sem-banco" (API sem Redis) ou "erro" (sem internet / API fora)
  let enviando = false;

  // Quem está usando este aparelho (vai pro registro de alterações).
  let eu = "";
  try { eu = localStorage.getItem(CHAVE_EU) || ""; } catch {}
  const meuAparelho = Registro.aparelhoDe(navigator.userAgent);

  // Toda alteração passa por aqui: aplica, registra, salva, redesenha e sincroniza.
  // "motivo" resume alterações em massa (reset, importar) numa linha só no registro.
  function commit(mutacao, motivo) {
    const anterior = estado.versao;
    const antes = JSON.parse(JSON.stringify(estado));
    mutacao(estado);
    estado.versao = anterior + 1;
    estado.registros = Registro.registrar(antes, estado, { autor: eu || "Anônimo", aparelho: meuAparelho, motivo, regras: BASE.regras });
    salvarLocal();
    render();
    empurrar(anterior, motivo);
  }

  // ---------- Sincronização (Vercel + Redis, opcional) ----------
  async function puxar() {
    if (enviando || sheetAberta()) return;
    try {
      const r = await fetch(API, { cache: "no-store" });
      if (r.status === 501 || r.status === 404) { online = false; motivoOffline = "sem-banco"; renderModo(); return; }
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      online = true;
      const remoto = normaliza(d.estado);
      if (!remoto) {
        await empurrar(null); // primeira vez: semeia o servidor com o placar atual
      } else if (remoto.versao !== estado.versao) {
        estado = remoto;
        salvarLocal();
        render();
      }
    } catch {
      online = false;
      motivoOffline = "erro";
    }
    renderModo();
  }

  async function empurrar(base, motivo) {
    if (!online) return;
    enviando = true;
    try {
      const r = await fetch(API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base, estado, autor: eu || "Anônimo", motivo })
      });
      if (r.status === 409) {
        const d = await r.json();
        const remoto = normaliza(d.estado);
        if (remoto) { estado = remoto; salvarLocal(); render(); }
        toast("Alguém foi mais rápido! ⚡", "O placar foi atualizado por outra pessoa. Confere e tenta de novo.", true);
      } else if (!r.ok) {
        throw new Error(r.status);
      } else {
        // O servidor é quem escreve o registro oficial; usa a versão dele.
        const d = await r.json();
        const salvo = d && normaliza(d.estado);
        if (salvo && salvo.versao === estado.versao) { estado.registros = salvo.registros; salvarLocal(); renderHistorico(); }
      }
    } catch {
      toast("Sem conexão com o placar 📡", "Salvei aqui no seu celular por enquanto.", true);
    } finally {
      enviando = false;
    }
  }

  // ---------- Cálculos ----------
  function placar() {
    const soma = {};
    estado.eventos.forEach((e) => { soma[e.jogador] = (soma[e.jogador] || 0) + e.pontos; });
    const lista = estado.jogadores
      .map((j) => ({ ...j, total: j.pontos + (soma[j.id] || 0) }))
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
    let rank = 0, prev = null;
    lista.forEach((j, i) => { if (j.total !== prev) { rank = i + 1; prev = j.total; } j.rank = rank; });
    return lista;
  }
  const jogador = (id) => estado.jogadores.find((j) => j.id === id);
  const faustao = () => estado.eventos.find((e) => e.regra === "faustao");

  function avatar(j, cls = "") {
    const dentro = j.foto ? `<img src="${esc(j.foto)}" alt="" loading="lazy">` : esc(j.emoji || "🙂");
    return `<span class="av ${cls}" style="--c:${corValida(j.cor)}">${dentro}</span>`;
  }

  // ---------- Render ----------
  function render() {
    const lista = placar();
    renderStats(lista);
    renderPodio(lista);
    renderBoard(lista);
    renderMissao();
    renderRegras();
    renderHistorico();
    renderTicker(lista);
    renderModo();
  }

  function renderStats(lista) {
    const lider = lista[0];
    const total = lista.reduce((s, j) => s + j.total, 0);
    const empatados = lista.filter((j) => lider && j.total === lider.total).length;
    const vantagem = lider && lista[1] ? lider.total - lista[1].total : 0;
    $("#stats").innerHTML = `
      <div class="stat"><b>${total}</b><small>pontos de<br>pura desgraça</small></div>
      <div class="stat"><b>${estado.jogadores.length}</b><small>urubus<br>de plantão</small></div>
      <div class="stat"><b>${empatados > 1 ? "=" : "+" + vantagem}</b><small>${empatados > 1 ? "empate<br>no topo!" : "vantagem<br>do líder"}</small></div>`;
  }

  function renderPodio(lista) {
    const top = lista.slice(0, 3);
    const ordem = [1, 0, 2].filter((i) => top[i]);
    $("#podium").innerHTML = ordem.map((i) => {
      const j = top[i];
      return `<button class="pod pod--${i + 1}" data-edit="${esc(j.id)}" type="button">
        ${i === 0 ? '<span class="crown">👑</span>' : ""}
        ${avatar(j, i === 0 ? "av--xl" : "av--lg")}
        <div class="pod-name">${esc(j.nome)}</div>
        <div class="pod-pts">${pts(j.total)}</div>
        <div class="pod-block">${j.rank}<sup>º</sup></div>
      </button>`;
    }).join("");
  }

  function renderBoard(lista) {
    const board = $("#board");
    const antes = {};
    $$(".row", board).forEach((el) => { antes[el.dataset.id] = el.getBoundingClientRect().top; });

    const max = Math.max(1, lista[0] ? lista[0].total : 1);
    const ultimoRank = lista.length ? lista[lista.length - 1].rank : 0;
    board.innerHTML = lista.map((j) => {
      const lider = j.rank === 1;
      const lanterna = lista.length > 1 && j.rank === ultimoRank && !lider;
      const gap = lider ? "no topo 👑" : `a ${pts(lista[0].total - j.total)} do topo`;
      return `<li class="row ${lider ? "is-leader" : ""} ${lanterna ? "is-last" : ""}" data-id="${esc(j.id)}" style="--c:${corValida(j.cor)}">
        <button class="row-hit" data-edit="${esc(j.id)}" type="button" aria-label="Editar ${esc(j.nome)}"></button>
        <span class="row-rank">${j.rank}<sup>º</sup></span>
        ${avatar(j, "av--md")}
        <div class="row-info">
          <div class="row-name">${esc(j.nome)}
            ${lider ? '<span class="badge badge--gold">Líder</span>' : ""}
            ${lanterna ? '<span class="badge badge--red">Lanterna 🔦</span>' : ""}
          </div>
          <div class="row-nick">${esc(j.apelido || "Sem apelido (ainda)")}</div>
          <div class="row-bar"><i data-w="${Math.max(0, (j.total / max) * 100)}"></i></div>
        </div>
        <div class="row-pts"><b>${j.total}</b><small>pts</small><div class="row-gap">${gap}</div></div>
      </li>`;
    }).join("");

    requestAnimationFrame(() => {
      $$(".row-bar i", board).forEach((i) => { i.style.width = i.dataset.w + "%"; });
    });

    // FLIP: anima quem subiu ou desceu
    $$(".row", board).forEach((el) => {
      const de = antes[el.dataset.id];
      if (de === undefined) return;
      const dy = de - el.getBoundingClientRect().top;
      if (!dy) return;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 600, easing: "cubic-bezier(.2,.9,.25,1.1)" });
    });
  }

  function cardMissao() {
    const r = regraPorId.faustao;
    const f = faustao();
    const quem = f && jogador(f.jogador);
    return `<div class="mission ${f ? "is-done" : ""}">
      <span class="mission-target">${f ? "🫡" : "🎯"}</span>
      <div class="mission-top"><span class="mission-tag">Missão especial</span><span class="mission-pts">+${r.pontos}</span></div>
      <h3>Faustão</h3>
      <p>${f ? "Ô loco, meu! A missão mais aguardada da história do grupo foi cumprida." : "Vale 6 pontos pra quem anunciar primeiro. Só pode ser cumprida uma vez."}</p>
      <div class="mission-status"><i></i>${f ? `Cumprida por ${esc(quem ? quem.nome : "alguém")}` : "Status: Faustão segue invicto"}</div>
    </div>`;
  }

  function renderMissao() { $("#missionMini").innerHTML = cardMissao(); }

  function renderRegras() {
    $("#rules").innerHTML = BASE.regras.map((r) => {
      if (r.especial) return `<div class="rule rule--especial">${cardMissao()}</div>`;
      return `<div class="rule ${r.penalidade ? "rule--penalidade" : ""}">
        <span class="rule-emoji">${r.emoji}</span>
        <div><h3>${esc(r.nome)}</h3><p>${esc(r.desc)}</p></div>
        <span class="rule-pts">${r.pontos > 0 ? "+" : ""}${r.pontos}</span>
      </div>`;
    }).join("");
  }

  function quando(ts) {
    const d = new Date(ts);
    const min = Math.round((Date.now() - ts) / 60000);
    if (min < 1) return "agora mesmo";
    if (min < 60) return `há ${min} min`;
    if (min < 60 * 24) return `há ${Math.round(min / 60)} h`;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }

  function renderHistorico() {
    const evs = [...estado.eventos].sort((a, b) => b.ts - a.ts);
    $("#history").innerHTML = evs.length ? evs.map((e) => {
      const r = regraPorId[e.regra] || { emoji: "❓", nome: e.regra };
      const j = jogador(e.jogador) || { nome: "Ex-participante", emoji: "👻", cor: "#888888" };
      return `<li class="h-item">
        <span class="h-emoji">${r.emoji}</span>
        <div><div class="h-title">${esc(j.nome)} · ${esc(r.nome)}</div>
        <div class="h-meta">${e.nota ? `“${esc(e.nota)}” · ` : ""}${quando(e.ts)}</div></div>
        <div class="h-side"><span class="h-pts ${e.pontos < 0 ? "neg" : ""}">${e.pontos > 0 ? "+" : ""}${e.pontos}</span>
        <button class="h-del" data-del="${esc(e.id)}" type="button">desfazer</button></div>
      </li>`;
    }).join("") : `<li class="empty"><b>🦗</b>Nenhum anúncio lançado ainda.<br>O placar antigo veio do WhatsApp. Toque no 📣 quando a próxima bomba cair.</li>`;

    const regs = estado.registros || [];
    $("#logList").innerHTML = regs.length ? regs.map((g) => `
      <li class="log">
        <span class="log-emoji">${esc(g.emoji)}</span>
        <div class="log-body">
          <div class="log-text"><b>${esc(g.autor)}</b> ${esc(g.texto)}</div>
          <div class="log-meta">${dataHora(g.ts)}${g.aparelho ? ` · via ${esc(g.aparelho)}` : ""}</div>
        </div>
      </li>`).join("") : `<li class="empty"><b>🕵️</b>Nada mudou ainda.<br>Toda alteração de ponto, participante ou foto aparece aqui, com nome e horário.</li>`;
    $("#logCount").textContent = regs.length ? regs.length : "";

    const ult = regs[0];
    $("#lastChange").innerHTML = ult
      ? `<span class="lc-emoji">🕵️</span><span class="lc-text"><b>${esc(ult.autor)}</b> ${esc(ult.texto)} <small>· ${quando(ult.ts)}</small></span><span class="lc-go">ver registro ›</span>`
      : "";
    $("#lastChange").hidden = !ult;

    $("#euInfo").innerHTML = `Você está como <b>${esc(eu || "Anônimo")}</b> · <button type="button" class="link" data-eu>trocar</button>`;
  }

  function dataHora(ts) {
    if (!ts) return "data desconhecida";
    const d = new Date(ts);
    const hoje = new Date();
    const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === hoje.toDateString()) return `hoje, ${hora} (${quando(ts)})`;
    return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: d.getFullYear() === hoje.getFullYear() ? undefined : "numeric" })}, ${hora}`;
  }

  function renderTicker(lista) {
    const lider = lista[0];
    const lanterna = lista[lista.length - 1];
    const ult = [...estado.eventos].sort((a, b) => b.ts - a.ts)[0];
    const ultJ = ult && jogador(ult.jogador);
    const itens = [
      lider && `${lider.nome} lidera com ${pts(lider.total)}`,
      faustao() ? "Missão Faustão: CUMPRIDA" : "Faustão segue firme e forte, para desespero de alguns",
      ult && ultJ && `Último anúncio: ${ultJ.nome}, ${(regraPorId[ult.regra] || {}).nome || ""}`,
      lanterna && lista.length > 1 && `${lanterna.nome} segura a lanterna com ${pts(lanterna.total)}`,
      "Previsão errada custa 2 pontos. Pense antes de profetizar",
      "Fique ligado: o próximo plantão pode ser seu",
      "Grupo segue com notificações ativadas 24h por dia"
    ].filter(Boolean);
    const html = itens.map((t) => `<span>${esc(t)}</span>`).join("");
    $("#ticker").innerHTML = html + html;
  }

  function renderModo() {
    const el = $("#live");
    el.classList.toggle("is-local", !online);
    el.innerHTML = online ? "<i></i>AO VIVO" : "<i></i>LOCAL";
    const local = motivoOffline === "sem-banco"
      ? "🟡 <b>Modo local: o banco do placar não está configurado na Vercel.</b> Fotos, pontos e participantes ficam só neste aparelho e ninguém mais vê."
      : "🟡 <b>Sem conexão com o placar.</b> O que você mudar agora fica só neste aparelho até a conexão voltar.";
    $("#modeNote").innerHTML = online ? "🟢 <b>Placar compartilhado.</b> Tudo que você muda aqui aparece pra galera toda." : local;
    $("#syncBanner").hidden = online;
    $("#syncBanner").innerHTML = online ? "" : `<span>⚠️</span><div>${local.replace("🟡 ", "")}</div>`;
  }

  // ---------- Sheets ----------
  let sheetAtual = null;
  const sheetAberta = () => !!sheetAtual;

  function abrirSheet(el) {
    sheetAtual = el;
    $("#sheetBackdrop").hidden = false;
    el.hidden = false;
    el.scrollTop = 0;
    el.style.transform = "";
    document.body.style.overflow = "hidden";
  }
  function fecharSheet() {
    if (!sheetAtual) return;
    sheetAtual.hidden = true;
    sheetAtual = null;
    $("#sheetBackdrop").hidden = true;
    document.body.style.overflow = "";
  }
  $("#sheetBackdrop").addEventListener("click", fecharSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharSheet(); });

  // Arrastar pra baixo pra fechar
  $$(".sheet").forEach((sheet) => {
    let y0 = null, dy = 0;
    sheet.addEventListener("touchstart", (e) => { if (sheet.scrollTop <= 0) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
    sheet.addEventListener("touchmove", (e) => {
      if (y0 === null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      if (dy > 0) sheet.style.transform = `translate(-50%, ${dy}px)`;
    }, { passive: true });
    sheet.addEventListener("touchend", () => {
      if (y0 === null) return;
      if (dy > 110) fecharSheet(); else sheet.style.transform = "";
      y0 = null;
    });
  });

  // ---------- Lançar anúncio ----------
  const form = $("#announceForm");
  let escolha = { jogador: null, regra: null };

  function abrirAnuncio(jogadorId = null) {
    escolha = { jogador: jogadorId, regra: null };
    $("#note").value = "";
    $("#playerChips").innerHTML = placar().map((j) => `
      <button type="button" class="chip" data-p="${esc(j.id)}" style="--c:${corValida(j.cor)}">${avatar(j, "av--sm")}${esc(j.nome)}</button>`).join("");
    const feito = faustao();
    $("#ruleOptions").innerHTML = BASE.regras.map((r) => `
      <button type="button" class="opt ${r.pontos < 0 ? "neg" : ""}" data-r="${r.id}" ${r.especial && feito ? "disabled" : ""}>
        <span>${r.emoji}</span><span>${esc(r.nome)}${r.especial && feito ? " <small>(já cumprida)</small>" : ""}</span><b>${r.pontos > 0 ? "+" : ""}${r.pontos}</b>
      </button>`).join("");
    atualizaAnuncio();
    abrirSheet($("#sheet"));
  }

  function atualizaAnuncio() {
    $$(".chip", form).forEach((c) => c.classList.toggle("is-on", c.dataset.p === escolha.jogador));
    $$(".opt", form).forEach((o) => o.classList.toggle("is-on", o.dataset.r === escolha.regra));
    const btn = $("#submitBtn");
    const j = escolha.jogador && jogador(escolha.jogador);
    const r = escolha.regra && regraPorId[escolha.regra];
    btn.disabled = !(j && r);
    btn.textContent = j && r
      ? (r.pontos < 0 ? `Aplicar ${r.pontos} no ${j.nome} 🤡` : `Confirmar +${pts(r.pontos)} pro ${j.nome}`)
      : !j ? "Escolha quem avisou" : "Escolha o que aconteceu";
  }

  form.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    const opt = e.target.closest(".opt");
    if (chip) escolha.jogador = chip.dataset.p;
    if (opt && !opt.disabled) escolha.regra = opt.dataset.r;
    if (chip || opt) { vibra(10); atualizaAnuncio(); }
  });

  const FRASES_BOAS = [
    "Dedo mais rápido do grupo!", "O grupo agradece o luto em primeira mão.", "Plantão da Globo quem?",
    "Jornalismo investigativo de alto nível.", "William Bonner tá com inveja.", "Notificação ativada é outra coisa.",
    "Esse aí dorme com o celular na mão."
  ];
  const FRASES_RUINS = ["Nostradamus de araque!", "Errou feio, errou rude.", "A bola de cristal tava embaçada.", "Mãe Dináh se revirou.", "Profecia: reprovada."];

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const j = jogador(escolha.jogador);
    const r = regraPorId[escolha.regra];
    if (!j || !r) return;
    if (r.especial && faustao()) return;
    const nota = $("#note").value.trim().slice(0, 80);
    commit((s) => s.eventos.push({ id: uid(), jogador: j.id, regra: r.id, pontos: r.pontos, nota, ts: Date.now() }));
    fecharSheet();
    trocarAba("ranking");
    window.scrollTo({ top: 0, behavior: "smooth" });
    const row = $(`.row[data-id="${CSS.escape(j.id)}"]`);
    if (row) { row.classList.remove("flash"); void row.offsetWidth; row.classList.add("flash"); }
    if (r.pontos < 0) {
      vibra([60, 40, 60]);
      toast(`${r.pontos} pro ${j.nome} 🤡`, sorteia(FRASES_RUINS), true);
      chacoalha();
    } else {
      vibra([30, 30, 80]);
      toast(r.especial ? "🎯 MISSÃO FAUSTÃO CUMPRIDA!" : `+${pts(r.pontos)} pro ${j.nome}!`, r.especial ? "Ô loco, meu! Que momento histórico." : sorteia(FRASES_BOAS));
      confete(r.especial ? 320 : r.pontos >= 5 ? 220 : 130);
    }
  });

  // ---------- Participantes ----------
  const pForm = $("#playerForm");
  let editando = null; // cópia do jogador sendo editado

  function abrirJogador(id) {
    const j = id ? jogador(id) : null;
    editando = j ? { ...j } : { id: null, nome: "", apelido: "", emoji: sorteia(["😎", "🐸", "👽", "🦊", "🐙", "🦄", "🤖", "🐔"]), cor: sorteia(CORES), pontos: 0, foto: "" };
    $("#playerTitle").textContent = j ? "Editar participante" : "Novo participante";
    $("#pNome").value = editando.nome;
    $("#pApelido").value = editando.apelido;
    $("#pEmoji").value = editando.emoji;
    $("#pDelete").hidden = !j;
    $("#pAnunciar").hidden = !j;
    $("#pSave").textContent = j ? "Salvar alterações" : "Adicionar à competição";
    $("#swatches").innerHTML = CORES.map((c) => `<button type="button" class="swatch" data-cor="${c}" style="--c:${c}" aria-label="Cor ${c}"></button>`).join("");
    atualizaJogadorPreview();
    abrirSheet($("#playerSheet"));
  }

  function totalDe(id) { return (placar().find((x) => x.id === id) || {}).total; }

  function atualizaJogadorPreview() {
    const e = editando;
    e.emoji = $("#pEmoji").value.trim() || "🙂";
    $("#photoPreview").outerHTML = `<span id="photoPreview">${avatar(e, "av--xxl")}</span>`;
    $("#photoRemove").hidden = !e.foto;
    $("#photoLabel").textContent = e.foto ? "Trocar foto" : "Adicionar foto";
    $$(".swatch", pForm).forEach((s) => s.classList.toggle("is-on", s.dataset.cor === e.cor));
    $("#pPontos").textContent = e.pontos;
    const soma = e.id ? totalDe(e.id) - jogador(e.id).pontos : 0;
    $("#pTotal").textContent = `Total no placar: ${pts(e.pontos + soma)}${soma ? ` (${soma > 0 ? "+" : ""}${soma} lançados pelo site)` : ""}`;
  }

  pForm.addEventListener("input", (e) => { if (e.target.id === "pEmoji") atualizaJogadorPreview(); });
  pForm.addEventListener("click", (e) => {
    const sw = e.target.closest(".swatch");
    const st = e.target.closest("[data-d]");
    if (sw) { editando.cor = sw.dataset.cor; atualizaJogadorPreview(); vibra(8); }
    if (st) { editando.pontos += Number(st.dataset.d); atualizaJogadorPreview(); vibra(8); }
  });

  $("#photoInput").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      editando.foto = await reduzFoto(file);
      atualizaJogadorPreview();
    } catch {
      toast("Não rolou essa foto 😬", "Tenta outra imagem (JPG ou PNG).", true);
    }
  });
  $("#photoRemove").addEventListener("click", () => { editando.foto = ""; atualizaJogadorPreview(); });

  // Recorta no centro e reduz pra 256px, assim cabe no celular e no servidor
  function reduzFoto(file) {
    return new Promise((ok, falha) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const lado = 256;
        const c = document.createElement("canvas");
        c.width = c.height = lado;
        const m = Math.min(img.naturalWidth, img.naturalHeight);
        c.getContext("2d").drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, lado, lado);
        URL.revokeObjectURL(url);
        ok(c.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => { URL.revokeObjectURL(url); falha(); };
      img.src = url;
    });
  }

  pForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const nome = $("#pNome").value.trim().slice(0, 20);
    if (!nome) { $("#pNome").focus(); return; }
    const repetido = estado.jogadores.some((j) => j.id !== editando.id && j.nome.toLowerCase() === nome.toLowerCase());
    if (repetido) { toast("Esse nome já existe 👀", "Coloca um sobrenome, inicial, apelido...", true); return; }
    const dados = {
      nome,
      apelido: $("#pApelido").value.trim().slice(0, 40),
      emoji: ($("#pEmoji").value.trim() || "🙂").slice(0, 8),
      cor: corValida(editando.cor),
      pontos: editando.pontos,
      foto: editando.foto
    };
    const novo = !editando.id;
    const id = editando.id;
    commit((s) => {
      if (novo) s.jogadores.push({ id: uid(), ...dados });
      else Object.assign(s.jogadores.find((j) => j.id === id), dados);
    });
    fecharSheet();
    if (novo) { toast(`${nome} entrou na competição! 🎉`, "Mais um urubu no grupo."); confete(90); }
    else toast("Salvo ✅", `${nome} atualizado.`);
  });

  $("#pDelete").addEventListener("click", () => {
    const j = jogador(editando.id);
    if (!j) return;
    if (!confirm(`Remover ${j.nome} da competição? Os anúncios dessa pessoa também somem.`)) return;
    commit((s) => {
      s.jogadores = s.jogadores.filter((x) => x.id !== j.id);
      s.eventos = s.eventos.filter((x) => x.jogador !== j.id);
    });
    fecharSheet();
    toast(`${j.nome} saiu do grupo 🚪`, "Saiu sem avisar ninguém. Ironia.", true);
  });

  $("#pAnunciar").addEventListener("click", () => {
    const id = editando.id;
    fecharSheet();
    abrirAnuncio(id);
  });

  // ---------- Histórico, backup e reset ----------
  $("#history").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del]");
    if (!b) return;
    const ev = estado.eventos.find((x) => x.id === b.dataset.del);
    if (!ev || !confirm("Desfazer esse anúncio? Os pontos voltam pro que eram.")) return;
    commit((s) => { s.eventos = s.eventos.filter((x) => x.id !== ev.id); });
    toast("Anúncio desfeito ↩️", "Fake news detectada e removida.");
  });

  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("Voltar tudo pro placar oficial? Participantes novos, fotos e anúncios lançados serão apagados" + (online ? " PRA TODO MUNDO." : "."))) return;
    commit((s) => { const ini = estadoInicial(); s.jogadores = ini.jogadores; s.eventos = ini.eventos; }, "reset");
    toast("Placar resetado ↺", "De volta às origens do WhatsApp.");
  });

  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(estado, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cna-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $("#importInput").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const novo = normaliza(JSON.parse(await file.text()));
      if (!novo) throw new Error();
      if (!confirm(`Importar backup com ${novo.jogadores.length} participantes e ${novo.eventos.length} anúncios? Isso substitui o placar atual.`)) return;
      commit((s) => { s.jogadores = novo.jogadores; s.eventos = novo.eventos; }, "importar");
      toast("Backup importado 📦", "Placar restaurado.");
    } catch {
      toast("Arquivo inválido 🙅", "Precisa ser um backup exportado por este site.", true);
    }
  });

  // ---------- Compartilhar ----------
  $("#shareBtn").addEventListener("click", async () => {
    const medalha = ["🥇", "🥈", "🥉"];
    const linhas = placar().map((j) => `${medalha[j.rank - 1] || `${j.rank}º`} ${j.nome} - ${pts(j.total)}`);
    const texto = `📣 *QUADRO DA COMPETIÇÃO NACIONAL DOS ANÚNCIOS*\n\n${linhas.join("\n")}\n\n🎯 Missão Faustão: ${faustao() ? "CUMPRIDA" : "em aberto (+6)"}\n${location.href.split("#")[0]}`;
    try {
      if (navigator.share) { await navigator.share({ text: texto }); return; }
      await navigator.clipboard.writeText(texto);
      toast("Tabela copiada 📋", "Agora é só colar no grupo.");
    } catch (err) {
      if (err && err.name === "AbortError") return;
      toast("Não consegui copiar 😕", "Tira um print que vale igual.", true);
    }
  });

  // ---------- Quem é você ----------
  function abrirEu() {
    $("#euChips").innerHTML = placar().map((j) => `
      <button type="button" class="chip ${j.nome === eu ? "is-on" : ""}" data-eu-nome="${esc(j.nome)}" style="--c:${corValida(j.cor)}">${avatar(j, "av--sm")}${esc(j.nome)}</button>`).join("");
    abrirSheet($("#euSheet"));
  }
  function definirEu(nome) {
    eu = String(nome || "").slice(0, 24);
    try { localStorage.setItem(CHAVE_EU, eu); } catch {}
    fecharSheet();
    renderHistorico();
    toast(eu ? `Beleza, ${eu}! 🕵️` : "Ok, modo anônimo 🥸", "Tudo que você alterar fica no registro, com nome e horário.");
  }
  $("#euSheet").addEventListener("click", (e) => {
    const c = e.target.closest("[data-eu-nome]");
    if (c) definirEu(c.dataset.euNome);
    if (e.target.closest("#euAnon")) definirEu("");
  });
  document.addEventListener("click", (e) => { if (e.target.closest("[data-eu]")) abrirEu(); });

  function trocarSub(nome) {
    $$("[data-sub]").forEach((b) => b.classList.toggle("is-on", b.dataset.sub === nome));
    $$("[data-subview]").forEach((v) => { v.hidden = v.dataset.subview !== nome; });
  }
  $$("[data-sub]").forEach((b) => b.addEventListener("click", () => { trocarSub(b.dataset.sub); vibra(6); }));
  $("#lastChange").addEventListener("click", () => { trocarAba("historico"); trocarSub("registro"); window.scrollTo({ top: 0 }); });

  // ---------- Navegação ----------
  function trocarAba(nome) {
    $$(".view").forEach((v) => { const on = v.dataset.view === nome; v.hidden = !on; v.classList.toggle("is-active", on); });
    $$(".tab[data-tab]").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === nome));
  }
  $$(".tab[data-tab]").forEach((t) => t.addEventListener("click", () => { trocarAba(t.dataset.tab); window.scrollTo({ top: 0 }); vibra(6); }));
  $("#fab").addEventListener("click", () => { vibra(15); abrirAnuncio(); });
  $("#addPlayer").addEventListener("click", () => abrirJogador(null));
  document.addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]");
    if (ed) abrirJogador(ed.dataset.edit);
  });
  $("#live").addEventListener("click", () => {
    online ? toast("🟢 Placar ao vivo", "Sincronizado com a galera toda.") : toast("🟡 Modo local", "Salvando só neste aparelho. Configure o banco na Vercel pra compartilhar.");
  });

  // ---------- Efeitos ----------
  let toastTimer;
  function toast(titulo, sub = "", ruim = false) {
    const t = $("#toast");
    t.innerHTML = `${esc(titulo)}${sub ? `<small>${esc(sub)}</small>` : ""}`;
    t.classList.toggle("is-bad", ruim);
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-on"), 3200);
  }

  function vibra(p) { try { navigator.vibrate && navigator.vibrate(p); } catch {} }

  function chacoalha() {
    document.querySelector(".app").animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-10px)" }, { transform: "translateX(9px)" }, { transform: "translateX(-6px)" }, { transform: "translateX(0)" }],
      { duration: 420 }
    );
  }

  const reduzMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function confete(qtd) {
    if (reduzMovimento) return;
    const cv = $("#confetti");
    const ctx = cv.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const cores = ["#ffd60a", "#ff2d3d", "#4cc9f0", "#5ef38c", "#b388ff", "#ffffff"];
    const emojis = ["💀", "📣", "🚨", "⚰️", "📰"];
    const ps = Array.from({ length: qtd }, (_, i) => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 80,
      y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 15 - 4,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 10,
      c: sorteia(cores),
      e: i % 12 === 0 ? sorteia(emojis) : null
    }));
    let frames = 0;
    (function loop() {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ps.forEach((p) => {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        if (p.e) { ctx.font = "22px serif"; ctx.fillText(p.e, -11, 8); }
        else { ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
        ctx.restore();
      });
      if (++frames < 200) requestAnimationFrame(loop);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })();
  }

  // ---------- Início ----------
  render();
  puxar();
  let jaPerguntou = false;
  try { jaPerguntou = localStorage.getItem(CHAVE_EU) !== null; } catch {}
  if (!jaPerguntou) setTimeout(() => { if (!sheetAberta()) abrirEu(); }, 900);
  setInterval(() => { if (document.visibilityState === "visible") puxar(); }, 15000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") puxar(); });
})();
