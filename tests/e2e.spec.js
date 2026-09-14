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
    const searchInput = page.getByPlaceholder("Descreva o que você gostaria de solicitar...");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("manicure amanhã em BH");
    await expect(searchInput).toHaveValue("manicure amanhã em BH");
  });

  test("exemplos clicáveis no hero preenchem e disparam a busca (mesma barra, sem formulário novo)", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.getByPlaceholder("Descreva o que você gostaria de solicitar...");
    // "eletricista hoje" é um serviço cadastrado — clicar no exemplo deve
    // rotear pro ranking, igual uma busca digitada à mão faria.
    await page.locator('.example-chip[data-example="eletricista hoje"]').click();
    await expect(page.locator("#top3")).toBeInViewport();
    await expect(searchInput).toHaveValue("");
  });

  test("placeholder da busca muda conforme o modo ('Solicito serviço' vs 'Presto serviço')", async ({ page }) => {
    await page.goto("/");
    // Locator por id (não por placeholder) porque é exatamente o atributo
    // que este teste está conferindo mudar.
    const searchInput = page.locator("#bottom-search-input");
    await expect(searchInput).toHaveAttribute("placeholder", "Descreva o que você gostaria de solicitar...");

    await page.locator('.mode-btn[data-mode="provider"]').click();
    await expect(searchInput).toHaveAttribute("placeholder", /Solicito serviço/);

    await page.locator('.mode-btn[data-mode="requester"]').click();
    await expect(searchInput).toHaveAttribute("placeholder", "Descreva o que você gostaria de solicitar...");
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
    const bottomInput = page.getByPlaceholder("Descreva o que você gostaria de solicitar...");
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

  test("painel de benefícios mostra TeraBox em destaque, MEGA, Canva e Recibo Gratuito, com links pra conectar", async ({ page }) => {
    await page.goto("/");
    const featured = page.locator(".benefit-card--featured");
    await expect(featured).toContainText("TeraBox");
    await expect(page.locator(".benefit-card")).toHaveCount(4);
    await expect(page.locator(".benefit-card")).toContainText(["TeraBox", "MEGA", "Canva", "Recibo Gratuito"]);
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

  test("módulo de corridas: alternar pra 'Entrega' acha pedido de entrega existente (não corrida)", async ({ page }) => {
    await page.goto("/");
    await page.locator('.ride-type-btn[data-ride-type="entrega"]').click();
    await page.locator("#ride-from").fill("Farmácia Popular");
    await page.locator("#ride-to").fill("Ipês");
    await page.locator("#ride-form button[type=submit]").click();

    await expect(page.locator(".ride-match").first()).toContainText("Farmácia Popular");
    await page.locator("#ride-publish-btn").click();
    // Publicar a partir do modo "Entrega" tem que preencher o tipo certo,
    // não sempre "corrida" (achado ao expandir o pilar 4.5 pra cobrir
    // farmácia/comércio postando entregador, não só corrida de passageiro).
    await expect(page.locator("#post-type")).toHaveValue("entrega");
  });

  test("módulo de corridas: 'Entrega' não mistura resultado de 'Corrida' pro mesmo trajeto", async ({ page }) => {
    await page.goto("/");
    await page.locator('.ride-type-btn[data-ride-type="entrega"]').click();
    await page.locator("#ride-from").fill("Rua Bahia");
    await page.locator("#ride-to").fill("Aeroporto");
    await page.locator("#ride-form button[type=submit]").click();

    // "Rua Bahia → Aeroporto de Confins" é tipo "corrida" no mock — buscando
    // no modo "Entrega" não deve encontrar esse resultado.
    await expect(page.locator(".ride-empty")).toBeVisible();
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
    const searchInput = page.getByPlaceholder("Descreva o que você gostaria de solicitar...");
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
    const searchInput = page.getByPlaceholder("Descreva o que você gostaria de solicitar...");
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
    const searchInput = page.getByPlaceholder("Descreva o que você gostaria de solicitar...");
    await searchInput.fill("corrida do Centro pra Rodoviária");
    await searchInput.press("Enter");

    await expect(page.locator("#ride-from")).toHaveValue("Centro");
    await expect(page.locator("#ride-to")).toHaveValue("Rodoviária");
    await expect(page.locator("#ride-results")).not.toBeEmpty();
    await expect(page.locator(".result-answer")).not.toBeVisible();
  });

  test("busca fora do catálogo interno aciona a busca na web (só roda com Anthropic + SearXNG/Brave configurados)", async ({ page }) => {
    test.skip(
      !process.env.ANTHROPIC_API_KEY || !(process.env.SEARXNG_URL || process.env.BRAVE_SEARCH_API_KEY),
      "precisa de ANTHROPIC_API_KEY e (SEARXNG_URL ou BRAVE_SEARCH_API_KEY) pra testar a busca na web de verdade"
    );

    await page.goto("/");
    const searchInput = page.getByPlaceholder("Descreva o que você gostaria de solicitar...");
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
    await expect(page.getByPlaceholder("Descreva o que você gostaria de solicitar...")).toBeVisible();

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

test.describe("Top3Profissional - perfil profissional (pilar 4.12)", () => {
  test("cria perfil com foto, gera link compartilhável e a página pública carrega", async ({ request }) => {
    const res = await request.post("/api/providers", {
      multipart: {
        name: "Juliana Martins",
        service: "manicure",
        description: "faço unha há 5 anos, atendo em casa e a domicílio",
        location: "Savassi, Belo Horizonte",
        whatsapp: "31999990000",
        photos: {
          name: "foto.png",
          mimeType: "image/png",
          buffer: require("fs").readFileSync("assets/icons/icon-192.png"),
        },
      },
    });
    expect(res.status()).toBe(201);
    const { provider } = await res.json();
    expect(provider.slug).toMatch(/^juliana-martins-/);
    expect(provider.photos.length).toBe(1);

    const page = await request.get(`/prestador/${provider.slug}`);
    expect(page.status()).toBe(200);
    const html = await page.text();
    expect(html).toContain("Juliana Martins");
    expect(html).toContain("Chamar no WhatsApp");
  });

  test("troca de fundo é opcional — só roda se a pessoa marcar a caixinha, nunca sozinha", async ({ request }) => {
    const semMarcar = await request.post("/api/providers", {
      multipart: {
        name: "Sem Troca De Fundo",
        service: "eletricista",
        description: "não marquei a opção de trocar o fundo",
        location: "Belo Horizonte",
        whatsapp: "31999990000",
        photos: { name: "foto.png", mimeType: "image/png", buffer: require("fs").readFileSync("assets/icons/icon-192.png") },
      },
    });
    expect(semMarcar.status()).toBe(201);
    const { provider: providerSemFundo } = await semMarcar.json();
    expect(providerSemFundo.photos[0].newBackgroundUrl).toBeNull();
  });

  test("troca de fundo (opcional) gera uma foto nova e vira a capa da página pública", async ({ request }) => {
    const res = await request.post("/api/providers", {
      multipart: {
        name: "Com Troca De Fundo",
        service: "eletricista",
        description: "marquei a opção de trocar o fundo",
        location: "Belo Horizonte",
        whatsapp: "31999990000",
        newBackground: "true",
        photos: { name: "foto.png", mimeType: "image/png", buffer: require("fs").readFileSync("assets/icons/icon-192.png") },
      },
    });
    expect(res.status()).toBe(201);
    const { provider } = await res.json();
    const photo = provider.photos[0];
    expect(photo.newBackgroundUrl).toMatch(/-fundo-novo\.png$/);

    const photoRes = await request.get(photo.newBackgroundUrl);
    expect(photoRes.status()).toBe(200);
    expect(photoRes.headers()["content-type"]).toBe("image/png");

    const page = await request.get(`/prestador/${provider.slug}`);
    const html = await page.text();
    expect(html).toContain(photo.newBackgroundUrl);
  });

  test("validações: exige nome, serviço, descrição, localização, WhatsApp e pelo menos uma foto", async ({
    request,
  }) => {
    const semFoto = await request.post("/api/providers", {
      multipart: {
        name: "Teste",
        service: "eletricista",
        description: "conserto qualquer instalação elétrica",
        location: "Belo Horizonte",
        whatsapp: "31999990000",
      },
    });
    expect(semFoto.status()).toBe(400);
    expect((await semFoto.json()).error).toMatch(/foto/i);

    const semNome = await request.post("/api/providers", {
      multipart: {
        name: "",
        service: "eletricista",
        description: "conserto qualquer instalação elétrica",
        location: "Belo Horizonte",
        whatsapp: "31999990000",
        photos: { name: "foto.png", mimeType: "image/png", buffer: require("fs").readFileSync("assets/icons/icon-192.png") },
      },
    });
    expect(semNome.status()).toBe(400);
  });

  test("foto maior que o limite retorna erro claro em JSON, não uma página HTML de erro", async ({ request }) => {
    const tooBig = Buffer.alloc(9 * 1024 * 1024); // acima do limite de 8MB
    const res = await request.post("/api/providers", {
      multipart: {
        name: "Teste",
        service: "eletricista",
        description: "conserto qualquer instalação elétrica",
        location: "Belo Horizonte",
        whatsapp: "31999990000",
        photos: { name: "foto-grande.png", mimeType: "image/png", buffer: tooBig },
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/8MB/i);
  });

  test("arquivo que não é imagem de verdade é rejeitado, mesmo declarando Content-Type de imagem", async ({
    request,
  }) => {
    // O cliente pode mentir o mimetype no multipart — o servidor precisa
    // conferir a assinatura binária real do arquivo, não só confiar nesse
    // cabeçalho (achado do CodeRabbit no PR #43).
    const fakeImage = Buffer.from("<script>alert(1)</script>");
    const res = await request.post("/api/providers", {
      multipart: {
        name: "Teste",
        service: "eletricista",
        description: "conserto qualquer instalação elétrica",
        location: "Belo Horizonte",
        whatsapp: "31999990000",
        photos: { name: "nao-e-foto.png", mimeType: "image/png", buffer: fakeImage },
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/imagem/i);
  });

  test("nome/bio maliciosos não são injetados na página pública (XSS)", async ({ request }) => {
    const maliciousName = '<img src=x onerror=alert(1)>';
    const res = await request.post("/api/providers", {
      multipart: {
        name: maliciousName,
        service: "encanador",
        description: "conserto vazamento e instalação hidráulica",
        location: "Belo Horizonte",
        whatsapp: "31999990000",
        photos: { name: "foto.png", mimeType: "image/png", buffer: require("fs").readFileSync("assets/icons/icon-192.png") },
      },
    });
    expect(res.status()).toBe(201);
    const { provider } = await res.json();

    const page = await request.get(`/prestador/${provider.slug}`);
    const html = await page.text();
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img");
  });

  test("formulário 'Criar meu perfil' funciona pelo site: sobe foto, mostra o link no final", async ({ page }) => {
    await page.goto("/");
    await page.locator("#criar-perfil #provider-name").fill("Beatriz Alves");
    await page.locator("#provider-service").fill("cabeleireiro");
    await page.locator("#provider-location").fill("São Paulo");
    await page.locator("#provider-whatsapp").fill("11999990000");
    await page.locator("#provider-description").fill("corte e coloração, atendo no meu salão em casa");
    await page.locator("#provider-photos").setInputFiles("assets/icons/icon-192.png");
    await page.locator("#provider-form button[type=submit]").click();

    await expect(page.locator("#provider-status")).toHaveText("Perfil criado!");
    await expect(page.locator("#provider-result")).toBeVisible();
    await expect(page.locator("#provider-result a")).toHaveAttribute("href", /\/prestador\//);
  });

  test("busca por 'criar meu perfil' rola até a seção certa, sem gastar chamada de IA", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.getByPlaceholder("Descreva o que você gostaria de solicitar...");
    await searchInput.fill("quero criar meu perfil profissional");
    await searchInput.press("Enter");

    await expect(page.locator("#provider-name")).toBeFocused();
    await expect(page.locator(".result-answer")).not.toBeVisible();
  });

  test("perfil criado pela pessoa aparece no ranking de busca, com selo 'novo' e link pra própria página", async ({
    page,
    request,
  }) => {
    // Serviço com sufixo aleatório: exclusivo desse teste, nunca colide com
    // os 4 mock nem com "eletricista"/"manicure" usados em outros testes,
    // e sobrevive até a uma nova tentativa automática do próprio Playwright
    // sem acumular cards de execuções anteriores no mesmo processo.
    const uniqueService = `jardinagem-teste-${Math.random().toString(36).slice(2, 8)}`;
    const res = await request.post("/api/providers", {
      multipart: {
        name: "Perfil Ranking Teste",
        service: uniqueService,
        description: "cuido de jardim e paisagismo",
        location: "Belo Horizonte",
        whatsapp: "31999990000",
        photos: { name: "foto.png", mimeType: "image/png", buffer: require("fs").readFileSync("assets/icons/icon-192.png") },
      },
    });
    const { provider } = await res.json();

    const servicesResponse = page.waitForResponse((r) => r.url().includes("/api/services"));
    await page.goto("/");
    await servicesResponse; // espera o front-end aprender sobre o serviço novo antes de buscar

    const searchInput = page.getByPlaceholder("Descreva o que você gostaria de solicitar...");
    await searchInput.fill(`preciso de ${uniqueService} hoje`);
    await searchInput.press("Enter");

    const cards = page.locator(".rank-card");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("Perfil Ranking Teste");
    await expect(cards.first().locator(".chip--new")).toHaveText("novo");
    await expect(cards.first().locator(".rank-cta")).toHaveAttribute("href", `/prestador/${provider.slug}`);
  });
});

test.describe("Top3Profissional - sinal de demanda não publicada (pilar 4.2)", () => {
  // Cidade única por teste pra nunca colidir com o sinal gerado por outros
  // testes deste arquivo que também buscam "terreno"/"carro" — DEMAND_SIGNALS
  // é um estado global compartilhado por toda a suíte. Só letras (sem
  // dígitos) porque extractDemandLocation() no servidor só captura letras —
  // um sufixo numérico seria cortado fora do texto extraído.
  function randomCitySuffix() {
    const letters = "abcdefghijklmnopqrstuvwxyz";
    let s = "";
    for (let i = 0; i < 10; i++) s += letters[Math.floor(Math.random() * letters.length)];
    return s;
  }

  test("duas buscas pela mesma categoria/região viram um sinal agregado", async ({ request }) => {
    const uniqueCity = `Testopolis${randomCitySuffix()}`;
    await request.post("/api/chat", { data: { message: `terreno barato em ${uniqueCity}` } });
    await request.post("/api/chat", { data: { message: `procurando um terreno em ${uniqueCity}` } });

    const { signals } = await (await request.get("/api/demand-signals")).json();
    const match = signals.find((s) => s.location === uniqueCity);
    expect(match).toBeTruthy();
    expect(match.category).toBe("terreno");
    expect(match.count).toBe(2);
  });

  test("uma única busca não vira sinal público (mínimo de 2 antes de aparecer)", async ({ request }) => {
    const uniqueCity = `Solopolis${randomCitySuffix()}`;
    await request.post("/api/chat", { data: { message: `terreno em ${uniqueCity}` } });

    const { signals } = await (await request.get("/api/demand-signals")).json();
    expect(signals.find((s) => s.location === uniqueCity)).toBeUndefined();
  });

  test("'quero chamar X' (contato com prestador já existente) nunca conta como demanda", async ({ request }) => {
    const uniqueCity = `Naolopolis${randomCitySuffix()}`;
    await request.post("/api/chat", { data: { message: `quero chamar terreno em ${uniqueCity}` } });
    await request.post("/api/chat", { data: { message: `quero chamar terreno em ${uniqueCity}` } });

    const { signals } = await (await request.get("/api/demand-signals")).json();
    expect(signals.find((s) => s.location === uniqueCity)).toBeUndefined();
  });

  test("seção de demanda aparece no modo 'Presto serviço' quando há sinal suficiente", async ({ page, request }) => {
    const uniqueCity = `Verlandia${randomCitySuffix()}`;
    await request.post("/api/chat", { data: { message: `procurando carro em ${uniqueCity}` } });
    await request.post("/api/chat", { data: { message: `quero um carro usado em ${uniqueCity}` } });

    await page.goto("/");
    await page.locator('.mode-btn[data-mode="provider"]').click();
    await expect(page.locator("#demand-signals-list")).toContainText(uniqueCity);
    await expect(page.locator("#demand-signals")).toBeVisible();
  });
});

test.describe("Top3Profissional - grupos de economia (pilar 4.14)", () => {
  // Título único por teste — GROUP_OPPORTUNITIES é estado global
  // compartilhado por toda a suíte, igual DEMAND_SIGNALS.
  function uniqueTitle(prefix) {
    return `${prefix} ${Math.random().toString(36).slice(2, 10)}`;
  }

  test("categoria fora do escopo v1 é rejeitada", async ({ request }) => {
    const res = await request.post("/api/groups", {
      data: { category: "criptomoeda", title: uniqueTitle("Fora do escopo"), city: "BH", targetMembers: 3, whatsapp: "31900000001" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/categoria inválida/);
  });

  test("categoria 'assinatura' (task-001) funciona igual as outras, sem engine especial, e mostra o aviso fixo na tela", async ({
    page,
    request,
  }) => {
    const title = uniqueTitle("Netflix Premium");
    const create = await request.post("/api/groups", {
      data: { category: "assinatura", title, city: "BH", targetMembers: 2, estimatedIndividualPrice: 11, whatsapp: "31900000090" },
    });
    expect(create.status()).toBe(201);
    const group = await create.json();
    expect(group.category).toBe("assinatura");

    await page.goto("/#grupos");
    const card = page.locator(".group-card", { hasText: title });
    await expect(card).toContainText("O TOP3 só ajuda vocês a se encontrarem");
    await expect(card).toContainText("assinante extra da Netflix");
  });

  test("aviso fixo de assinatura não aparece em grupos de outras categorias", async ({ page, request }) => {
    const title = uniqueTitle("Frete sem aviso");
    await request.post("/api/groups", {
      data: { category: "frete", title, city: "BH", targetMembers: 2, whatsapp: "31900000091" },
    });
    await page.goto("/#grupos");
    const card = page.locator(".group-card", { hasText: title });
    await expect(card).not.toContainText("O TOP3 só ajuda vocês a se encontrarem");
  });

  test("criar grupo, entrar até completar, e o contato de todo mundo só aparece quando completo", async ({ request }) => {
    const title = uniqueTitle("Lavagem de caixa d'água");
    const create = await request.post("/api/groups", {
      data: { category: "servico", title, city: "Centro, BH", targetMembers: 3, estimatedIndividualPrice: 55, whatsapp: "31900000010", name: "Ana" },
    });
    expect(create.status()).toBe(201);
    const group = await create.json();
    expect(group.currentMembers).toBe(1);
    expect(group.status).toBe("aberto");

    // Enquanto aberto, só o contato de quem criou aparece no detalhe.
    const detailOpen = await (await request.get(`/api/groups/${group.id}`)).json();
    expect(detailOpen.members).toHaveLength(1);
    expect(detailOpen.members[0].whatsapp).toBe("31900000010");

    await request.post(`/api/groups/${group.id}/join`, { data: { whatsapp: "31900000011", name: "Bia" } });
    const complete = await request.post(`/api/groups/${group.id}/join`, { data: { whatsapp: "31900000012", name: "Caio" } });
    expect((await complete.json()).status).toBe("completo");

    const detailComplete = await (await request.get(`/api/groups/${group.id}`)).json();
    expect(detailComplete.members).toHaveLength(3);
    expect(detailComplete.members.map((m) => m.whatsapp).sort()).toEqual(["31900000010", "31900000011", "31900000012"].sort());
  });

  test("mesmo WhatsApp não entra duas vezes no mesmo grupo", async ({ request }) => {
    const create = await request.post("/api/groups", {
      data: { category: "compra", title: uniqueTitle("Compra coletiva"), city: "BH", targetMembers: 5, whatsapp: "31900000020" },
    });
    const group = await create.json();
    const dup = await request.post(`/api/groups/${group.id}/join`, { data: { whatsapp: "31900000020" } });
    expect(dup.status()).toBe(409);
  });

  test("não dá pra entrar num grupo já completo", async ({ request }) => {
    const create = await request.post("/api/groups", {
      data: { category: "curso", title: uniqueTitle("Curso"), city: "BH", targetMembers: 2, whatsapp: "31900000030" },
    });
    const group = await create.json();
    await request.post(`/api/groups/${group.id}/join`, { data: { whatsapp: "31900000031" } });
    const tooLate = await request.post(`/api/groups/${group.id}/join`, { data: { whatsapp: "31900000032" } });
    expect(tooLate.status()).toBe(409);
  });

  test("sair antes de fechar libera a vaga; grupo que esvazia vira 'encerrado' e some da listagem", async ({ request }) => {
    const title = uniqueTitle("Frete compartilhado");
    const create = await request.post("/api/groups", {
      data: { category: "frete", title, city: "BH", targetMembers: 3, whatsapp: "31900000040" },
    });
    const group = await create.json();

    const leave = await request.post(`/api/groups/${group.id}/leave`, { data: { whatsapp: "31900000040" } });
    const leftGroup = await leave.json();
    expect(leftGroup.currentMembers).toBe(0);
    expect(leftGroup.status).toBe("encerrado");

    const list = await (await request.get("/api/groups")).json();
    expect(list.groups.find((g) => g.id === group.id)).toBeUndefined();
  });

  test("não dá pra sair de um grupo já completo", async ({ request }) => {
    const create = await request.post("/api/groups", {
      data: { category: "viagem", title: uniqueTitle("Viagem"), city: "BH", targetMembers: 2, whatsapp: "31900000050" },
    });
    const group = await create.json();
    await request.post(`/api/groups/${group.id}/join`, { data: { whatsapp: "31900000051" } });
    const leave = await request.post(`/api/groups/${group.id}/leave`, { data: { whatsapp: "31900000050" } });
    expect(leave.status()).toBe(409);
  });

  test("filtro por categoria só devolve grupos daquela categoria", async ({ request }) => {
    const freteTitle = uniqueTitle("Frete filtro");
    await request.post("/api/groups", { data: { category: "frete", title: freteTitle, city: "BH", targetMembers: 4, whatsapp: "31900000060" } });
    const list = await (await request.get("/api/groups?category=frete")).json();
    expect(list.groups.every((g) => g.category === "frete")).toBe(true);
    expect(list.groups.some((g) => g.title === freteTitle)).toBe(true);
  });

  test("fluxo completo pela interface: criar grupo, aparece na lista, participar até completar", async ({ page }) => {
    const title = uniqueTitle("Lavagem de caixa d'água");
    await page.goto("/#grupos");

    await page.locator("#group-create-toggle").click();
    await page.locator("#group-title").fill(title);
    await page.locator("#group-category").selectOption("servico");
    await page.locator("#group-city").fill("Centro, BH");
    await page.locator("#group-target").fill("2");
    await page.locator("#group-whatsapp").fill("31900000070");
    await page.locator("#group-form button[type=submit]").click();

    await expect(page.locator("#group-status")).toHaveText("Grupo criado!");
    const card = page.locator(".group-card", { hasText: title });
    await expect(card).toContainText("1 de 2 vagas ocupadas");

    await card.locator(".group-join-btn").click();
    await card.locator('input[name="whatsapp"]').fill("31900000071");
    await card.locator('.group-action-form button[type=submit]').click();

    await expect(card).toContainText("Completo ✓");
  });

  test("ownerUserId (dono do grupo pro painel pessoal) nunca aparece em resposta pública", async ({ request }) => {
    const create = await request.post("/api/groups", {
      data: { category: "compra", title: uniqueTitle("Privacidade dono"), city: "BH", targetMembers: 2, whatsapp: "31900000080" },
    });
    const group = await create.json();
    expect(group.ownerUserId).toBeUndefined();

    const list = await (await request.get("/api/groups")).json();
    expect(list.groups.find((g) => g.id === group.id).ownerUserId).toBeUndefined();

    const detail = await (await request.get(`/api/groups/${group.id}`)).json();
    expect(detail.ownerUserId).toBeUndefined();
  });
});

test.describe("Top3Profissional - grupos de economia, categoria carona (task-002)", () => {
  function uniqueSuffix() {
    return Math.random().toString(36).slice(2, 10);
  }

  function motoristaPayload(overrides = {}) {
    return {
      category: "carona",
      tipo: "motorista",
      title: `BH -> Bom Despacho ${uniqueSuffix()}`,
      city: "BH",
      origemTexto: "BH",
      destinoTexto: "Bom Despacho",
      dataViagem: "2026-09-20",
      horarioAproximado: "08h",
      vagasTotais: 3,
      cnhNumero: "12345678900",
      veiculoPlaca: "ABC1D23",
      veiculoModelo: "Onix",
      veiculoCor: "Prata",
      whatsapp: "31955551001",
      name: "Carlos",
      ...overrides,
    };
  }

  function passageiroPayload(overrides = {}) {
    return {
      category: "carona",
      tipo: "passageiro",
      title: `Procuro carona ${uniqueSuffix()}`,
      city: "BH",
      origemTexto: "BH",
      destinoTexto: "Contagem",
      dataViagem: "2026-09-21",
      whatsapp: "31955552002",
      name: "Fernanda",
      ...overrides,
    };
  }

  test("motorista sem CNH/placa/veículo é rejeitado", async ({ request }) => {
    const { cnhNumero, ...payload } = motoristaPayload();
    const res = await request.post("/api/groups", { data: payload });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/CNH/);
  });

  test("motorista: vagasRestantes conta só assento de passageiro, não o próprio motorista", async ({ request }) => {
    const create = await request.post("/api/groups", { data: motoristaPayload({ vagasTotais: 3 }) });
    expect(create.status()).toBe(201);
    const group = await create.json();
    expect(group.currentMembers).toBe(1); // só o motorista
    expect(group.carona.vagasRestantes).toBe(3); // 3 vagas de passageiro, nenhuma ocupada ainda
  });

  test("CNH/placa/veículo não aparecem na listagem, só no detalhe do post", async ({ request }) => {
    const create = await request.post("/api/groups", { data: motoristaPayload() });
    const group = await create.json();

    const list = await (await request.get("/api/groups?category=carona")).json();
    const inList = list.groups.find((g) => g.id === group.id);
    expect(inList.carona.cnhNumero).toBeUndefined();
    expect(inList.carona.veiculoPlaca).toBeUndefined();

    const detail = await (await request.get(`/api/groups/${group.id}`)).json();
    expect(detail.carona.cnhNumero).toBe("12345678900");
    expect(detail.carona.veiculoPlaca).toBe("ABC1D23");
  });

  test("passageiro: post nasce como 'a própria vaga' — ninguém mais consegue entrar nele", async ({ request }) => {
    const create = await request.post("/api/groups", { data: passageiroPayload() });
    expect(create.status()).toBe(201);
    const group = await create.json();
    expect(group.currentMembers).toBe(1);
    expect(group.carona.vagasRestantes).toBeNull();

    const join = await request.post(`/api/groups/${group.id}/join`, { data: { whatsapp: "31900009999" } });
    expect(join.status()).toBe(409);
  });

  test("passageiro não exige nem aceita CNH/placa/veículo", async ({ request }) => {
    const create = await request.post("/api/groups", { data: passageiroPayload() });
    expect(create.status()).toBe(201);
    const group = await create.json();
    const detail = await (await request.get(`/api/groups/${group.id}`)).json();
    expect(detail.carona.tipo).toBe("passageiro");
    expect(detail.carona.cnhNumero).toBeUndefined();
  });

  test("motorista de carona aceita passageiro pelo /join normal, igual as outras categorias", async ({ request }) => {
    const create = await request.post("/api/groups", { data: motoristaPayload({ vagasTotais: 1 }) });
    const group = await create.json();
    const join = await request.post(`/api/groups/${group.id}/join`, { data: { whatsapp: "31900008888", name: "Passageira" } });
    expect(join.status()).toBe(200);
    const joined = await join.json();
    expect(joined.status).toBe("completo");
    expect(joined.carona.vagasRestantes).toBe(0);
  });

  test("filtro por origem/destino/data só retorna carona compatível", async ({ request }) => {
    const title = `Rota única ${uniqueSuffix()}`;
    const destino = `Destinoteste${uniqueSuffix()}`;
    const create = await request.post("/api/groups", { data: motoristaPayload({ title, destinoTexto: destino, dataViagem: "2026-10-05" }) });
    expect(create.status()).toBe(201);

    const matchDestino = await (await request.get(`/api/groups?category=carona&destino=${destino}`)).json();
    expect(matchDestino.groups.some((g) => g.title === title)).toBe(true);

    const noMatch = await (await request.get(`/api/groups?category=carona&destino=NaoExiste${uniqueSuffix()}`)).json();
    expect(noMatch.groups.some((g) => g.title === title)).toBe(false);

    const matchData = await (await request.get("/api/groups?category=carona&data=2026-10-05")).json();
    expect(matchData.groups.some((g) => g.title === title)).toBe(true);
  });

  test("ordenação por proximidade quando lat/lng são enviados", async ({ request }) => {
    const near = motoristaPayload({ title: `Perto ${uniqueSuffix()}`, lat: -19.9245, lng: -43.9352 });
    const far = motoristaPayload({ title: `Longe ${uniqueSuffix()}`, lat: -8.05, lng: -34.9 }); // Recife, bem mais longe
    expect((await request.post("/api/groups", { data: far })).status()).toBe(201);
    expect((await request.post("/api/groups", { data: near })).status()).toBe(201);

    const res = await (await request.get("/api/groups?category=carona&lat=-19.9245&lng=-43.9352")).json();
    const nearIndex = res.groups.findIndex((g) => g.title === near.title);
    const farIndex = res.groups.findIndex((g) => g.title === far.title);
    expect(nearIndex).toBeGreaterThanOrEqual(0);
    expect(farIndex).toBeGreaterThanOrEqual(0);
    expect(nearIndex).toBeLessThan(farIndex);
  });

  test("fluxo completo pela interface: criar post de motorista, aviso fixo aparece, 'Ver detalhes' revela CNH e WhatsApp", async ({
    page,
    request,
  }) => {
    const title = `BH -> Sete Lagoas ${uniqueSuffix()}`;
    await page.goto("/#grupos");

    await page.locator("#group-create-toggle").click();
    await page.locator("#group-title").fill(title);
    await page.locator("#group-category").selectOption("carona");
    await page.locator("#group-city").fill("BH");
    await page.locator("#carona-tipo").selectOption("motorista");
    await page.locator("#carona-origem").fill("BH");
    await page.locator("#carona-destino").fill("Sete Lagoas");
    await page.locator("#carona-data").fill("2026-09-22");
    await page.locator("#carona-vagas").fill("2");
    await page.locator("#carona-cnh").fill("99988877766");
    await page.locator("#carona-placa").fill("XYZ9A87");
    await page.locator("#carona-modelo").fill("HB20");
    await page.locator("#carona-cor").fill("Branco");
    await page.locator("#group-whatsapp").fill("31955559000");
    await page.locator("#group-form button[type=submit]").click();

    await expect(page.locator("#group-status")).toHaveText("Grupo criado!");
    const card = page.locator(".group-card", { hasText: title });
    await expect(card).toContainText("2 vagas restantes");
    await expect(card).toContainText("O TOP3 apenas conecta pessoas para carona compartilhada");

    await card.locator(".group-carona-detail-btn").click();
    await expect(card.locator(".group-carona-details")).toContainText("99988877766");
    await expect(card.locator(".group-carona-details")).toContainText("XYZ9A87");
    await expect(card.locator(".group-carona-details a", { hasText: "Falar no WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/31955559000"
    );
  });

  test("post de passageiro pela interface não mostra botão 'Participar' (post é individual)", async ({ page, request }) => {
    const title = `Procuro carona interface ${uniqueSuffix()}`;
    expect((await request.post("/api/groups", { data: passageiroPayload({ title }) })).status()).toBe(201);
    await page.goto("/#grupos");
    const card = page.locator(".group-card", { hasText: title });
    await expect(card.locator(".group-join-btn")).toHaveCount(0);
    await expect(card).toContainText("passageiro procurando carona");
  });
});

test.describe("Top3Profissional - login com Google (pilar 4.13)", () => {
  test("sem GOOGLE_CLIENT_ID configurada, tudo continua funcionando sem login", async ({ page, request }) => {
    const config = await (await request.get("/api/auth/config")).json();
    expect(config.googleClientId).toBeNull();

    const me = await request.get("/api/auth/me");
    expect(me.status()).toBe(401);

    const googleLogin = await request.post("/api/auth/google", { data: { credential: "qualquer-coisa" } });
    expect(googleLogin.status()).toBe(503);

    // O botão de login não aparece na página quando não está configurado.
    await page.goto("/");
    await expect(page.locator("#google-signin-slot")).toBeEmpty();
  });

  test("logout funciona (não quebra) mesmo sem sessão nenhuma", async ({ request }) => {
    const res = await request.post("/api/auth/logout");
    expect(res.status()).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  test("/health reporta se o login com Google está configurado", async ({ request }) => {
    const health = await (await request.get("/health")).json();
    expect(health.googleLoginConfigured).toBe(false);
  });

  test("perfil continua sendo criado normalmente sem estar logado (login é opcional)", async ({ request }) => {
    const res = await request.post("/api/providers", {
      multipart: {
        name: "Sem Login Teste",
        service: "pintor",
        description: "pinto casas e apartamentos",
        location: "Belo Horizonte",
        whatsapp: "31999990000",
        photos: { name: "foto.png", mimeType: "image/png", buffer: require("fs").readFileSync("assets/icons/icon-192.png") },
      },
    });
    expect(res.status()).toBe(201);
  });

  test("editar perfil (PUT) exige login, mesmo pra um perfil sem dono (ownerUserId null)", async ({ request }) => {
    const create = await request.post("/api/providers", {
      multipart: {
        name: "Editar Sem Login",
        service: "encanador",
        description: "conserto vazamento",
        location: "Belo Horizonte",
        whatsapp: "31999990000",
        photos: { name: "foto.png", mimeType: "image/png", buffer: require("fs").readFileSync("assets/icons/icon-192.png") },
      },
    });
    const { provider } = await create.json();

    const edit = await request.put(`/api/providers/${provider.slug}`, {
      multipart: { name: "Outro Nome", service: "encanador", location: "Belo Horizonte", whatsapp: "31999990000" },
    });
    expect(edit.status()).toBe(401);
  });

  test("editar perfil (PUT) exige login antes mesmo de checar se o slug existe", async ({ request }) => {
    const edit = await request.put("/api/providers/slug-que-nao-existe-123", {
      multipart: { name: "X", service: "y", location: "z", whatsapp: "31999990000" },
    });
    expect(edit.status()).toBe(401);
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
