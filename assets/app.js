const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
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

async function loadRanking(sortBy) {
  try {
    const effectiveSortBy = sortBy || rankingSort.value;
    let url = `/api/ranking?sortBy=${encodeURIComponent(effectiveSortBy)}`;

    locationHint.hidden = true;
    if (effectiveSortBy === "distance") {
      const loc = await getUserLocation();
      if (loc) {
        url += `&lat=${loc.lat}&lng=${loc.lng}`;
      } else {
        locationHint.hidden = false;
        locationHint.textContent = "Usando distância estimada — permita o acesso à localização pra ver a distância real até você.";
      }
    }

    const res = await fetch(url);
    if (!res.ok) return;
    const { top3, usedRealLocation } = await res.json();
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
      <span class="request-provider">aceito por ${escapeHtml(r.provider || "prestador")}</span>
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
        <span class="request-meta">${escapeHtml(r.requester)} · ${escapeHtml(r.when || "a combinar")} · ${distanceChip}R$ ${r.price}</span>
      </span>
      <span class="request-action">${requestActionArea(r)}</span>
    `;
    requestsList.appendChild(item);
  });
}

requestsList.addEventListener("click", async (event) => {
  const acceptBtn = event.target.closest(".accept-btn");
  const completeBtn = event.target.closest(".complete-btn");
  if (!acceptBtn && !completeBtn) return;

  const button = acceptBtn || completeBtn;
  const item = button.closest(".request-item");
  const id = item.dataset.id;
  button.disabled = true;

  try {
    if (acceptBtn) {
      const provider = prompt("Seu nome (aparece pra quem publicou o pedido):") || "";
      const res = await fetch(`/api/requests/${encodeURIComponent(id)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (!res.ok) {
        button.disabled = false;
        alert(data.error || "Não consegui aceitar este pedido.");
        return;
      }
    } else {
      const res = await fetch(`/api/requests/${encodeURIComponent(id)}/complete`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        button.disabled = false;
        alert(data.error || "Não consegui marcar como concluído.");
        return;
      }
    }
    loadRequests();
  } catch (err) {
    button.disabled = false;
    alert("Falha de conexão.");
  }
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

  try {
    const res = await fetch(`/api/requests/${encodeURIComponent(id)}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: Number(data.get("rating")), comment: data.get("comment") }),
    });
    const result = await res.json();
    if (!res.ok) {
      submitBtn.disabled = false;
      alert(result.error || "Não consegui registrar a avaliação.");
      return;
    }
    loadRequests();
  } catch (err) {
    submitBtn.disabled = false;
    alert("Falha de conexão ao avaliar.");
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
const publishInterestLink = document.getElementById("publish-interest-link");
let lastSearchQuery = "";

publishInterestLink.addEventListener("click", () => {
  if (!lastSearchQuery) return;
  document.getElementById("post-title").value = lastSearchQuery;
  document.getElementById("post-type").focus();
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

  lastSearchQuery = message;
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
