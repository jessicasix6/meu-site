const { test, expect } = require("@playwright/test");

test.describe("Top3Profissional - fluxo básico", () => {
  test("carrega a página sem erros de console", async ({ page }) => {
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/");
    await expect(page).toHaveTitle(/Top3Profissional/);
    expect(consoleErrors).toEqual([]);
  });

  test("barra de busca principal existe e aceita texto", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.getByLabel("Pesquisar profissional");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("manicure amanhã em BH");
    await expect(searchInput).toHaveValue("manicure amanhã em BH");
  });

  test("top 3 carrega profissionais mock (sem depender de IA)", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator(".rank-card");
    await expect(cards).toHaveCount(3);
  });

  test('alternar para "presto um serviço" mostra pedidos em aberto', async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: /presto um serviço/i }).click();
    const requests = page.locator(".request-item");
    await expect(requests.first()).toBeVisible();
  });

  test("busca via agente responde de verdade (só roda com ANTHROPIC_API_KEY configurada)", async ({ page }) => {
    test.skip(!process.env.ANTHROPIC_API_KEY, "precisa de ANTHROPIC_API_KEY pra testar o agente de verdade");

    await page.goto("/");
    const searchInput = page.getByLabel("Pesquisar profissional");
    await searchInput.fill("manicure amanhã em BH");
    await searchInput.press("Enter");

    const answer = page.locator(".result-answer");
    await expect(answer).toBeVisible({ timeout: 15000 });
    await expect(answer).not.toHaveClass(/result-answer--error/);
  });
});

test.describe("Top3Profissional - mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("funciona em viewport mobile: menu, busca e alternância de modo", async ({ page }) => {
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/");
    await expect(page.getByLabel("Pesquisar profissional")).toBeVisible();

    await page.getByRole("tab", { name: /presto um serviço/i }).click();
    await expect(page.locator(".request-item").first()).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });
});

test.describe("Top3Profissional - segurança básica", () => {
  test("nenhum segredo (chave da API) aparece no HTML/JS/CSS servido", async ({ page, request }) => {
    const paths = ["/", "/assets/app.js", "/assets/style.css"];
    const secretPattern = /sk-ant-[a-zA-Z0-9_-]+/;

    for (const path of paths) {
      const res = await request.get(path);
      const body = await res.text();
      expect(body, `segredo encontrado em ${path}`).not.toMatch(secretPattern);
      expect(body, `variável ANTHROPIC_API_KEY vazou em ${path}`).not.toContain("ANTHROPIC_API_KEY");
      if (process.env.WHATSAPP_ACCESS_TOKEN) {
        expect(body, `token do WhatsApp vazou em ${path}`).not.toContain(process.env.WHATSAPP_ACCESS_TOKEN);
      }
      if (process.env.SUPABASE_SECRET_KEY) {
        expect(body, `chave secreta do Supabase vazou em ${path}`).not.toContain(process.env.SUPABASE_SECRET_KEY);
      }
      if (process.env.WORKER_TOKEN) {
        expect(body, `WORKER_TOKEN vazou em ${path}`).not.toContain(process.env.WORKER_TOKEN);
      }
    }
  });
});

test.describe("Top3Profissional - infra", () => {
  test("/health responde 200 (usado pelo host pra saber se o processo está de pé)", async ({ request }) => {
    const res = await request.get("/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("/internal/db recusa requisição sem o WORKER_TOKEN certo", async ({ request }) => {
    const res = await request.post("/internal/db", {
      headers: { Authorization: "Bearer token-errado" },
      data: { method: "GET", path: "/rest/v1/tasks?select=id&limit=1" },
    });
    expect(res.status()).toBe(401);
  });

  test("/internal/db aceita o WORKER_TOKEN certo (só roda se configurado)", async ({ request }) => {
    test.skip(!process.env.WORKER_TOKEN, "precisa de WORKER_TOKEN pra testar o proxy de verdade");
    const res = await request.post("/internal/db", {
      headers: { Authorization: `Bearer ${process.env.WORKER_TOKEN}` },
      data: { method: "GET", path: "/rest/v1/tasks?select=id&limit=1" },
    });
    expect(res.status()).toBe(200);
  });
});
