require("dotenv").config();
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk").default;

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
    distanceKm: 3.2,
    price: 28,
    status: "aberto",
  },
  {
    id: "r2",
    type: "entrega",
    title: "Farmácia Popular → Rua dos Ipês, 120 (Savassi)",
    requester: "Farmácia Popular",
    distanceKm: 1.8,
    price: 12,
    status: "aberto",
  },
  {
    id: "r3",
    type: "corrida",
    title: "Praça da Liberdade → Shopping Cidade",
    requester: "Marcos T.",
    distanceKm: 5.6,
    price: 22,
    status: "aberto",
  },
  {
    id: "r4",
    type: "entrega",
    title: "Drogaria São Paulo → Av. Contorno, 890",
    requester: "Drogaria São Paulo",
    distanceKm: 2.4,
    price: 15,
    status: "aberto",
  },
];

const SYSTEM_PROMPT = `Você é o assistente de busca do Top3Profissional, um app que conecta pessoas a profissionais de serviços locais.
Ajude o usuário a encontrar alguém na lista de profissionais disponíveis abaixo. Seja breve e direto (poucas frases).
Ao recomendar alguém, cite nome, serviço, cidade, horário disponível, avaliação (rating de 0 a 5), distância (distanceKm),
preço (price, em reais) e se responde rápido (fastReply). Se ninguém da lista atender ao pedido, diga isso com honestidade
e sugira a opção mais próxima disponível. Responda sempre em português do Brasil.

Profissionais disponíveis (mock, para fins de protótipo):
${JSON.stringify(PROVIDERS, null, 2)}`;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY não definida. Crie um arquivo .env com ANTHROPIC_API_KEY=sk-ant-...");
  process.exit(1);
}

const anthropic = new Anthropic();
const app = express();
app.use(express.json());
app.use(express.static(__dirname));

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "campo 'message' é obrigatório" });
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: message }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    res.json({ reply: textBlock ? textBlock.text : "" });
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

app.post("/api/requests/:id/accept", (req, res) => {
  const request = REQUESTS.find((r) => r.id === req.params.id);
  if (!request) {
    return res.status(404).json({ error: "pedido não encontrado" });
  }
  if (request.status === "aceito") {
    return res.status(409).json({ error: "este pedido já foi aceito" });
  }
  request.status = "aceito";
  res.json({ request });
});

const PORT = process.env.PORT || 8123;
app.listen(PORT, () => {
  console.log(`Top3Profissional rodando em http://localhost:${PORT}`);
});
