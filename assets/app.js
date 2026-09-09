const log = document.getElementById("chat-log");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const rankingList = document.getElementById("ranking-list");
const rankingSort = document.getElementById("ranking-sort");

async function loadRanking(sortBy) {
  try {
    const res = await fetch(`/api/ranking?sortBy=${encodeURIComponent(sortBy || rankingSort.value)}`);
    if (!res.ok) return;
    const { top3 } = await res.json();
    rankingList.innerHTML = "";
    top3.forEach((p, index) => {
      const item = document.createElement("li");
      item.className = `ranking-item rank-${index + 1}`;
      item.innerHTML = `
        <span class="rank-badge">#${index + 1}</span>
        <span class="rank-info">
          <strong>${escapeHtml(p.name)}</strong> — ${escapeHtml(p.service)}
          ${p.fastReply ? '<span class="fast-reply-badge">resposta rápida</span>' : ""}
          <br />
          <span class="rank-meta">${escapeHtml(p.city)} · ${p.distanceKm.toFixed(1)} km · R$ ${p.price} · ${p.rating.toFixed(1)} ★</span>
        </span>
      `;
      rankingList.appendChild(item);
    });
  } catch (err) {
    // painel de ranking é decorativo; falha aqui não deve travar o chat
  }
}

loadRanking();
rankingSort.addEventListener("change", () => loadRanking());

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

function renderRequests(requests) {
  requestsList.innerHTML = "";
  requests.forEach((r) => {
    const item = document.createElement("li");
    item.className = "request-item";
    item.dataset.id = r.id;
    const accepted = r.status === "aceito";
    item.innerHTML = `
      <span class="request-badge request-badge--${r.type}">${r.type === "corrida" ? "corrida" : "entrega"}</span>
      <span class="request-info">
        <strong>${escapeHtml(r.title)}</strong>
        <br />
        <span class="request-meta">${escapeHtml(r.requester)} · ${r.distanceKm.toFixed(1)} km · R$ ${r.price}</span>
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

function appendLine(role, prefix, text) {
  const line = document.createElement("div");
  line.className = `term-line ${role}`;
  line.innerHTML = prefix
    ? `<span class="line-prefix">${prefix}</span><span class="line-text">${formatMessage(text)}</span>`
    : `<span class="line-text">${formatMessage(text)}</span>`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
  return line;
}

appendLine("system", "", 'sistema pronto. pergunte algo como "manicure amanhã em BH".');

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;

  appendLine("user", "$", message);
  input.value = "";
  input.disabled = true;

  const typing = appendLine("agent typing", ">", "digitando...");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    typing.remove();

    if (!res.ok) {
      appendLine("agent error", "erro:", data.error || "Algo deu errado.");
    } else {
      appendLine("agent", ">", data.reply);
    }
  } catch (err) {
    typing.remove();
    appendLine("agent error", "erro:", "Não consegui falar com o servidor.");
  } finally {
    input.disabled = false;
    input.focus();
  }
});
