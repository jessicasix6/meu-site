const chatSection = document.getElementById("chat");
const results = document.getElementById("chat-results");
const rankingList = document.getElementById("ranking-list");
const rankingSort = document.getElementById("ranking-sort");
const locationHint = document.getElementById("location-hint");

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

async function loadRanking(sortBy) {
  const callId = ++loadRankingCallId;
  try {
    const effectiveSortBy = sortBy || rankingSort.value;
    let url = `/api/ranking?sortBy=${encodeURIComponent(effectiveSortBy)}`;

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
    if (usedRealLocation) {
      locationHint.hidden = false;
      locationHint.textContent = "Mostrando distância real a partir da sua localização.";
    }
    rankingList.innerHTML = "";
    top3.forEach((p, index) => {
      const item = document.createElement("li");
      item.className = `rank-card rank-card--${index + 1}`;
      item.innerHTML = `
        <div class="rank-card-top">
          <div class="rank-avatar">${escapeHtml(initials(p.name))}</div>
          <span class="rank-pos">#${index + 1}</span>
        </div>
        <h3 class="rank-name">${escapeHtml(p.name)}</h3>
        <p class="rank-service">${escapeHtml(p.service)} · ${escapeHtml(p.city)}</p>
        <div class="rank-stars">${starRow(p.rating)}<span class="rank-rating-num">${p.rating.toFixed(1)}</span></div>
        <div class="rank-chips">
          <span class="chip">${p.distanceKm.toFixed(1)} km</span>
          <span class="chip">R$ ${p.price}</span>
          ${p.fastReply ? '<span class="chip chip--fast">resposta rápida</span>' : ""}
        </div>
        <button type="button" class="rank-cta" data-name="${escapeHtml(p.name)}">Chamar agora</button>
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

rankingList.addEventListener("click", (event) => {
  const button = event.target.closest(".rank-cta");
  if (!button) return;
  runSearch(`quero chamar ${button.dataset.name}`);
});

const requesterView = document.getElementById("requester-view");
const providerView = document.getElementById("provider-view");
const requestsList = document.getElementById("requests-list");
const modeButtons = document.querySelectorAll(".mode-btn");
let requestsLoaded = false;

function setMode(mode) {
  const isProvider = mode === "provider";
  requesterView.hidden = isProvider;
  providerView.hidden = !isProvider;
  modeButtons.forEach((btn) => {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  if (isProvider && !requestsLoaded) {
    requestsLoaded = true;
    loadRequests();
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

// Módulo de corridas (pilar 4.5) — mini-app "de onde → pra onde" estilo
// BlaBlaCar, separado do formulário genérico de qualquer categoria.
const rideForm = document.getElementById("ride-form");
const rideFrom = document.getElementById("ride-from");
const rideTo = document.getElementById("ride-to");
const rideResults = document.getElementById("ride-results");

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

  return `${matchesHtml}<button type="button" class="ride-publish-btn" id="ride-publish-btn">Publicar essa corrida</button>`;
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
        r.type === "corrida" &&
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
  document.getElementById("post-type").value = "corrida";
  document.getElementById("post-title").value = `${from} → ${to}`;
  document.getElementById("publicar").scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("post-price").focus();
});

const postForm = document.getElementById("post-form");
const postStatus = document.getElementById("post-status");
const publishInterestLink = document.getElementById("publish-interest-link");
let lastSearchQuery = "";

publishInterestLink.addEventListener("click", (event) => {
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

bottomSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = bottomSearchInput.value.trim();
  if (!message) return;
  // A busca só é visível no modo "solicitar" — troca de volta se a pessoa
  // buscar estando no modo "presto um serviço".
  if (providerView.hidden === false) setMode("requester");
  bottomSearchInput.value = "";
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
