// Integração com o WhatsApp Cloud API (Meta for Developers).
//
// Isso não funciona sozinho: precisa de uma conta WhatsApp Business API
// configurada no Meta for Developers (https://developers.facebook.com/apps),
// com um número de teste (grátis) ou número real verificado. Depois de criar
// o app lá, você vai ter três valores pra colocar no .env:
//
//   WHATSAPP_VERIFY_TOKEN   -> uma string qualquer que você escolhe (ex: "top3profissional-verify").
//                              É usada só na etapa de verificação do webhook lá no painel da Meta.
//   WHATSAPP_ACCESS_TOKEN   -> o token de acesso do app (na aba WhatsApp > API Setup).
//   WHATSAPP_PHONE_NUMBER_ID -> o ID do número de telefone (também na aba API Setup).
//
// No painel da Meta, em "Configuration" > "Webhook", você aponta pra:
//   https://SEU-DOMINIO/webhook/whatsapp
// (localhost não funciona ali — precisa estar publicado, ex: via ngrok pra testar,
// ou já em produção depois do deploy).
//
// Sem essas variáveis definidas, as rotas abaixo continuam registradas mas não
// enviam nada de volta (só logam um aviso) — não derruba o resto do site.

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

function isConfigured() {
  return Boolean(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID && WHATSAPP_VERIFY_TOKEN);
}

async function sendWhatsAppMessage(to, text) {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.warn(`[whatsapp] credenciais ausentes — mensagem não enviada para ${to}: "${text}"`);
    return;
  }

  const url = `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[whatsapp] falha ao enviar mensagem (${res.status}):`, body);
  }
}

// askAgent: (message: string) => Promise<string>
// acceptRequest: (id: string) => { ok: boolean, request?: object, error?: string }
function registerWhatsAppRoutes(app, { askAgent, acceptRequest }) {
  // Meta chama essa rota uma vez, quando você configura o webhook no painel,
  // pra confirmar que o servidor é seu.
  app.get("/webhook/whatsapp", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (WHATSAPP_VERIFY_TOKEN && mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  });

  // Mensagens recebidas chegam aqui via POST.
  app.post("/webhook/whatsapp", async (req, res) => {
    // A Meta espera uma resposta 200 rápida; processa depois de responder.
    res.sendStatus(200);

    try {
      const entry = req.body?.entry?.[0];
      const change = entry?.changes?.[0];
      const message = change?.value?.messages?.[0];
      if (!message || message.type !== "text") return;

      const from = message.from;
      const text = message.text.body.trim();

      // Prestador aceitando um pedido: "aceitar r1"
      const acceptMatch = text.match(/^aceitar\s+(\S+)/i);
      if (acceptMatch) {
        const result = acceptRequest(acceptMatch[1]);
        const reply = result.ok
          ? `Pedido ${result.request.id} aceito: ${result.request.title}`
          : `Não consegui aceitar: ${result.error}`;
        await sendWhatsAppMessage(from, reply);
        return;
      }

      // Qualquer outra mensagem vira uma pergunta pro mesmo agente do site.
      try {
        const reply = await askAgent(text);
        await sendWhatsAppMessage(from, reply);
      } catch (agentErr) {
        console.error("[whatsapp] falha ao consultar o agente:", agentErr.message);
        await sendWhatsAppMessage(from, "Não consegui consultar o agente agora. Tenta de novo em instantes.");
      }
    } catch (err) {
      console.error("[whatsapp] erro processando mensagem recebida:", err.message);
    }
  });
}

module.exports = { registerWhatsAppRoutes, isConfigured };
