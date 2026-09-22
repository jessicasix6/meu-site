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
// Quem for classificar uma busca (ver heroSearchForm mais abaixo) espera
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

// ── Filtros de localização e preço ──────────────────────────────────────────
// Localização em cache: atualizada quando o usuário clica em "📍 Minha localização"
// ou quando a geolocalização já foi concedida pelo banner inicial.
let cachedUserLocation = null;

const BR_STATES = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
  MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
  PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia",
  RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins",
};

const BR_CITIES = {
  AC: ["Rio Branco", "Cruzeiro do Sul", "Sena Madureira"],
  AL: ["Maceió", "Arapiraca", "Palmeira dos Índios"],
  AP: ["Macapá", "Santana", "Laranjal do Jari"],
  AM: ["Manaus", "Parintins", "Itacoatiara", "Manacapuru"],
  BA: ["Salvador", "Feira de Santana", "Vitória da Conquista", "Camaçari", "Juazeiro", "Ilhéus", "Lauro de Freitas"],
  CE: ["Fortaleza", "Caucaia", "Juazeiro do Norte", "Maracanaú", "Sobral", "Crato"],
  DF: ["Brasília", "Taguatinga", "Ceilândia", "Samambaia", "Planaltina"],
  ES: ["Vitória", "Vila Velha", "Serra", "Cariacica", "Cachoeiro de Itapemirim"],
  GO: ["Goiânia", "Aparecida de Goiânia", "Anápolis", "Rio Verde", "Luziânia"],
  MA: ["São Luís", "Imperatriz", "São José de Ribamar", "Timon", "Caxias"],
  MT: ["Cuiabá", "Várzea Grande", "Rondonópolis", "Sinop", "Tangará da Serra"],
  MS: ["Campo Grande", "Dourados", "Três Lagoas", "Corumbá", "Grande Dourados"],
  MG: ["Belo Horizonte", "Uberlândia", "Contagem", "Juiz de Fora", "Betim", "Montes Claros", "Ribeirão das Neves", "Uberaba", "Governador Valadares", "Ipatinga"],
  PA: ["Belém", "Ananindeua", "Santarém", "Marabá", "Castanhal"],
  PB: ["João Pessoa", "Campina Grande", "Santa Rita", "Patos", "Bayeux"],
  PR: ["Curitiba", "Londrina", "Maringá", "Ponta Grossa", "Cascavel", "São José dos Pinhais", "Foz do Iguaçu"],
  PE: ["Recife", "Caruaru", "Olinda", "Petrolina", "Paulista", "Jaboatão dos Guararapes"],
  PI: ["Teresina", "Imperatriz do Piauí", "Parnaíba", "Picos", "Floriano"],
  RJ: ["Rio de Janeiro", "São Gonçalo", "Duque de Caxias", "Nova Iguaçu", "Niterói", "Belford Roxo", "Campos dos Goytacazes", "Petrópolis"],
  RN: ["Natal", "Mossoró", "Parnamirim", "São Gonçalo do Amarante", "Macaíba"],
  RS: ["Porto Alegre", "Caxias do Sul", "Pelotas", "Canoas", "Santa Maria", "Gravataí", "Viamão", "Novo Hamburgo"],
  RO: ["Porto Velho", "Ji-Paraná", "Ariquemes", "Vilhena", "Cacoal"],
  RR: ["Boa Vista", "Rorainópolis", "Caracaraí"],
  SC: ["Florianópolis", "Joinville", "Blumenau", "São José", "Chapecó", "Itajaí", "Criciúma", "Jaraguá do Sul"],
  SP: ["São Paulo", "Guarulhos", "Campinas", "São Bernardo do Campo", "Santo André", "Osasco", "Ribeirão Preto", "Sorocaba", "Santos", "Mauá", "São José dos Campos", "Mogi das Cruzes", "Diadema", "Jundiaí", "Piracicaba", "Bauru", "Franca", "São Vicente", "Carapicuíba"],
  SE: ["Aracaju", "Nossa Senhora do Socorro", "Lagarto", "Itabaiana", "São Cristóvão"],
  TO: ["Palmas", "Araguaína", "Gurupi", "Porto Nacional", "Paraíso do Tocantins"],
};

function populateStateSelect(selectEl) {
  Object.entries(BR_STATES)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([uf, name]) => {
      const opt = document.createElement("option");
      opt.value = uf;
      opt.textContent = name;
      selectEl.appendChild(opt);
    });
}

function populateCitySelect(citySelect, uf) {
  citySelect.innerHTML = '<option value="">Todas as cidades</option>';
  if (!uf || !BR_CITIES[uf]) return;
  BR_CITIES[uf].slice().sort((a, b) => a.localeCompare(b)).forEach((city) => {
    const opt = document.createElement("option");
    opt.value = city;
    opt.textContent = city;
    citySelect.appendChild(opt);
  });
}

async function resolveUserLocation(btn) {
  if (cachedUserLocation) return cachedUserLocation;
  const label = btn && btn.querySelector(".btn-label");
  const setLabel = (text) => {
    if (label) label.textContent = text;
    else if (btn) btn.textContent = text;
  };
  setLabel("Buscando...");
  const loc = await getUserLocation();
  setLabel("Minha localização");
  if (loc) {
    cachedUserLocation = loc;
    btn && btn.classList.add("active");
  }
  return loc;
}

// ── Filtros da seção Ranking ────────────────────────────────────────────────
const rankingFilterState = document.getElementById("ranking-filter-state");
const rankingFilterCity = document.getElementById("ranking-filter-city");
const rankingUseLocationBtn = document.getElementById("ranking-use-location-btn");
let rankingUseGps = false;
let rankingPriceSort = "";

if (rankingFilterState) {
  populateStateSelect(rankingFilterState);
  rankingFilterState.addEventListener("change", () => {
    populateCitySelect(rankingFilterCity, rankingFilterState.value);
    rankingUseGps = false;
    rankingUseLocationBtn && rankingUseLocationBtn.classList.remove("active");
    loadRanking();
  });
}
if (rankingFilterCity) {
  rankingFilterCity.addEventListener("change", () => loadRanking());
}
if (rankingUseLocationBtn) {
  rankingUseLocationBtn.addEventListener("click", async () => {
    rankingUseGps = true;
    rankingFilterState && (rankingFilterState.value = "");
    rankingFilterCity && (rankingFilterCity.innerHTML = '<option value="">Todas as cidades</option>');
    await resolveUserLocation(rankingUseLocationBtn);
    loadRanking();
  });
}
document.querySelectorAll("#ranking-filter-bar .price-sort-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const sort = btn.dataset.sort;
    if (rankingPriceSort === sort) {
      rankingPriceSort = "";
      btn.classList.remove("active");
    } else {
      rankingPriceSort = sort;
      document.querySelectorAll("#ranking-filter-bar .price-sort-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    }
    loadRanking();
  });
});

// ── Filtros da seção Pedidos (prestar serviço) ──────────────────────────────
const requestsFilterState = document.getElementById("requests-filter-state");
const requestsFilterCity = document.getElementById("requests-filter-city");
const requestsUseLocationBtn = document.getElementById("requests-use-location-btn");
let requestsUseGps = false;
let requestsPriceSort = "";

if (requestsFilterState) {
  populateStateSelect(requestsFilterState);
  requestsFilterState.addEventListener("change", () => {
    populateCitySelect(requestsFilterCity, requestsFilterState.value);
    requestsUseGps = false;
    requestsUseLocationBtn && requestsUseLocationBtn.classList.remove("active");
    loadRequests();
  });
}
if (requestsFilterCity) {
  requestsFilterCity.addEventListener("change", () => loadRequests());
}
if (requestsUseLocationBtn) {
  requestsUseLocationBtn.addEventListener("click", async () => {
    requestsUseGps = true;
    requestsFilterState && (requestsFilterState.value = "");
    requestsFilterCity && (requestsFilterCity.innerHTML = '<option value="">Todas as cidades</option>');
    await resolveUserLocation(requestsUseLocationBtn);
    loadRequests();
  });
}
document.querySelectorAll("#requests-filter-bar .price-sort-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const sort = btn.dataset.sort;
    if (requestsPriceSort === sort) {
      requestsPriceSort = "";
      btn.classList.remove("active");
    } else {
      requestsPriceSort = sort;
      document.querySelectorAll("#requests-filter-bar .price-sort-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    }
    loadRequests();
  });
});

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
    if (rankingFilterState && rankingFilterState.value) {
      url += `&state=${encodeURIComponent(BR_STATES[rankingFilterState.value] || rankingFilterState.value)}`;
    }
    if (rankingFilterCity && rankingFilterCity.value) {
      url += `&city=${encodeURIComponent(rankingFilterCity.value)}`;
    }
    if (rankingPriceSort) {
      url += `&sortPrice=${encodeURIComponent(rankingPriceSort)}`;
    }

    locationHint.hidden = true;
    if (effectiveSortBy === "distance" || rankingUseGps) {
      const loc = rankingUseGps ? (cachedUserLocation || await getUserLocation()) : await getUserLocation();
      if (callId !== loadRankingCallId) return;
      if (loc) {
        cachedUserLocation = loc;
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
      const reviewsText = typeof p.reviewCount === "number"
        ? ` <span class="rank-review-count">• ${p.reviewCount} avaliações</span>` : "";
      const ratingHtml =
        typeof p.rating === "number"
          ? `${starRow(p.rating)}<span class="rank-rating-num">${p.rating.toFixed(1).replace(".", ",")}</span>${reviewsText}`
          : '<span class="chip chip--new">novo</span>';
      const distanceText = typeof p.distanceKm === "number" ? `<span class="rank-meta-item"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg> ${p.distanceKm.toFixed(1)} km</span>` : "";
      const priceText = typeof p.price === "number" ? `<span class="rank-meta-item rank-meta-price">A partir de R$ ${p.price}</span>` : "";
      const availBadge = p.isAvailable
        ? `<span class="avail-badge avail-badge--on">● Disponível</span>`
        : `<span class="avail-badge avail-badge--off">Sem horário</span>`;
      const nextSlotLine = p.nextSlot && p.isAvailable
        ? `<p class="rank-next-slot">${escapeHtml(p.nextSlot)}</p>` : "";
      const ctaProfile = p.slug
        ? `<a href="/prestador/${encodeURIComponent(p.slug)}" class="rank-view-profile" target="_blank" rel="noopener">Ver perfil</a>`
        : `<button type="button" class="rank-view-profile" disabled>Ver perfil</button>`;
      const ctaContact = p.slug
        ? `<a href="/prestador/${encodeURIComponent(p.slug)}" class="rank-cta" target="_blank" rel="noopener">Chamar / Agendar</a>`
        : `<button type="button" class="rank-cta" data-name="${escapeHtml(p.name)}">Chamar / Agendar</button>`;
      const avatarInner = p.photoUrl
        ? `<div class="rank-avatar rank-avatar--photo"><img src="${escapeHtml(p.photoUrl)}" alt="Foto de ${escapeHtml(p.name)}" loading="lazy"></div>`
        : `<div class="rank-avatar">${escapeHtml(initials(p.name))}</div>`;
      item.innerHTML = `
        <div class="rank-card-header">
          ${avatarInner}
          <div class="rank-header-info">
            <div class="rank-header-row">
              <h3 class="rank-name">${escapeHtml(p.name)}</h3>
              <span class="rank-pos">#${index + 1}</span>
            </div>
            <p class="rank-service">${escapeHtml(p.service)}</p>
            <p class="rank-city">${escapeHtml(p.city)}</p>
          </div>
        </div>
        <div class="rank-stars">${ratingHtml}</div>
        <div class="rank-meta">
          ${distanceText}
          ${priceText}
        </div>
        <div class="rank-avail-row">
          ${availBadge}
          ${nextSlotLine}
        </div>
        <div class="rank-cta-row">
          ${ctaProfile}
          ${ctaContact}
        </div>
      `;
      // Fallback para iniciais se a imagem falhar ao carregar — sem inline JS.
      if (p.photoUrl) {
        const img = item.querySelector(".rank-avatar--photo img");
        if (img) {
          img.addEventListener("error", () => {
            const avatar = item.querySelector(".rank-avatar--photo");
            if (avatar) {
              avatar.className = "rank-avatar";
              avatar.textContent = initials(p.name);
            }
          });
        }
      }
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
// Busca, chips e painel de categoria ficam fora do #requester-view (senão
// sumiriam junto com ele no modo "presto serviço", levando as abas junto e
// deixando a pessoa sem como voltar). Escondidos à parte aqui.
const heroRequesterTools = document.getElementById("hero-requester-tools");
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
  if (heroRequesterTools) heroRequesterTools.hidden = isProvider;
  modeButtons.forEach((btn) => {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  if (heroSearchInput) heroSearchInput.placeholder = SEARCH_PLACEHOLDER_BY_MODE[mode] || SEARCH_PLACEHOLDER_BY_MODE.requester;
  if (isProvider && !requestsLoaded) {
    requestsLoaded = true;
    loadRequests();
    loadDemandSignals();
  }
}

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setMode(btn.dataset.mode);
  });
});

// Filtro de tipo + palavra-chave (task-009, item 5) — "produto" não tem
// subcategoria rígida (TV, carro, o que for caem todos aí), então o jeito
// de achar algo específico dentro dele é buscar por palavra no título do
// pedido, igual o resto do site já faz em vários lugares (ride-form, por
// exemplo) em vez de inventar uma subcategoria nova pra cada tipo de coisa.
let allRequests = [];
const requestsFilterType = document.getElementById("requests-filter-type");
const requestsFilterKeyword = document.getElementById("requests-filter-keyword");

function applyRequestsFilter() {
  const type = requestsFilterType.value;
  const keyword = requestsFilterKeyword.value.trim().toLowerCase();
  const filtered = allRequests.filter((r) => {
    if (type && r.type !== type) return false;
    if (keyword && !r.title.toLowerCase().includes(keyword)) return false;
    return true;
  });
  renderRequests(filtered);
}

requestsFilterType.addEventListener("change", applyRequestsFilter);
requestsFilterKeyword.addEventListener("input", applyRequestsFilter);

async function loadRequests() {
  try {
    let url = "/api/requests";
    const params = new URLSearchParams();
    if (requestsFilterState && requestsFilterState.value) {
      params.set("state", BR_STATES[requestsFilterState.value] || requestsFilterState.value);
    }
    if (requestsFilterCity && requestsFilterCity.value) {
      params.set("city", requestsFilterCity.value);
    }
    if (requestsPriceSort) {
      params.set("sortPrice", requestsPriceSort);
    }
    if (requestsUseGps && cachedUserLocation) {
      params.set("lat", cachedUserLocation.lat);
      params.set("lng", cachedUserLocation.lng);
    }
    const qs = params.toString();
    if (qs) url += "?" + qs;
    const res = await fetch(url);
    if (!res.ok) return;
    const { requests } = await res.json();
    allRequests = requests;
    applyRequestsFilter();
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

const REQUEST_LABELS = { corrida: "corrida", entrega: "entrega", profissional: "profissional", imovel: "imóvel", produto: "produto" };

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
  if (requests.length === 0) {
    requestsList.innerHTML = '<li class="requests-empty">Nenhum pedido encontrado.</li>';
    return;
  }
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
        <span class="request-meta">${escapeHtml(r.requester)} · ${escapeHtml(r.location || "local não informado")} · ${escapeHtml(r.when || "a combinar")} · ${distanceChip}R$ ${r.price}</span>
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

// O servidor já filtra URL com esquema perigoso (server.js: isSafeHttpUrl),
// mas o front-end confere de novo antes de usar como href — não confia em
// dado vindo de busca externa (SearXNG/Brave) sem checar duas vezes.
function safeHref(url) {
  try {
    const protocol = new URL(url, window.location.href).protocol;
    return protocol === "http:" || protocol === "https:" ? url : null;
  } catch (err) {
    return null;
  }
}

// Sem a Claude escrevendo a resposta (decisão da Jéssica, 2026-09-14), o
// texto que chega aqui agora é a lista de resultados de busca crua (título +
// URL + trecho) — precisa virar link clicável de verdade, senão a pessoa não
// consegue visitar o site sem copiar e colar a URL na mão. O regex só casa
// string que já começa literalmente com "http://"/"https://", então nunca
// linkifica um esquema perigoso tipo "javascript:" sozinho — safeHref (ver
// price-reference) ainda confere de novo antes de virar href, por segurança.
function formatMessage(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // "url" aqui já veio de escapeHtml(text) acima — está pronto pra ir
    // direto num atributo HTML, não escapar de novo (senão vira "&amp;amp;"
    // em qualquer URL com "&" de verdade, ex: query string de busca).
    // Pontuação de fim de frase colada na URL (ex: "...achados em
    // https://exemplo.com.") não faz parte do link — sem separar isso, ela
    // vira parte do href de verdade (achado na revisão do CodeRabbit, PR #69).
    .replace(/(https?:\/\/[^\s<]+)/g, (url) => {
      const trailingMatch = url.match(/[.,;:!?)]+$/);
      const trailing = trailingMatch ? trailingMatch[0] : "";
      const cleanUrl = trailing ? url.slice(0, -trailing.length) : url;
      const href = safeHref(cleanUrl);
      return href
        ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${trailing}`
        : url;
    })
    .replace(/\n/g, "<br>");
}

function renderResult(query, state, text) {
  chatSection.hidden = false;
  const actionButton =
    state === "ok"
      ? '<button type="button" class="result-action-btn" id="result-solicitar-btn">Ir para o formulário de pedido</button>'
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
    autoFillLocationFromTitle();
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

const RIDE_TRACK_ICON_PIN = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
const RIDE_TRACK_ICON_STOP = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>';

function renderRideResults(matches) {
  const matchesHtml = matches.length
    ? `<ul class="ride-matches">${matches
        .map(
          (r) => `
        <li class="ride-match" data-owner-id="${escapeHtml(r.ownerUserId || "")}">
          <strong>${escapeHtml(r.title)}</strong>
          <span class="ride-match-meta">${escapeHtml(r.requester)} · ${escapeHtml(r.when || "a combinar")} · R$ ${r.price}</span>
          ${r.ownerUserId ? `<button type="button" class="ride-track-btn cta-secondary" data-user-id="${escapeHtml(r.ownerUserId)}">${RIDE_TRACK_ICON_PIN} <span class="btn-label">Ver ao vivo</span></button><span class="ride-live-pos" hidden></span>` : ""}
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

rideResults.addEventListener("click", async (event) => {
  const trackBtn = event.target.closest(".ride-track-btn");
  if (trackBtn) {
    const userId = trackBtn.dataset.userId;
    const posEl = trackBtn.closest(".ride-match").querySelector(".ride-live-pos");
    if (!posEl) return;
    if (!posEl.hidden) { posEl.hidden = true; trackBtn.innerHTML = `${RIDE_TRACK_ICON_PIN} <span class="btn-label">Ver ao vivo</span>`; return; }
    posEl.hidden = false;
    trackBtn.innerHTML = `${RIDE_TRACK_ICON_STOP} <span class="btn-label">Fechar</span>`;
    posEl.textContent = "buscando posição…";
    const poll = async () => {
      try {
        const r = await fetch(`/api/location/${encodeURIComponent(userId)}`);
        const d = await r.json();
        if (!d.online) { posEl.textContent = "Motorista não está compartilhando posição no momento."; return; }
        const mapsLink = `https://www.google.com/maps?q=${d.lat},${d.lng}`;
        posEl.innerHTML = `<a href="${mapsLink}" target="_blank" rel="noopener noreferrer">Ver no mapa ↗</a> · atualizado ${new Date(d.updatedAt).toLocaleTimeString("pt-BR")}`;
        if (!posEl.hidden) setTimeout(poll, 6000);
      } catch (_) { posEl.textContent = "Falha ao obter posição."; }
    };
    poll();
    return;
  }

  const btn = event.target.closest("#ride-publish-btn");
  if (!btn) return;
  const from = rideFrom.value.trim();
  const to = rideTo.value.trim();
  document.getElementById("post-type").value = rideType;
  document.getElementById("post-title").value = `${from} → ${to}`;
  // Título setado por script não dispara 'input' sozinho (task-009 item 1)
  // — chama direto pra "Onde" já vir preenchido com a mesma rota, sem
  // pedir pra digitar de novo o que já foi buscado acima.
  autoFillLocationFromTitle();
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
  compra: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  frete: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.89 1.45l8 4A2 2 0 0 1 22 7.24v9.53a2 2 0 0 1-1.11 1.79l-8 4a2 2 0 0 1-1.78 0l-8-4a2 2 0 0 1-1.11-1.79V7.24a2 2 0 0 1 1.11-1.79l8-4a2 2 0 0 1 1.78 0Z"/><path d="M2.32 6.16 12 11l9.68-4.84"/><line x1="12" y1="22.76" x2="12" y2="11"/></svg>',
  viagem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  servico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94Z"/></svg>',
  curso: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/></svg>',
  assinatura: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>',
  carona: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 11 6.5 6.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11"/><rect x="3" y="11" width="18" height="6" rx="2"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/></svg>',
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
const groupPriceReferenceBtn = document.getElementById("group-price-reference-btn");
const groupPriceReferencePanel = document.getElementById("group-price-reference-panel");
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
      <span class="request-icon">${GROUP_CATEGORY_ICONS[g.category] || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'}</span>
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
  // Estimativa por Haversine + multiplicador (task-008), não é rota exata —
  // "aproximada" sempre no texto pra não passar a impressão de km medido.
  const distanciaText = typeof c.distanciaAproximadaKm === "number" ? ` · ~${c.distanciaAproximadaKm.toFixed(0)} km (aproximado)` : "";
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
        <span class="request-meta">${routeText}${distanciaText} · ${whenText}</span>
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

// Referência de preço externa (task-007), sem IA — busca crua na web
// (mesma fonte de sempre: SearXNG grátis, Brave como fallback) só pra
// mostrar preços reais de referência antes de publicar. Nunca resume nem
// interpreta os resultados — a pessoa lê e decide sozinha.
groupPriceReferenceBtn.addEventListener("click", async () => {
  const description = document.getElementById("group-title").value.trim();
  const local = document.getElementById("group-city").value.trim();
  if (!description) {
    document.getElementById("group-title").focus();
    return;
  }
  groupPriceReferenceBtn.disabled = true;
  groupPriceReferencePanel.hidden = false;
  groupPriceReferencePanel.innerHTML = "buscando preços de referência…";

  try {
    const res = await fetch(`/api/price-reference?description=${encodeURIComponent(description)}&local=${encodeURIComponent(local)}`);
    const data = await res.json();
    if (!res.ok || !data.available || data.results.length === 0) {
      groupPriceReferencePanel.innerHTML = '<p class="user-panel-empty">Referência de preço não disponível no momento.</p>';
      return;
    }
    groupPriceReferencePanel.innerHTML = `
      <ul class="user-panel-list">
        ${data.results
          .map((r) => {
            const href = safeHref(r.url);
            const titleHtml = `<strong>${escapeHtml(r.title)}</strong>`;
            return `
          <li class="user-panel-item">
            <span>
              ${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${titleHtml}</a>` : titleHtml}
              <br />
              <span class="user-panel-empty">${escapeHtml(r.snippet)}</span>
            </span>
          </li>`;
          })
          .join("")}
      </ul>
    `;
  } catch (err) {
    groupPriceReferencePanel.innerHTML = '<p class="user-panel-empty">Referência de preço não disponível no momento.</p>';
  } finally {
    groupPriceReferenceBtn.disabled = false;
  }
});

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
      resetAltchaWidget("group-altcha-slot");
      return;
    }
    groupStatus.textContent = "Grupo criado!";
    groupStatus.className = "post-status post-status--ok";
    renderGroupSuggestions(result.suggestions);
    groupForm.reset();
    updateGroupFormFieldsForCategory();
    delete caronaHorarioInput.dataset.touched;
    caronaLocationStatus.textContent = "";
    groupPriceReferencePanel.hidden = true;
    groupPriceReferencePanel.innerHTML = "";
    groupForm.hidden = true;
    // A solução do desafio já foi consumida nesta criação — o formulário
    // pode ser reaberto pra criar outro grupo depois, então precisa de um
    // desafio novo já pronto pra essa próxima vez.
    resetAltchaWidget("group-altcha-slot");
    await loadGroups();
  } catch (err) {
    groupStatus.textContent = "Falha de conexão. Tente de novo.";
    groupStatus.className = "post-status post-status--error";
    resetAltchaWidget("group-altcha-slot");
  } finally {
    submitBtn.disabled = false;
  }
});

loadGroups();

const postForm = document.getElementById("post-form");
const postStatus = document.getElementById("post-status");
const publishInterestLink = document.getElementById("publish-interest-link");
const postTitleInput = document.getElementById("post-title");
const postLocationInput = document.getElementById("post-location");
const postDateInput = document.getElementById("post-date");
const postTimeInput = document.getElementById("post-time");
const postWhatsappInput = document.getElementById("post-whatsapp");
const postRequesterInput = document.getElementById("post-requester");
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

// task-009 item 2: "Quando" vem com hoje já selecionado (a pessoa só troca
// se quiser outro dia), nunca em branco — postForm.reset() volta um
// <input type="date"> pro vazio, por isso reaplicado de novo depois de
// cada publicação bem-sucedida, não só na carga inicial da página.
function setPostDateToToday() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  postDateInput.value = `${yyyy}-${mm}-${dd}`;
}
setPostDateToToday();

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - today) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "hoje";
  if (diffDays === 1) return "amanhã";
  // Ano só entra quando é diferente do atual (CodeRabbit, PR #75) — sem
  // isso, "15/09" escolhido pra 2027 ficaria indistinguível de 15/09 deste
  // ano pra quem vê o pedido. Dentro do mesmo ano, mantém curto.
  const dateLabel = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
  return y === today.getFullYear() ? dateLabel : `${dateLabel}/${y}`;
}

// Backend continua guardando "quando" como texto livre (request.when) —
// combina data+horário num texto legível aqui, sem precisar mudar o
// formato guardado no servidor nem o resto do site que já lê esse campo.
function buildWhenFromForm() {
  const parts = [];
  if (postDateInput.value) parts.push(formatDateLabel(postDateInput.value));
  if (postTimeInput.value) parts.push(`às ${postTimeInput.value}`);
  return parts.length ? parts.join(" ") : "a combinar";
}

// task-009 item 1: se "O que você precisa" já tem um padrão de rota
// reconhecível, extrai origem/destino dali em vez de pedir pra pessoa
// digitar a mesma informação duas vezes em "Onde". Ordem importa: seta
// (menos ambíguo) antes de "de X para/pra Y" antes de hífen (mais ambíguo,
// qualquer "a - b" no meio de uma frase bateria).
function extractRouteFromText(text) {
  const arrowMatch = text.match(/^(.+?)\s*(?:→|->)\s*(.+)$/);
  if (arrowMatch) return { origem: arrowMatch[1].trim(), destino: arrowMatch[2].trim() };
  const paraMatch = text.match(/^de\s+(.+?)\s+(?:para|pra)\s+(.+)$/i);
  if (paraMatch) return { origem: paraMatch[1].trim(), destino: paraMatch[2].trim() };
  const dashMatch = text.match(/^(.+?)\s+-\s+(.+)$/);
  if (dashMatch) return { origem: dashMatch[1].trim(), destino: dashMatch[2].trim() };
  return null;
}

// "Onde" só é obrigatório enquanto a pessoa não editou com a própria mão —
// uma vez editado manualmente, o vínculo automático com o título para (pra
// não sobrescrever o que ela acabou de digitar a cada tecla no título).
let postLocationAutoFilled = true;
postLocationInput.addEventListener("input", () => {
  postLocationAutoFilled = false;
});

function autoFillLocationFromTitle() {
  if (!postLocationAutoFilled) return;
  const route = extractRouteFromText(postTitleInput.value.trim());
  postLocationInput.value = route ? `${route.origem} → ${route.destino}` : "";
}
postTitleInput.addEventListener("input", autoFillLocationFromTitle);

// task-009 item 1: pra categoria "corrida" especificamente, um botão
// "Usar minha localização" ao lado de "Onde" — mesmo padrão já usado em
// Carona (task-002): pede permissão do navegador uma única vez por
// clique (não é rastreamento contínuo), guarda lat/lng em campos ocultos
// e preenche "Onde" com um rótulo amigável (sem tentar reverse geocoding
// via Nominatim pra isso — "guardando lat/lng direto" já é a alternativa
// mais simples que o próprio arquivo da task permite). Se a permissão for
// negada, o campo continua editável na mão, nada trava.
const postTypeSelect = document.getElementById("post-type");
const postLocationGeoField = document.getElementById("post-location-geo");
const postUseLocationBtn = document.getElementById("post-use-location");
const postLocationStatus = document.getElementById("post-location-status");
const postLatInput = document.getElementById("post-lat");
const postLngInput = document.getElementById("post-lng");

// getCurrentPosition é assíncrono e pode demorar — sem essa "geração", um
// pedido antigo que só resolve depois (ex: a pessoa clicou duas vezes, ou
// trocou o Tipo enquanto esperava) podia sobrescrever lat/lng com um
// resultado desatualizado (achado do CodeRabbit, PR #76). Cada clique novo
// invalida qualquer callback pendente de antes.
let postLocationRequestGeneration = 0;

function clearPostLocationCoordinates() {
  postLatInput.value = "";
  postLngInput.value = "";
}

function updatePostLocationGeoVisibility() {
  postLocationGeoField.hidden = postTypeSelect.value !== "corrida";
}
postTypeSelect.addEventListener("change", () => {
  postLocationRequestGeneration += 1;
  clearPostLocationCoordinates();
  updatePostLocationGeoVisibility();
});
updatePostLocationGeoVisibility();

postUseLocationBtn.addEventListener("click", () => {
  const requestGeneration = ++postLocationRequestGeneration;
  clearPostLocationCoordinates();
  if (!navigator.geolocation) {
    postLocationStatus.textContent = "seu navegador não suporta localização";
    return;
  }
  postLocationStatus.textContent = "obtendo localização…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (requestGeneration !== postLocationRequestGeneration) return;
      postLatInput.value = pos.coords.latitude;
      postLngInput.value = pos.coords.longitude;
      postLocationInput.value = "📍 Localização atual";
      postLocationAutoFilled = false;
      postLocationStatus.textContent = "localização atual usada ✓";
    },
    () => {
      if (requestGeneration !== postLocationRequestGeneration) return;
      postLocationStatus.textContent = "não consegui obter sua localização — preencha \"Onde\" manualmente";
    }
  );
});

// task-009 item 3: WhatsApp e nome pré-preenchidos a partir do perfil de
// quem está logada (task-003) — continuam editáveis (publicar em nome de
// outra pessoa, outro número só pra esse post). Sem conta, ficam em branco
// como sempre. Chamada de dentro de renderLoggedInUser() (mais abaixo no
// arquivo) — as três formas de entrar logada (sessão restaurada, login por
// e-mail/senha, Google) passam todas por ali.
function prefillPostFormFromProfile() {
  if (!currentUserProfile) return;
  if (!postWhatsappInput.value && currentUserProfile.whatsapp) postWhatsappInput.value = currentUserProfile.whatsapp;
  if (!postRequesterInput.value && currentUserProfile.name) postRequesterInput.value = currentUserProfile.name;
}

postForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(postForm);
  // "Onde" pode ter ficado vazio de propósito (task-009 item 1: sem padrão
  // de rota detectável no título, e a pessoa não preencheu na mão) — última
  // tentativa de extrair da mesma forma que o auto-preenchimento ao vivo,
  // pro caso de algum caminho ter passado por cima do valor do campo sem
  // disparar o listener de 'input' (ex: preenchido por script).
  let location = data.get("location").trim();
  if (!location) {
    const route = extractRouteFromText(data.get("title").trim());
    if (route) location = `${route.origem} → ${route.destino}`;
  }
  const payload = {
    type: data.get("type"),
    title: data.get("title"),
    when: buildWhenFromForm(),
    price: data.get("price"),
    requester: data.get("requester"),
    whatsapp: data.get("whatsapp"),
    location,
    lat: data.get("lat") || null,
    lng: data.get("lng") || null,
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
    postLocationRequestGeneration += 1; // invalida qualquer geolocalização ainda pendente antes do reset
    postForm.reset();
    setPostDateToToday();
    postLocationAutoFilled = true;
    postLocationStatus.textContent = "";
    updatePostLocationGeoVisibility();
    prefillPostFormFromProfile();
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
    const avail = Array.isArray(provider.availability) ? provider.availability : [];
    providerAvailRows.forEach((row) => {
      const slot = avail.find((s) => s.dia === row.dataset.day);
      row.querySelector(".provider-avail-inicio").value = slot ? slot.inicio : "";
      row.querySelector(".provider-avail-fim").value = slot ? slot.fim : "";
    });
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

const providerAvailRows = document.querySelectorAll("#provider-availability-list .provider-avail-row");

function collectProviderAvailability() {
  const slots = [];
  providerAvailRows.forEach((row) => {
    const inicio = row.querySelector(".provider-avail-inicio").value;
    const fim = row.querySelector(".provider-avail-fim").value;
    if (inicio && fim) slots.push({ dia: row.dataset.day, inicio, fim });
  });
  return slots;
}

providerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(providerForm);
  data.set("availability", JSON.stringify(collectProviderAvailability()));
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

// Busca única, sempre pela barra central do hero — o resto da página fica
// só pra mostrar rankings, corridas e outros resultados.
let searchInFlight = false;

async function runSearch(message) {
  // Guarda contra buscas simultâneas: a busca pode ser disparada por mais
  // de um caminho (barra do hero, "Chamar agora" no ranking) — sem essa
  // guarda, uma busca mais antiga em voo poderia terminar depois e
  // sobrescrever o resultado de uma busca mais nova.
  if (searchInFlight) return;
  searchInFlight = true;
  lastSearchQuery = message;
  if (heroSearchInput) heroSearchInput.disabled = true;
  const heroSearchSubmitEl = heroSearchForm?.querySelector('button[type="submit"]');
  if (heroSearchSubmitEl) heroSearchSubmitEl.disabled = true;
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
    if (heroSearchInput) heroSearchInput.disabled = false;
    if (heroSearchSubmitEl) heroSearchSubmitEl.disabled = false;
    searchInFlight = false;
  }
}

// task-012: a busca central do hero e a barra flutuante de baixo agora são
// DOIS formulários (ids diferentes) chamando a MESMA lógica — extraída
// aqui pra função só, em vez de duplicar o roteamento por intenção nos
// dois handlers de submit.
async function performSearch(message) {
  if (!message) return;
  // A busca só é visível no modo "solicitar" — troca de volta se a pessoa
  // buscar estando no modo "presto um serviço".
  if (providerView.hidden === false) setMode("requester");

  // Contagem real de "buscas realizadas" (task-012, Números que conectam)
  // — fire-and-forget, uma busca não deve esperar nem falhar por causa
  // disso. Precisa ser aqui (não só em /api/chat) porque boa parte da
  // busca resolve inteira no classifyIntent() abaixo, sem nunca chegar no
  // servidor.
  fetch("/api/search-events", { method: "POST" }).catch(() => {});

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
}

// Barra de busca central do hero (task-012) — mesmo motor de busca de
// sempre (task-005).
const heroSearchForm = document.getElementById("hero-search-form");
const heroSearchInput = document.getElementById("hero-search-input");
heroSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = heroSearchInput.value.trim();
  heroSearchInput.value = "";
  performSearch(message);
});

// Chips de categoria do hero — cada chip abre uma experiência inline logo
// abaixo dos chips, sem rolar a página.
//
// Seções que já existem na página (ranking, corridas, grupos) são MOVIDAS
// pro painel em vez de reimplementadas: o DOM move preserva os listeners, e
// como a delegação de clique dessas seções mora nos próprios elementos que
// se movem (#ranking-list, #ride-results, #groups-list), todos os botões
// continuam funcionando dentro do painel. Reimplementar os cards num
// container novo mataria essa delegação e deixaria botão morto na tela.
const categoryPanel = document.getElementById("category-quick-panel");
const categoryPanelTitle = document.getElementById("category-panel-title");
const categoryPanelHead = document.getElementById("category-panel-head");
const categoryPanelBody = document.getElementById("category-panel-body");
const gruposSection = document.getElementById("grupos");

// Guarda a posição exata de origem (parent + irmão seguinte) pra devolver a
// seção no lugar certo — appendChild sozinho jogaria ela pro fim do parent.
const panelMovedSections = [];

function restorePanelSections() {
  // O seletor de serviço é injetado na barra do #top3, que é emprestada; sem
  // remover aqui, ele voltaria grudado na seção ao fechar o painel.
  document.getElementById("panel-servico-field")?.remove();
  while (panelMovedSections.length) {
    const { el, parent, nextSibling } = panelMovedSections.pop();
    parent.insertBefore(el, nextSibling);
  }
}

function movePanelSection(el) {
  if (!el) return;
  panelMovedSections.push({ el, parent: el.parentElement, nextSibling: el.nextSibling });
  categoryPanelBody.appendChild(el);
}

function openServicosPanel() {
  movePanelSection(rankingSection);

  // O seletor de categoria entra DENTRO da barra de filtros do ranking, junto
  // de localização, estado, cidade, "ordenar por" e preço — filtro espalhado
  // em três cantos da tela não ajuda ninguém a filtrar.
  const barra = document.getElementById("ranking-filter-bar");
  const campo = document.createElement("label");
  campo.className = "ranking-sort-label";
  campo.id = "panel-servico-field";
  campo.innerHTML = `
    serviço
    <select id="panel-servico-select" class="filter-select">
      <option value="">Todos os serviços</option>
    </select>
  `;
  barra.insertBefore(campo, barra.firstChild);

  const select = document.getElementById("panel-servico-select");
  select.addEventListener("change", () => loadRanking(undefined, select.value));
  fetch("/api/services")
    .then((res) => (res.ok ? res.json() : { services: [] }))
    .then(({ services }) => {
      (services || []).forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      });
      if (currentRankingService) select.value = currentRankingService;
    })
    .catch(() => {});
}

function openViagemPanel() {
  categoryPanelHead.innerHTML = `
    <form id="panel-viagem-form" class="panel-search-form" autocomplete="off">
      <label class="panel-field">
        <span class="panel-field-label">De onde</span>
        <input id="panel-viagem-de" class="panel-input" type="text" placeholder="ex: Centro" />
      </label>
      <label class="panel-field">
        <span class="panel-field-label">Pra onde</span>
        <input id="panel-viagem-para" class="panel-input" type="text" placeholder="ex: Aeroporto" />
      </label>
      <label class="panel-field">
        <span class="panel-field-label">Data</span>
        <input id="panel-viagem-data" class="panel-input" type="date" />
      </label>
      <button type="submit" class="panel-submit">Buscar viagens</button>
    </form>
  `;
  // Corridas/entregas e caronas são dois mecanismos diferentes (pedidos vs
  // grupos) — a busca de cima alimenta os dois de uma vez só, em vez de
  // obrigar a pessoa a preencher dois formulários pra mesma viagem.
  movePanelSection(ridesSection);
  movePanelSection(gruposSection);

  document.getElementById("panel-viagem-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const de = document.getElementById("panel-viagem-de").value.trim();
    const para = document.getElementById("panel-viagem-para").value.trim();
    const data = document.getElementById("panel-viagem-data").value;

    if (rideFrom) rideFrom.value = de;
    if (rideTo) rideTo.value = para;
    rideForm?.requestSubmit();

    if (caronaSearchOrigem) caronaSearchOrigem.value = de;
    if (caronaSearchDestino) caronaSearchDestino.value = para;
    // Atribui mesmo quando vazio: /api/groups filtra data por igualdade, então
    // uma data que sobrou da busca anterior esconderia caronas válidas desta.
    if (caronaSearchData) {
      caronaSearchData.value = data;
      caronaSearchData.dataset.touched = "1";
    }
    document.querySelector('.group-category-btn[data-category="carona"]')?.click();
  });
}

function openGrupoPanel() {
  categoryPanelHead.innerHTML = "";
  movePanelSection(gruposSection);
}

// ── Painel de produtos e imóveis ────────────────────────────────────────────
// Diferente dos outros três: não existe seção equivalente na página pra
// mover, então os cards são renderizados aqui. A ação é um link direto de
// WhatsApp (dado que /api/requests já devolve), não um botão delegado —
// assim nenhum controle fica sem função de verdade.
const PANEL_PRODUTO_TYPES = [
  { type: "produto", label: "Produtos" },
  { type: "imovel", label: "Imóveis" },
];
let panelProdutoType = "produto";
let panelProdutoPriceSort = "";
let panelProdutoUseGps = false;

function panelProdutoQueryUrl() {
  const params = new URLSearchParams({ type: panelProdutoType });
  const state = document.getElementById("panel-produto-state");
  const city = document.getElementById("panel-produto-city");
  const min = document.getElementById("panel-produto-min");
  const max = document.getElementById("panel-produto-max");
  if (state && state.value) params.set("state", BR_STATES[state.value] || state.value);
  if (city && city.value) params.set("city", city.value);
  if (min && min.value) params.set("minPrice", min.value);
  if (max && max.value) params.set("maxPrice", max.value);
  if (panelProdutoPriceSort) params.set("sortPrice", panelProdutoPriceSort);
  if (panelProdutoUseGps && cachedUserLocation) {
    params.set("lat", cachedUserLocation.lat);
    params.set("lng", cachedUserLocation.lng);
  }
  return `/api/requests?${params.toString()}`;
}

function formatBRL(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR") : String(value);
}

function renderPanelProdutoCard(r) {
  const whatsapp = String(r.whatsapp || "").replace(/\D/g, "");
  const action = whatsapp
    ? `<a class="panel-produto-cta" href="https://wa.me/55${escapeHtml(whatsapp)}" target="_blank" rel="noopener noreferrer">Falar no WhatsApp</a>`
    : '<span class="request-provider">contato não informado</span>';
  const distancia = typeof r.distanceKm === "number" ? `${r.distanceKm.toFixed(1)} km · ` : "";
  return `
    <li class="panel-produto-card">
      <strong class="panel-produto-title">${escapeHtml(r.title)}</strong>
      <span class="panel-produto-price">R$ ${escapeHtml(formatBRL(r.price))}</span>
      <span class="panel-produto-meta">${distancia}${escapeHtml(r.location || "local não informado")} · ${escapeHtml(r.requester || "anunciante")}</span>
      ${action}
    </li>
  `;
}

// Mesma guarda de corrida que loadRanking() usa: trocar de filtro rápido
// dispara várias buscas, e sem isso a resposta lenta de um filtro abandonado
// chega depois e sobrescreve o resultado do filtro que está ativo agora.
let loadPanelProdutosCallId = 0;

async function loadPanelProdutos() {
  const callId = ++loadPanelProdutosCallId;
  const list = document.getElementById("panel-produto-list");
  if (!list) return;
  list.innerHTML = '<li class="panel-produto-empty">Carregando…</li>';
  try {
    const res = await fetch(panelProdutoQueryUrl());
    if (callId !== loadPanelProdutosCallId) return;
    if (!res.ok) throw new Error("falha");
    const { requests } = await res.json();
    if (callId !== loadPanelProdutosCallId) return;
    const abertos = (requests || []).filter((r) => r.status === "aberto");
    // Com localização ligada, ordena por perto — o servidor calcula distanceKm
    // mas só ordena por preço, então a ordenação por distância é feita aqui.
    if (panelProdutoUseGps) {
      abertos.sort((a, b) => {
        const da = typeof a.distanceKm === "number" ? a.distanceKm : Infinity;
        const db = typeof b.distanceKm === "number" ? b.distanceKm : Infinity;
        return da - db;
      });
    }
    list.innerHTML = abertos.length ? abertos.map(renderPanelProdutoCard).join("") : renderPanelProdutoVazio();
  } catch (err) {
    if (callId !== loadPanelProdutosCallId) return;
    list.innerHTML = '<li class="panel-produto-empty">Não consegui carregar os anúncios agora.</li>';
  }
}

// Quem chegou procurando e não achou é demanda que o site perde se a tela
// vazia não oferecer nada. Em vez de só avisar que não tem, convida a pessoa
// a dizer o que procura — vira um pedido publicado, que é justamente o que
// faz a categoria deixar de ser vazia.
function panelProdutoTemFiltro() {
  const ids = ["panel-produto-state", "panel-produto-city", "panel-produto-min", "panel-produto-max"];
  return ids.some((id) => (document.getElementById(id) || {}).value) || Boolean(panelProdutoPriceSort) || panelProdutoUseGps;
}

function renderPanelProdutoVazio() {
  const rotulo = panelProdutoType === "imovel" ? "imóvel" : "produto";
  // Culpar o filtro quando nenhum foi aplicado faz a pessoa mexer nos filtros
  // à toa procurando um erro que não é dela.
  const aviso = panelProdutoTemFiltro()
    ? "Nenhum anúncio com esses filtros."
    : `Ainda não tem ${rotulo} publicado por aqui.`;
  return `
    <li class="panel-produto-empty">
      <p class="panel-vazio-aviso">${escapeHtml(aviso)}</p>
      <p class="panel-vazio-convite">Não achou o que procurava? Diga o que você precisa — quem tiver entra em contato.</p>
      <button type="button" class="panel-submit" id="panel-produto-pedir">Publicar o que eu procuro</button>
    </li>
  `;
}

function openProdutoPanel() {
  panelProdutoType = "produto";
  panelProdutoPriceSort = "";
  panelProdutoUseGps = false;
  categoryPanelHead.innerHTML = `
    <div class="panel-subtabs" role="tablist" aria-label="Tipo de anúncio">
      ${PANEL_PRODUTO_TYPES.map(
        (t, i) =>
          `<button type="button" class="panel-subtab${i === 0 ? " is-active" : ""}" data-produto-type="${t.type}" role="tab" aria-selected="${i === 0}">${t.label}</button>`
      ).join("")}
    </div>
    <div class="panel-filter-row">
      <button type="button" id="panel-produto-location" class="panel-filter-btn"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg> <span class="btn-label">Minha localização</span></button>
      <label class="panel-field">
        <span class="panel-field-label">Estado</span>
        <select id="panel-produto-state" class="panel-select">
          <option value="">Todos os estados</option>
        </select>
      </label>
      <label class="panel-field">
        <span class="panel-field-label">Cidade</span>
        <select id="panel-produto-city" class="panel-select">
          <option value="">Todas as cidades</option>
        </select>
      </label>
      <label class="panel-field panel-field--narrow">
        <span class="panel-field-label">Preço mín.</span>
        <input id="panel-produto-min" class="panel-input" type="number" inputmode="numeric" placeholder="qualquer" />
      </label>
      <label class="panel-field panel-field--narrow">
        <span class="panel-field-label">Preço máx.</span>
        <input id="panel-produto-max" class="panel-input" type="number" inputmode="numeric" placeholder="qualquer" />
      </label>
      <button type="button" class="panel-filter-btn panel-price-sort" data-price-sort="asc">R$ ↑</button>
      <button type="button" class="panel-filter-btn panel-price-sort" data-price-sort="desc">R$ ↓</button>
    </div>
  `;
  categoryPanelBody.innerHTML = '<ul id="panel-produto-list" class="panel-produto-list" aria-live="polite"></ul>';

  const stateSel = document.getElementById("panel-produto-state");
  const citySel = document.getElementById("panel-produto-city");
  populateStateSelect(stateSel);
  stateSel.addEventListener("change", () => {
    populateCitySelect(citySel, stateSel.value);
    loadPanelProdutos();
  });
  citySel.addEventListener("change", loadPanelProdutos);

  const debouncedProdutos = debounce(loadPanelProdutos, 350);
  document.getElementById("panel-produto-min").addEventListener("input", debouncedProdutos);
  document.getElementById("panel-produto-max").addEventListener("input", debouncedProdutos);

  categoryPanelHead.querySelectorAll("[data-produto-type]").forEach((tab) => {
    tab.addEventListener("click", () => {
      panelProdutoType = tab.dataset.produtoType;
      categoryPanelHead.querySelectorAll("[data-produto-type]").forEach((t) => {
        const active = t === tab;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", String(active));
      });
      loadPanelProdutos();
    });
  });

  categoryPanelHead.querySelectorAll(".panel-price-sort").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.priceSort;
      panelProdutoPriceSort = panelProdutoPriceSort === next ? "" : next;
      categoryPanelHead.querySelectorAll(".panel-price-sort").forEach((b) => {
        b.classList.toggle("is-active", b.dataset.priceSort === panelProdutoPriceSort);
      });
      loadPanelProdutos();
    });
  });

  // Delegado na lista porque o botão nasce junto do estado vazio, que é
  // redesenhado a cada filtro.
  document.getElementById("panel-produto-list").addEventListener("click", (event) => {
    if (!event.target.closest("#panel-produto-pedir")) return;
    abrirPedidoNoPainel(panelProdutoType);
  });

  document.getElementById("panel-produto-location").addEventListener("click", async (event) => {
    const btn = event.currentTarget;
    if (panelProdutoUseGps) {
      panelProdutoUseGps = false;
      btn.classList.remove("is-active");
      loadPanelProdutos();
      return;
    }
    const loc = await resolveUserLocation(btn);
    // O painel pode ter sido fechado e reaberto enquanto a localização era
    // resolvida; sem essa guarda o botão antigo, já descartado, ligaria o GPS
    // no painel novo sem ninguém ter clicado nele.
    if (!loc || !btn.isConnected) return;
    panelProdutoUseGps = true;
    btn.classList.add("is-active");
    loadPanelProdutos();
  });

  loadPanelProdutos();
}

// Traz o formulário de publicar pra dentro do painel em vez de rolar a página
// até ele — a promessa do painel é justamente não jogar a pessoa pra longe.
function abrirPedidoNoPainel(tipo) {
  const publicar = document.getElementById("publicar");
  if (!publicar) return;
  // Com o formulário aberto logo abaixo, o botão que o abriu vira ruído.
  const botao = document.getElementById("panel-produto-pedir");
  if (botao) botao.hidden = true;
  movePanelSection(publicar);

  const selectTipo = document.getElementById("post-type");
  if (selectTipo && [...selectTipo.options].some((o) => o.value === tipo)) {
    selectTipo.value = tipo;
  }
  const titulo = document.getElementById("post-title");
  if (titulo) {
    titulo.focus({ preventScroll: true });
  }
}

const CATEGORY_PANELS = {
  servico: { title: "Serviços perto de você", open: openServicosPanel },
  viagem: { title: "Viagens, corridas e caronas", open: openViagemPanel },
  grupo: { title: "Grupos", open: openGrupoPanel },
  produto: { title: "Produtos e imóveis", open: openProdutoPanel },
};

function closeCategoryPanel() {
  restorePanelSections();
  categoryPanelHead.innerHTML = "";
  categoryPanelBody.innerHTML = "";
  categoryPanel.hidden = true;
}

function openCategoryPanel(category) {
  const config = CATEGORY_PANELS[category];
  if (!config) {
    heroSearchInput.focus();
    return;
  }
  // Devolve o que estava aberto antes de limpar — sem isso, innerHTML = ""
  // destruiria a seção emprestada em vez de devolvê-la à página.
  restorePanelSections();
  categoryPanelHead.innerHTML = "";
  categoryPanelBody.innerHTML = "";
  categoryPanelTitle.textContent = config.title;
  config.open();
  categoryPanel.hidden = false;
}

document.querySelectorAll("[data-hero-category]").forEach((chip) => {
  chip.addEventListener("click", () => openCategoryPanel(chip.dataset.heroCategory));
});

document.querySelector(".category-panel-close")?.addEventListener("click", closeCategoryPanel);

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
  emailAuthForm.querySelector('[data-auth-field="altcha"]').hidden = !isSignup;
  document.getElementById("auth-name").required = isSignup;
  document.getElementById("auth-whatsapp").required = isSignup;
  emailAuthSubmit.textContent = isSignup ? "Criar conta" : "Entrar";
  emailAuthTabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.authMode === emailAuthMode));
}

emailAuthToggle.addEventListener("click", () => {
  emailAuthPanel.hidden = !emailAuthPanel.hidden;
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
      resetAltchaWidget("email-auth-altcha-slot");
      return;
    }
    const meRes = await fetch("/api/auth/me");
    const me = meRes.ok ? await meRes.json() : { providers: [], groups: [], requests: [] };
    renderLoggedInUser(result.user, me.providers, me.groups, me.requests);
    emailAuthForm.reset();
    // Mesma lógica do grupo: se a pessoa deslogar e cadastrar outra conta
    // sem recarregar a página, precisa de um desafio novo.
    resetAltchaWidget("email-auth-altcha-slot");
  } catch (err) {
    emailAuthStatus.textContent = "Falha de conexão. Tente de novo.";
    emailAuthStatus.className = "post-status post-status--error";
    resetAltchaWidget("email-auth-altcha-slot");
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
// "Quero prestar" — nunca bloqueia o uso anônimo. task-014: agora aparece
// só uma vez por sessão (sessionStorage "já foi exibido") e nunca depois
// de logar. Fechar (×) também guarda no sessionStorage — banner não volta
// mais na mesma aba, nem após navegar de volta.
const LOGIN_SUGGESTION_DISMISSED_KEY = "top3_login_suggestion_dismissed";
const loginSuggestionBanner = document.getElementById("login-suggestion-banner");
const loginSuggestionCta = document.getElementById("login-suggestion-cta");
const loginSuggestionDismiss = document.getElementById("login-suggestion-dismiss");

function wasLoginSuggestionDismissed() {
  try {
    // sessionStorage: só nessa aba/sessão. localStorage (fallback legado):
    // persiste entre visitas — mantido pra quem já tinha dispensado antes.
    return (
      sessionStorage.getItem(LOGIN_SUGGESTION_DISMISSED_KEY) === "1" ||
      localStorage.getItem(LOGIN_SUGGESTION_DISMISSED_KEY) === "1"
    );
  } catch (err) {
    return false;
  }
}

function markLoginSuggestionDismissed() {
  try {
    sessionStorage.setItem(LOGIN_SUGGESTION_DISMISSED_KEY, "1");
  } catch (err) {
    // storage indisponível — banner pode reaparecer nessa visita, sem problema.
  }
}

function showLoginSuggestionBannerIfApplicable() {
  if (currentUserProfile || wasLoginSuggestionDismissed()) return;
  loginSuggestionBanner.hidden = false;
  // Marca como exibido assim que aparece — não mostra de novo na mesma sessão.
  markLoginSuggestionDismissed();
}

function hideLoginSuggestionBanner() {
  loginSuggestionBanner.hidden = true;
}

loginSuggestionCta.addEventListener("click", () => {
  hideLoginSuggestionBanner();
  emailAuthPanel.hidden = false;
  emailAuthToggle.scrollIntoView({ behavior: "smooth", block: "center" });
});

loginSuggestionDismiss.addEventListener("click", () => {
  hideLoginSuggestionBanner();
  markLoginSuggestionDismissed();
});

function renderLoggedInUser(user, providers, groups, requests) {
  ownProviders = providers || [];
  ownGroups = groups || [];
  ownRequests = requests || [];
  currentUserProfile = user;
  prefillPostFormFromProfile();
  googleSigninSlot.innerHTML = `
    <button type="button" class="user-chip" id="user-chip-toggle">
      ${user.picture ? `<img src="${escapeHtml(user.picture)}" alt="" />` : ""}
      ${escapeHtml(user.name)}
    </button>
    <button type="button" class="user-logout" id="google-logout-btn">Sair</button>
  `;
  emailAuthToggle.hidden = true;
  emailAuthPanel.hidden = true;
  // signup-toggle removido (tarefa de simplificação do login)
  hideLoginSuggestionBanner();
  renderUserPanel();
  // Prompt de WhatsApp para quem entrou via login social sem número cadastrado
  showWhatsAppPromptIfNeeded(user);
  // Painel de tracking ao vivo (aparece na seção de corridas para usuários logados)
  initLiveTracking(user);
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
    // quer usar o site sem logar. console.error só pra quem for depurar
    // (task-011, item 3) — antes falhava 100% em silêncio, sem rastro
    // nenhum nem no DevTools de quem estava tentando entender por que não
    // logou.
    console.error("[login google] falha ao completar login:", err);
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
  // use_fedcm_for_button (task-011, item 3 — corrigido no PR #77 depois
  // do achado do CodeRabbit): `use_fedcm_for_prompt` só afeta o fluxo de
  // One Tap/prompt e já está depreciado/ignorado pelo próprio Google —
  // não fazia nada pro botão renderizado abaixo (renderButton), que é
  // exatamente o fluxo que a Jéssica reportou como quebrado. A flag certa
  // pro botão é use_fedcm_for_button. Navegadores recentes vêm
  // restringindo cookie de terceiro por padrão, o que pode quebrar
  // silenciosamente o fluxo clássico sem nenhum erro visível — FedCM é o
  // mecanismo atual recomendado pelo Google pra não depender disso.
  // auto_select: false + auto_prompt: false (task-013/014) — sem esses dois
  // o GIS pode mostrar o popup One Tap sozinho na home, antes de qualquer
  // ação do usuário. O botão do Google deve aparecer DENTRO do modal "Entrar".
  google.accounts.id.initialize({ client_id: clientId, callback: handleGoogleCredential, use_fedcm_for_button: true, auto_select: false, auto_prompt: false });
  // Botão "standard" (com texto "Fazer login com o Google") tem largura fixa
  // ~240px — em telas estreitas (mesmo corte de .site-nav no CSS) isso vaza
  // pra fora do header, cortado. "icon" é um botão circular compacto, cabe
  // em qualquer largura.
  const isNarrow = window.innerWidth < 640;
  // Já era o botão oficial do Google (renderButton, não um customizado) —
  // o "feio" reportado (task-009, item 6) era o tema "outline", pensado
  // pra fundo claro: vira um quadrado branco chapado num header quase
  // preto (--bg: #0a0c0d). "filled_black" é o tema oficial do próprio
  // Google pra contexto escuro, combina com o resto do site sem precisar
  // customizar nada por fora das diretrizes de marca deles.
  // task-014: renderiza dentro do modal "Entrar", não no header — o botão
  // deve aparecer só quando a pessoa abrir o modal explicitamente.
  const modalSlot = document.getElementById("google-signin-modal-slot");
  if (modalSlot) {
    modalSlot.hidden = false;
    google.accounts.id.renderButton(modalSlot, {
      theme: "filled_black",
      size: "large",
      type: "standard",
      locale: "pt-BR",
      width: 300,
    });
  }
}

// ALTCHA (task-008) — só cria o widget de verdade se o servidor confirmar
// que está configurado (ALTCHA_HMAC_KEY). Nunca deixa o elemento parado no
// HTML sem isso: ele tentaria buscar um desafio em /api/altcha-challenge que
// não existe (503) e, sem solução nenhuma, travaria o envio do formulário
// pela validação nativa do HTML5 — pior que não ter anti-spam nenhum.
function createAltchaWidget(slot) {
  if (!slot) return;
  const widget = document.createElement("altcha-widget");
  widget.setAttribute("challenge", "/api/altcha-challenge");
  widget.setAttribute("auto", "onfocus");
  widget.setAttribute("hidelogo", "");
  slot.appendChild(widget);
}

// Uma solução do ALTCHA só vale uma vez (proteção contra replay no
// servidor) — se o envio falhar por QUALQUER motivo (e-mail já cadastrado,
// queda de conexão, etc), a solução que já foi resolvida fica queimada. Sem
// recriar o widget aqui, a pessoa tentaria de novo com o mesmo desafio já
// usado e cairia sempre em "verificação anti-spam inválida", mascarando o
// erro de verdade (achado na revisão do CodeRabbit, PR #68). Só recria se
// já existia um widget de verdade (ALTCHA configurado) — no-op sem isso.
function resetAltchaWidget(slotId) {
  const slot = document.getElementById(slotId);
  if (!slot || !slot.querySelector("altcha-widget")) return;
  slot.innerHTML = "";
  createAltchaWidget(slot);
}

fetch("/api/auth/config")
  .then((res) => res.json())
  .then(async (config) => {
    if (config.altchaConfigured) {
      createAltchaWidget(document.getElementById("email-auth-altcha-slot"));
      createAltchaWidget(document.getElementById("group-altcha-slot"));
    }

    // Estatísticas do site (task-008) — Umami self-hosted, sem mandar dado
    // de visita pra terceiro. Só injeta o script se as duas variáveis
    // estiverem configuradas no servidor; sem elas, o site funciona
    // normalmente, só sem rastreamento nenhum. Roda antes de qualquer
    // "return" abaixo, pra não perder a página vista por causa do fluxo de
    // login.
    if (config.umamiScriptUrl && config.umamiWebsiteId) {
      const script = document.createElement("script");
      script.defer = true;
      script.src = config.umamiScriptUrl;
      script.dataset.websiteId = config.umamiWebsiteId;
      document.head.appendChild(script);
    }

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

    // Supabase social login (Facebook / Instagram) — só ativa se o servidor
    // tiver SUPABASE_URL e SUPABASE_ANON_KEY configurados.
    if (config.supabaseUrl && config.supabaseAnonKey) {
      const supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

      // Detecta retorno de OAuth (hash #access_token=... na URL)
      const { data: { session: oauthSession } } = await supabase.auth.getSession();
      if (oauthSession?.access_token) {
        const r = await fetch("/api/auth/supabase-social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: oauthSession.access_token }),
        });
        if (r.ok) {
          const { user } = await r.json();
          if (user) {
            // Limpa o hash da URL para não re-processar no próximo F5
            history.replaceState(null, "", window.location.pathname + window.location.search);
            renderLoggedInUser(user, [], [], []);
            return;
          }
        }
      }

      // Mostra botões de Facebook e Instagram
      const fbBtn = document.getElementById("facebook-login-btn");
      const igBtn = document.getElementById("instagram-login-btn");
      if (fbBtn) {
        fbBtn.hidden = false;
        fbBtn.addEventListener("click", () => {
          supabase.auth.signInWithOAuth({
            provider: "facebook",
            options: { redirectTo: window.location.origin },
          });
        });
      }
      if (igBtn) {
        igBtn.hidden = false;
        igBtn.addEventListener("click", () => {
          supabase.auth.signInWithOAuth({
            provider: "instagram",
            options: { redirectTo: window.location.origin },
          });
        });
      }
    }

    if (!config.googleClientId) return;
    await loadGisScript();
    initGoogleSignIn(config.googleClientId, 20);
  })
  .catch(() => {})
  .finally(() => showLoginSuggestionBannerIfApplicable());

// ── Banner de permissão de localização ─────────────────────────────────────
// Pede permissão logo ao abrir o site (não só ao ordenar por distância).
// Se já foi concedida, aproveitamos sem mostrar o banner.
(async function initGeoBanner() {
  if (!navigator.geolocation) return;
  const banner = document.getElementById("geo-permission-banner");
  const activateBtn = document.getElementById("geo-permission-btn");
  const dismissBtn = document.getElementById("geo-permission-dismiss");
  if (!banner) return;

  let permState = "prompt";
  try {
    const perm = await navigator.permissions.query({ name: "geolocation" });
    permState = perm.state;
  } catch (_) {}

  if (permState === "granted") return; // já tem, não mostra nada
  if (permState === "denied") return;  // negada, não adianta pedir

  // Só mostra se ainda não foi dispensado nesta sessão
  if (sessionStorage.getItem("geo-banner-dismissed")) return;
  banner.hidden = false;

  activateBtn.addEventListener("click", () => {
    banner.hidden = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => { cachedUserLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
      () => {}
    );
  });
  dismissBtn.addEventListener("click", () => {
    banner.hidden = true;
    sessionStorage.setItem("geo-banner-dismissed", "1");
  });
})();

// ── Prompt de WhatsApp para usuários de login social ────────────────────────
// Usuários que entram pelo Google/Facebook/Instagram não passam pelo cadastro
// com WhatsApp — pedimos depois do login se ainda não tiver.
function showWhatsAppPromptIfNeeded(user) {
  if (user.whatsapp) return;
  const overlay = document.getElementById("whatsapp-prompt-modal");
  const input = document.getElementById("whatsapp-prompt-input");
  const saveBtn = document.getElementById("whatsapp-prompt-save");
  const skipBtn = document.getElementById("whatsapp-prompt-skip");
  const errorEl = document.getElementById("whatsapp-prompt-error");
  if (!overlay) return;
  overlay.hidden = false;

  saveBtn.addEventListener("click", async () => {
    errorEl.hidden = true;
    const val = input.value.trim();
    const digits = val.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 11) {
      errorEl.textContent = "Use o formato (DD) 9XXXX-XXXX";
      errorEl.hidden = false;
      return;
    }
    saveBtn.disabled = true;
    try {
      const r = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp: val }),
      });
      const data = await r.json();
      if (!r.ok) {
        errorEl.textContent = data.error || "Não consegui salvar.";
        errorEl.hidden = false;
        return;
      }
      overlay.hidden = true;
    } catch (_) {
      errorEl.textContent = "Falha de conexão.";
      errorEl.hidden = false;
    } finally {
      saveBtn.disabled = false;
    }
  });
  skipBtn.addEventListener("click", () => { overlay.hidden = true; });
}

// ── Rastreamento ao vivo de corridas ────────────────────────────────────────
let liveTrackingWatchId = null;
let liveTrackingInterval = null;

function initLiveTracking(user) {
  const panel = document.getElementById("live-tracking-panel");
  const toggleBtn = document.getElementById("live-tracking-toggle");
  const statusEl = document.getElementById("live-tracking-status");
  if (!panel || !toggleBtn) return;
  panel.hidden = false;

  toggleBtn.addEventListener("click", () => {
    if (liveTrackingWatchId !== null) {
      // Para o compartilhamento
      navigator.geolocation.clearWatch(liveTrackingWatchId);
      clearInterval(liveTrackingInterval);
      liveTrackingWatchId = null;
      liveTrackingInterval = null;
      fetch("/api/location", { method: "DELETE" }).catch(() => {});
      toggleBtn.textContent = "Iniciar compartilhamento";
      toggleBtn.classList.remove("cta-primary");
      toggleBtn.classList.add("cta-secondary");
      if (statusEl) statusEl.hidden = true;
      return;
    }

    if (!navigator.geolocation) {
      if (statusEl) { statusEl.textContent = "Geolocalização não suportada neste dispositivo."; statusEl.hidden = false; }
      return;
    }

    let lastPos = null;
    liveTrackingWatchId = navigator.geolocation.watchPosition(
      (pos) => { lastPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
      () => {
        if (statusEl) { statusEl.textContent = "Sem acesso à localização — verifique as permissões."; statusEl.hidden = false; }
        navigator.geolocation.clearWatch(liveTrackingWatchId);
        liveTrackingWatchId = null;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );

    // Envia posição ao servidor a cada 8 segundos
    liveTrackingInterval = setInterval(async () => {
      if (!lastPos) return;
      try {
        await fetch("/api/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lastPos),
        });
      } catch (_) {}
    }, 8000);

    toggleBtn.textContent = "Parar compartilhamento";
    toggleBtn.classList.remove("cta-secondary");
    toggleBtn.classList.add("cta-primary");
    if (statusEl) {
      statusEl.textContent = "Compartilhando localização ao vivo…";
      statusEl.hidden = false;
    }
  });
}

// task-012 — nova home "TOP3 SYSTEM": tudo que parece estatística ou
// atividade aqui embaixo vem de consulta real (fetch pro backend), nunca
// número fixo. Ver docs/visao-produto.md seção 4.22.

// Indicador "Online" (item 1) — só aparece se /health responder de
// verdade, nunca decorativo fixo. Sem tentar de novo: se falhar, o
// indicador simplesmente não aparece (nada pra "cair" depois).
(async function checkOnlineStatus() {
  const indicator = document.getElementById("online-indicator");
  try {
    const res = await fetch("/health");
    if (res.ok) indicator.hidden = false;
  } catch (err) {
    // sem indicador mesmo — melhor que fingir "online" sem checar nada.
  }
})();

// "Mais" (menu do topo) — dropdown simples, fecha ao clicar fora ou ao
// escolher um item. Guardado contra null pois o nav pode não existir.
const navMoreToggle = document.getElementById("nav-more-toggle");
const navMoreMenu = document.getElementById("nav-more-menu");
if (navMoreToggle && navMoreMenu) {
  navMoreToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = !navMoreMenu.hidden;
    navMoreMenu.hidden = isOpen;
    navMoreToggle.setAttribute("aria-expanded", String(!isOpen));
  });
  document.addEventListener("click", (event) => {
    if (navMoreMenu.hidden) return;
    if (event.target.closest("#nav-more-menu, #nav-more-toggle")) return;
    navMoreMenu.hidden = true;
    navMoreToggle.setAttribute("aria-expanded", "false");
  });
  navMoreMenu.addEventListener("click", () => {
    navMoreMenu.hidden = true;
    navMoreToggle.setAttribute("aria-expanded", "false");
  });
}

// "Comece agora" (chamada final) → abre modal de login
document.getElementById("final-cta-btn")?.addEventListener("click", () => {
  emailAuthToggle.click();
  document.getElementById("email-auth-toggle").scrollIntoView({ behavior: "smooth", block: "center" });
});


// Categorias populares (item 7) — as de Grupos aplicam o mesmo filtro que
// já existe na seção Grupos, só de outro ponto de entrada.
document.querySelectorAll("#categorias .category-card[data-group-category]").forEach((card) => {
  card.addEventListener("click", (event) => {
    const category = card.dataset.groupCategory;
    const categoryBtn = document.querySelector(`.group-category-btn[data-category="${category}"]`);
    if (categoryBtn) {
      event.preventDefault();
      categoryBtn.click();
      highlightSection(document.getElementById("grupos"));
    }
  });
});

// "há X min/h/d" a partir de um timestamp ISO real — usado em Atividade
// recente (item 4). Sempre relativo a agora, nunca um texto fixo.
function formatRelativeTime(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "agora mesmo";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.round(diffH / 24);
  return `há ${diffD}d`;
}

// Destaques da sua região (item 3) — mistura pedidos (REQUESTS) e grupos
// abertos (GROUP_OPPORTUNITIES) reais, ordenados por mais recente. Sem
// posts suficientes, mostra só os que existem (nunca completa com
// exemplo fictício); sem nenhum, mostra o empty state com ação.
async function loadHighlights() {
  const list = document.getElementById("highlights-list");
  const empty = document.getElementById("highlights-empty");
  try {
    const [requestsRes, groupsRes] = await Promise.all([fetch("/api/requests"), fetch("/api/groups")]);
    const { requests } = requestsRes.ok ? await requestsRes.json() : { requests: [] };
    const { groups } = groupsRes.ok ? await groupsRes.json() : { groups: [] };

    const items = [
      ...requests
        .filter((r) => r.status === "aberto")
        .map((r) => ({
          id: `r-${r.id}`,
          createdAt: r.createdAt,
          label: r.type,
          title: r.title,
          where: r.location || "local não informado",
          price: `R$ ${r.price}`,
          actionText: "Ver opções",
          onAction: () => {
            setMode("provider");
            highlightSection(document.getElementById("provider"));
          },
        })),
      ...groups
        .filter((g) => g.status === "aberto")
        .map((g) => ({
          id: `g-${g.id}`,
          createdAt: g.createdAt,
          label: g.categoryLabel || g.category,
          title: g.title,
          where: g.city,
          price: g.estimatedIndividualPrice ? `R$ ${g.estimatedIndividualPrice}/pessoa` : `${g.currentMembers}/${g.targetMembers} pessoas`,
          actionText: g.category === "carona" ? "Ver carona" : "Participar",
          onAction: () => {
            const categoryBtn = document.querySelector(`.group-category-btn[data-category="${g.category}"]`);
            if (categoryBtn) categoryBtn.click();
            highlightSection(document.getElementById("grupos"));
          },
        })),
    ]
      // Posts de exemplo do catálogo inicial (server.js) não têm createdAt
      // (só posts criados de verdade pela API ganham isso) — sem tratar
      // isso, new Date(undefined) vira NaN e a subtração do comparador
      // devolve NaN pra esses itens, deixando a ordenação instável
      // (achado do CodeRabbit, PR #78). undefined sempre vai pro fim, sem
      // interferir na ordenação por data real dos demais.
      .sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : -Infinity;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : -Infinity;
        return timeB - timeA;
      })
      .slice(0, 5);

    if (items.length === 0) {
      list.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    list.innerHTML = items
      .map(
        (item, index) => {
          const typeKey = (item.label || "").toLowerCase().replace(/\s+/g, "").normalize("NFD").replace(/[̀-ͯ]/g, "");
          return `
      <li class="highlight-card">
        <div class="highlight-card-header highlight-card-header--${typeKey}">
          <span class="highlight-card-badge highlight-card-badge--${typeKey}">${escapeHtml(item.label)}</span>
        </div>
        <div class="highlight-card-body">
          <strong class="highlight-card-title">${escapeHtml(item.title)}</strong>
          <span class="highlight-card-where">${escapeHtml(item.where)}</span>
          <span class="highlight-card-price highlight-price">${escapeHtml(item.price)}</span>
          <button type="button" class="highlight-card-action highlight-action" data-highlight-index="${index}">${escapeHtml(item.actionText)} →</button>
        </div>
      </li>`;
        }
      )
      .join("");
    list.querySelectorAll(".highlight-card-action").forEach((btn) => {
      btn.addEventListener("click", () => items[Number(btn.dataset.highlightIndex)].onAction());
    });
  } catch (err) {
    list.innerHTML = "";
    empty.hidden = false;
  }
}

// TOP3 SYSTEM — Atividade recente (item 4).
async function loadActivityFeed() {
  const list = document.getElementById("activity-list");
  const empty = document.getElementById("activity-empty");
  try {
    const res = await fetch("/api/activity-feed?limit=8");
    const { events } = res.ok ? await res.json() : { events: [] };
    if (!events || events.length === 0) {
      list.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    list.innerHTML = events
      .map(
        (ev) => `
      <li class="activity-item">
        <span class="activity-text">${escapeHtml(ev.text)}</span>
        <span class="activity-time">${escapeHtml(formatRelativeTime(ev.createdAt))}</span>
      </li>`
      )
      .join("");
  } catch (err) {
    list.innerHTML = "";
    empty.hidden = false;
  }
}

// Números que conectam (item 6) — os 4 vêm todos de /api/home-stats, uma
// query real cada, nunca arredondado nem simulado (mesmo se o número real
// for baixo, ex: "3").
async function loadHomeStats() {
  try {
    const res = await fetch("/api/home-stats");
    if (!res.ok) return;
    const stats = await res.json();
    const fmt = (n) => (n > 0 ? `+${n}` : String(n));
    document.getElementById("stat-searches").textContent = fmt(stats.searchesLast7Days);
    document.getElementById("stat-open").textContent = fmt(stats.openOpportunities);
    document.getElementById("stat-groups").textContent = fmt(stats.groupsForming);
    document.getElementById("stat-providers").textContent = fmt(stats.providersListed);
  } catch (err) {
    // Sem dado, os cards ficam com "—" (valor inicial do HTML) em vez de
    // travar ou mostrar zero enganoso.
  }
}

loadHighlights();
loadActivityFeed();
loadHomeStats();
