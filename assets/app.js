const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const results = document.getElementById("chat-results");
const rankingList = document.getElementById("ranking-list");
const rankingSort = document.getElementById("ranking-sort");

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

async function loadRanking(sortBy) {
  try {
    const res = await fetch(`/api/ranking?sortBy=${encodeURIComponent(sortBy || rankingSort.value)}`);
    if (!res.ok) return;
    const { top3 } = await res.json();
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
  if (!button || input.disabled) return;
  input.value = `quero chamar ${button.dataset.name}`;
  document.getElementById("chat").scrollIntoView({ behavior: "smooth", block: "center" });
  form.requestSubmit();
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

const REQUEST_LABELS = { corrida: "corrida", entrega: "entrega", profissional: "profissional" };

function renderRequests(requests) {
  requestsList.innerHTML = "";
  requests.forEach((r) => {
    const item = document.createElement("li");
    item.className = `request-item request-item--${r.type}`;
    item.dataset.id = r.id;
    const accepted = r.status === "aceito";
    const distanceChip = typeof r.distanceKm === "number" ? `${r.distanceKm.toFixed(1)} km · ` : "";
    item.innerHTML = `
      <span class="request-icon request-icon--${r.type}">${REQUEST_ICONS[r.type] || ""}</span>
      <span class="request-info">
        <span class="request-badge request-badge--${r.type}">${REQUEST_LABELS[r.type] || r.type}</span>
        <br />
        <strong>${escapeHtml(r.title)}</strong>
        <br />
        <span class="request-meta">${escapeHtml(r.requester)} · ${escapeHtml(r.when || "a combinar")} · ${distanceChip}R$ ${r.price}</span>
      </span>
      <button type="button" class="accept-btn" ${accepted ? "disabled" : ""}>${accepted ? "aceito" : "aceitar"}</button>
    `;
    requestsList.appendChild(item);
  });
}

requestsList.addEventListener("click", async (event) => {
  const button = event.target.closest(".accept-btn");
  if (!button || button.disabled) return;

  const item = button.closest(".request-item");
  const id = item.dataset.id;
  button.disabled = true;
  button.textContent = "aceitando...";

  try {
    const res = await fetch(`/api/requests/${encodeURIComponent(id)}/accept`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      button.disabled = false;
      button.textContent = "aceitar";
      alert(data.error || "Não consegui aceitar este pedido.");
      return;
    }
    button.textContent = "aceito";
  } catch (err) {
    button.disabled = false;
    button.textContent = "aceitar";
    alert("Falha de conexão ao aceitar o pedido.");
  }
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
  results.innerHTML = `
    <p class="result-query">Resultados para "${escapeHtml(query)}"</p>
    <div class="result-answer ${state === "error" ? "result-answer--error" : ""}">
      ${state === "loading" ? '<span class="result-loading">buscando…</span>' : formatMessage(text)}
    </div>
  `;
}

const postForm = document.getElementById("post-form");
const postStatus = document.getElementById("post-status");

postForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(postForm);
  const payload = {
    type: data.get("type"),
    title: data.get("title"),
    when: data.get("when"),
    price: data.get("price"),
    requester: data.get("requester"),
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;

  input.disabled = true;
  renderResult(message, "loading");

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
    input.disabled = false;
    input.focus();
  }
});
