require("dotenv").config();
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk").default;

const PROVIDERS = [
  { name: "Ana Souza", service: "manicure", city: "Belo Horizonte", time: "amanhã às 14h" },
  { name: "Carla Lima", service: "manicure", city: "Belo Horizonte", time: "hoje às 17h30" },
  { name: "Fernanda Reis", service: "manicure", city: "Belo Horizonte", time: "amanhã às 09h" },
  { name: "João Pedro", service: "eletricista", city: "Curitiba", time: "hoje às 15h" },
  { name: "Marcos Vieira", service: "eletricista", city: "Curitiba", time: "amanhã às 10h" },
  { name: "Beatriz Alves", service: "cabeleireiro", city: "São Paulo", time: "hoje às 18h" },
  { name: "Ricardo Nunes", service: "encanador", city: "Rio de Janeiro", time: "amanhã às 08h" },
];

const SYSTEM_PROMPT = `Você é o assistente de busca do meu-site, um app que conecta pessoas a profissionais de serviços locais.
Ajude o usuário a encontrar alguém na lista de profissionais disponíveis abaixo. Seja breve e direto (poucas frases).
Ao recomendar alguém, cite nome, serviço, cidade e horário disponível. Se ninguém da lista atender ao pedido,
diga isso com honestidade e sugira a opção mais próxima disponível. Responda sempre em português do Brasil.

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

const PORT = process.env.PORT || 8123;
app.listen(PORT, () => {
  console.log(`meu-site rodando em http://localhost:${PORT}`);
});
