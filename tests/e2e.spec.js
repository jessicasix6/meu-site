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

  test("barra de busca fixa embaixo existe e aceita texto", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.getByPlaceholder("O que você precisa?");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("manicure amanhã em BH");
    await expect(searchInput).toHaveValue("manicure amanhã em BH");
  });

  test("busca: bloqueia uma segunda busca (ex: 'Chamar agora' no ranking) enquanto a primeira está em andamento", async ({
    page,
  }) => {
    // A busca pode ser disparada por mais de um caminho — a barra fixa
    // embaixo e o botão "Chamar agora" dos cards de ranking — e os dois
    // alimentam o mesmo runSearch(). Sem uma guarda compartilhada, uma
    // busca mais antiga em voo poderia terminar depois e sobrescrever o
    // resultado de uma busca mais nova.
    let releaseFirst;
    const firstRequestReceived = new Promise((resolve) => {
      page.route("**/api/chat", async (route) => {
        const body = route.request().postDataJSON();
        if (body.message === "primeira busca") {
          resolve();
          await new Promise((r) => (releaseFirst = r));
          await route.fulfill({ json: { reply: "resposta da primeira busca" } });
        } else {
          await route.fulfill({ json: { reply: "resposta da segunda busca" } });
        }
      });
    });

    await page.goto("/");
    const bottomInput = page.getByPlaceholder("O que você precisa?");
    const bottomSubmit = page.locator("#bottom-search-form button[type=submit]");

    await bottomInput.fill("primeira busca");
    await bottomSubmit.click();
    await firstRequestReceived;

    // Enquanto a primeira busca está em voo, o campo e o botão de envio
    // da barra de baixo devem estar desabilitados.
    await expect(bottomInput).toBeDisabled();
    await expect(bottomSubmit).toBeDisabled();

    // Tenta um segundo caminho pra disparar busca mesmo assim (ex: clique
    // em "Chamar agora" já registrado antes de desabilitar) — deve ser
    // ignorado pela guarda de busca em voo.
    await page.locator(".rank-cta").first().click({ force: true });

    releaseFirst();
    await expect(page.locator(".result-answer")).toContainText("resposta da primeira busca");
    await expect(bottomInput).toBeEnabled();
    await expect(bottomSubmit).toBeEnabled();
  });

  test("top 3 carrega profissionais mock (sem depender de IA)", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator(".rank-card");
    await expect(cards).toHaveCount(3);
  });

  test("filtro 'mais perto' usa geolocalização real quando permitida", async ({ page, context }) => {
    // Ponto perto da Ana Souza (Savassi, BH) — mais perto dela que dos outros.
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: -19.925, longitude: -43.935 });

    await page.goto("/");
    await page.locator("#ranking-sort").selectOption("distance");

    await expect(page.locator("#location-hint")).toContainText("distância real");
    await expect(page.locator(".rank-name").first()).toHaveText("Ana Souza");
  });

  test("filtro 'mais perto' cai pra distância estimada se a localização for negada", async ({ page, context }) => {
    await context.clearPermissions();

    await page.goto("/");
    await page.locator("#ranking-sort").selectOption("distance");

    await expect(page.locator("#location-hint")).toContainText("distância estimada");
  });

  test("/api/ranking calcula distância real (Haversine) quando lat/lng são enviados", async ({ request }) => {
    const res = await request.get("/api/ranking?sortBy=distance&lat=-19.925&lng=-43.935");
    expect(res.status()).toBe(200);
    const { top3, usedRealLocation } = await res.json();
    expect(usedRealLocation).toBe(true);
    expect(top3[0].name).toBe("Ana Souza");
    expect(top3[0].distanceKm).toBeLessThan(1);
  });

  test("painel de benefícios mostra TeraBox em destaque e MEGA, com links pra conectar", async ({ page }) => {
    await page.goto("/");
    const featured = page.locator(".benefit-card--featured");
    await expect(featured).toContainText("TeraBox");
    await expect(page.locator(".benefit-card")).toHaveCount(2);
    for (const link of await page.locator(".benefit-connect").all()) {
      await expect(link).toHaveAttribute("href", /^https:\/\//);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", /noopener/);
    }
  });

  test('alternar para "presto um serviço" mostra pedidos em aberto', async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: /presto um serviço/i }).click();
    const requests = page.locator(".request-item");
    await expect(requests.first()).toBeVisible();
  });

  test("módulo de corridas (pilar 4.5): busca acha corrida existente pelo trajeto", async ({ page }) => {
    await page.goto("/");
    await page.locator("#ride-from").fill("Rua Bahia");
    await page.locator("#ride-to").fill("Aeroporto");
    await page.locator("#ride-form button[type=submit]").click();

    await expect(page.locator(".ride-match").first()).toContainText("Aeroporto de Confins");
    await expect(page.locator("#ride-publish-btn")).toBeVisible();
  });

  test("módulo de corridas: trajeto sem resultado mostra estado vazio e permite publicar pré-preenchido", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("#ride-from").fill("Barreiro");
    await page.locator("#ride-to").fill("Pampulha");
    await page.locator("#ride-form button[type=submit]").click();

    await expect(page.locator(".ride-empty")).toBeVisible();
    await page.locator("#ride-publish-btn").click();

    await expect(page.locator("#post-type")).toHaveValue("corrida");
    await expect(page.locator("#post-title")).toHaveValue("Barreiro → Pampulha");
  });

  test("publicar pedido com categoria livre (não só corrida/entrega/profissional)", async ({ page, request }) => {
    const res = await request.post("/api/requests", {
      data: { type: "Terreno", title: "terreno barato em Contagem", price: 50000, whatsapp: "31999990000", location: "Contagem" },
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
      data: { type: maliciousType, title: "teste de segurança", price: 10, whatsapp: "31999990000", location: "Belo Horizonte" },
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

  test("publicar pedido exige WhatsApp e localização — sem isso, quem aceitar não tem como te achar", async ({
    request,
  }) => {
    const semWhatsapp = await request.post("/api/requests", {
      data: { type: "corrida", title: "teste sem whatsapp", price: 10, location: "Belo Horizonte" },
    });
    expect(semWhatsapp.status()).toBe(400);
    expect((await semWhatsapp.json()).error).toMatch(/whatsapp/i);

    const semLocalizacao = await request.post("/api/requests", {
      data: { type: "corrida", title: "teste sem localização", price: 10, whatsapp: "31999990000" },
    });
    expect(semLocalizacao.status()).toBe(400);
    expect((await semLocalizacao.json()).error).toMatch(/localiza/i);

    const completo = await request.post("/api/requests", {
      data: { type: "corrida", title: "teste completo", price: 10, whatsapp: "31999990000", location: "Belo Horizonte" },
    });
    expect(completo.status()).toBe(201);
  });

  test("localização aparece pra quem tá navegando, WhatsApp só aparece depois de aceitar", async ({ page, request }) => {
    const created = await (
      await request.post("/api/requests", {
        data: { type: "teste", title: "pedido teste visibilidade contato", price: 10, whatsapp: "31988887777", location: "Barreiro, Belo Horizonte" },
      })
    ).json();
    const id = created.request.id;

    await page.goto("/");
    await page.getByRole("tab", { name: /presto um serviço/i }).click();
    const item = page.locator(`.request-item[data-id="${id}"]`);
    await expect(item).toContainText("Barreiro, Belo Horizonte");
    await expect(item).not.toContainText("31988887777");

    await request.post(`/api/requests/${id}/accept`, { data: { provider: "Prestador Teste" } });
    await page.reload();
    await page.getByRole("tab", { name: /presto um serviço/i }).click();
    await expect(item).toContainText("31988887777");
  });

  test("busca via agente responde de verdade (só roda com ANTHROPIC_API_KEY configurada)", async ({ page }) => {
    test.skip(!process.env.ANTHROPIC_API_KEY, "precisa de ANTHROPIC_API_KEY pra testar o agente de verdade");

    await page.goto("/");
    const searchInput = page.getByPlaceholder("O que você precisa?");
    // Fora dos serviços cadastrados e sem palavra de corrida/carona — cai no
    // texto de IA (ranking e corridas são testados à parte, sem gastar
    // chamada de IA pra isso).
    await searchInput.fill("conserto de geladeira hoje");
    await searchInput.press("Enter");

    const answer = page.locator(".result-answer");
    await expect(answer).toBeVisible({ timeout: 15000 });
    await expect(answer).not.toHaveClass(/result-answer--error/);
  });

  test("busca por serviço cadastrado mostra o ranking filtrado — sem gastar chamada de IA", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.getByPlaceholder("O que você precisa?");
    await searchInput.fill("preciso de um eletricista hoje");
    await searchInput.press("Enter");

    await expect(page.locator("#ranking-title")).toContainText("eletricista");
    const cards = page.locator(".rank-card");
    await expect(cards).toHaveCount(2);
    await expect(page.locator(".rank-service").first()).toContainText("eletricista");
    await expect(page.locator("#ranking-filter-hint")).toBeVisible();

    // Não foi pro texto de IA nem gastou uma chamada de /api/chat.
    await expect(page.locator(".result-answer")).not.toBeVisible();

    await page.locator("#ranking-clear-filter").click();
    await expect(page.locator("#ranking-title")).toHaveText("Os 3 mais bem avaliados");
    await expect(cards).toHaveCount(3);
  });

  test("busca por corrida/carona mostra o painel de corridas pré-preenchido — sem gastar chamada de IA", async ({
    page,
  }) => {
    await page.goto("/");
    const searchInput = page.getByPlaceholder("O que você precisa?");
    await searchInput.fill("corrida do Centro pra Rodoviária");
    await searchInput.press("Enter");

    await expect(page.locator("#ride-from")).toHaveValue("Centro");
    await expect(page.locator("#ride-to")).toHaveValue("Rodoviária");
    await expect(page.locator("#ride-results")).not.toBeEmpty();
    await expect(page.locator(".result-answer")).not.toBeVisible();
  });

  test("busca fora do catálogo interno aciona a busca na web (só roda com as duas chaves configuradas)", async ({ page }) => {
    test.skip(
      !process.env.ANTHROPIC_API_KEY || !process.env.BRAVE_SEARCH_API_KEY,
      "precisa de ANTHROPIC_API_KEY e BRAVE_SEARCH_API_KEY pra testar a busca na web de verdade"
    );

    await page.goto("/");
    const searchInput = page.getByPlaceholder("O que você precisa?");
    await searchInput.fill("terreno barato em Contagem");
    await searchInput.press("Enter");

    const answer = page.locator(".result-answer");
    await expect(answer).toBeVisible({ timeout: 20000 });
    await expect(answer).not.toHaveClass(/result-answer--error/);
  });

  test("publicar pedido por conversa, sem formulário (pilar 4.6 — só roda com ANTHROPIC_API_KEY)", async ({
    request,
  }) => {
    test.skip(!process.env.ANTHROPIC_API_KEY, "precisa de ANTHROPIC_API_KEY pra testar o agente de verdade");

    const before = await (await request.get("/api/requests")).json();

    const res = await request.post("/api/chat", {
      data: {
        message:
          "quero publicar uma corrida do Centro pra Rodoviária hoje às 20h, pago R$25, meu whatsapp é 31999990000, em Belo Horizonte",
      },
    });
    expect(res.status()).toBe(200);
    const { reply } = await res.json();
    expect(reply.toLowerCase()).toMatch(/public/);

    const after = await (await request.get("/api/requests")).json();
    expect(after.requests.length).toBe(before.requests.length + 1);
    expect(after.requests[0].type).toBe("corrida");
    expect(after.requests[0].price).toBe(25);
  });

  test("descrever o que precisa, sem confirmar publicação, não publica nada sozinho", async ({ request }) => {
    test.skip(!process.env.ANTHROPIC_API_KEY, "precisa de ANTHROPIC_API_KEY pra testar o agente de verdade");

    const before = await (await request.get("/api/requests")).json();

    await request.post("/api/chat", {
      data: { message: "procuro uma corrida do Barreiro pro Centro amanhã de manhã" },
    });

    const after = await (await request.get("/api/requests")).json();
    expect(after.requests.length).toBe(before.requests.length);
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
    await expect(page.getByPlaceholder("O que você precisa?")).toBeVisible();

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

test.describe("Top3Profissional - avaliação pós-serviço", () => {
  test("fluxo completo: aceitar → concluir → avaliar", async ({ page, request }) => {
    const created = await (
      await request.post("/api/requests", { data: { type: "teste", title: "pedido de teste pra avaliação", price: 10, whatsapp: "31999990000", location: "Belo Horizonte" } })
    ).json();
    const id = created.request.id;

    const accept = await request.post(`/api/requests/${id}/accept`, { data: { provider: "Prestador Teste" } });
    expect(accept.status()).toBe(200);

    const complete = await request.post(`/api/requests/${id}/complete`);
    expect(complete.status()).toBe(200);

    const rate = await request.post(`/api/requests/${id}/rate`, { data: { rating: 5, comment: "Ótimo atendimento" } });
    expect(rate.status()).toBe(200);
    const { request: rated } = await rate.json();
    expect(rated.rating).toBe(5);

    await page.goto("/");
    await page.getByRole("tab", { name: /presto um serviço/i }).click();
    const item = page.locator(`.request-item[data-id="${id}"]`);
    await expect(item.locator(".star--filled")).toHaveCount(5);
    await expect(item).toContainText("Ótimo atendimento");
  });

  test("comentário malicioso na avaliação não é injetado na página", async ({ page, request }) => {
    const created = await (
      await request.post("/api/requests", { data: { type: "teste", title: "pedido teste XSS avaliação", price: 10, whatsapp: "31999990000", location: "Belo Horizonte" } })
    ).json();
    const id = created.request.id;
    await request.post(`/api/requests/${id}/accept`, { data: { provider: "P" } });
    await request.post(`/api/requests/${id}/complete`);
    await request.post(`/api/requests/${id}/rate`, { data: { rating: 3, comment: "<img src=x onerror=alert(1)>" } });

    const alerts = [];
    page.on("dialog", (d) => {
      alerts.push(d.message());
      d.dismiss();
    });

    await page.goto("/");
    await page.getByRole("tab", { name: /presto um serviço/i }).click();
    const html = await page.locator("#requests-list").innerHTML();
    expect(html).not.toContain("<img");
    expect(alerts).toEqual([]);
  });

  test("validações: não dá pra concluir sem aceitar, nem avaliar fora do intervalo, nem avaliar duas vezes", async ({
    request,
  }) => {
    const created = await (
      await request.post("/api/requests", { data: { type: "teste", title: "pedido validação", price: 10, whatsapp: "31999990000", location: "Belo Horizonte" } })
    ).json();
    const id = created.request.id;

    const completeTooEarly = await request.post(`/api/requests/${id}/complete`);
    expect(completeTooEarly.status()).toBe(409);

    await request.post(`/api/requests/${id}/accept`, { data: { provider: "P" } });
    const rateTooEarly = await request.post(`/api/requests/${id}/rate`, { data: { rating: 5 } });
    expect(rateTooEarly.status()).toBe(409);

    await request.post(`/api/requests/${id}/complete`);
    const badRating = await request.post(`/api/requests/${id}/rate`, { data: { rating: 6 } });
    expect(badRating.status()).toBe(400);

    const goodRating = await request.post(`/api/requests/${id}/rate`, { data: { rating: 4 } });
    expect(goodRating.status()).toBe(200);

    const doubleRate = await request.post(`/api/requests/${id}/rate`, { data: { rating: 2 } });
    expect(doubleRate.status()).toBe(409);
  });

  test("mensagem de erro ao tentar aceitar reflete o status real do pedido (aceito vs. concluído)", async ({
    request,
  }) => {
    const created = await (
      await request.post("/api/requests", { data: { type: "teste", title: "pedido mensagem de erro", price: 10, whatsapp: "31999990000", location: "Belo Horizonte" } })
    ).json();
    const id = created.request.id;

    await request.post(`/api/requests/${id}/accept`, { data: { provider: "P" } });
    const acceptAgain = await request.post(`/api/requests/${id}/accept`, { data: { provider: "Q" } });
    expect((await acceptAgain.json()).error).toContain("já foi aceito");

    await request.post(`/api/requests/${id}/complete`);
    const acceptAfterComplete = await request.post(`/api/requests/${id}/accept`, { data: { provider: "Q" } });
    expect((await acceptAfterComplete.json()).error).toContain("já foi concluído");
  });

  test("webhook do WhatsApp rejeita nota de dois dígitos em vez de truncar (ex: '10' virando '1')", async ({
    request,
  }) => {
    const created = await (
      await request.post("/api/requests", { data: { type: "teste", title: "pedido teste whatsapp", price: 10, whatsapp: "31999990000", location: "Belo Horizonte" } })
    ).json();
    const id = created.request.id;
    await request.post(`/api/requests/${id}/accept`, { data: { provider: "P" } });
    await request.post(`/api/requests/${id}/complete`);

    const webhookPayload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { type: "text", from: "5511999999999", text: { body: `avaliar ${id} 10 nota de dez` } },
                ],
              },
            },
          ],
        },
      ],
    };
    const webhookRes = await request.post("/webhook/whatsapp", { data: webhookPayload });
    expect(webhookRes.status()).toBe(200); // sempre 200 pra Meta, mesmo se a mensagem for rejeitada

    // Dá um tempinho pro processamento assíncrono do webhook terminar.
    await new Promise((r) => setTimeout(r, 300));

    const { requests } = await (await request.get("/api/requests")).json();
    const updated = requests.find((r) => r.id === id);
    expect(updated.rating).toBeUndefined(); // não deve ter sido avaliado com "1" por engano
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

test.describe("Top3Profissional - PWA", () => {
  test("manifest.json é válido e referencia ícones que existem de verdade", async ({ request }) => {
    const res = await request.get("/manifest.json");
    expect(res.status()).toBe(200);
    const manifest = await res.json();
    expect(manifest.name).toBe("Top3Profissional");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThan(0);

    for (const icon of manifest.icons) {
      const iconRes = await request.get(icon.src);
      expect(iconRes.status(), `ícone ${icon.src} deveria existir`).toBe(200);
    }
  });

  test("service worker registra e cacheia o esqueleto do app, sem cachear /api/ ou /health", async ({ page }) => {
    await page.goto("/");
    // "ready" só resolve depois do ciclo completo install→activate (e o
    // cache.addAll() do install roda dentro de um waitUntil, que bloqueia
    // essa transição) — diferente de só checar getRegistrations().length,
    // que pode voltar true antes do cache.addAll() terminar de verdade.
    await page.evaluate(() => navigator.serviceWorker.ready);

    const cachedPaths = await page.evaluate(async () => {
      const cache = await caches.open("top3-shell-v1");
      const keys = await cache.keys();
      return keys.map((k) => new URL(k.url).pathname);
    });

    expect(cachedPaths).toContain("/assets/style.css");
    expect(cachedPaths).toContain("/assets/app.js");
    expect(cachedPaths.some((p) => p.startsWith("/api/"))).toBe(false);
    expect(cachedPaths).not.toContain("/health");
  });
});
