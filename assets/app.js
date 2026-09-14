const chatSection = document.getElementById("chat");
const results = document.getElementById("chat-results");
const rankingSection = document.getElementById("top3");
const rankingList = document.getElementById("ranking-list");
const rankingSort = document.getElementById("ranking-sort");
const rankingTitle = document.getElementById("ranking-title");
const rankingFilterHint = document.getElementById("ranking-filter-hint");
const locationHint = document.getElementById("location-hint");

// Rola até a seção e dá um destaque rápido — sinal visual de que a busca
// virou aquele resultado ali, não um texto perdido em algum lugar da página.
function highlightSection(section) {
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  section.classList.add("section-highlight");
  setTimeout(() => section.classList.remove("section-highlight"), 1600);
}

// Serviços "cadastrados" — começa só com os mock (fallback antes do fetch
// abaixo responder) e é atualizado com /api/services, que já inclui os
// perfis reais criados pelas pessoas (pilar 4.12). Sem isso, um serviço
// novo cadastrado via "Criar meu perfil" nunca apareceria numa busca —
// só no link direto do próprio perfil, o que não faz sentido. Se a busca
// citar um desses, mostra o ranking filtrado em vez de cair no texto de
// IA. Palavras de corrida/carona também roteiam direto pro painel de
// corridas, sem gastar uma chamada de IA à toa.
let KNOWN_SERVICES = ["manicure", "eletricista", "cabeleireiro", "encanador"];
// Quem for classificar uma busca (ver bottomSearchForm mais abaixo) espera
// essa promise primeiro — sem isso, uma busca feita rápido demais (antes do
// fetch responder) classificaria um serviço novo como "other" por engano,
// já que KNOWN_SERVICES ainda estaria só com os 4 mock de fallback.
const knownServicesLoaded = fetch("/api/services")
  .then((res) => res.json())
  .then((data) => {
    if (Array.isArray(data.services) && data.services.length) KNOWN_SERVICES = data.services;
  })
  .catch(() => {});
const RIDE_KEYWORDS = ["corrida", "carona", "ônibus", "onibus", "busão", "busao"];
// Frases de quem quer criar o próprio perfil (pilar 4.12), não buscar algo.
const PROFILE_KEYWORDS = ["criar meu perfil", "meu perfil profissional", "divulgar meu trabalho", "meu site profissional"];

function classifyIntent(message) {
  const lower = message.toLowerCase();
  if (PROFILE_KEYWORDS.some((k) => lower.includes(k))) {
    return { type: "profile" };
  }
  // "de/do/da/dos/das X pra/para Y" — cobre as contrações mais comuns de
  // "de" + artigo no português falado (ex: "corrida do Centro pra Rodoviária").
  const routeMatch = message.match(/\bd[eoa]s?\s+(.+?)\s+(?:pra|para)\s+(.+)/i);
  if (RIDE_KEYWORDS.some((k) => lower.includes(k)) || message.includes("→") || routeMatch) {
    return { type: "ride", from: routeMatch && routeMatch[1].trim(), to: routeMatch && routeMatch[2].trim() };
  }
  const service = KNOWN_SERVICES.find((s) => lower.includes(s));
  if (service) return { type: "service", service };
  return { type: "other" };
}

// Pede a localização real do navegador (com permissão explícita da pessoa)
// só quando faz sentido — ordenando por distância. Se negar ou não tiver
// suporte, resolve null e cai de volta na distância estimada (mock).
function getUserLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000 }
    );
  });
}

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function starRow(rating) {
  const filled = Math.round(rating);
  let out = "";
  for (let i = 1; i <= 5; i++) {
    out += `<span class="star ${i <= filled ? "star--filled" : ""}">★</span>`;
  }
  return out;
}

// A espera pela geolocalização pode ser lenta (até 8s) — se a pessoa trocar
// de filtro de novo antes disso resolver, essa chamada antiga não pode
// sobrescrever uma mais recente quando finalmente responder.
let loadRankingCallId = 0;
// Quando a busca identifica um serviço cadastrado (ex: "eletricista"), o
// ranking fica filtrado pra esse serviço até a pessoa limpar o filtro ou
// buscar outra coisa — inclusive ao trocar a ordenação.
let currentRankingService = "";

async function loadRanking(sortBy, service) {
  if (service !== undefined) currentRankingService = service;
  const callId = ++loadRankingCallId;
  try {
    const effectiveSortBy = sortBy || rankingSort.value;
    let url = `/api/ranking?sortBy=${encodeURIComponent(effectiveSortBy)}`;
    if (currentRankingService) {
      url += `&service=${encodeURIComponent(currentRankingService)}`;
    }

    locationHint.hidden = true;
    if (effectiveSortBy === "distance") {
      const loc = await getUserLocation();
      if (callId !== loadRankingCallId) return;
      if (loc) {
        url += `&lat=${loc.lat}&lng=${loc.lng}`;
      } else {
        locationHint.hidden = false;
        locationHint.textContent = "Usando distância estimada — permita o acesso à localização pra ver a distância real até você.";
      }
    }

    const res = await fetch(url);
    if (callId !== loadRankingCallId) return;
    if (!res.ok) return;
    const { top3, usedRealLocation } = await res.json();
    if (callId !== loadRankingCallId) return;
    if (currentRankingService) {
      rankingTitle.textContent = `Os 3 mais bem avaliados — ${currentRankingService}`;
      rankingFilterHint.hidden = false;
      rankingFilterHint.innerHTML = `Mostrando só quem faz "${escapeHtml(currentRankingService)}". <a href="#" id="ranking-clear-filter">Ver todos</a>`;
    } else {
      rankingTitle.textContent = "Os 3 mais bem avaliados";
      rankingFilterHint.hidden = true;
    }
    if (usedRealLocation) {
      locationHint.hidden = false;
      locationHint.textContent = "Mostrando distância real a partir da sua localização.";
    }
    rankingList.innerHTML = "";
    top3.forEach((p, index) => {
      const item = document.createElement("li");
      item.className = `rank-card rank-card--${index + 1}`;
      // Perfil real recém-criado (pilar 4.12) ainda não tem avaliação, preço
      // nem distância de verdade — mostra "novo" em vez de tentar formatar
      // um número que não existe.
      const ratingHtml =
        typeof p.rating === "number"
          ? `${starRow(p.rating)}<span class="rank-rating-num">${p.rating.toFixed(1)}</span>`
          : '<span class="chip chip--new">novo</span>';
      const distanceChip = typeof p.distanceKm === "number" ? `<span class="chip">${p.distanceKm.toFixed(1)} km</span>` : "";
      const priceChip = typeof p.price === "number" ? `<span class="chip">R$ ${p.price}</span>` : "";
      const ctaHtml = p.slug
        ? `<a href="/prestador/${encodeURIComponent(p.slug)}" class="rank-cta" target="_blank" rel="noopener">Ver perfil</a>`
        : `<button type="button" class="rank-cta" data-name="${escapeHtml(p.name)}">Chamar agora</button>`;
      item.innerHTML = `
        <div class="rank-card-top">
          <div class="rank-avatar">${escapeHtml(initials(p.name))}</div>
          <span class="rank-pos">#${index + 1}</span>
        </div>
        <h3 class="rank-name">${escapeHtml(p.name)}</h3>
        <p class="rank-service">${escapeHtml(p.service)} · ${escapeHtml(p.city)}</p>
        <div class="rank-stars">${ratingHtml}</div>
        <div class="rank-chips">
          ${distanceChip}
          ${priceChip}
          ${p.fastReply ? '<span class="chip chip--fast">resposta rápida</span>' : ""}
        </div>
        ${ctaHtml}
      `;
      rankingList.appendChild(item);
    });
  } catch (err) {
    console.error("Falha ao carregar o ranking:", err);
    rankingList.innerHTML = '<li class="ranking-error">Não consegui carregar o ranking agora.</li>';
  }
}

loadRanking();
rankingSort.addEventListener("change", () => loadRanking());

rankingFilterHint.addEventListener("click", (event) => {
  if (!event.target.closest("#ranking-clear-filter")) return;
  event.preventDefault();
  loadRanking(undefined, "");
});

rankingList.addEventListener("click", (event) => {
  const button = event.target.closest(".rank-cta");
  // Perfil real (pilar 4.12) usa um <a> pra própria página — não tem
  // data-name, e o clique já navega sozinho, sem precisar de runSearch().
  if (!button || !button.dataset.name) return;
  runSearch(`quero chamar ${button.dataset.name}`);
});

const requesterView = document.getElementById("requester-view");
const providerView = document.getElementById("provider-view");
const requestsList = document.getElementById("requests-list");
// [data-mode] restringe aos botões "Solicito serviço"/"Presto serviço" —
// .mode-btn sozinho pegaria também as tabs de categoria de grupo, tipo de
// corrida e entrar/criar conta (task-003), que reusam a mesma classe visual
// mas não têm nada a ver com esse toggle (sem o filtro, clicar numa dessas
// outras tabs tirava o destaque "ativo" do toggle de baixo, sem motivo).
const modeButtons = document.querySelectorAll(".mode-btn[data-mode]");
let requestsLoaded = false;

const SEARCH_PLACEHOLDER_BY_MODE = {
  requester: "Descreva o que você gostaria de solicitar...",
  provider: "Buscar um serviço, ou toque em 'Solicito serviço' pra pedir algo",
};

function setMode(mode) {
  const isProvider = mode === "provider";
  requesterView.hidden = isProvider;
  providerView.hidden = !isProvider;
  modeButtons.forEach((btn) => {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  bottomSearchInput.placeholder = SEARCH_PLACEHOLDER_BY_MODE[mode] || SEARCH_PLACEHOLDER_BY_MODE.requester;
  if (isProvider && !requestsLoaded) {
    requestsLoaded = true;
    loadRequests();
    loadDemandSignals();
  }
}

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

async function loadRequests() {
  try {
    const res = await fetch("/api/requests");
    if (!res.ok) return;
    const { requests } = await res.json();
    renderRequests(requests);
  } catch (err) {
    requestsList.innerHTML = '<li class="requests-error">Não consegui carregar os pedidos agora.</li>';
  }
}

const demandSection = document.getElementById("demand-signals");
const demandSignalsList = document.getElementById("demand-signals-list");
const DEMAND_CATEGORY_LABELS = { terreno: "terreno", imóvel: "imóvel", carro: "carro/veículo", produto: "produto" };

// Pilar 4.2 — mostra pra quem tem algo pra oferecer o que andou sendo
// procurado sem ninguém publicar (ver docs/visao-produto.md seção 4.2).
// Fica escondida quando não há sinal nenhum (nada acumulado ainda, ou tudo
// abaixo do mínimo pra virar estatística) — sem seção vazia no meio do site.
async function loadDemandSignals() {
  try {
    const res = await fetch("/api/demand-signals");
    if (!res.ok) return;
    const { signals } = await res.json();
    if (!signals || signals.length === 0) {
      demandSection.hidden = true;
      return;
    }
    demandSignalsList.innerHTML = signals
      .map((s) => {
        const label = DEMAND_CATEGORY_LABELS[s.category] || s.category;
        const where = s.location ? ` em ${escapeHtml(s.location)}` : "";
        const people = s.count === 1 ? "1 pessoa procurou" : `${s.count} pessoas procuraram`;
        return `<li class="demand-signal-item"><strong>${escapeHtml(label)}</strong>${where} — ${people}</li>`;
      })
      .join("");
    demandSection.hidden = false;
  } catch (err) {
    demandSection.hidden = true;
  }
}

const REQUEST_ICONS = {
  corrida: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm14 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM5 17V9l2-5h10l2 5v8"/></svg>',
  entrega: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 11h18M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  profissional: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a4 4 0 1 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 1 5.4-5.4l-2.6 2.6-2-2 2.6-2.6z"/></svg>',
};
// Categoria fora dessas três (ex: "terreno", "carro") cai nesse ícone genérico.
const REQUEST_ICON_DEFAULT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.4 7.2H22l-6 4.6 2.3 7.2L12 16.4l-6.3 4.6 2.3-7.2-6-4.6h7.6z"/></svg>';

const REQUEST_LABELS = { corrida: "corrida", entrega: "entrega", profissional: "profissional" };

// r.type agora é texto livre (ex: "terreno", "carro usado") — nunca interpolar
// direto num nome de classe CSS nem em innerHTML sem passar por aqui antes.
function slugifyType(type) {
  return String(type)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "outro";
}

function requestActionArea(r) {
  if (r.status === "aberto") {
    return '<button type="button" class="accept-btn">aceitar</button>';
  }
  if (r.status === "aceito") {
    return `
      <span class="request-provider">aceito por ${escapeHtml(r.provider || "prestador")} — fale com ${escapeHtml(r.requester)} no WhatsApp ${escapeHtml(r.whatsapp)}</span>
      <button type="button" class="complete-btn">marcar como concluído</button>
    `;
  }
  // concluído
  if (r.rating === undefined) {
    return `
      <form class="rate-form">
        <label class="rate-label">
          nota
          <select name="rating" required>
            <option value="" disabled selected>escolha</option>
            <option value="5">★★★★★</option>
            <option value="4">★★★★</option>
            <option value="3">★★★</option>
            <option value="2">★★</option>
            <option value="1">★</option>
          </select>
        </label>
        <input type="text" name="comment" placeholder="comentário (opcional)" maxlength="300" />
        <button type="submit">avaliar</button>
      </form>
    `;
  }
  return `
    <span class="request-rating">${starRow(r.rating)}${r.comment ? ` — "${escapeHtml(r.comment)}"` : ""}</span>
  `;
}

function renderRequests(requests) {
  requestsList.innerHTML = "";
  requests.forEach((r) => {
    const typeSlug = slugifyType(r.type);
    const item = document.createElement("li");
    item.className = `request-item request-item--${typeSlug} request-item--${r.status === "concluído" ? "concluido" : r.status}`;
    item.dataset.id = r.id;
    const distanceChip = typeof r.distanceKm === "number" ? `${r.distanceKm.toFixed(1)} km · ` : "";
    item.innerHTML = `
      <span class="request-icon request-icon--${typeSlug}">${REQUEST_ICONS[r.type] || REQUEST_ICON_DEFAULT}</span>
      <span class="request-info">
        <span class="request-badge request-badge--${typeSlug}">${escapeHtml(REQUEST_LABELS[r.type] || r.type)}</span>
        <br />
        <strong>${escapeHtml(r.title)}</strong>
        <br />
        <span class="request-meta">${escapeHtml(r.requester)} · ${escapeHtml(r.location)} · ${escapeHtml(r.when || "a combinar")} · ${distanceChip}R$ ${r.price}</span>
      </span>
      <span class="request-action">${requestActionArea(r)}</span>
    `;
    requestsList.appendChild(item);
  });
}

// Compartilhado pelos três fluxos abaixo (aceitar/concluir/avaliar) pra não
// duplicar o fetch+tratamento de erro três vezes (e divergir entre cópias).
async function postRequestAction(url, body) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json();
    return { ok: res.ok, error: data.error };
  } catch (err) {
    return { ok: false, error: "Falha de conexão." };
  }
}

requestsList.addEventListener("click", async (event) => {
  const acceptBtn = event.target.closest(".accept-btn");
  const completeBtn = event.target.closest(".complete-btn");
  if (!acceptBtn && !completeBtn) return;

  const button = acceptBtn || completeBtn;
  const item = button.closest(".request-item");
  const id = item.dataset.id;
  button.disabled = true;

  const result = acceptBtn
    ? await postRequestAction(`/api/requests/${encodeURIComponent(id)}/accept`, {
        provider: prompt("Seu nome (aparece pra quem publicou o pedido):") || "",
      })
    : await postRequestAction(`/api/requests/${encodeURIComponent(id)}/complete`);

  if (!result.ok) {
    button.disabled = false;
    alert(result.error || "Não consegui completar a ação.");
    return;
  }
  loadRequests();
});

requestsList.addEventListener("submit", async (event) => {
  const form = event.target.closest(".rate-form");
  if (!form) return;
  event.preventDefault();

  const item = form.closest(".request-item");
  const id = item.dataset.id;
  const data = new FormData(form);
  const submitBtn = form.querySelector("button[type=submit]");
  submitBtn.disabled = true;

  const result = await postRequestAction(`/api/requests/${encodeURIComponent(id)}/rate`, {
    rating: Number(data.get("rating")),
    comment: data.get("comment"),
  });

  if (!result.ok) {
    submitBtn.disabled = false;
    alert(result.error || "Não consegui registrar a avaliação.");
    return;
  }
  loadRequests();
});

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatMessage(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function renderResult(query, state, text) {
  chatSection.hidden = false;
  const actionButton =
    state === "ok"
      ? '<button type="button" class="result-action-btn" id="result-solicitar-btn">Solicitar / publicar pedido</button>'
      : "";
  results.innerHTML = `
    <p class="result-query">Resultados para "${escapeHtml(query)}"</p>
    <div class="result-answer ${state === "error" ? "result-answer--error" : ""}">
      ${state === "loading" ? '<span class="result-loading">buscando…</span>' : formatMessage(text)}
    </div>
    ${actionButton}
  `;
}

function goToPublish() {
  if (lastSearchQuery) {
    document.getElementById("post-title").value = lastSearchQuery;
  }
  document.getElementById("publicar").scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("post-type").focus();
}

results.addEventListener("click", (event) => {
  if (event.target.closest("#result-solicitar-btn")) goToPublish();
});

// Módulo de corridas (pilar 4.5) — mini-app "de onde → pra onde" de
// corrida/carona compartilhada, separado do formulário genérico de
// qualquer categoria.
const rideForm = document.getElementById("ride-form");
const rideFrom = document.getElementById("ride-from");
const rideTo = document.getElementById("ride-to");
const rideResults = document.getElementById("ride-results");
const ridesSection = document.getElementById("corridas");
const rideTypeButtons = document.querySelectorAll(".ride-type-btn");

// Painel assume "hoje" por padrão (nada pra pessoa escolher) — só mostra a
// data pra dar contexto, igual um app de caronas de verdade.
document.getElementById("rides-today").textContent =
  `Hoje, ${new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long" })} · corrida ou carona compartilhada`;

// Corrida/carona e entrega usam o mesmo mini-app (de → pra), só muda o tipo
// de pedido filtrado/publicado — evita duplicar a seção inteira pra cada
// categoria (ver docs/visao-produto.md seção 10: um controle por ação).
// "Entrega" existe aqui pra cobrir o caso do pilar 4.5: farmácia/comércio
// sem entregador postando ao lado de gente comum pedindo corrida.
let rideType = "corrida";
const RIDE_TYPE_LABEL = { corrida: "corrida", entrega: "entrega" };

rideTypeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    rideType = btn.dataset.rideType;
    rideTypeButtons.forEach((b) => {
      const active = b === btn;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", String(active));
    });
    // Já tinha uma busca em andamento nesse trajeto — refaz pro tipo novo,
    // em vez de deixar resultado do tipo antigo na tela.
    if (rideFrom.value.trim() && rideTo.value.trim()) rideForm.requestSubmit();
  });
});

function renderRideResults(matches) {
  const matchesHtml = matches.length
    ? `<ul class="ride-matches">${matches
        .map(
          (r) => `
        <li class="ride-match">
          <strong>${escapeHtml(r.title)}</strong>
          <span class="ride-match-meta">${escapeHtml(r.requester)} · ${escapeHtml(r.when || "a combinar")} · R$ ${r.price}</span>
        </li>`
        )
        .join("")}</ul>`
    : `<p class="ride-empty">Nada publicado nesse trajeto ainda — seja a primeira pessoa.</p>`;

  return `${matchesHtml}<button type="button" class="ride-publish-btn" id="ride-publish-btn">Publicar essa ${RIDE_TYPE_LABEL[rideType]}</button>`;
}

rideForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const from = rideFrom.value.trim();
  const to = rideTo.value.trim();
  if (!from || !to) return;

  rideResults.innerHTML = '<p class="ride-loading">buscando…</p>';
  try {
    const res = await fetch("/api/requests");
    if (!res.ok) throw new Error("falha ao buscar");
    const { requests } = await res.json();
    const fromLower = from.toLowerCase();
    const toLower = to.toLowerCase();
    const matches = requests.filter(
      (r) =>
        r.type === rideType &&
        r.status === "aberto" &&
        r.title.toLowerCase().includes(fromLower) &&
        r.title.toLowerCase().includes(toLower)
    );
    rideResults.innerHTML = renderRideResults(matches);
  } catch (err) {
    rideResults.innerHTML = '<p class="ride-empty">Não consegui buscar agora. Tenta de novo.</p>';
  }
});

rideResults.addEventListener("click", (event) => {
  const btn = event.target.closest("#ride-publish-btn");
  if (!btn) return;
  const from = rideFrom.value.trim();
  const to = rideTo.value.trim();
  document.getElementById("post-type").value = rideType;
  document.getElementById("post-title").value = `${from} → ${to}`;
  document.getElementById("publicar").scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("post-price").focus();
});

// Grupos de Economia v1 (pilar 4.14) — "gente quer a mesma coisa, o site
// junta o grupo": compra coletiva, frete, viagem, serviço em grupo, curso,
// assinatura compartilhada. Nunca tem engine especial por categoria, nunca
// verifica credencial, nunca retém pagamento — ver docs/visao-produto.md
// seção 4.14 e docs/futuro-assinaturas-e-pagamentos.md (reputação/denúncia
// continuam fora de escopo, dependem de login que o site ainda não exige
// aqui).
const GROUP_CATEGORY_ICONS = {
  compra: "🛒",
  frete: "📦",
  viagem: "🧳",
  servico: "🧰",
  curso: "🎓",
  assinatura: "📺",
  carona: "🚗",
};

// Aviso fixo só pra grupos de assinatura (task-001) — deixa claro que o
// TOP3 é só ponto de encontro, nunca intermediário; combinação e pagamento
// seguem as regras oficiais de cada serviço (ex: assinante extra Netflix).
const GROUP_ASSINATURA_NOTICE =
  "O TOP3 só ajuda vocês a se encontrarem. Combinem entre vocês e sigam sempre as regras oficiais do serviço (ex: assinante extra da Netflix).";

// Aviso fixo pra carona (task-002) — mesma lógica do aviso de assinatura:
// deixa claro que o site conecta, não verifica motorista nem intermedeia
// nada.
const GROUP_CARONA_NOTICE =
  "O TOP3 apenas conecta pessoas para carona compartilhada. Confirme identidade, placa e combine tudo antes de embarcar — o site não verifica motoristas, não intermedeia pagamento e não se responsabiliza pela viagem.";

const groupsList = document.getElementById("groups-list");
const groupCategoryButtons = document.querySelectorAll(".group-category-btn");
const groupCreateToggle = document.getElementById("group-create-toggle");
const groupForm = document.getElementById("group-form");
const groupStatus = document.getElementById("group-status");
const groupSuggestions = document.getElementById("group-suggestions");
let currentGroupCategory = "";

// Busca extra de carona (origem/destino/data/perto de mim) — só aparece
// quando a categoria "carona" está selecionada no filtro (ver toggle mais
// abaixo). Localização é sempre opcional e pedida na hora, nunca salva além
// do necessário pra ordenar essa busca (task-002, seção 2).
const caronaSearchExtra = document.getElementById("carona-search-extra");
const caronaSearchOrigem = document.getElementById("carona-search-origem");
const caronaSearchDestino = document.getElementById("carona-search-destino");
const caronaSearchData = document.getElementById("carona-search-data");
const caronaSearchLocationBtn = document.getElementById("carona-search-location");
let caronaSearchLat = null;
let caronaSearchLng = null;

function debounce(fn, waitMs) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), waitMs);
  };
}

function buildGroupsQueryUrl() {
  const params = new URLSearchParams();
  if (currentGroupCategory) params.set("category", currentGroupCategory);
  if (currentGroupCategory === "carona") {
    if (caronaSearchOrigem.value.trim()) params.set("origem", caronaSearchOrigem.value.trim());
    if (caronaSearchDestino.value.trim()) params.set("destino", caronaSearchDestino.value.trim());
    if (caronaSearchData.value) params.set("data", caronaSearchData.value);
    if (caronaSearchLat != null && caronaSearchLng != null) {
      params.set("lat", caronaSearchLat);
      params.set("lng", caronaSearchLng);
    }
  }
  const qs = params.toString();
  return qs ? `/api/groups?${qs}` : "/api/groups";
}

// "concluido" (task-004) é um sub-estado de "completo" — grupo que já
// fechou E a atividade em si já aconteceu (viagem/prazo passou, ou alguém
// marcou manualmente via POST .../complete). Pra tudo que já valia pra
// "completo" (não aceita mais entrada, mostra "Completo ✓"), "concluido"
// tem que valer igual — só muda pra habilitar avaliação/denúncia.
function isGroupClosed(g) {
  return g.status === "completo" || g.status === "concluido";
}

// "Avaliar / Relatar problema" (task-004) só faz sentido depois que o grupo
// fecha — antes disso não existe ninguém confirmado pra avaliar ou
// denunciar ainda. Reusa o mesmo botão/painel em qualquer categoria.
function reviewButtonHtml(g) {
  if (!isGroupClosed(g)) return "";
  return `<button type="button" class="group-review-btn" data-group-id="${escapeHtml(g.id)}">Avaliar / Relatar problema</button>`;
}

function renderGenericGroupCard(g) {
  const vagas = g.targetMembers - g.currentMembers;
  const vagasText = isGroupClosed(g) ? "grupo completo" : vagas === 1 ? "falta 1 pessoa" : `faltam ${vagas} pessoas`;
  const priceText = typeof g.estimatedIndividualPrice === "number" ? `R$ ${g.estimatedIndividualPrice} por pessoa (estimado)` : "";
  const deadlineText = g.deadline ? `até ${escapeHtml(g.deadline)}` : "";
  const actionArea = isGroupClosed(g)
    ? '<span class="request-provider">Completo ✓</span>'
    : `<button type="button" class="accept-btn group-join-btn" data-group-id="${escapeHtml(g.id)}">Participar</button>
         <button type="button" class="group-leave-link" data-group-id="${escapeHtml(g.id)}">já participa? sair</button>`;
  const noticeHtml = g.category === "assinatura" ? `<p class="group-assinatura-notice">${escapeHtml(GROUP_ASSINATURA_NOTICE)}</p>` : "";
  return `
    <li class="request-item group-card" data-group-id="${escapeHtml(g.id)}">
      <span class="request-icon">${GROUP_CATEGORY_ICONS[g.category] || "👥"}</span>
      <span class="request-info">
        <strong>${escapeHtml(g.title)}</strong>
        <br />
        <span class="request-meta">${escapeHtml(g.city)} · ${g.currentMembers} de ${g.targetMembers} vagas ocupadas · ${vagasText}</span>
        <br />
        <span class="request-meta">${[priceText, deadlineText].filter(Boolean).join(" · ")}</span>
        ${noticeHtml}
        <div class="group-review-panel" hidden></div>
      </span>
      <span class="request-action group-action">${actionArea}${reviewButtonHtml(g)}</span>
    </li>`;
}

// Carona (task-002) tem cara própria: motorista tem vaga/participar (reusa
// o join/leave que já existe, só muda o texto), passageiro é um post
// individual — não dá pra "participar" dele (motorista entra em contato
// direto pelo WhatsApp, revelado em "Ver detalhes"). CNH/placa/veículo só
// aparecem em "Ver detalhes" (busca GET /api/groups/:id), nunca na lista —
// mesma regra de "informação sensível só no detalhe" do resto do mecanismo.
function renderCaronaGroupCard(g) {
  const c = g.carona;
  const isMotorista = c.tipo === "motorista";
  const routeText = `${escapeHtml(c.origemTexto)} → ${escapeHtml(c.destinoTexto)}`;
  const whenText = `${escapeHtml(c.dataViagem)}${c.horarioAproximado ? " · " + escapeHtml(c.horarioAproximado) : ""}`;
  const vagasText = isMotorista
    ? c.vagasRestantes === 0
      ? "sem vagas"
      : c.vagasRestantes === 1
        ? "1 vaga restante"
        : `${c.vagasRestantes} vagas restantes`
    : "passageiro procurando carona";
  const joinArea = !isMotorista
    ? ""
    : isGroupClosed(g)
      ? '<span class="request-provider">Completo ✓</span>'
      : `<button type="button" class="accept-btn group-join-btn" data-group-id="${escapeHtml(g.id)}">Participar</button>
         <button type="button" class="group-leave-link" data-group-id="${escapeHtml(g.id)}">já participa? sair</button>`;

  return `
    <li class="request-item group-card" data-group-id="${escapeHtml(g.id)}">
      <span class="request-icon">${GROUP_CATEGORY_ICONS.carona}</span>
      <span class="request-info">
        <strong>${escapeHtml(g.title)}</strong>
        <br />
        <span class="request-meta">${routeText} · ${whenText}</span>
        <br />
        <span class="request-meta">${escapeHtml(g.city)} · ${vagasText}</span>
        <p class="group-assinatura-notice">${escapeHtml(GROUP_CARONA_NOTICE)}</p>
        <div class="group-carona-details" hidden></div>
        <div class="group-review-panel" hidden></div>
      </span>
      <span class="request-action group-action">
        <button type="button" class="group-carona-detail-btn" data-group-id="${escapeHtml(g.id)}">Ver detalhes</button>
        ${joinArea}
        ${reviewButtonHtml(g)}
      </span>
    </li>`;
}

// Data local no formato do <input type="date"> (YYYY-MM-DD), sem passar por
// UTC (toISOString viraria o dia errado perto da meia-noite em fusos a oeste
// de Greenwich, que é o caso do Brasil inteiro).
function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayDateInputValue() {
  return dateInputValue(new Date());
}

function tomorrowDateInputValue() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dateInputValue(tomorrow);
}

function renderGroupsList(groups) {
  if (groups.length === 0) {
    // Categoria carona com filtro de data em "hoje" (o padrão, task-003) e
    // sem nenhum resultado: sugere já ver amanhã em vez de só dizer "vazio"
    // — a pessoa não devia precisar adivinhar que dá pra trocar a data.
    if (currentGroupCategory === "carona" && caronaSearchData.value === todayDateInputValue()) {
      groupsList.innerHTML =
        '<li class="requests-error">Nenhuma carona hoje.' +
        ' <button type="button" id="carona-see-tomorrow" class="cta-secondary">Ver amanhã →</button></li>';
      document.getElementById("carona-see-tomorrow").addEventListener("click", () => {
        caronaSearchData.value = tomorrowDateInputValue();
        loadGroups();
      });
      return;
    }
    groupsList.innerHTML = '<li class="requests-error">Nenhum grupo aberto nessa categoria ainda — crie o primeiro.</li>';
    return;
  }
  groupsList.innerHTML = groups.map((g) => (g.category === "carona" ? renderCaronaGroupCard(g) : renderGenericGroupCard(g))).join("");
}

async function loadGroups() {
  try {
    const res = await fetch(buildGroupsQueryUrl());
    if (!res.ok) return;
    const { groups } = await res.json();
    renderGroupsList(groups);
  } catch (err) {
    groupsList.innerHTML = '<li class="groups-empty">Não consegui carregar os grupos agora.</li>';
  }
}

groupCategoryButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    currentGroupCategory = btn.dataset.category;
    groupCategoryButtons.forEach((b) => b.classList.toggle("is-active", b === btn));
    caronaSearchExtra.hidden = currentGroupCategory !== "carona";
    // Data padrão "hoje" ao abrir a busca de carona (task-003) — só na
    // primeira vez que a pessoa entra nessa categoria; se ela já trocou a
    // data (inclusive limpou o campo de propósito), não sobrescreve de novo.
    if (currentGroupCategory === "carona" && !caronaSearchData.value && !caronaSearchData.dataset.touched) {
      caronaSearchData.value = todayDateInputValue();
    }
    loadGroups();
  });
});
caronaSearchData.addEventListener("input", () => {
  caronaSearchData.dataset.touched = "1";
});

const debouncedLoadGroups = debounce(loadGroups, 350);
caronaSearchOrigem.addEventListener("input", debouncedLoadGroups);
caronaSearchDestino.addEventListener("input", debouncedLoadGroups);
caronaSearchData.addEventListener("change", loadGroups);

caronaSearchLocationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) return;
  const originalText = caronaSearchLocationBtn.textContent;
  caronaSearchLocationBtn.textContent = "obtendo localização…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      caronaSearchLat = pos.coords.latitude;
      caronaSearchLng = pos.coords.longitude;
      caronaSearchLocationBtn.textContent = "ordenado por perto de você ✓";
      loadGroups();
    },
    () => {
      caronaSearchLocationBtn.textContent = originalText;
    }
  );
});

// "Ver detalhes" (carona): busca CNH/placa/veículo (se motorista) e o
// contato pra "Falar no WhatsApp" — só na hora que a pessoa pede, nunca na
// listagem geral (task-002: esses dados só aparecem "na tela de detalhe do
// post, antes de confirmar interesse").
groupsList.addEventListener("click", async (event) => {
  const detailBtn = event.target.closest(".group-carona-detail-btn");
  if (!detailBtn) return;
  const card = detailBtn.closest(".group-card");
  const detailsDiv = card.querySelector(".group-carona-details");
  if (!detailsDiv.hidden) {
    detailsDiv.hidden = true;
    return;
  }
  detailsDiv.hidden = false;
  detailsDiv.textContent = "carregando…";
  try {
    const res = await fetch(`/api/groups/${encodeURIComponent(detailBtn.dataset.groupId)}`);
    const detail = await res.json();
    if (!res.ok) {
      detailsDiv.textContent = detail.error || "Não consegui carregar os detalhes.";
      return;
    }
    const c = detail.carona;
    const docsHtml =
      c && c.tipo === "motorista"
        ? `<p class="request-meta">CNH: ${escapeHtml(c.cnhNumero)} · Placa: ${escapeHtml(c.veiculoPlaca)} · ${escapeHtml(c.veiculoModelo)} ${escapeHtml(c.veiculoCor)}</p>`
        : "";
    const contact = detail.members && detail.members[0];
    const whatsappDigits = contact ? String(contact.whatsapp).replace(/\D/g, "") : "";
    const whatsappHtml = whatsappDigits
      ? `<a class="accept-btn" href="https://wa.me/${encodeURIComponent(whatsappDigits)}" target="_blank" rel="noopener noreferrer">Falar no WhatsApp</a>`
      : "";
    detailsDiv.innerHTML = `${docsHtml}${whatsappHtml}`;
  } catch (err) {
    detailsDiv.textContent = "Falha de conexão.";
  }
});

groupsList.addEventListener("click", (event) => {
  const joinBtn = event.target.closest(".group-join-btn");
  const leaveBtn = event.target.closest(".group-leave-link");
  const btn = joinBtn || leaveBtn;
  if (!btn) return;
  const card = btn.closest(".group-card");
  const groupId = btn.dataset.groupId;
  const action = joinBtn ? "join" : "leave";
  // Formulário mínimo, só aparece quando a pessoa realmente decide agir —
  // sem abrir modal nem sair da lista (ver princípios de UI/UX da seção 10).
  card.querySelector(".group-action").innerHTML = `
    <form class="rate-form group-action-form" data-action="${action}">
      <input type="tel" name="whatsapp" placeholder="Seu WhatsApp" required />
      ${action === "join" ? '<input type="text" name="name" placeholder="Seu nome (opcional)" />' : ""}
      <button type="submit">${action === "join" ? "Confirmar" : "Sair"}</button>
    </form>
  `;
  card.querySelector(".group-action-form input[name=whatsapp]").focus();
  card.querySelector(".group-action-form").dataset.groupId = groupId;
});

groupsList.addEventListener("submit", async (event) => {
  const form = event.target.closest(".group-action-form");
  if (!form) return;
  event.preventDefault();
  const groupId = form.dataset.groupId;
  const action = form.dataset.action;
  const data = new FormData(form);
  const submitBtn = form.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  try {
    const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ whatsapp: data.get("whatsapp"), name: data.get("name") }),
    });
    const result = await res.json();
    if (!res.ok) {
      form.insertAdjacentHTML(
        "afterend",
        `<p class="post-status post-status--error">${escapeHtml(result.error || "Não consegui completar a ação.")}</p>`
      );
      submitBtn.disabled = false;
      return;
    }
    await loadGroups();
  } catch (err) {
    form.insertAdjacentHTML("afterend", '<p class="post-status post-status--error">Falha de conexão. Tente de novo.</p>');
    submitBtn.disabled = false;
  }
});

// Avaliação e denúncia (task-004) — só aparece depois que o grupo fecha
// (completo/concluído). "Avaliar" é um botão por participante confirmado
// (exceto a própria pessoa); "Relatar problema" é sempre visível, não
// depende de ter concluído (dá pra denunciar assim que o grupo fecha —
// ex: motorista sumiu antes da viagem acontecer de verdade).
const GROUP_REVIEW_FIXED_NOTICE =
  "Avaliações são baseadas em histórico real de grupos. O TOP3 não garante nem intermedeia pagamentos — sempre combine e confirme antes de pagar ou embarcar.";
const DENUNCIA_MOTIVO_LABELS = {
  nao_entregou: "Não entregou o combinado",
  sumiu_apos_combinado: "Sumiu depois de combinar",
  valor_diferente: "Cobrou/pagou valor diferente",
  outro: "Outro motivo",
};

function renderGroupReviewPanel(detail) {
  if (!currentUserProfile) {
    return '<p class="user-panel-empty">Entre com sua conta pra avaliar ou relatar um problema — precisa ter participado desse grupo logado.</p>';
  }
  if (!detail.currentUserIsConfirmedMember) {
    return '<p class="user-panel-empty">Só quem participou desse grupo logado pode avaliar ou relatar um problema.</p>';
  }
  const others = detail.members.filter((m) => m.userId && m.userId !== currentUserProfile.id);
  const membersHtml = others.length
    ? others
        .map((m) => {
          const stars =
            typeof m.mediaAvaliacao === "number"
              ? `${m.mediaAvaliacao.toFixed(1)} ⭐ (${m.totalAvaliacoes} ${m.totalAvaliacoes === 1 ? "avaliação" : "avaliações"})`
              : "sem avaliação ainda";
          return `
        <li class="user-panel-item">
          <span>${escapeHtml(m.name)} <span class="user-panel-empty">· ${escapeHtml(stars)}</span></span>
          <span class="user-panel-item-actions">
            <button type="button" class="group-avaliar-btn" data-user-id="${escapeHtml(m.userId)}" data-user-name="${escapeHtml(m.name)}">Avaliar</button>
          </span>
        </li>`;
        })
        .join("")
    : '<p class="user-panel-empty">Ninguém mais desse grupo participou logado.</p>';
  return `
    <ul class="user-panel-list">${membersHtml}</ul>
    <button type="button" class="cta-secondary group-denunciar-btn">Relatar problema</button>
    <p class="carona-docs-notice">${escapeHtml(GROUP_REVIEW_FIXED_NOTICE)}</p>
    <div class="group-review-form-slot"></div>
  `;
}

function avaliacaoFormHtml(userId, userName) {
  return `
    <form class="group-avaliacao-form" data-group-avaliado-id="${escapeHtml(userId)}">
      <div class="post-field">
        <label for="avaliacao-nota">Nota pra ${escapeHtml(userName)}</label>
        <select id="avaliacao-nota" name="nota" required>
          <option value="5">5 — ótimo</option>
          <option value="4">4 — bom</option>
          <option value="3">3 — ok</option>
          <option value="2">2 — ruim</option>
          <option value="1">1 — péssimo</option>
        </select>
      </div>
      <div class="post-field">
        <label for="avaliacao-comentario">Comentário (opcional, até 200 caracteres)</label>
        <input id="avaliacao-comentario" name="comentario" type="text" maxlength="200" />
      </div>
      <button type="submit" class="post-submit">Enviar avaliação</button>
      <p class="post-status group-review-status" aria-live="polite"></p>
    </form>`;
}

function denunciaFormHtml() {
  const options = Object.entries(DENUNCIA_MOTIVO_LABELS)
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join("");
  return `
    <form class="group-denuncia-form">
      <div class="post-field post-field--wide">
        <label for="denuncia-denunciado">Sobre quem é o problema</label>
        <select id="denuncia-denunciado" name="denunciadoId" required></select>
      </div>
      <div class="post-field post-field--wide">
        <label for="denuncia-motivo">Motivo</label>
        <select id="denuncia-motivo" name="motivo" required>${options}</select>
      </div>
      <div class="post-field post-field--wide">
        <label for="denuncia-descricao">O que aconteceu</label>
        <input id="denuncia-descricao" name="descricao" type="text" maxlength="500" required />
      </div>
      <div class="post-field post-field--wide">
        <label for="denuncia-evidencia">Evidência (opcional — link, print, o que tiver)</label>
        <input id="denuncia-evidencia" name="evidencia" type="text" maxlength="300" />
      </div>
      <button type="submit" class="post-submit">Enviar denúncia</button>
      <p class="post-status group-review-status" aria-live="polite"></p>
    </form>`;
}

async function loadGroupReviewPanel(groupId, panel) {
  panel.innerHTML = "carregando…";
  try {
    const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}`);
    const detail = await res.json();
    if (!res.ok) {
      panel.textContent = detail.error || "Não consegui carregar.";
      return;
    }
    panel.dataset.groupId = groupId;
    panel.dataset.members = JSON.stringify(detail.members.filter((m) => m.userId));
    panel.innerHTML = renderGroupReviewPanel(detail);
  } catch (err) {
    panel.textContent = "Falha de conexão.";
  }
}

groupsList.addEventListener("click", async (event) => {
  const reviewBtn = event.target.closest(".group-review-btn");
  if (reviewBtn) {
    const card = reviewBtn.closest(".group-card");
    const panel = card.querySelector(".group-review-panel");
    if (!panel.hidden) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    await loadGroupReviewPanel(reviewBtn.dataset.groupId, panel);
    return;
  }

  const avaliarBtn = event.target.closest(".group-avaliar-btn");
  if (avaliarBtn) {
    const slot = avaliarBtn.closest(".group-review-panel").querySelector(".group-review-form-slot");
    slot.innerHTML = avaliacaoFormHtml(avaliarBtn.dataset.userId, avaliarBtn.dataset.userName);
    slot.querySelector("select, input").focus();
    return;
  }

  const denunciarBtn = event.target.closest(".group-denunciar-btn");
  if (denunciarBtn) {
    const panel = denunciarBtn.closest(".group-review-panel");
    const slot = panel.querySelector(".group-review-form-slot");
    slot.innerHTML = denunciaFormHtml();
    const members = JSON.parse(panel.dataset.members || "[]").filter((m) => m.userId !== currentUserProfile.id);
    const select = slot.querySelector("#denuncia-denunciado");
    select.innerHTML = members.map((m) => `<option value="${escapeHtml(m.userId)}">${escapeHtml(m.name)}</option>`).join("");
    return;
  }
});

groupsList.addEventListener("submit", async (event) => {
  const avaliacaoForm = event.target.closest(".group-avaliacao-form");
  const denunciaForm = event.target.closest(".group-denuncia-form");
  if (!avaliacaoForm && !denunciaForm) return;
  event.preventDefault();
  const form = avaliacaoForm || denunciaForm;
  const panel = form.closest(".group-review-panel");
  const groupId = panel.dataset.groupId;
  const status = form.querySelector(".group-review-status");
  const submitBtn = form.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  status.textContent = "enviando…";
  status.className = "post-status group-review-status";

  const path = avaliacaoForm ? "avaliacoes" : "denuncias";
  const body = avaliacaoForm
    ? { avaliadoId: avaliacaoForm.dataset.groupAvaliadoId, nota: Number(new FormData(form).get("nota")), comentario: new FormData(form).get("comentario") }
    : Object.fromEntries(new FormData(form));

  try {
    const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (!res.ok) {
      status.textContent = result.error || "Não consegui enviar.";
      status.className = "post-status group-review-status post-status--error";
      submitBtn.disabled = false;
      return;
    }
    status.textContent = avaliacaoForm ? "Avaliação enviada!" : "Denúncia registrada.";
    status.className = "post-status group-review-status post-status--ok";
    // Recarrega o painel pra já refletir a nova média/lista, sem precisar
    // fechar e abrir de novo.
    setTimeout(() => loadGroupReviewPanel(groupId, panel), 800);
  } catch (err) {
    status.textContent = "Falha de conexão. Tente de novo.";
    status.className = "post-status group-review-status post-status--error";
    submitBtn.disabled = false;
  }
});

groupCreateToggle.addEventListener("click", () => {
  groupForm.hidden = !groupForm.hidden;
  if (!groupForm.hidden) {
    document.getElementById("group-title").focus();
    prefillGroupFormFromProfile();
    if (caronaTipoSelect.value === "motorista") prefillMotoristaFieldsFromProfile();
  }
});

// Campos condicionais do formulário de criar (task-002): categoria "carona"
// troca os campos genéricos (vagas/preço/prazo) pelos campos de carona;
// dentro de carona, "motorista" exige CNH/placa/veículo, "passageiro" não.
// required é alternado junto — senão o navegador bloqueia o envio por causa
// de campo escondido ainda marcado obrigatório.
const groupCategorySelect = document.getElementById("group-category");
const groupTargetField = document.getElementById("group-target-field");
const groupTipoField = document.getElementById("group-tipo-field");
const groupPriceField = document.getElementById("group-price-field");
const groupDeadlineField = document.getElementById("group-deadline-field");
const groupTargetInput = document.getElementById("group-target");
const groupCaronaFields = document.getElementById("group-carona-fields");
const caronaTipoSelect = document.getElementById("carona-tipo");
const caronaOrigemInput = document.getElementById("carona-origem");
const caronaDestinoInput = document.getElementById("carona-destino");
const caronaDataInput = document.getElementById("carona-data");
const caronaMotoristaFields = document.getElementById("carona-motorista-fields");
const caronaVagasInput = document.getElementById("carona-vagas");
const caronaCnhInput = document.getElementById("carona-cnh");
const caronaPlacaInput = document.getElementById("carona-placa");
const caronaModeloInput = document.getElementById("carona-modelo");
const caronaCorInput = document.getElementById("carona-cor");
const caronaHorarioInput = document.getElementById("carona-horario");
const groupWhatsappInput = document.getElementById("group-whatsapp");
const groupNameInput = document.getElementById("group-name");
const caronaUseLocationBtn = document.getElementById("carona-use-location");
const caronaLocationStatus = document.getElementById("carona-location-status");
const caronaLatInput = document.getElementById("carona-lat");
const caronaLngInput = document.getElementById("carona-lng");

// Pré-preenchimento a partir do perfil (task-003) — só entra em campo
// vazio, nunca sobrescreve o que a pessoa já digitou, e continua 100%
// editável depois de preenchido.
function prefillGroupFormFromProfile() {
  if (!currentUserProfile) return;
  if (!groupWhatsappInput.value && currentUserProfile.whatsapp) groupWhatsappInput.value = currentUserProfile.whatsapp;
  if (!groupNameInput.value && currentUserProfile.name) groupNameInput.value = currentUserProfile.name;
}

function prefillMotoristaFieldsFromProfile() {
  if (!currentUserProfile || !currentUserProfile.motorista) return;
  const m = currentUserProfile.motorista;
  if (!caronaCnhInput.value && m.cnhNumero) caronaCnhInput.value = m.cnhNumero;
  if (!caronaPlacaInput.value && m.veiculoPlaca) caronaPlacaInput.value = m.veiculoPlaca;
  if (!caronaModeloInput.value && m.veiculoModelo) caronaModeloInput.value = m.veiculoModelo;
  if (!caronaCorInput.value && m.veiculoCor) caronaCorInput.value = m.veiculoCor;
}

const WEEKDAY_NAMES = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

function weekdayNameFromDateInput(dateStr) {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return null;
  // Monta a data no fuso local (não usa new Date(string), que interpreta
  // "YYYY-MM-DD" como meia-noite UTC e pode virar o dia da semana errado
  // pra quem está no Brasil).
  return WEEKDAY_NAMES[new Date(year, month - 1, day).getDay()];
}

caronaHorarioInput.addEventListener("input", () => {
  caronaHorarioInput.dataset.touched = "1";
});

// Sugere o horário da primeira janela de disponibilidade que bate com o dia
// da semana da data escolhida (task-003) — só enquanto a pessoa não digitou
// nada nesse campo com a própria mão.
function suggestHorarioFromProfile() {
  if (!currentUserProfile || !Array.isArray(currentUserProfile.disponibilidade)) return;
  if (caronaHorarioInput.dataset.touched) return;
  const dia = weekdayNameFromDateInput(caronaDataInput.value);
  if (!dia) return;
  const janela = currentUserProfile.disponibilidade.find((j) => j.dia === dia);
  caronaHorarioInput.value = janela ? janela.inicio : "";
}

caronaDataInput.addEventListener("change", suggestHorarioFromProfile);

function updateCaronaTipoFields() {
  const isMotorista = caronaTipoSelect.value === "motorista";
  caronaMotoristaFields.hidden = !isMotorista;
  caronaVagasInput.required = isMotorista;
  caronaCnhInput.required = isMotorista;
  caronaPlacaInput.required = isMotorista;
  caronaModeloInput.required = isMotorista;
  caronaCorInput.required = isMotorista;
  if (isMotorista) prefillMotoristaFieldsFromProfile();
}

function updateGroupFormFieldsForCategory() {
  const isCarona = groupCategorySelect.value === "carona";
  groupTargetField.hidden = isCarona;
  // Carona já tem o próprio "Você é" (motorista/passageiro) — esse campo
  // genérico de quero/ofereço (task-005) não se aplica a ela.
  groupTipoField.hidden = isCarona;
  groupPriceField.hidden = isCarona;
  groupDeadlineField.hidden = isCarona;
  groupTargetInput.required = !isCarona;
  groupCaronaFields.hidden = !isCarona;
  caronaOrigemInput.required = isCarona;
  caronaDestinoInput.required = isCarona;
  caronaDataInput.required = isCarona;
  if (isCarona) updateCaronaTipoFields();
}

groupCategorySelect.addEventListener("change", updateGroupFormFieldsForCategory);
caronaTipoSelect.addEventListener("change", updateCaronaTipoFields);
updateGroupFormFieldsForCategory();

// Localização é sempre opcional e pedida na hora (nunca salva além do que
// preenche esses dois campos escondidos, usados só pra ordenar a busca —
// task-002, seção 2).
caronaUseLocationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    caronaLocationStatus.textContent = "seu navegador não suporta localização";
    return;
  }
  caronaLocationStatus.textContent = "obtendo localização…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      caronaLatInput.value = pos.coords.latitude;
      caronaLngInput.value = pos.coords.longitude;
      caronaLocationStatus.textContent = "localização atual usada ✓";
    },
    () => {
      caronaLocationStatus.textContent = "não consegui obter sua localização — preencha a origem manualmente";
    }
  );
});

// Motor de sugestão automática (task-005, sem IA) — mostra na hora quem já
// publicou o lado oposto compatível (mesma categoria, local parecido, data
// compatível), com o WhatsApp já pronto pra chamar. Cálculo é feito no
// servidor (comparação de texto/data direta, nenhuma chamada externa).
function renderGroupSuggestions(suggestions) {
  if (!suggestions || suggestions.length === 0) {
    groupSuggestions.innerHTML = "";
    return;
  }
  const count = suggestions.length;
  const intro = count === 1 ? "Encontramos 1 pessoa que combina com o que você procura!" : `Encontramos ${count} pessoas que combinam com o que você procura!`;
  const itemsHtml = suggestions
    .map((s) => {
      const routeText = s.carona ? ` · ${escapeHtml(s.carona.origemTexto)} → ${escapeHtml(s.carona.destinoTexto)}` : "";
      const whatsappDigits = String(s.whatsapp || "").replace(/\D/g, "");
      const whatsappHtml = whatsappDigits
        ? `<a class="accept-btn" href="https://wa.me/${encodeURIComponent(whatsappDigits)}" target="_blank" rel="noopener noreferrer">Falar no WhatsApp</a>`
        : "";
      return `
      <li class="request-item">
        <span class="request-info">
          <strong>${escapeHtml(s.name || "Alguém")}</strong> · ${escapeHtml(s.title)}
          <br />
          <span class="request-meta">${escapeHtml(s.city)}${routeText}</span>
        </span>
        <span class="request-action">${whatsappHtml}</span>
      </li>`;
    })
    .join("");
  groupSuggestions.innerHTML = `
    <p class="post-status post-status--ok">${escapeHtml(intro)}</p>
    <ul class="requests-list">${itemsHtml}</ul>
  `;
}

groupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(groupForm);
  const submitBtn = groupForm.querySelector("button[type=submit]");
  groupStatus.textContent = "criando grupo…";
  groupStatus.className = "post-status";
  submitBtn.disabled = true;

  // "tipoGeral" (select genérico quero/ofereço, task-005) tem nome próprio
  // de propósito — o formulário também tem "carona-tipo" com name="tipo"
  // (motorista/passageiro), e os dois ficam sempre no mesmo <form> (só um
  // escondido via CSS conforme a categoria). Com o mesmo "name" nos dois,
  // o FormData pegaria o valor errado quando o campo escondido vem depois
  // no DOM. Categoria carona já manda "tipo" certo via carona-tipo; fora
  // dela, "tipoGeral" é que precisa virar "tipo" no payload da API.
  const payload = Object.fromEntries(data);
  if (groupCategorySelect.value !== "carona") {
    payload.tipo = payload.tipoGeral;
  }
  delete payload.tipoGeral;

  try {
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!res.ok) {
      groupStatus.textContent = result.error || "Não consegui criar o grupo.";
      groupStatus.className = "post-status post-status--error";
      return;
    }
    groupStatus.textContent = "Grupo criado!";
    groupStatus.className = "post-status post-status--ok";
    renderGroupSuggestions(result.suggestions);
    groupForm.reset();
    updateGroupFormFieldsForCategory();
    delete caronaHorarioInput.dataset.touched;
    caronaLocationStatus.textContent = "";
    groupForm.hidden = true;
    await loadGroups();
  } catch (err) {
    groupStatus.textContent = "Falha de conexão. Tente de novo.";
    groupStatus.className = "post-status post-status--error";
  } finally {
    submitBtn.disabled = false;
  }
});

loadGroups();

const postForm = document.getElementById("post-form");
const postStatus = document.getElementById("post-status");
const publishInterestLink = document.getElementById("publish-interest-link");
let lastSearchQuery = "";

publishInterestLink.addEventListener("click", (event) => {
  if (!lastSearchQuery) return;
  event.preventDefault();
  goToPublish();
});

document.getElementById("ranking-publish-link").addEventListener("click", (event) => {
  if (!lastSearchQuery) return;
  event.preventDefault();
  goToPublish();
});

postForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(postForm);
  const payload = {
    type: data.get("type"),
    title: data.get("title"),
    when: data.get("when"),
    price: data.get("price"),
    requester: data.get("requester"),
    whatsapp: data.get("whatsapp"),
    location: data.get("location"),
  };

  postStatus.textContent = "publicando…";
  postStatus.className = "post-status";

  try {
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json();

    if (!res.ok) {
      postStatus.textContent = result.error || "Não consegui publicar.";
      postStatus.className = "post-status post-status--error";
      return;
    }

    postStatus.textContent = "Publicado! Já aparece pra quem presta serviço.";
    postStatus.className = "post-status post-status--ok";
    postForm.reset();
    // A view do prestador vive escondida enquanto este formulário está
    // visível (são mutuamente exclusivas), então não tem como recarregar
    // a lista "ao vivo" aqui — só marcamos como desatualizada, e ela
    // recarrega sozinha na próxima vez que o modo prestador for aberto.
    requestsLoaded = false;
  } catch (err) {
    postStatus.textContent = "Falha de conexão ao publicar.";
    postStatus.className = "post-status post-status--error";
  }
});

// Pilar 4.12 — perfil profissional gerado por IA. Envia como multipart
// (FormData direto do form, sem montar JSON) porque tem arquivo de foto
// junto; o servidor escreve a bio e (se configurado) melhora as fotos.
const providerForm = document.getElementById("provider-form");
const providerStatus = document.getElementById("provider-status");
const providerResult = document.getElementById("provider-result");
const providerFormSubmit = document.getElementById("provider-form-submit");
const providerEditNotice = document.getElementById("provider-edit-notice");
const providerEditName = document.getElementById("provider-edit-name");
const providerEditCancel = document.getElementById("provider-edit-cancel");
const providerDescriptionLabel = document.getElementById("provider-description-label");
const providerDescriptionInput = document.getElementById("provider-description");
const providerPhotosLabel = document.getElementById("provider-photos-label");
const providerPhotosInput = document.getElementById("provider-photos");

// Slug do perfil sendo editado, ou null em modo "criar novo" — controla se
// o submit do form manda POST (criar) ou PUT (editar), sem duplicar form.
let editingProviderSlug = null;

function setProviderFormMode(mode) {
  const editing = mode === "edit";
  providerEditNotice.hidden = !editing;
  providerFormSubmit.textContent = editing ? "Salvar alterações" : "Criar meu perfil";
  providerDescriptionLabel.textContent = editing
    ? "Descreva o que você faz (deixe em branco pra manter a bio atual)"
    : "Descreva o que você faz, com suas palavras";
  providerDescriptionInput.required = !editing;
  providerPhotosLabel.textContent = editing ? "Fotos (deixe em branco pra manter as atuais)" : "Fotos (pelo menos uma)";
  providerPhotosInput.required = !editing;
}

async function startEditingProvider(slug) {
  providerStatus.textContent = "";
  providerStatus.className = "post-status";
  providerResult.hidden = true;
  try {
    const res = await fetch(`/api/providers/${encodeURIComponent(slug)}`);
    if (!res.ok) throw new Error("não encontrado");
    const { provider } = await res.json();
    editingProviderSlug = provider.slug;
    providerForm.elements.name.value = provider.name;
    providerForm.elements.service.value = provider.service;
    providerForm.elements.location.value = provider.location;
    providerForm.elements.whatsapp.value = provider.whatsapp;
    providerForm.elements.description.value = "";
    providerEditName.textContent = provider.name;
    setProviderFormMode("edit");
    highlightSection(document.getElementById("criar-perfil"));
    providerForm.elements.name.focus();
  } catch (err) {
    providerStatus.textContent = "Não consegui carregar esse perfil pra editar.";
    providerStatus.className = "post-status post-status--error";
  }
}

providerEditCancel.addEventListener("click", () => {
  editingProviderSlug = null;
  providerForm.reset();
  setProviderFormMode("create");
  providerStatus.textContent = "";
  providerStatus.className = "post-status";
  providerResult.hidden = true;
});

providerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(providerForm);
  const isEditing = Boolean(editingProviderSlug);

  providerStatus.textContent = isEditing ? "salvando alterações…" : "criando seu perfil…";
  providerStatus.className = "post-status";
  providerResult.hidden = true;
  providerFormSubmit.disabled = true;

  try {
    const res = isEditing
      ? await fetch(`/api/providers/${encodeURIComponent(editingProviderSlug)}`, { method: "PUT", body: data })
      : await fetch("/api/providers", { method: "POST", body: data });
    const result = await res.json();

    if (!res.ok) {
      providerStatus.textContent = result.error || `Não consegui ${isEditing ? "salvar as alterações" : "criar seu perfil"}.`;
      providerStatus.className = "post-status post-status--error";
      return;
    }

    const link = `${window.location.origin}/prestador/${result.provider.slug}`;
    providerStatus.textContent = isEditing ? "Alterações salvas!" : "Perfil criado!";
    providerStatus.className = "post-status post-status--ok";
    providerResult.hidden = false;
    providerResult.innerHTML = `
      <p>${isEditing ? "Seu perfil foi atualizado:" : "Seu perfil já está no ar — compartilhe o link:"}</p>
      <a href="${escapeHtml(link)}" target="_blank" rel="noopener">${escapeHtml(link)}</a>
    `;
    // Atualiza o painel pessoal em memória (nome/serviço podem ter mudado)
    // sem precisar recarregar a página nem buscar de novo no servidor.
    if (isEditing) {
      const entry = ownProviders.find((p) => p.slug === result.provider.slug);
      if (entry) {
        entry.name = result.provider.name;
        entry.service = result.provider.service;
      }
    }
    editingProviderSlug = null;
    providerForm.reset();
    setProviderFormMode("create");
  } catch (err) {
    providerStatus.textContent = "Falha de conexão. Tente de novo.";
    providerStatus.className = "post-status post-status--error";
  } finally {
    providerFormSubmit.disabled = false;
  }
});

// Busca única, sempre pela barra fixa embaixo (estilo app) — o topo do
// site fica só pra mostrar rankings, corridas e outros resultados.
const bottomSearchForm = document.getElementById("bottom-search-form");
const bottomSearchInput = document.getElementById("bottom-search-input");
const bottomSearchSubmit = bottomSearchForm.querySelector('button[type="submit"]');
let searchInFlight = false;

async function runSearch(message) {
  // Guarda contra buscas simultâneas: a busca pode ser disparada por mais
  // de um caminho (barra de baixo, "Chamar agora" no ranking) — sem essa
  // guarda, uma busca mais antiga em voo poderia terminar depois e
  // sobrescrever o resultado de uma busca mais nova.
  if (searchInFlight) return;
  searchInFlight = true;
  lastSearchQuery = message;
  bottomSearchInput.disabled = true;
  bottomSearchSubmit.disabled = true;
  renderResult(message, "loading");
  results.scrollIntoView({ behavior: "smooth", block: "center" });

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();

    if (!res.ok) {
      renderResult(message, "error", data.error || "Algo deu errado.");
    } else {
      renderResult(message, "ok", data.reply);
    }
  } catch (err) {
    renderResult(message, "error", "Não consegui falar com o servidor.");
  } finally {
    bottomSearchInput.disabled = false;
    bottomSearchSubmit.disabled = false;
    searchInFlight = false;
  }
}

bottomSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = bottomSearchInput.value.trim();
  if (!message) return;
  // A busca só é visível no modo "solicitar" — troca de volta se a pessoa
  // buscar estando no modo "presto um serviço".
  if (providerView.hidden === false) setMode("requester");
  bottomSearchInput.value = "";

  // Espera o catálogo de serviços carregar antes de classificar — sem isso,
  // uma busca feita rápido demais (antes do fetch responder) poderia
  // classificar um serviço recém-cadastrado como "other" só porque
  // KNOWN_SERVICES ainda estava com a lista de fallback (achado do
  // CodeRabbit no PR #45). Na prática resolve quase instantâneo.
  await knownServicesLoaded;

  // Busca roteia por intenção: serviço cadastrado mostra o ranking,
  // corrida/carona mostra o painel de corridas — só cai no texto de IA
  // (runSearch) pro que sobrar (terreno, carro, produto etc). Ver seção 10
  // de docs/visao-produto.md.
  const intent = classifyIntent(message);
  if (intent.type === "profile") {
    highlightSection(document.getElementById("criar-perfil"));
    document.getElementById("provider-name").focus();
    return;
  }
  if (intent.type === "ride") {
    if (intent.from && intent.to) {
      rideFrom.value = intent.from;
      rideTo.value = intent.to;
      rideForm.requestSubmit();
    } else {
      rideFrom.focus();
    }
    highlightSection(ridesSection);
    return;
  }
  if (intent.type === "service") {
    loadRanking(undefined, intent.service);
    highlightSection(rankingSection);
    return;
  }

  // Busca por palavra-chave sem IA (task-005) — cobre o que classifyIntent
  // sozinho não pega: sinônimo de serviço ("unha" além de "manicure") e
  // categoria de Grupos de Economia (frete/curso/assinatura/compra/viagem).
  // Resultado "text" (fallback mais fraco, substring simples no título) não
  // vira atalho aqui — cai no mesmo fluxo de busca na web de sempre, pra
  // não destacar a seção Grupos pra qualquer busca que bata por acaso.
  try {
    const searchRes = await fetch(`/api/search?q=${encodeURIComponent(message)}`);
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.type === "service" && searchData.results.length > 0) {
        loadRanking(undefined, searchData.service);
        highlightSection(rankingSection);
        return;
      }
      if (searchData.type === "group" && searchData.results.length > 0) {
        const categoryBtn = document.querySelector(`.group-category-btn[data-category="${searchData.category}"]`);
        if (categoryBtn) categoryBtn.click();
        highlightSection(document.getElementById("grupos"));
        return;
      }
    }
  } catch (err) {
    // Falha na busca por palavra-chave não deveria travar a busca — cai no
    // mesmo fallback de sempre (busca na web).
  }

  runSearch(message);
});

document.getElementById("nav-ask-link").addEventListener("click", (event) => {
  event.preventDefault();
  bottomSearchInput.focus();
});

document.getElementById("hero-ask-link").addEventListener("click", (event) => {
  event.preventDefault();
  bottomSearchInput.focus();
});

// Exemplos clicáveis no hero (manicure, terreno, corrida, carro...) — mostra
// logo de cara o tipo de coisa que dá pra pedir, pra quem chega no site sem
// saber o que digitar. Preenche a mesma barra de busca e dispara a mesma
// busca de sempre (sem formulário novo, sem rota paralela).
document.querySelectorAll(".example-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    bottomSearchInput.value = chip.dataset.example;
    bottomSearchForm.requestSubmit();
  });
});

// Login com Google (opcional, pilar 4.13). Sem GOOGLE_CLIENT_ID configurada
// no servidor, /api/auth/config devolve null e o botão nunca aparece — nada
// quebra, o resto do site funciona igual antes.
const googleSigninSlot = document.getElementById("google-signin-slot");
const userPanel = document.getElementById("user-panel");

// Login por email/senha (task-003) — alternativa sempre disponível, não
// depende de GOOGLE_CLIENT_ID. Mesmo painel serve pra "Entrar" e "Criar
// conta", só troca quais campos aparecem (ver princípios de UI/UX da seção
// 10: um controle por ação, não dois formulários fazendo quase a mesma
// coisa).
const emailAuthToggle = document.getElementById("email-auth-toggle");
const emailAuthPanel = document.getElementById("email-auth-panel");
const emailAuthTabs = document.querySelectorAll(".email-auth-tab");
const emailAuthForm = document.getElementById("email-auth-form");
const emailAuthSubmit = document.getElementById("email-auth-submit");
const emailAuthStatus = document.getElementById("email-auth-status");
let emailAuthMode = "login";

function updateEmailAuthMode() {
  const isSignup = emailAuthMode === "signup";
  emailAuthForm.querySelector('[data-auth-field="name"]').hidden = !isSignup;
  emailAuthForm.querySelector('[data-auth-field="whatsapp"]').hidden = !isSignup;
  document.getElementById("auth-name").required = isSignup;
  document.getElementById("auth-whatsapp").required = isSignup;
  emailAuthSubmit.textContent = isSignup ? "Criar conta" : "Entrar";
  emailAuthTabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.authMode === emailAuthMode));
}

emailAuthToggle.addEventListener("click", () => {
  emailAuthPanel.hidden = !emailAuthPanel.hidden;
  if (!emailAuthPanel.hidden) document.getElementById("auth-email").focus();
});

emailAuthTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    emailAuthMode = tab.dataset.authMode;
    updateEmailAuthMode();
  });
});
updateEmailAuthMode();

emailAuthForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(emailAuthForm);
  emailAuthStatus.textContent = emailAuthMode === "signup" ? "criando conta…" : "entrando…";
  emailAuthStatus.className = "post-status";
  emailAuthSubmit.disabled = true;
  try {
    const res = await fetch(`/api/auth/${emailAuthMode === "signup" ? "signup" : "login"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(data)),
    });
    const result = await res.json();
    if (!res.ok) {
      emailAuthStatus.textContent = result.error || "Não consegui completar.";
      emailAuthStatus.className = "post-status post-status--error";
      return;
    }
    const meRes = await fetch("/api/auth/me");
    const me = meRes.ok ? await meRes.json() : { providers: [], groups: [], requests: [] };
    renderLoggedInUser(result.user, me.providers, me.groups, me.requests);
    emailAuthForm.reset();
  } catch (err) {
    emailAuthStatus.textContent = "Falha de conexão. Tente de novo.";
    emailAuthStatus.className = "post-status post-status--error";
  } finally {
    emailAuthSubmit.disabled = false;
  }
});

// Painel pessoal (pilar 4.13): lista os perfis, grupos e pedidos que a
// pessoa logada criou, com atalho pra ver/editar cada um. Guardado aqui pra
// não precisar buscar de novo toda vez que o painel abre/fecha. "Meus
// pedidos" só pega o que foi publicado pelo formulário direto do site —
// pedido publicado por conversa (chat do site ou WhatsApp) fica sem dono,
// esses dois caminhos não têm sessão de navegador pra amarrar.
let ownProviders = [];
let ownGroups = [];
let ownRequests = [];

function renderUserPanel() {
  const providersHtml =
    ownProviders.length === 0
      ? '<p class="user-panel-empty">Você ainda não criou nenhum perfil. Use "Criar meu perfil" no menu.</p>'
      : `<ul class="user-panel-list">${ownProviders
          .map(
            (p) => `
          <li class="user-panel-item">
            <span>${escapeHtml(p.name)} <span class="user-panel-empty">· ${escapeHtml(p.service)}</span></span>
            <span class="user-panel-item-actions">
              <a href="/prestador/${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">Ver</a>
              <button type="button" data-edit-slug="${escapeHtml(p.slug)}">Editar</button>
            </span>
          </li>`
          )
          .join("")}</ul>`;

  const groupsHtml =
    ownGroups.length === 0
      ? '<p class="user-panel-empty">Você ainda não criou nenhum grupo. Use "Grupos" no menu.</p>'
      : `<ul class="user-panel-list">${ownGroups
          .map(
            (g) => `
          <li class="user-panel-item">
            <span>${escapeHtml(g.title)} <span class="user-panel-empty">· ${escapeHtml(g.categoryLabel)} · ${g.status}</span></span>
            <span class="user-panel-item-actions">
              <button type="button" data-view-group-category="${escapeHtml(g.category)}">Ver</button>
            </span>
          </li>`
          )
          .join("")}</ul>`;

  const requestsHtml =
    ownRequests.length === 0
      ? '<p class="user-panel-empty">Você ainda não publicou nenhum pedido pelo formulário. Use "Publicar" no menu.</p>'
      : `<ul class="user-panel-list">${ownRequests
          .map(
            (r) => `
          <li class="user-panel-item">
            <span>${escapeHtml(r.title)} <span class="user-panel-empty">· ${escapeHtml(r.type)} · ${escapeHtml(r.status)}</span></span>
            <span class="user-panel-item-actions">
              <button type="button" class="view-own-request-btn">Ver</button>
            </span>
          </li>`
          )
          .join("")}</ul>`;

  userPanel.innerHTML = `
    <button type="button" id="edit-profile-btn" class="cta-secondary">Meus dados</button>
    <h3>Meus perfis</h3>${providersHtml}<h3>Meus grupos</h3>${groupsHtml}<h3>Meus pedidos</h3>${requestsHtml}`;
}

// Perfil completo de quem está logado (task-003) — guardado aqui pra
// pré-preencher formulário de Grupos sem precisar buscar de novo toda hora.
let currentUserProfile = null;

// Sugestão discreta de login (task-003) nas telas de "Quero solicitar"/
// "Quero prestar" — nunca bloqueia o uso anônimo, só aparece pra quem ainda
// não está logado e ainda não dispensou (localStorage, por navegador —
// dispensar aqui não afeta outro aparelho nem outra pessoa).
const LOGIN_SUGGESTION_DISMISSED_KEY = "top3_login_suggestion_dismissed";
const loginSuggestionBanner = document.getElementById("login-suggestion-banner");
const loginSuggestionCta = document.getElementById("login-suggestion-cta");
const loginSuggestionDismiss = document.getElementById("login-suggestion-dismiss");

function wasLoginSuggestionDismissed() {
  try {
    return localStorage.getItem(LOGIN_SUGGESTION_DISMISSED_KEY) === "1";
  } catch (err) {
    return false;
  }
}

function showLoginSuggestionBannerIfApplicable() {
  if (currentUserProfile || wasLoginSuggestionDismissed()) return;
  loginSuggestionBanner.hidden = false;
}

function hideLoginSuggestionBanner() {
  loginSuggestionBanner.hidden = true;
}

loginSuggestionCta.addEventListener("click", () => {
  hideLoginSuggestionBanner();
  emailAuthPanel.hidden = false;
  emailAuthToggle.scrollIntoView({ behavior: "smooth", block: "center" });
  document.getElementById("auth-email").focus();
});

loginSuggestionDismiss.addEventListener("click", () => {
  hideLoginSuggestionBanner();
  try {
    localStorage.setItem(LOGIN_SUGGESTION_DISMISSED_KEY, "1");
  } catch (err) {
    // localStorage indisponível (modo privado, storage bloqueado) — sem
    // problema, o banner só volta a aparecer nessa mesma visita.
  }
});

function renderLoggedInUser(user, providers, groups, requests) {
  ownProviders = providers || [];
  ownGroups = groups || [];
  ownRequests = requests || [];
  currentUserProfile = user;
  googleSigninSlot.innerHTML = `
    <button type="button" class="user-chip" id="user-chip-toggle">
      ${user.picture ? `<img src="${escapeHtml(user.picture)}" alt="" />` : ""}
      ${escapeHtml(user.name)}
    </button>
    <button type="button" class="user-logout" id="google-logout-btn">Sair</button>
  `;
  emailAuthToggle.hidden = true;
  emailAuthPanel.hidden = true;
  hideLoginSuggestionBanner();
  renderUserPanel();
}

// Edição de perfil (task-003) — WhatsApp, tipo de uso, dados de motorista e
// disponibilidade semanal. Mesmo formulário serve só de "editar" (não tem
// "criar", a conta já existe desde o cadastro) — reaproveita os estilos
// .post-form/.post-field do resto do site em vez de inventar um layout novo.
const profileEditPanel = document.getElementById("profile-edit-panel");
const profileEditForm = document.getElementById("profile-edit-form");
const profileEditStatus = document.getElementById("profile-edit-status");
const profileWhatsappInput = document.getElementById("profile-whatsapp");
const profileTipoUsoSelect = document.getElementById("profile-tipo-uso");
const profileCnhInput = document.getElementById("profile-cnh");
const profilePlacaInput = document.getElementById("profile-placa");
const profileModeloInput = document.getElementById("profile-modelo");
const profileCorInput = document.getElementById("profile-cor");
const profileAvailabilityRows = document.querySelectorAll(".profile-availability-row");

function openProfileEditPanel() {
  if (!currentUserProfile) return;
  profileWhatsappInput.value = currentUserProfile.whatsapp || "";
  profileTipoUsoSelect.value = currentUserProfile.tipoUso || "";
  const m = currentUserProfile.motorista || {};
  profileCnhInput.value = m.cnhNumero || "";
  profilePlacaInput.value = m.veiculoPlaca || "";
  profileModeloInput.value = m.veiculoModelo || "";
  profileCorInput.value = m.veiculoCor || "";
  const disponibilidade = Array.isArray(currentUserProfile.disponibilidade) ? currentUserProfile.disponibilidade : [];
  profileAvailabilityRows.forEach((row) => {
    const janela = disponibilidade.find((j) => j.dia === row.dataset.day);
    row.querySelector(".profile-availability-inicio").value = janela ? janela.inicio : "";
    row.querySelector(".profile-availability-fim").value = janela ? janela.fim : "";
  });
  profileEditStatus.textContent = "";
  profileEditStatus.className = "post-status";
  profileEditPanel.hidden = false;
}

profileEditForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitBtn = profileEditForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  profileEditStatus.textContent = "salvando…";
  profileEditStatus.className = "post-status";

  const motoristaFields = {
    cnhNumero: profileCnhInput.value.trim(),
    veiculoPlaca: profilePlacaInput.value.trim(),
    veiculoModelo: profileModeloInput.value.trim(),
    veiculoCor: profileCorInput.value.trim(),
  };
  // Só manda o objeto motorista se pelo menos um campo foi preenchido — em
  // branco os quatro significa "não ofereço carona", que o servidor grava
  // como null (mesma regra de validateMotorista em server.js).
  const motorista = Object.values(motoristaFields).some(Boolean) ? motoristaFields : null;

  const disponibilidade = [];
  profileAvailabilityRows.forEach((row) => {
    const inicio = row.querySelector(".profile-availability-inicio").value;
    const fim = row.querySelector(".profile-availability-fim").value;
    if (inicio && fim) disponibilidade.push({ dia: row.dataset.day, inicio, fim });
  });

  try {
    const res = await fetch("/api/auth/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        whatsapp: profileWhatsappInput.value.trim(),
        tipoUso: profileTipoUsoSelect.value || null,
        motorista,
        disponibilidade,
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      profileEditStatus.textContent = result.error || "Não consegui salvar.";
      profileEditStatus.className = "post-status post-status--error";
      return;
    }
    currentUserProfile = result.user;
    profileEditStatus.textContent = "Salvo!";
    profileEditStatus.className = "post-status post-status--ok";
  } catch (err) {
    profileEditStatus.textContent = "Falha de conexão. Tente de novo.";
    profileEditStatus.className = "post-status post-status--error";
  } finally {
    submitBtn.disabled = false;
  }
});

document.addEventListener("click", (event) => {
  if (profileEditPanel.hidden) return;
  if (event.target.closest("#profile-edit-panel") || event.target.closest("#edit-profile-btn")) return;
  profileEditPanel.hidden = true;
});

googleSigninSlot.addEventListener("click", (event) => {
  if (event.target.closest("#google-logout-btn")) {
    fetch("/api/auth/logout", { method: "POST" }).then(() => window.location.reload());
    return;
  }
  if (event.target.closest("#user-chip-toggle")) {
    userPanel.hidden = !userPanel.hidden;
  }
});

document.addEventListener("click", (event) => {
  if (userPanel.hidden) return;
  if (event.target.closest("#user-panel") || event.target.closest("#user-chip-toggle")) return;
  userPanel.hidden = true;
});

userPanel.addEventListener("click", (event) => {
  if (event.target.closest("#edit-profile-btn")) {
    userPanel.hidden = true;
    openProfileEditPanel();
    return;
  }
  const editBtn = event.target.closest("[data-edit-slug]");
  if (editBtn) {
    userPanel.hidden = true;
    startEditingProvider(editBtn.dataset.editSlug);
    return;
  }
  const viewGroupBtn = event.target.closest("[data-view-group-category]");
  if (viewGroupBtn) {
    userPanel.hidden = true;
    const categoryBtn = document.querySelector(`.group-category-btn[data-category="${viewGroupBtn.dataset.viewGroupCategory}"]`);
    if (categoryBtn) categoryBtn.click();
    highlightSection(document.getElementById("grupos"));
    return;
  }
  // Não dá pra filtrar o quadro por um pedido específico (não existe esse
  // filtro ainda) — leva pro quadro geral, no modo "Presto serviço", onde
  // qualquer pedido publicado (inclusive o da pessoa) aparece.
  if (event.target.closest(".view-own-request-btn")) {
    userPanel.hidden = true;
    setMode("provider");
    highlightSection(document.getElementById("provider"));
  }
});

async function handleGoogleCredential(response) {
  try {
    const res = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: response.credential }),
    });
    if (!res.ok) return;
    const { user } = await res.json();
    // /api/auth/google não devolve os perfis/grupos (usuário pode ser novo)
    // — busca em seguida pra já abrir com o painel certo, sem precisar
    // recarregar.
    const meRes = await fetch("/api/auth/me");
    const me = meRes.ok ? await meRes.json() : { providers: [], groups: [], requests: [] };
    renderLoggedInUser(user, me.providers, me.groups, me.requests);
  } catch (err) {
    // Login é só um extra opcional — falha aqui não deve incomodar quem só
    // quer usar o site sem logar.
  }
}

// Só carrega o script da Google (accounts.google.com) quando o login está
// configurado — sem isso, todo mundo que visita o site faria uma chamada de
// rede pra Google à toa, mesmo sem essa funcionalidade estar ativa.
function loadGisScript() {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// google.accounts só existe depois do script externo carregar — tenta de
// novo por um tempo em vez de exigir uma ordem de carregamento exata.
function initGoogleSignIn(clientId, attemptsLeft) {
  if (!window.google || !window.google.accounts) {
    if (attemptsLeft > 0) setTimeout(() => initGoogleSignIn(clientId, attemptsLeft - 1), 150);
    return;
  }
  google.accounts.id.initialize({ client_id: clientId, callback: handleGoogleCredential });
  google.accounts.id.renderButton(googleSigninSlot, { theme: "outline", size: "medium", locale: "pt-BR" });
}

fetch("/api/auth/config")
  .then((res) => res.json())
  .then(async (config) => {
    // Confere se já tinha sessão de uma visita anterior ANTES de montar
    // qualquer botão de login — sem isso, o botão podia aparecer do lado do
    // nome de quem já está logado (o GIS não limpa o próprio slot ao
    // renderizar). Login por email/senha é sempre disponível (task-003),
    // então essa checagem roda independente de GOOGLE_CLIENT_ID estar
    // configurada — diferente de antes, que só checava sessão quando
    // Google estava ativo (bug: sessão feita por email/senha não
    // sobrevivia a um F5 quando Google não estava configurado).
    const meRes = await fetch("/api/auth/me");
    if (meRes.ok) {
      const { user, providers, groups, requests } = await meRes.json();
      if (user) {
        renderLoggedInUser(user, providers, groups, requests);
        return;
      }
    }
    if (!config.googleClientId) return;
    await loadGisScript();
    initGoogleSignIn(config.googleClientId, 20);
  })
  .catch(() => {})
  .finally(() => showLoginSuggestionBannerIfApplicable());
