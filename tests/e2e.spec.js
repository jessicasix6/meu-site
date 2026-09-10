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

  test("publicar pedido com categoria livre (não só corrida/entrega/profissional)", async ({ page, request }) => {
    const res = await request.post("/api/requests", {
      data: { type: "Terreno", title: "terreno barato em Contagem", price: 50000 },
    });
    expect(res.status()).toBe(201);
    const { request: created } = await res.json();
    expect(created.type).toBe("terreno");

    await page.goto("/");
    await page.getByRole("tab", { name: /presto um serviço/i }).click();
    await expect(page.locator(".request-badge", { hasText: "terreno" }).first()).toBeVisible();
  });

  test("categoria com HTML/script não é injetada na página (sanitização de classe CSS)", async ({ page, request }) => {
    const maliciousType = '"><img src=x onerror=alert(1)>';
    const res = await request.post("/api/requests", {
      data: { type: maliciousType, title: "teste de segurança", price: 10 },
    });
    expect(res.status()).toBe(201);

    const alerts = [];
    page.on("dialog", (dialog) => {
      alerts.push(dialog.message());
      dialog.dismiss();
    });

    await page.goto("/");
    await page.getByRole("tab", { name: /presto um serviço/i }).click();
    await expect(page.locator(".request-item").first()).toBeVisible();

    const html = await page.locator("#requests-list").innerHTML();
    expect(html).not.toContain("<img");
    expect(alerts).toEqual([]);
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

  test("busca fora do catálogo interno aciona a busca na web (só roda com as duas chaves configuradas)", async ({ page }) => {
    test.skip(
      !process.env.ANTHROPIC_API_KEY || !process.env.BRAVE_SEARCH_API_KEY,
      "precisa de ANTHROPIC_API_KEY e BRAVE_SEARCH_API_KEY pra testar a busca na web de verdade"
    );

    await page.goto("/");
    const searchInput = page.getByLabel("Pesquisar profissional");
    await searchInput.fill("terreno barato em Contagem");
    await searchInput.press("Enter");

    const answer = page.locator(".result-answer");
    await expect(answer).toBeVisible({ timeout: 20000 });
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
      if (process.env.BRAVE_SEARCH_API_KEY) {
        expect(body, `chave da Brave Search vazou em ${path}`).not.toContain(process.env.BRAVE_SEARCH_API_KEY);
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
});
