// Portão de acesso ao Supabase pro worker do TOP3 (Passo 12).
//
// Por quê existe: o worker roda como agente na nuvem (rotina agendada do
// Claude Code), que não tem acesso a arquivos/variáveis locais — não dá
// pra colocar a chave secreta do Supabase direto no prompt da rotina
// (ficaria salva em texto puro na configuração dela). Em vez disso, o
// worker fala com esse endpoint, autenticado só com o WORKER_TOKEN
// (um segredo pequeno e específico, criado só pra isso) — e é este
// servidor, que já guarda a chave do Supabase com segurança, quem de
// fato conversa com o banco.
//
// WORKER_TOKEN precisa estar definido tanto aqui (.env local / Railway)
// quanto embutido no prompt da rotina agendada na nuvem.

const WORKER_TOKEN = process.env.WORKER_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

function isConfigured() {
  return Boolean(WORKER_TOKEN && SUPABASE_URL && SUPABASE_SECRET_KEY);
}

function registerWorkerRoutes(app) {
  app.post("/internal/db", async (req, res) => {
    // Autenticação primeiro, sempre — mesmo se WORKER_TOKEN não estiver
    // definido neste ambiente, nenhum header enviado bate com
    // "Bearer undefined", então isso ainda nega corretamente (401), em vez
    // de vazar "está configurado ou não" pra quem não está autenticado.
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${WORKER_TOKEN}`) {
      return res.status(401).json({ error: "não autorizado" });
    }

    if (!isConfigured()) {
      return res.status(503).json({ error: "worker API não configurada neste ambiente" });
    }

    const { method, path, body } = req.body || {};
    if (!method || !path || typeof path !== "string" || !path.startsWith("/rest/v1/")) {
      return res.status(400).json({ error: "requisição inválida (method e path/rest/v1/... são obrigatórios)" });
    }
    if (!["GET", "POST", "PATCH", "DELETE"].includes(method)) {
      return res.status(400).json({ error: "method inválido" });
    }

    try {
      const upstreamHeaders = {
        apikey: SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        "Content-Type": "application/json",
      };
      if (method !== "GET") {
        upstreamHeaders.Prefer = "return=representation";
      }

      const upstream = await fetch(`${SUPABASE_URL}${path}`, {
        method,
        headers: upstreamHeaders,
        body: method === "GET" ? undefined : JSON.stringify(body || {}),
      });

      const text = await upstream.text();
      res.status(upstream.status);
      res.type("application/json");
      res.send(text);
    } catch (err) {
      console.error("[worker-api] falha ao encaminhar pro Supabase:", err.message);
      res.status(502).json({ error: "falha ao falar com o banco" });
    }
  });
}

module.exports = { registerWorkerRoutes, isConfigured };
