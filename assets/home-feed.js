// Home Neon Dark — feed filtrável (Pedidos | Ofertas | Top 3), chips de
// categoria, subcategorias, barra de filtros, painel de busca recolhível e
// barra de navegação inferior. Carregado DEPOIS de app.js (usa escapeHtml,
// setMode, highlightSection, formatRelativeTime e initials dele).
// Sem dado, mostra empty state — nunca completa com exemplo inventado.

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const norm = (t) =>
    String(t || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");

  // ── ícones / miniaturas ────────────────────────────────────────────────
  const ICONS = {
    pin: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
    car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 11 6.5 6.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11"/><rect x="3" y="11" width="18" height="6" rx="2"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.89 1.45l8 4A2 2 0 0 1 22 7.24v9.53a2 2 0 0 1-1.11 1.79l-8 4a2 2 0 0 1-1.78 0l-8-4a2 2 0 0 1-1.11-1.79V7.24a2 2 0 0 1 1.11-1.79l8-4a2 2 0 0 1 1.78 0Z"/><path d="M2.32 6.16 12 11l9.68-4.84"/><line x1="12" y1="22.76" x2="12" y2="11"/></svg>',
    wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94Z"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>',
  };
  const ICON_BY_TYPE = {
    corrida: ICONS.car, viagem: ICONS.car, carona: ICONS.car, entrega: ICONS.box, frete: ICONS.box,
    profissional: ICONS.wrench, servico: ICONS.wrench, grupo: ICONS.users, compra: ICONS.users,
    curso: ICONS.users, produto: ICONS.bag, imovel: ICONS.home,
  };
  const KNOWN_TYPES = Object.keys(ICON_BY_TYPE).concat(["outro", "assinatura"]);

  function typeKey(label) {
    return norm(label).replace(/\s+/g, "");
  }

  function thumbHtml(key, photoUrl, initialsText) {
    const klass = KNOWN_TYPES.includes(key) ? key : "default";
    if (photoUrl) {
      return `<div class="feed-thumb feed-thumb--${klass}"><img src="${escapeHtml(photoUrl)}" alt="" loading="lazy" width="96" height="92" /></div>`;
    }
    const inner = initialsText ? `<span class="feed-thumb-initials">${escapeHtml(initialsText)}</span>` : ICON_BY_TYPE[key] || ICONS.bag;
    return `<div class="feed-thumb feed-thumb--${klass}" aria-hidden="true">${inner}</div>`;
  }

  // ── categorias / subcategorias ─────────────────────────────────────────
  const SUBS = {
    todos: ["Restaurante", "Lanchonete", "Padaria", "Mercado", "Farmácia", "Moda", "Pet shop", "Eletrônicos", "Presentes", "Beleza", "Saúde", "Outros"],
    servicos: ["Pedreiro", "Manicure", "Eletricista", "Diarista", "Pintor", "Encanador", "Jardineiro", "Outros"],
    produtos: ["Eletrônicos", "Móveis", "Roupas", "Alimentos", "Ferramentas", "Presentes", "Outros"],
    lojas: ["Restaurante", "Lanchonete", "Padaria", "Mercado", "Farmácia", "Pet shop", "Moda", "Outros"],
    corridas: ["Carona", "Corrida", "Entrega", "Frete", "Mudança", "Outros"],
    imoveis: ["Aluguel", "Venda", "Quarto", "Temporada", "Outros"],
    eventos: ["Show", "Festa", "Esporte", "Curso", "Outros"],
  };
  const SUB_WORDS = {
    Restaurante: ["restaurante", "burger", "marmita", "hamburguer"],
    Lanchonete: ["lanchonete", "lanche"],
    Padaria: ["padaria", "paes", "pao "],
    Mercado: ["mercado", "supermercado"],
    Farmácia: ["farmacia", "drogaria"],
    Moda: ["moda", "roupa", "sapato"],
    "Pet shop": ["pet", "racao"],
    Eletrônicos: ["eletron", " tv", "tv ", "celular", "notebook"],
    Presentes: ["presente"],
    Beleza: ["manicure", "pedicure", "cabelo", "cabeleireir", "beleza", "estetic", "unha"],
    Saúde: ["saude", "medic", "dentista", "fisio"],
    Pedreiro: ["pedreiro"],
    Manicure: ["manicure", "pedicure", "unha"],
    Eletricista: ["eletricista"],
    Diarista: ["diarista", "faxina"],
    Pintor: ["pintor", "pintar"],
    Encanador: ["encanador", "desentup"],
    Jardineiro: ["jardin"],
    Móveis: ["movel", "moveis", "sofa", "armario"],
    Roupas: ["roupa"],
    Alimentos: ["alimento", "comida", "bolo"],
    Ferramentas: ["ferramenta"],
    Carona: ["carona"],
    Corrida: ["corrida"],
    Entrega: ["entrega"],
    Frete: ["frete"],
    Mudança: ["mudanca"],
    Aluguel: ["aluguel", "alugar"],
    Venda: ["venda", "vender", "terreno"],
    Quarto: ["quarto"],
    Temporada: ["temporada"],
    Show: ["show"],
    Festa: ["festa"],
    Esporte: ["esporte"],
    Curso: ["curso", "aula"],
  };
  const LOJA_WORDS = ["padaria", "restaurante", "lanchonete", "mercado", "farmacia", "pet", "moda", "loja", "burger", "drogaria"];

  const CAT_BY_REQUEST = { corrida: "corridas", entrega: "corridas", profissional: "servicos", servico: "servicos", produto: "produtos", imovel: "imoveis", outro: "produtos", loja: "lojas" };
  const CAT_BY_GROUP = { compra: "produtos", assinatura: "produtos", frete: "corridas", viagem: "corridas", carona: "corridas", servico: "servicos", curso: "eventos" };

  function textOf(item) {
    return " " + norm([item.title, item.service, item.type, item.label].filter(Boolean).join(" ")) + " ";
  }

  function catOf(item) {
    if (item.kind === "oferta") {
      const t = textOf(item);
      return LOJA_WORDS.some((w) => t.includes(w)) ? "lojas" : "servicos";
    }
    if (item.source === "group") return CAT_BY_GROUP[item.type] || "servicos";
    return CAT_BY_REQUEST[item.type] || "servicos";
  }

  function matchesSub(item, sub) {
    if (!sub) return true;
    const t = textOf(item);
    if (sub === "Outros") {
      const pool = SUBS[state.cat] || SUBS.todos;
      return !pool.filter((s) => s !== "Outros").some((s) => (SUB_WORDS[s] || []).some((w) => t.includes(w)));
    }
    return (SUB_WORDS[sub] || [norm(sub)]).some((w) => t.includes(w));
  }

  // ── estado ─────────────────────────────────────────────────────────────
  const state = { tipo: "todos", cat: "todos", sub: "", dist: "10", price: "", sort: "recentes", tab: "pedidos", expanded: { pedidos: false, ofertas: false } };
  let pedidos = [];
  let ofertas = [];
  let top = [];
  let loaded = false;

  const isDefaultView = () => state.cat === "todos" && !state.sub && state.dist === "10" && !state.price && state.sort === "recentes";
  const isMobile = () => window.matchMedia("(max-width: 960px)").matches;

  function passes(item) {
    if (state.cat !== "todos" && catOf(item) !== state.cat) return false;
    if (!matchesSub(item, state.sub)) return false;
    const maxKm = Number(state.dist);
    if (maxKm > 0 && Number.isFinite(item.distanceKm) && item.distanceKm > maxKm) return false;
    if (state.price) {
      const [min, max] = state.price.split("-");
      if (Number.isFinite(item.priceNum)) {
        if (item.priceNum < Number(min || 0)) return false;
        if (max && item.priceNum > Number(max)) return false;
      }
    }
    return true;
  }

  function sorter(a, b) {
    const time = (x) => (x.createdAt ? new Date(x.createdAt).getTime() : -Infinity);
    switch (state.sort) {
      case "menor-preco":
        return (a.priceNum ?? Infinity) - (b.priceNum ?? Infinity);
      case "maior-preco":
        return (b.priceNum ?? -Infinity) - (a.priceNum ?? -Infinity);
      case "perto":
        return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
      case "avaliacao":
        return (b.rating ?? -Infinity) - (a.rating ?? -Infinity);
      default: {
        const d = time(b) - time(a);
        return Number.isNaN(d) ? 0 : d;
      }
    }
  }

  // ── render ─────────────────────────────────────────────────────────────
  function limitFor(kind) {
    if (state.expanded[kind]) return 12;
    if (isMobile()) return 12;
    return isDefaultView() ? 3 : 6;
  }

  function pedidoCard(item, index) {
    const key = typeKey(item.label);
    const isGroup = item.source === "group";
    const time = item.createdAt ? formatRelativeTime(item.createdAt) : "";
    return `
      <li class="highlight-card feed-card" data-index="${index}">
        ${thumbHtml(key, item.photoUrl)}
        <div class="feed-body">
          <div class="feed-top">
            <div class="feed-tags">
              <span class="feed-tag ${isGroup ? "feed-tag--grupo" : "feed-tag--pedido"}">${isGroup ? "Grupo" : "Pedido"}</span>
              <span class="feed-tag feed-tag--tipo">${escapeHtml(item.label)}</span>
            </div>
            ${time ? `<span class="feed-time">${escapeHtml(time)}</span>` : ""}
          </div>
          <strong class="feed-title highlight-card-title">${escapeHtml(item.title)}</strong>
          <div class="feed-meta">
            <div class="feed-who">
              <span class="feed-where">${ICONS.pin}${escapeHtml(item.where)}</span>
              <button type="button" class="highlight-card-action highlight-action" data-index="${index}">${escapeHtml(item.actionText)} →</button>
            </div>
            <span class="feed-price highlight-card-price highlight-price">${escapeHtml(item.price)}</span>
          </div>
        </div>
      </li>`;
  }

  function ofertaCard(p) {
    const rating = Number.isFinite(p.rating) ? p.rating.toFixed(1).replace(".", ",") : null;
    const where = [p.city, Number.isFinite(p.distanceKm) ? `${String(p.distanceKm).replace(".", ",")} km` : null].filter(Boolean).join(" • ");
    return `
      <li class="feed-card">
        ${thumbHtml("servico", p.photoUrl, initials(p.title))}
        <div class="feed-body">
          <div class="feed-top">
            <div class="feed-tags">
              <span class="feed-tag feed-tag--oferta">Oferta</span>
              <span class="feed-tag feed-tag--tipo">${escapeHtml(p.service)}</span>
            </div>
            ${p.nextSlot ? `<span class="feed-time feed-time--clip">${escapeHtml(p.nextSlot)}</span>` : ""}
          </div>
          <strong class="feed-title">${escapeHtml(p.title)}</strong>
          <div class="feed-meta">
            <div class="feed-who">
              ${rating ? `<span class="feed-star">★ ${rating}</span>` : "<span>Novo no TOP3</span>"}
              ${where ? `<span class="feed-where">${ICONS.pin}${escapeHtml(where)}</span>` : ""}
              <a class="feed-action" href="${escapeHtml(p.href)}">Ver perfil →</a>
            </div>
            ${Number.isFinite(p.priceNum) ? `<span class="feed-price">R$ ${escapeHtml(String(p.priceNum))}</span>` : ""}
          </div>
        </div>
      </li>`;
  }

  function topItem(p, i) {
    const rating = Number.isFinite(p.rating) ? p.rating.toFixed(1).replace(".", ",") : null;
    const filled = Number.isFinite(p.rating) ? Math.round(p.rating) : 0;
    const reviews = Number.isFinite(p.reviewCount) ? ` • ${p.reviewCount} aval.` : "";
    return `
      <a class="feed-rank-item" href="${escapeHtml(p.href)}">
        <div class="feed-rank-thumb feed-thumb feed-thumb--servico">
          ${p.photoUrl ? `<img src="${escapeHtml(p.photoUrl)}" alt="" loading="lazy" width="62" height="54" />` : `<span class="feed-thumb-initials" style="font-size:1.1rem">${escapeHtml(initials(p.title))}</span>`}
          <span class="feed-rank-num feed-rank-num--${i + 1}">${i + 1}</span>
        </div>
        <div class="feed-rank-info">
          <div class="feed-rank-name">${escapeHtml(p.title)}</div>
          <div class="feed-rank-cat">${escapeHtml([p.service, p.city].filter(Boolean).join(" • "))}</div>
          <div class="feed-rank-stars">${rating ? `<span>${"★".repeat(filled)}${"☆".repeat(5 - filled)}</span>${rating}${reviews}` : "Novo no TOP3"}</div>
        </div>
        <span class="feed-rank-arrow" aria-hidden="true">›</span>
      </a>`;
  }

  let shownPedidos = [];

  function render() {
    if (!loaded) return;
    const listP = $("highlights-list");
    const emptyP = $("highlights-empty");
    const listO = $("feed-ofertas");
    const emptyO = $("feed-ofertas-empty");

    const fp = pedidos.filter(passes).sort(sorter);
    const fo = ofertas.filter(passes).sort(sorter);
    shownPedidos = fp.slice(0, limitFor("pedidos"));
    const shownOfertas = fo.slice(0, limitFor("ofertas"));

    listP.innerHTML = shownPedidos.map((it, i) => pedidoCard(it, i)).join("");
    emptyP.hidden = shownPedidos.length > 0;
    listO.innerHTML = shownOfertas.map(ofertaCard).join("");
    emptyO.hidden = shownOfertas.length > 0;

    const morePed = $("feed-more-pedidos");
    const moreOfe = $("feed-more-ofertas");
    morePed.hidden = fp.length <= 3 && !state.expanded.pedidos;
    moreOfe.hidden = fo.length <= 3 && !state.expanded.ofertas;
    morePed.textContent = state.expanded.pedidos ? "Ver menos ↑" : "Ver todos →";
    moreOfe.textContent = state.expanded.ofertas ? "Ver menos ↑" : "Ver todos →";
    morePed.setAttribute("aria-expanded", String(state.expanded.pedidos));
    moreOfe.setAttribute("aria-expanded", String(state.expanded.ofertas));

    $("feed-top3-list").innerHTML = top.slice(0, 3).map(topItem).join("");
    applyVisibility();
  }

  // Desktop: o filtro "Tipo" decide quais colunas aparecem. Celular: as abas.
  function applyVisibility() {
    const colP = $("highlights-list").closest(".feed-col");
    const colO = $("feed-ofertas").closest(".feed-col");
    const grid = colP.parentElement;
    const mobile = isMobile();
    const showP = mobile ? state.tab === "pedidos" : state.tipo !== "ofertas";
    const showO = mobile ? state.tab === "ofertas" : state.tipo !== "pedidos";
    colP.hidden = !showP;
    colO.hidden = !showO;
    grid.classList.toggle("feed-grid--single", showP !== showO && !mobile);
    $("feed-tab-pedidos").classList.toggle("is-active", state.tab === "pedidos");
    $("feed-tab-ofertas").classList.toggle("is-active", state.tab === "ofertas");
    $("feed-tab-pedidos").setAttribute("aria-selected", String(state.tab === "pedidos"));
    $("feed-tab-ofertas").setAttribute("aria-selected", String(state.tab === "ofertas"));
  }

  // ── chips / subcategorias / selects ────────────────────────────────────
  function renderSubs() {
    const list = SUBS[state.cat] || SUBS.todos;
    $("sub-row").innerHTML =
      '<span class="sub-label">Subcategorias</span>' +
      ['<button type="button" class="sub-pill' + (state.sub ? "" : " is-active") + '" data-sub="">Todas</button>']
        .concat(list.map((s) => `<button type="button" class="sub-pill${state.sub === s ? " is-active" : ""}" data-sub="${escapeHtml(s)}">${escapeHtml(s)}</button>`))
        .join("");
    $("filter-sub").innerHTML = '<option value="">Todas</option>' + list.map((s) => `<option value="${escapeHtml(s)}"${state.sub === s ? " selected" : ""}>${escapeHtml(s)}</option>`).join("");
  }

  function syncControls() {
    document.querySelectorAll(".cat-chip").forEach((chip) => {
      const on = chip.dataset.cat === state.cat;
      chip.classList.toggle("is-active", on);
      chip.setAttribute("aria-selected", String(on));
    });
    $("filter-cat").value = state.cat;
    $("filter-tipo").value = state.tipo;
    $("filter-dist").value = state.dist;
    $("filter-price").value = state.price;
    $("filter-sort").value = state.sort;
    renderSubs();
  }

  function setCat(cat) {
    state.cat = cat;
    state.sub = "";
    syncControls();
    render();
  }

  $("cat-row").addEventListener("click", (e) => {
    const chip = e.target.closest(".cat-chip");
    if (chip) setCat(chip.dataset.cat);
  });
  $("sub-row").addEventListener("click", (e) => {
    const pill = e.target.closest(".sub-pill");
    if (!pill) return;
    state.sub = pill.dataset.sub;
    syncControls();
    render();
  });
  $("filter-cat").addEventListener("change", (e) => setCat(e.target.value));
  $("filter-sub").addEventListener("change", (e) => {
    state.sub = e.target.value;
    syncControls();
    render();
  });
  $("filter-tipo").addEventListener("change", (e) => {
    state.tipo = e.target.value;
    if (state.tipo === "pedidos" || state.tipo === "ofertas") state.tab = state.tipo;
    render();
  });
  $("filter-dist").addEventListener("change", (e) => {
    state.dist = e.target.value;
    render();
  });
  $("filter-price").addEventListener("change", (e) => {
    state.price = e.target.value;
    render();
  });
  $("filter-sort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    render();
  });
  $("filter-more-btn").addEventListener("click", () => {
    const panel = $("filter-more-panel");
    panel.hidden = !panel.hidden;
    $("filter-more-btn").setAttribute("aria-expanded", String(!panel.hidden));
  });
  $("filter-clear-btn").addEventListener("click", () => {
    Object.assign(state, { tipo: "todos", cat: "todos", sub: "", dist: "10", price: "", sort: "recentes" });
    syncControls();
    render();
  });

  document.querySelectorAll(".feed-tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      state.tab = tab.dataset.feedTab;
      applyVisibility();
    })
  );
  document.querySelectorAll("[data-feed-more]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const kind = btn.dataset.feedMore;
      state.expanded[kind] = !state.expanded[kind];
      render();
    })
  );
  $("feed-tabs-all").addEventListener("click", () => {
    state.expanded[state.tab] = true;
    render();
  });

  // clique no card de pedido / grupo
  $("highlights-list").addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    const card = e.target.closest(".highlight-card");
    if (card && shownPedidos[Number(card.dataset.index)]) shownPedidos[Number(card.dataset.index)].onAction();
  });

  // ── dados reais ────────────────────────────────────────────────────────
  async function load() {
    try {
      const [rq, gr, rk] = await Promise.all([fetch("/api/requests"), fetch("/api/groups"), fetch("/api/ranking?limit=12")]);
      const { requests } = rq.ok ? await rq.json() : { requests: [] };
      const { groups } = gr.ok ? await gr.json() : { groups: [] };
      const { top3 } = rk.ok ? await rk.json() : { top3: [] };

      pedidos = [
        ...requests
          .filter((r) => r.status === "aberto")
          .map((r) => ({
            kind: "pedido",
            source: "request",
            type: r.type,
            label: r.type,
            title: r.title,
            where: r.location || "local não informado",
            photoUrl: r.photoUrl || null,
            createdAt: r.createdAt,
            priceNum: Number.isFinite(Number(r.price)) ? Number(r.price) : null,
            distanceKm: Number.isFinite(r.distanceKm) ? r.distanceKm : null,
            price: `R$ ${r.price}`,
            actionText: "Ver opções",
            onAction: () => {
              setMode("provider");
              highlightSection($("provider"));
            },
          })),
        ...groups
          .filter((g) => g.status === "aberto")
          .map((g) => ({
            kind: "pedido",
            source: "group",
            type: g.category,
            label: g.categoryLabel || g.category,
            title: g.title,
            where: g.city,
            createdAt: g.createdAt,
            priceNum: Number.isFinite(Number(g.estimatedIndividualPrice)) && g.estimatedIndividualPrice ? Number(g.estimatedIndividualPrice) : null,
            distanceKm: null,
            price: g.estimatedIndividualPrice ? `R$ ${g.estimatedIndividualPrice}/pessoa` : `${g.currentMembers}/${g.targetMembers} pessoas`,
            actionText: g.category === "carona" ? "Ver carona" : "Participar",
            onAction: () => {
              const btn = document.querySelector(`.group-category-btn[data-category="${g.category}"]`);
              if (btn) btn.click();
              highlightSection($("grupos"));
            },
          })),
      ];

      const providers = (top3 || []).map((p) => ({
        kind: "oferta",
        source: "provider",
        type: "servico",
        label: p.service,
        service: p.service,
        title: p.name,
        city: p.city,
        rating: Number.isFinite(p.rating) ? p.rating : null,
        reviewCount: p.reviewCount,
        distanceKm: Number.isFinite(p.distanceKm) ? p.distanceKm : null,
        priceNum: Number.isFinite(p.price) ? p.price : null,
        nextSlot: p.nextSlot,
        photoUrl: p.photoUrl,
        href: p.slug ? `/prestador/${encodeURIComponent(p.slug)}` : "#top3",
      }));
      ofertas = providers;
      top = providers;
    } catch (err) {
      pedidos = [];
      ofertas = [];
      top = [];
    }
    loaded = true;
    render();
  }

  // ── atalhos por categoria (painel recolhido; abre pelo link discreto do hero) ──
  const searchPanel = $("hero-search-panel");
  const panelToggle = $("hero-panel-toggle");
  function setSearchPanel(open, focus) {
    if (!searchPanel) return;
    searchPanel.hidden = !open;
    if (panelToggle) panelToggle.setAttribute("aria-expanded", String(open));
    if (open && focus) {
      const first = searchPanel.querySelector(".hero-category-chips button");
      if (first) first.focus({ preventScroll: true });
    }
  }
  if (panelToggle) panelToggle.addEventListener("click", () => setSearchPanel(searchPanel.hidden, true));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && searchPanel && !searchPanel.hidden && document.activeElement && searchPanel.contains(document.activeElement)) {
      setSearchPanel(false, false);
      if (panelToggle) panelToggle.focus();
    }
  });

  // ── barra de navegação (Explorar | Postar | Mensagens | Meu perfil) ────
  const bnav = $("bnav");
  function setBni(name) {
    bnav.querySelectorAll(".bni").forEach((a) => {
      const on = a.dataset.bni === name;
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }
  bnav.addEventListener("click", (e) => {
    const link = e.target.closest(".bni");
    if (!link) return;
    setBni(link.dataset.bni);
    if (link.dataset.bni === "perfil") {
      e.preventDefault();
      // logada: abre o "Meu perfil"; senão, o painel de entrar
      if (typeof currentUserProfile !== "undefined" && currentUserProfile && typeof window.openProfile === "function") {
        window.openProfile(link);
      } else {
        $("email-auth-toggle").click();
        $("email-auth-toggle").scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
    if (link.dataset.bni === "explorar") {
      setMode("requester");
    }
  });

  // nav do topo: marca o link da seção visível
  const navLinks = document.querySelectorAll(".site-nav-link");
  navLinks.forEach((a) =>
    a.addEventListener("click", () => {
      navLinks.forEach((x) => {
        x.classList.toggle("is-active", x === a);
        if (x === a) x.setAttribute("aria-current", "true");
        else x.removeAttribute("aria-current");
      });
    })
  );

  // No celular os selects mostram só o rótulo curto (como no guia visual); no desktop, o texto completo.
  const SHORT = { "filter-tipo": ["Tipo", "Todos"], "filter-cat": ["Categoria", "Todas as categorias"], "filter-price": ["Preço", "Qualquer valor"] };
  function applyLabels() {
    const mobile = isMobile();
    Object.entries(SHORT).forEach(([id, [short, long]]) => {
      const opt = $(id).options[0];
      if (opt) opt.textContent = mobile ? short : long;
    });
  }
  applyLabels();
  window.matchMedia("(max-width: 960px)").addEventListener("change", () => {
    applyLabels();
    render();
  });

  syncControls();
  window.reloadHomeFeed = load;
  load();
})();
