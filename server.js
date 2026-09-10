require("dotenv").config();
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk").default;
const { registerWhatsAppRoutes, isConfigured: isWhatsAppConfigured } = require("./whatsapp");

const PROVIDERS = [
  { name: "Ana Souza", service: "manicure", city: "Belo Horizonte", time: "amanhã às 14h", rating: 4.9, distanceKm: 1.2, price: 45, fastReply: true },
  { name: "Carla Lima", service: "manicure", city: "Belo Horizonte", time: "hoje às 17h30", rating: 4.6, distanceKm: 3.8, price: 35, fastReply: false },
  { name: "Fernanda Reis", service: "manicure", city: "Belo Horizonte", time: "amanhã às 09h", rating: 4.8, distanceKm: 2.1, price: 40, fastReply: true },
  { name: "João Pedro", service: "eletricista", city: "Curitiba", time: "hoje às 15h", rating: 4.7, distanceKm: 4.5, price: 90, fastReply: true },
  { name: "Marcos Vieira", service: "eletricista", city: "Curitiba", time: "amanhã às 10h", rating: 4.5, distanceKm: 6.0, price: 80, fastReply: false },
  { name: "Beatriz Alves", service: "cabeleireiro", city: "São Paulo", time: "hoje às 18h", rating: 5.0, distanceKm: 0.8, price: 120, fastReply: true },
  { name: "Ricardo Nunes", service: "encanador", city: "Rio de Janeiro", time: "amanhã às 08h", rating: 4.4, distanceKm: 5.2, price: 100, fastReply: false },
];

const REQUESTS = [
  {
    id: "r1",
    type: "corrida",
    title: "Rua Bahia, 500 → Aeroporto de Confins",
    requester: "Juliana M.",
    when: "hoje às 19h",
    distanceKm: 3.2,
    price: 28,
    status: "aberto",
  },
  {
    id: "r2",
    type: "entrega",
    title: "Farmácia Popular → Rua dos Ipês, 120 (Savassi)",
    requester: "Farmácia Popular",
    when: "hoje às 16h30",
    distanceKm: 1.8,
    price: 12,
    status: "aberto",
  },
  {
    id: "r3",
    type: "corrida",
    title: "Praça da Liberdade → Shopping Cidade",
    requester: "Marcos T.",
    when: "amanhã às 09h",
    distanceKm: 5.6,
    price: 22,
    status: "aberto",
  },
  {
    id: "r4",
    type: "entrega",
    title: "Drogaria São Paulo → Av. Contorno, 890",
    requester: "Drogaria São Paulo",
    when: "hoje às 20h",
    distanceKm: 2.4,
    price: 15,
    status: "aberto",
  },
];

let nextRequestId = REQUESTS.length + 1;
const REQUEST_TYPE_MAX_LENGTH = 30;

const SYSTEM_PROMPT = `Você é o assistente de busca do Top3Profissional, um app que conecta pessoas a profissionais de serviços locais.
Ajude o usuário a encontrar alguém na lista de profissionais disponíveis abaixo. Seja breve e direto (poucas frases).
Ao recomendar alguém, cite nome, serviço, cidade, horário disponível, avaliação (rating de 0 a 5), distância (distanceKm),
preço (price, em reais) e se responde rápido (fastReply). Se ninguém da lista atender ao pedido, diga isso com honestidade
e sugira a opção mais próxima disponível. Responda sempre em português do Brasil.

Profissionais disponíveis (mock, para fins de protótipo):
${JSON.stringify(PROVIDERS, null, 2)}`;

let anthropic = null;
if (process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic();
} else {
  console.warn(
    "ANTHROPIC_API_KEY não definida — o servidor sobe, mas /api/chat e o WhatsApp vão responder com erro. " +
      "Crie um .env com ANTHROPIC_API_KEY=sk-ant-... pra ativar o agente."
  );
}

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

async function askAgent(message) {
  if (!anthropic) {
    throw new Error("ANTHROPIC_API_KEY não configurada neste ambiente");
  }
  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: message }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock ? textBlock.text : "";
}

function acceptRequest(id) {
  // Normalizado aqui (não só no lado do WhatsApp) pra cobrir qualquer
  // chamador que receba o id com espaços, maiúsculas ou pontuação solta
  // (ex: "aceitar R1." digitado no WhatsApp).
  const normalized = String(id).trim().replace(/[.,!?;:]+$/, "").toLowerCase();
  const request = REQUESTS.find((r) => r.id.toLowerCase() === normalized);
  if (!request) {
    return { ok: false, error: "pedido não encontrado" };
  }
  if (request.status === "aceito") {
    return { ok: false, error: "este pedido já foi aceito" };
  }
  request.status = "aceito";
  return { ok: true, request };
}

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "campo 'message' é obrigatório" });
  }

  try {
    const reply = await askAgent(message);
    res.json({ reply });
  } catch (err) {
    console.error("Erro ao chamar a Claude API:", err.message);
    res.status(500).json({ error: "Falha ao consultar o agente. Tente novamente." });
  }
});

const SORTERS = {
  rating: (a, b) => b.rating - a.rating,
  price: (a, b) => a.price - b.price,
  distance: (a, b) => a.distanceKm - b.distanceKm,
};

app.get("/api/ranking", (req, res) => {
  const sortBy = SORTERS[req.query.sortBy] ? req.query.sortBy : "rating";
  const top3 = [...PROVIDERS]
    .sort(SORTERS[sortBy])
    .slice(0, 3)
    .map(({ name, service, city, rating, distanceKm, price, fastReply }) => ({
      name,
      service,
      city,
      rating,
      distanceKm,
      price,
      fastReply,
    }));
  res.json({ top3, sortBy });
});

app.get("/api/requests", (req, res) => {
  res.json({ requests: REQUESTS });
});

app.post("/api/requests", (req, res) => {
  const { type, title, requester, when, price } = req.body;

  if (!type || typeof type !== "string" || !type.trim()) {
    return res.status(400).json({ error: "diga o tipo do que você precisa (ex: corrida, terreno, carro...)" });
  }
  const normalizedType = type.trim().toLowerCase();
  if (normalizedType.length > REQUEST_TYPE_MAX_LENGTH) {
    return res.status(400).json({ error: `tipo muito longo (máximo ${REQUEST_TYPE_MAX_LENGTH} caracteres)` });
  }
  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "descreva o que você precisa" });
  }
  if (requester !== undefined && typeof requester !== "string") {
    return res.status(400).json({ error: "nome inválido" });
  }
  if (when !== undefined && typeof when !== "string") {
    return res.status(400).json({ error: "campo 'quando' inválido" });
  }
  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    return res.status(400).json({ error: "valor inválido" });
  }

  const request = {
    id: `r${nextRequestId++}`,
    type: normalizedType,
    title: title.trim(),
    requester: (requester && requester.trim()) || "Você",
    when: (when && when.trim()) || "a combinar",
    distanceKm: null,
    price: priceNum,
    status: "aberto",
  };
  REQUESTS.unshift(request);
  res.status(201).json({ request });
});

app.post("/api/requests/:id/accept", (req, res) => {
  const result = acceptRequest(req.params.id);
  if (!result.ok) {
    const status = result.error === "pedido não encontrado" ? 404 : 409;
    return res.status(status).json({ error: result.error });
  }
  res.json({ request: result.request });
});

// Health check pro host (Railway, etc.) saber se o processo está de pé.
// De propósito não depende da Claude API nem de nada externo — só confirma
// que o servidor Express está respondendo, pra não marcar "unhealthy" por
// um problema de terceiro que não impede o site de carregar.
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    anthropicConfigured: Boolean(anthropic),
    whatsappConfigured: isWhatsAppConfigured(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

registerWhatsAppRoutes(app, { askAgent, acceptRequest });

const PORT = process.env.PORT || 8123;
app.listen(PORT, () => {
  console.log(`Top3Profissional rodando em http://localhost:${PORT}`);
  console.log(
    isWhatsAppConfigured()
      ? "[whatsapp] credenciais configuradas — webhook ativo em /webhook/whatsapp"
      : "[whatsapp] credenciais ausentes — webhook registrado mas não vai enviar mensagens (veja whatsapp.js)"
  );
});
