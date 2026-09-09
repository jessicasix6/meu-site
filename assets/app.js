const PROVIDERS = [
  { name: "Ana Souza", service: "manicure", city: "Belo Horizonte", time: "amanhã às 14h" },
  { name: "Carla Lima", service: "manicure", city: "Belo Horizonte", time: "hoje às 17h30" },
  { name: "Fernanda Reis", service: "manicure", city: "Belo Horizonte", time: "amanhã às 09h" },
  { name: "João Pedro", service: "eletricista", city: "Curitiba", time: "hoje às 15h" },
  { name: "Marcos Vieira", service: "eletricista", city: "Curitiba", time: "amanhã às 10h" },
  { name: "Beatriz Alves", service: "cabeleireiro", city: "São Paulo", time: "hoje às 18h" },
  { name: "Ricardo Nunes", service: "encanador", city: "Rio de Janeiro", time: "amanhã às 08h" },
];

function findResults(query) {
  const q = query.toLowerCase();
  const matched = PROVIDERS.filter(
    (p) => q.includes(p.service.toLowerCase()) || q.includes(p.city.toLowerCase())
  );
  const pool = matched.length > 0 ? matched : PROVIDERS;
  return pool.slice(0, 5);
}

function renderResults(results) {
  const list = document.getElementById("results");
  list.innerHTML = "";
  results.forEach((r, index) => {
    const li = document.createElement("li");
    li.className = "result-card";
    li.style.animationDelay = `${index * 0.08}s, ${0.5 + index * 0.08}s`;
    li.innerHTML = `
      <strong>${r.name}</strong> — ${r.service}
      <br />
      <span>${r.city} · ${r.time}</span>
    `;
    list.appendChild(li);
  });
}

document.getElementById("search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const query = document.getElementById("search-input").value.trim();
  const status = document.getElementById("status");

  if (!query) {
    status.textContent = "";
    renderResults([]);
    return;
  }

  const results = findResults(query);
  status.textContent = `${results.length} resultado(s) para "${query}"`;
  renderResults(results);
});
