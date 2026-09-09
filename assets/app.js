const log = document.getElementById("chat-log");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const rankingList = document.getElementById("ranking-list");

async function loadRanking() {
  try {
    const res = await fetch("/api/ranking");
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
          <br />
          <span class="rank-meta">${escapeHtml(p.city)} · ${p.rating.toFixed(1)} ★</span>
        </span>
      `;
      rankingList.appendChild(item);
    });
  } catch (err) {
    // painel de ranking é decorativo; falha aqui não deve travar o chat
  }
}

loadRanking();

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
