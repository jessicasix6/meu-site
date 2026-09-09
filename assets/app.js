const log = document.getElementById("chat-log");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");

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

function appendMessage(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  bubble.innerHTML = formatMessage(text);
  log.appendChild(bubble);
  log.scrollTop = log.scrollHeight;
  return bubble;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;

  appendMessage("user", message);
  input.value = "";
  input.disabled = true;

  const typing = appendMessage("agent typing", "digitando...");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    typing.remove();

    if (!res.ok) {
      appendMessage("agent error", data.error || "Algo deu errado.");
    } else {
      appendMessage("agent", data.reply);
    }
  } catch (err) {
    typing.remove();
    appendMessage("agent error", "Não consegui falar com o servidor.");
  } finally {
    input.disabled = false;
    input.focus();
  }
});
