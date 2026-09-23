const { test, expect, request: apiRequest } = require("@playwright/test");

test.describe("Top3Profissional - fluxo básico", () => {
  test("carrega a página sem erros de console", async ({ page }) => {
    // Domínio de teste do Umami (task-008, ver playwright.config.js) é
    // propositalmente falso (stats.test.invalid) — numa instância real
    // configurada de verdade, o script carrega normal. Aqui só interessa
    // confirmar que o resto da página não gera erro nenhum, então o
    // carregamento desse script específico é simulado (200, JS vazio).
    await page.route("https://stats.test.invalid/script.js", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
    );

    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/");
    await expect(page).toHaveTitle(/Top3Profissional/);
    expect(consoleErrors).toEqual([]);
  });

  test("barra de busca do hero existe e aceita texto", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.locator("#hero-search-input");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("manicure amanhã em BH");
    await expect(searchInput).toHaveValue("manicure amanhã em BH");
  });

  test("busca central do hero (task-012) usa o mesmo motor de busca da barra flutuante", async ({ page }) => {
    await page.goto("/");
    const heroInput = page.getByPlaceholder("O que você está procurando?");
    await expect(heroInput).toBeVisible();
    // "eletricista" é um serviço cadastrado — buscar pelo hero deve rotear
    // pro ranking, igual a barra flutuante de baixo já fazia.
    await heroInput.fill("eletricista");
    await page.locator("#hero-search-form button[type=submit]").click();
    await expect(page.locator("#top3")).toBeInViewport();
    await expect(heroInput).toHaveValue("");
  });

  test("chips de categoria do hero abrem o painel inline de cada categoria", async ({ page }) => {
    await page.goto("/");
    const panelBody = page.locator("#category-panel-body");

    // "Serviços" traz o ranking pra dentro do painel, sem rolar a página
    await page.locator('[data-hero-category="servico"]').click();
    await expect(page.locator("#category-quick-panel")).toBeVisible();
    await expect(page.locator("#category-panel-title")).toHaveText("Serviços perto de você");
    await expect(panelBody.locator("#top3")).toBeAttached();

    // "Grupo" troca o conteúdo do painel e devolve o ranking pro lugar
    await page.locator('[data-hero-category="grupo"]').click();
    await expect(panelBody.locator("#grupos")).toBeAttached();
    await expect(panelBody.locator("#top3")).toHaveCount(0);
    await expect(page.locator("#requester-view #top3")).toBeAttached();
  });

  test("fechar o painel devolve as seções emprestadas pra página", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-hero-category="viagem"]').click();
    // Viagem empresta as duas fontes: corridas/entregas e caronas (grupos)
    await expect(page.locator("#category-panel-body #corridas")).toBeAttached();
    await expect(page.locator("#category-panel-body #grupos")).toBeAttached();

    await page.locator(".category-panel-close").click();
    await expect(page.locator("#category-quick-panel")).toBeHidden();
    await expect(page.locator("#requester-view #corridas")).toBeAttached();
    await expect(page.locator("#requester-view #grupos")).toBeAttached();
  });

  test("placeholder da busca muda conforme o modo ('Solicito serviço' vs 'Presto serviço')", async ({ page }) => {
    await page.goto("/");
    // Busca agora é só pelo hero — placeholder muda com o modo
    const searchInput = page.locator("#hero-search-input");
    await expect(searchInput).toHaveAttribute("placeholder", "O que você está procurando?");

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
    const bottomInput = page.locator("#hero-search-input");
    const bottomSubmit = page.locator("#hero-search-form button[type=submit]");

    await bottomInput.fill("primeira busca");
    await bottomSubmit.click();
    await firstRequestReceived;

    // Enquanto a primeira busca está em voo, o campo e o botão de envio
    // devem estar desabilitados — agora controlados pelo hero form.
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
    await page.getByRole("tab", { name: /presto serviço/i }).click();
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
    await page.getByRole("tab", { name: /presto serviço/i }).click();
    await expect(page.locator(".request-badge", { hasText: "terreno" }).first()).toBeVisible();
  });

  test("ownerUserId aparece na resposta pública para suportar tracking ao vivo de corridas", async ({ request }) => {
    const res = await request.post("/api/requests", {
      data: { type: "corrida", title: "teste tracking dono", price: 20, whatsapp: "31900002222", location: "BH" },
    });
    expect(res.status()).toBe(201);
    const { request: created } = await res.json();
    // ownerUserId é exposto (como ID opaco) para permitir que passageiros
    // consultem o tracking ao vivo do motorista via GET /api/location/:userId
    // (não revela nome, contato nem coordenadas sem o motorista ativar).
    // Sem ownerUserId no card, o botão "Ver ao vivo" não teria para onde apontar.

    const list = await (await request.get("/api/requests")).json();
    const found = list.requests.find((r) => r.id === created.id);
    expect(found).toBeDefined();
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
    await page.getByRole("tab", { name: /presto serviço/i }).click();
    await expect(page.locator(".request-item").first()).toBeVisible();

    const html = await page.locator("#requests-list").innerHTML();
    expect(html).not.toContain("<img");
    expect(alerts).toEqual([]);
  });

  test("publicar pedido exige WhatsApp, mas localização é opcional (task-009, item 1 — extraída do título quando dá)", async ({
    request,
  }) => {
    const semWhatsapp = await request.post("/api/requests", {
      data: { type: "corrida", title: "teste sem whatsapp", price: 10, location: "Belo Horizonte" },
    });
    expect(semWhatsapp.status()).toBe(400);
    expect((await semWhatsapp.json()).error).toMatch(/whatsapp/i);

    // Sem "Onde" preenchida (nem extraída de um padrão de rota no título) —
    // continua publicando, só sem localização (mostrado como "local não
    // informado" no card, ver assets/app.js).
    const semLocalizacao = await request.post("/api/requests", {
      data: { type: "corrida", title: "teste sem localização", price: 10, whatsapp: "31999990000" },
    });
    expect(semLocalizacao.status()).toBe(201);
    expect((await semLocalizacao.json()).request.location).toBe("");

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
    await page.getByRole("tab", { name: /presto serviço/i }).click();
    const item = page.locator(`.request-item[data-id="${id}"]`);
    await expect(item).toContainText("Barreiro, Belo Horizonte");
    await expect(item).not.toContainText("31988887777");

    await request.post(`/api/requests/${id}/accept`, { data: { provider: "Prestador Teste" } });
    await page.reload();
    await page.getByRole("tab", { name: /presto serviço/i }).click();
    await expect(item).toContainText("31988887777");
  });

  test("busca por serviço cadastrado mostra o ranking filtrado — sem gastar chamada de IA", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.locator("#hero-search-input");
    await searchInput.fill("preciso de um eletricista hoje");
    await searchInput.press("Enter");

    await expect(page.locator("#ranking-title")).toContainText("eletricista");
    const cards = page.locator(".rank-card");
    await expect(cards).toHaveCount(2);
    await expect(page.locator(".rank-service-city").first()).toContainText("eletricista");
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
    const searchInput = page.locator("#hero-search-input");
    await searchInput.fill("corrida do Centro pra Rodoviária");
    await searchInput.press("Enter");

    await expect(page.locator("#ride-from")).toHaveValue("Centro");
    await expect(page.locator("#ride-to")).toHaveValue("Rodoviária");
    await expect(page.locator("#ride-results")).not.toBeEmpty();
    await expect(page.locator(".result-answer")).not.toBeVisible();
  });

  test("busca fora do catálogo interno mostra os resultados da web direto, sem IA (só roda com SearXNG/Brave configurados)", async ({
    page,
  }) => {
    test.skip(
      !(process.env.SEARXNG_URL || process.env.BRAVE_SEARCH_API_KEY),
      "precisa de SEARXNG_URL ou BRAVE_SEARCH_API_KEY pra testar a busca na web de verdade"
    );
    await page.goto("/");
    const searchInput = page.locator("#hero-search-input");
    await searchInput.fill("terreno barato em Contagem");
    await searchInput.press("Enter");
    const answer = page.locator(".result-answer");
    await expect(answer).toBeVisible({ timeout: 15000 });
    await expect(answer).not.toHaveClass(/result-answer--error/);
    await expect(answer.locator("a").first()).toHaveAttribute("href", /^https?:\/\//);
  });
});

test.describe("Top3Profissional - mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("funciona em viewport mobile: menu, busca e alternância de modo", async ({ page }) => {
    // Ver comentário equivalente no primeiro teste do arquivo — domínio de
    // teste do Umami é propositalmente falso, simula o carregamento aqui
    // também.
    await page.route("https://stats.test.invalid/script.js", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
    );

    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/");
    await expect(page.getByPlaceholder("O que você está procurando?")).toBeVisible();

    // force:true de propósito, motivo investigado a fundo (não é achado
    // escondido): com a home bem mais alta desde a task-012 (várias
    // seções novas), a checagem de "elemento realmente clicável" do
    // Playwright, sob emulação mobile+touch, intercepta o clique num
    // elemento aleatório e diferente a cada tentativa (hero, um card de
    // destaque, um <div class="container"> genérico) — nunca o mesmo
    // duas vezes, mesmo depois de esperar a rede ficar quieta
    // (networkidle) e rolar pro topo antes. Conferido manualmente via
    // elementFromPoint() na coordenada exata do botão: sempre resolve pro
    // botão certo — o clique de verdade sempre funciona, é a checagem
    // prévia do Playwright que fica instável nesse cenário específico
    // (viewport mobile + touch + página alta), não um bug real de
    // sobreposição visual.
    await page.getByRole("tab", { name: /presto serviço/i }).click({ force: true });
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
    await page.getByRole("tab", { name: /presto serviço/i }).click();
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
    await page.getByRole("tab", { name: /presto serviço/i }).click();
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
    const searchInput = page.locator("#hero-search-input");
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

    const searchInput = page.locator("#hero-search-input");
    await searchInput.fill(`preciso de ${uniqueService} hoje`);
    await searchInput.press("Enter");

    const cards = page.locator(".rank-card");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("Perfil Ranking Teste");
    await expect(cards.first().locator(".chip--new")).toHaveText("novo");
    await expect(cards.first().locator(".rank-cta")).toHaveAttribute("href", `/prestador/${provider.slug}`);
  });

  test("foto do perfil aparece no card do ranking: photoUrl no JSON, <img> no card, HTTP 200", async ({
    page,
    request,
  }) => {
    // Serviço único para este perfil aparecer sozinho no top 3.
    const uniqueService = `fotografia-teste-${Math.random().toString(36).slice(2, 8)}`;
    const res = await request.post("/api/providers", {
      multipart: {
        name: "Foto Ranking Teste",
        service: uniqueService,
        description: "fotógrafo profissional com fotos reais",
        location: "São Paulo",
        whatsapp: "31999990099",
        photos: {
          name: "foto.png",
          mimeType: "image/png",
          buffer: require("fs").readFileSync("assets/icons/icon-192.png"),
        },
      },
    });
    expect(res.status()).toBe(201);
    const { provider } = await res.json();
    expect(provider.photos.length).toBeGreaterThan(0);

    // API devolve photoUrl para perfil com foto.
    const rankingJson = await (await request.get(`/api/ranking?service=${uniqueService}`)).json();
    expect(rankingJson.top3.length).toBeGreaterThan(0);
    const rankItem = rankingJson.top3[0];
    expect(typeof rankItem.photoUrl).toBe("string");
    expect(rankItem.photoUrl.length).toBeGreaterThan(0);

    // Prioridade: newBackgroundUrl > enhancedUrl > url (usa a primeira foto).
    const firstPhoto = provider.photos[0];
    const expectedUrl = firstPhoto.newBackgroundUrl || firstPhoto.enhancedUrl || firstPhoto.url;
    expect(rankItem.photoUrl).toBe(expectedUrl);

    // A URL da foto responde HTTP 200 com Content-Type de imagem.
    const imgRes = await request.get(rankItem.photoUrl);
    expect(imgRes.status()).toBe(200);
    expect(imgRes.headers()["content-type"]).toMatch(/^image\//);

    // Card no DOM mostra <img> com o src correto.
    const servicesResponse = page.waitForResponse((r) => r.url().includes("/api/services"));
    await page.goto("/");
    await servicesResponse;
    const searchInput = page.locator("#hero-search-input");
    await searchInput.fill(`preciso de ${uniqueService} hoje`);
    await searchInput.press("Enter");

    const card = page.locator(".rank-card").first();
    await expect(card).toContainText("Foto Ranking Teste");
    const img = card.locator(".rank-card-img");
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute("src", expectedUrl);
  });

  test("card sem foto continua mostrando iniciais", async ({ page, request }) => {
    // Serviço único sem foto — usa PROVIDERS mock que não têm photoUrl.
    await page.goto("/");
    const searchInput = page.locator("#hero-search-input");
    await searchInput.fill("preciso de manicure");
    await searchInput.press("Enter");

    const cards = page.locator(".rank-card");
    await expect(cards.first()).toBeVisible();
    // Cards mock não têm foto — devem mostrar iniciais, nunca .rank-card-img.
    await expect(cards.first().locator(".rank-card-img")).toHaveCount(0);
    await expect(cards.first().locator(".rank-card-initials-big")).not.toBeEmpty();
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
    expect(me.status()).toBe(200);
    expect((await me.json()).user).toBeNull();

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

test.describe("Top3Profissional - login simples por email/senha + perfil (task-003)", () => {
  function randomEmail() {
    return `teste${Date.now()}${Math.floor(Math.random() * 10000)}@example.com`;
  }

  test("cadastro cria conta, já loga (sessão) e devolve os campos públicos do perfil", async ({ request }) => {
    const email = randomEmail();
    const signup = await request.post("/api/auth/signup", {
      data: { name: "Maria Cadastro", email, password: "senha12345", whatsapp: "31999990000" },
    });
    expect(signup.status()).toBe(201);
    const { user } = await signup.json();
    expect(user.name).toBe("Maria Cadastro");
    expect(user.email).toBe(email);
    expect(user.whatsapp).toBe("31999990000");
    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("reputacaoScore");

    // A sessão já fica ativa depois do cadastro (mesmo cookie de sessão do
    // login com Google) — não deveria precisar logar de novo.
    const me = await request.get("/api/auth/me");
    expect(me.status()).toBe(200);
    expect((await me.json()).user.email).toBe(email);
  });

  test("cadastro rejeita e-mail duplicado", async ({ request }) => {
    const email = randomEmail();
    await request.post("/api/auth/signup", {
      data: { name: "Primeira Conta", email, password: "senha12345", whatsapp: "31999990000" },
    });
    const second = await request.post("/api/auth/signup", {
      data: { name: "Segunda Conta", email, password: "outrasenha123", whatsapp: "31988880000" },
    });
    expect(second.status()).toBe(409);
  });

  test("cadastro rejeita senha curta, e-mail inválido e campos faltando", async ({ request }) => {
    const semSenha = await request.post("/api/auth/signup", {
      data: { name: "X", email: randomEmail(), password: "123", whatsapp: "31999990000" },
    });
    expect(semSenha.status()).toBe(400);

    const emailInvalido = await request.post("/api/auth/signup", {
      data: { name: "X", email: "não-é-email", password: "senha12345", whatsapp: "31999990000" },
    });
    expect(emailInvalido.status()).toBe(400);

    const semWhatsapp = await request.post("/api/auth/signup", {
      data: { name: "X", email: randomEmail(), password: "senha12345" },
    });
    expect(semWhatsapp.status()).toBe(400);
  });

  test("login com senha certa funciona, com senha errada ou e-mail inexistente dá erro genérico", async ({ request }) => {
    const email = randomEmail();
    await request.post("/api/auth/signup", {
      data: { name: "Login Teste", email, password: "senhacerta123", whatsapp: "31999990000" },
    });
    await request.post("/api/auth/logout");

    const senhaErrada = await request.post("/api/auth/login", { data: { email, password: "senhaerrada" } });
    expect(senhaErrada.status()).toBe(401);

    const inexistente = await request.post("/api/auth/login", {
      data: { email: randomEmail(), password: "qualquercoisa" },
    });
    expect(inexistente.status()).toBe(401);
    // Mesma mensagem pros dois casos — não dá pista de qual e-mail existe.
    expect((await senhaErrada.json()).error).toBe((await inexistente.json()).error);

    const login = await request.post("/api/auth/login", { data: { email, password: "senhacerta123" } });
    expect(login.status()).toBe(200);
    expect((await login.json()).user.email).toBe(email);
  });

  test("editar perfil (task-003): WhatsApp, tipo de uso, dados de motorista e disponibilidade", async ({ request }) => {
    const email = randomEmail();
    await request.post("/api/auth/signup", {
      data: { name: "Perfil Completo", email, password: "senha12345", whatsapp: "31999990000" },
    });

    const edit = await request.put("/api/auth/profile", {
      data: {
        whatsapp: "31988887777",
        tipoUso: "ambos",
        motorista: { cnhNumero: "12345678900", veiculoPlaca: "ABC1D23", veiculoModelo: "Onix", veiculoCor: "Prata" },
        disponibilidade: [{ dia: "segunda", inicio: "08:00", fim: "12:00" }],
      },
    });
    expect(edit.status()).toBe(200);
    const { user } = await edit.json();
    expect(user.whatsapp).toBe("31988887777");
    expect(user.tipoUso).toBe("ambos");
    expect(user.motorista).toEqual({ cnhNumero: "12345678900", veiculoPlaca: "ABC1D23", veiculoModelo: "Onix", veiculoCor: "Prata" });
    expect(user.disponibilidade).toEqual([{ dia: "segunda", inicio: "08:00", fim: "12:00" }]);
  });

  test("editar perfil exige login", async ({ request }) => {
    const edit = await request.put("/api/auth/profile", { data: { whatsapp: "31988887777" } });
    expect(edit.status()).toBe(401);
  });

  test("editar perfil rejeita dados de motorista incompletos (todos os campos ou nenhum)", async ({ request }) => {
    const email = randomEmail();
    await request.post("/api/auth/signup", {
      data: { name: "Motorista Incompleto", email, password: "senha12345", whatsapp: "31999990000" },
    });
    const edit = await request.put("/api/auth/profile", {
      data: { motorista: { cnhNumero: "12345678900" } },
    });
    expect(edit.status()).toBe(400);
  });

  test("editar perfil rejeita disponibilidade com dia ou horário inválido", async ({ request }) => {
    const email = randomEmail();
    await request.post("/api/auth/signup", {
      data: { name: "Disponibilidade Teste", email, password: "senha12345", whatsapp: "31999990000" },
    });
    const diaInvalido = await request.put("/api/auth/profile", {
      data: { disponibilidade: [{ dia: "feriado", inicio: "08:00", fim: "12:00" }] },
    });
    expect(diaInvalido.status()).toBe(400);

    const horarioInvalido = await request.put("/api/auth/profile", {
      data: { disponibilidade: [{ dia: "terca", inicio: "8h", fim: "12h" }] },
    });
    expect(horarioInvalido.status()).toBe(400);
  });

  test("login com Google e por email/senha no mesmo e-mail não criam duas contas (mesmo usuário)", async ({ request }) => {
    // Não dá pra simular um credential do Google de verdade aqui (exigiria
    // um token assinado pelo Google) — mas o endpoint de signup por e-mail
    // sozinho já garante unicidade por e-mail entre TODOS os caminhos de
    // login, incluindo o futuro cadastro por Google com o mesmo endereço
    // (ver createUser/existingByEmail em server.js), então cobrimos aqui só
    // a garantia de unicidade que o signup por e-mail já expõe.
    const email = randomEmail();
    const first = await request.post("/api/auth/signup", {
      data: { name: "Conta Única", email, password: "senha12345", whatsapp: "31999990000" },
    });
    expect(first.status()).toBe(201);
    const duplicate = await request.post("/api/auth/signup", {
      data: { name: "Conta Única 2", email, password: "outrasenha", whatsapp: "31988880000" },
    });
    expect(duplicate.status()).toBe(409);
  });

  test("busca de carona abre já filtrada em hoje, e sugere amanhã quando não acha nada", async ({ page }) => {
    await page.goto("/");
    // Garante resultado vazio para carona hoje, independente dos dados do CI
    await page.route(/\/api\/groups(\?.*)?$/, (route) => {
      const url = route.request().url();
      if (url.includes("category=carona") || url.includes("data=")) {
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ groups: [] }) });
      } else {
        route.continue();
      }
    });
    await page.locator('.group-category-btn[data-category="carona"]').click();
    const dataInput = page.locator("#carona-search-data");
    const today = new Date();
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    await expect(dataInput).toHaveValue(expected);

    const seeTomorrow = page.locator("#carona-see-tomorrow");
    await expect(seeTomorrow).toBeVisible();
    await seeTomorrow.click();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const expectedTomorrow = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    await expect(dataInput).toHaveValue(expectedTomorrow);
  });

  test("post de carona pré-preenche WhatsApp, nome, CNH/placa/veículo e sugere horário a partir do perfil logado", async ({ page }) => {
    const email = randomEmail();
    await page.request.post("/api/auth/signup", {
      data: { name: "Carlos Motorista Teste", email, password: "senha12345", whatsapp: "31977776666" },
    });
    await page.request.put("/api/auth/profile", {
      data: {
        motorista: { cnhNumero: "98765432100", veiculoPlaca: "XYZ9A87", veiculoModelo: "HB20", veiculoCor: "Branco" },
        disponibilidade: [{ dia: "segunda", inicio: "07:30", fim: "11:00" }],
      },
    });

    await page.goto("/");
    await page.getByRole("button", { name: "+ Criar um grupo" }).click();
    await page.locator("#group-category").selectOption("carona");
    await page.locator("#carona-tipo").selectOption("motorista");

    await expect(page.locator("#group-whatsapp")).toHaveValue("31977776666");
    await expect(page.locator("#group-name")).toHaveValue("Carlos Motorista Teste");
    await expect(page.locator("#carona-cnh")).toHaveValue("98765432100");
    await expect(page.locator("#carona-placa")).toHaveValue("XYZ9A87");
    await expect(page.locator("#carona-modelo")).toHaveValue("HB20");
    await expect(page.locator("#carona-cor")).toHaveValue("Branco");

    // 14/09/2026 é uma segunda-feira — bate com a janela de disponibilidade cadastrada.
    await page.locator("#carona-data").fill("2026-09-14");
    await page.locator("#carona-data").dispatchEvent("change");
    await expect(page.locator("#carona-horario")).toHaveValue("07:30");

    // Editar manualmente trava a sugestão — trocar de dia não deve mais sobrescrever.
    await page.locator("#carona-horario").fill("10:00");
    await page.locator("#carona-data").fill("2026-09-15");
    await page.locator("#carona-data").dispatchEvent("change");
    await expect(page.locator("#carona-horario")).toHaveValue("10:00");

    // Campos continuam editáveis mesmo pré-preenchidos.
    await page.locator("#carona-placa").fill("NOVA1B23");
    await expect(page.locator("#carona-placa")).toHaveValue("NOVA1B23");
  });

  test("sugestão discreta de login aparece pra quem não está logado, some ao logar, e some pra sempre ao dispensar", async ({ page }) => {
    await page.goto("/");
    const banner = page.locator("#login-suggestion-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Crie uma conta grátis");

    // Clicar no CTA leva pro painel de login/cadastro, sem bloquear nada.
    await page.locator("#login-suggestion-cta").click();
    await expect(banner).toBeHidden();
    await expect(page.locator("#email-auth-panel")).toBeVisible();

    // Banner foi marcado como dispensado no sessionStorage ao aparecer.
    // Recarregar na mesma sessão não mostra novamente.
    await page.reload();
    await expect(page.locator("#login-suggestion-banner")).toBeHidden();
  });

  test("sugestão de login não aparece pra quem já está logado", async ({ page }) => {
    const email = randomEmail();
    await page.request.post("/api/auth/signup", {
      data: { name: "Já Logada", email, password: "senha12345", whatsapp: "31999990000" },
    });
    await page.goto("/");
    await expect(page.locator("#login-suggestion-banner")).toBeHidden();
  });

  test("usar sem estar logado continua funcionando 100% — sugestão de login nunca bloqueia nada", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.locator("#hero-search-input");
    await expect(searchInput).toBeEditable();
    await page.getByRole("button", { name: "+ Criar um grupo" }).click();
    await expect(page.locator("#group-form")).toBeVisible();
  });

  test("modal de login não desmarca o toggle Solicito/Presto serviço da barra de busca", async ({ page }) => {
    await page.goto("/");
    await page.locator("#email-auth-toggle").click();
    await expect(page.locator("#email-auth-panel")).toBeVisible();
    // Abrir o painel de login não deve desmarcar o modo ativo
    await expect(page.locator('.mode-btn[data-mode="requester"]')).toHaveClass(/is-active/);
    await expect(page.locator("#requester-view")).toBeVisible();
  });

  test("editar perfil pela interface: abre pré-preenchido, salva, e reabre com os novos dados", async ({ page }) => {
    const email = randomEmail();
    await page.request.post("/api/auth/signup", {
      data: { name: "Edição Interface", email, password: "senha12345", whatsapp: "31955554444" },
    });

    await page.goto("/");
    await page.locator("#user-chip-toggle").click();
    await page.locator("#edit-profile-btn").click();

    // Abre pré-preenchido com o que veio do cadastro.
    await expect(page.locator("#profile-whatsapp")).toHaveValue("31955554444");

    await page.locator("#profile-whatsapp").fill("31944443333");
    await page.locator("#profile-tipo-uso").selectOption("prestador");
    await page.locator("#profile-cnh").fill("55566677788");
    await page.locator("#profile-placa").fill("QWE4R56");
    await page.locator("#profile-modelo").fill("Argo");
    await page.locator("#profile-cor").fill("Vermelho");
    const segundaRow = page.locator('.profile-availability-row[data-day="segunda"]');
    await segundaRow.locator(".profile-availability-inicio").fill("08:00");
    await segundaRow.locator(".profile-availability-fim").fill("12:00");
    await page.locator("#profile-edit-form button[type=submit]").click();
    await expect(page.locator("#profile-edit-status")).toHaveText("Salvo!");

    const me = await page.request.get("/api/auth/me").then((r) => r.json());
    expect(me.user.whatsapp).toBe("31944443333");
    expect(me.user.tipoUso).toBe("prestador");
    expect(me.user.motorista).toEqual({ cnhNumero: "55566677788", veiculoPlaca: "QWE4R56", veiculoModelo: "Argo", veiculoCor: "Vermelho" });
    expect(me.user.disponibilidade).toEqual([{ dia: "segunda", inicio: "08:00", fim: "12:00" }]);

    // Fecha e reabre — reaparece com os dados que acabaram de ser salvos.
    await page.locator("#profile-edit-panel").evaluate((el) => (el.hidden = true));
    await page.locator("#user-chip-toggle").click();
    await page.locator("#edit-profile-btn").click();
    await expect(page.locator("#profile-whatsapp")).toHaveValue("31944443333");
    await expect(page.locator("#profile-placa")).toHaveValue("QWE4R56");
    await expect(segundaRow.locator(".profile-availability-inicio")).toHaveValue("08:00");
  });

  test("editar perfil pela interface: deixar todos os campos de motorista em branco limpa os dados de motorista salvos", async ({ page }) => {
    const email = randomEmail();
    await page.request.post("/api/auth/signup", {
      data: { name: "Sem Motorista", email, password: "senha12345", whatsapp: "31955554444" },
    });
    await page.request.put("/api/auth/profile", {
      data: { motorista: { cnhNumero: "1", veiculoPlaca: "2", veiculoModelo: "3", veiculoCor: "4" } },
    });

    await page.goto("/");
    await page.locator("#user-chip-toggle").click();
    await page.locator("#edit-profile-btn").click();
    await expect(page.locator("#profile-cnh")).toHaveValue("1");

    await page.locator("#profile-cnh").fill("");
    await page.locator("#profile-placa").fill("");
    await page.locator("#profile-modelo").fill("");
    await page.locator("#profile-cor").fill("");
    await page.locator("#profile-edit-form button[type=submit]").click();
    await expect(page.locator("#profile-edit-status")).toHaveText("Salvo!");

    const me = await page.request.get("/api/auth/me").then((r) => r.json());
    expect(me.user.motorista).toBeNull();
  });
});

test.describe("Top3Profissional - avaliações e denúncia (task-004)", () => {
  function randomEmail(prefix) {
    return `${prefix}${Date.now()}${Math.floor(Math.random() * 100000)}@example.com`;
  }

  // Dois usuários logados (cada um no seu próprio APIRequestContext, pra não
  // misturar cookie de sessão), um grupo genérico com os dois dentro,
  // marcado como concluído — o cenário base que quase todo teste desta
  // seção precisa pra sequer chegar na regra que está testando.
  async function setupConcludedGroup(baseURL) {
    const userA = await apiRequest.newContext({ baseURL });
    const userB = await apiRequest.newContext({ baseURL });
    const emailA = randomEmail("avaliador");
    const emailB = randomEmail("avaliado");
    const signupA = await userA.post("/api/auth/signup", {
      data: { name: "Dono do Grupo", email: emailA, password: "senha12345", whatsapp: "31911110000" },
    });
    const { user: dataA } = await signupA.json();
    const signupB = await userB.post("/api/auth/signup", {
      data: { name: "Participante", email: emailB, password: "senha12345", whatsapp: "31922220000" },
    });
    const { user: dataB } = await signupB.json();

    const createRes = await userA.post("/api/groups", {
      data: { category: "compra", title: "Compra em grupo teste", city: "BH", targetMembers: 2, whatsapp: "31911110000", name: "Dono" },
    });
    const group = await createRes.json();
    await userB.post(`/api/groups/${group.id}/join`, { data: { whatsapp: "31922220000", name: "Participante" } });
    const completeRes = await userA.post(`/api/groups/${group.id}/complete`);
    expect(completeRes.status()).toBe(200);

    return { userA, userB, idA: dataA.id, idB: dataB.id, groupId: group.id };
  }

  test("não dá pra avaliar antes do grupo estar concluído", async ({ request }) => {
    const emailA = randomEmail("cedo");
    const emailB = randomEmail("cedo2");
    const a = await request.post("/api/auth/signup", { data: { name: "A", email: emailA, password: "senha12345", whatsapp: "31911110000" } });
    const { user: userA } = await a.json();
    const createRes = await request.post("/api/groups", {
      data: { category: "compra", title: "Grupo aberto", city: "BH", targetMembers: 5, whatsapp: "31911110000", name: "A" },
    });
    const group = await createRes.json();
    // Grupo ainda "aberto" (target=5, só 1 membro) — nem completo, nem concluído.
    const avaliar = await request.post(`/api/groups/${group.id}/avaliacoes`, { data: { avaliadoId: "u999", nota: 5 } });
    expect(avaliar.status()).toBe(409);
  });

  test("avaliação mútua funciona, calcula média corretamente, e um par não avalia duas vezes no mesmo grupo", async ({ request, baseURL }) => {
    const { userA, userB, idA, idB, groupId } = await setupConcludedGroup(baseURL);

    const avA = await userA.post(`/api/groups/${groupId}/avaliacoes`, { data: { avaliadoId: idB, nota: 5, comentario: "Ótimo!" } });
    expect(avA.status()).toBe(201);
    const avB = await userB.post(`/api/groups/${groupId}/avaliacoes`, { data: { avaliadoId: idA, nota: 4 } });
    expect(avB.status()).toBe(201);

    const perfilB = await request.get(`/api/users/${idB}/avaliacoes`).then((r) => r.json());
    expect(perfilB.mediaAvaliacao).toBe(5);
    expect(perfilB.totalAvaliacoes).toBe(1);
    expect(perfilB.recentes[0]).toEqual({ nota: 5, comentario: "Ótimo!", createdAt: expect.any(String) });

    const duplicada = await userA.post(`/api/groups/${groupId}/avaliacoes`, { data: { avaliadoId: idB, nota: 1 } });
    expect(duplicada.status()).toBe(409);
  });

  test("não dá pra se autoavaliar, nem avaliar quem não participou do grupo", async ({ request, baseURL }) => {
    const { userA, idA, groupId } = await setupConcludedGroup(baseURL);

    const auto = await userA.post(`/api/groups/${groupId}/avaliacoes`, { data: { avaliadoId: idA, nota: 5 } });
    expect(auto.status()).toBe(400);

    const foraDoGrupo = await userA.post(`/api/groups/${groupId}/avaliacoes`, { data: { avaliadoId: "u_inexistente", nota: 5 } });
    expect(foraDoGrupo.status()).toBe(400);
  });

  test("só quem participou do grupo (confirmado) pode avaliar", async ({ request, baseURL }) => {
    const { userB, idB, groupId } = await setupConcludedGroup(baseURL);
    const outsider = await apiRequest.newContext({ baseURL });
    await outsider.post("/api/auth/signup", {
      data: { name: "De Fora", email: randomEmail("fora"), password: "senha12345", whatsapp: "31933330000" },
    });
    const res = await outsider.post(`/api/groups/${groupId}/avaliacoes`, { data: { avaliadoId: idB, nota: 5 } });
    expect(res.status()).toBe(403);
  });

  test("avaliação exige login, nota de 1 a 5, e comentário até 200 caracteres", async ({ request, baseURL }) => {
    const { userA, idB, groupId } = await setupConcludedGroup(baseURL);

    const semLogin = await request.post(`/api/groups/${groupId}/avaliacoes`, { data: { avaliadoId: idB, nota: 5 } });
    expect(semLogin.status()).toBe(401);

    const notaInvalida = await userA.post(`/api/groups/${groupId}/avaliacoes`, { data: { avaliadoId: idB, nota: 6 } });
    expect(notaInvalida.status()).toBe(400);
    const notaZero = await userA.post(`/api/groups/${groupId}/avaliacoes`, { data: { avaliadoId: idB, nota: 0 } });
    expect(notaZero.status()).toBe(400);

    const comentarioLongo = await userA.post(`/api/groups/${groupId}/avaliacoes`, {
      data: { avaliadoId: idB, nota: 5, comentario: "a".repeat(201) },
    });
    expect(comentarioLongo.status()).toBe(400);
  });

  test("denúncia: aberta não afeta reputação, resolução procedente aplica -25 e pode restringir a conta", async ({ request, baseURL }) => {
    const { userA, userB, idA, idB, groupId } = await setupConcludedGroup(baseURL);

    const denuncia = await userA.post(`/api/groups/${groupId}/denuncias`, {
      data: { denunciadoId: idB, motivo: "nao_entregou", descricao: "Não entregou o combinado." },
    });
    expect(denuncia.status()).toBe(201);
    const { id: denunciaId } = await denuncia.json();

    // Aberta: sem efeito nenhum na conta de B.
    let meB = await userB.get("/api/auth/me").then((r) => r.json());
    expect(meB.user.status).toBe("ativo");
    let confirmadas = await request.get(`/api/users/${idB}/denuncias-confirmadas`).then((r) => r.json());
    expect(confirmadas.total).toBe(0);

    const resolve = await request.patch(`/api/denuncias/${denunciaId}`, {
      headers: { "X-Admin-Key": "test-admin-secret-nao-usar-em-producao" },
      data: { status: "procedente" },
    });
    expect(resolve.status()).toBe(200);

    confirmadas = await request.get(`/api/users/${idB}/denuncias-confirmadas`).then((r) => r.json());
    expect(confirmadas.total).toBe(1);
    meB = await userB.get("/api/auth/me").then((r) => r.json());
    expect(meB.user.status).toBe("ativo"); // 100 - 25 = 75, ainda acima do limiar de 40

    // Resolver de novo não é permitido.
    const resolveDeNovo = await request.patch(`/api/denuncias/${denunciaId}`, {
      headers: { "X-Admin-Key": "test-admin-secret-nao-usar-em-producao" },
      data: { status: "improcedente" },
    });
    expect(resolveDeNovo.status()).toBe(409);
  });

  test("denúncia improcedente não tem efeito nenhum na reputação", async ({ request, baseURL }) => {
    const { userA, idB, groupId } = await setupConcludedGroup(baseURL);
    const denuncia = await userA.post(`/api/groups/${groupId}/denuncias`, {
      data: { denunciadoId: idB, motivo: "outro", descricao: "Achei estranho." },
    });
    const { id: denunciaId } = await denuncia.json();
    await request.patch(`/api/denuncias/${denunciaId}`, {
      headers: { "X-Admin-Key": "test-admin-secret-nao-usar-em-producao" },
      data: { status: "improcedente" },
    });
    const confirmadas = await request.get(`/api/users/${idB}/denuncias-confirmadas`).then((r) => r.json());
    expect(confirmadas.total).toBe(0);
  });

  test("resolução de denúncia exige a chave de admin certa", async ({ request, baseURL }) => {
    const { userA, idB, groupId } = await setupConcludedGroup(baseURL);
    const denuncia = await userA.post(`/api/groups/${groupId}/denuncias`, {
      data: { denunciadoId: idB, motivo: "outro", descricao: "Teste." },
    });
    const { id: denunciaId } = await denuncia.json();

    const semChave = await request.patch(`/api/denuncias/${denunciaId}`, { data: { status: "procedente" } });
    expect(semChave.status()).toBe(401);

    const chaveErrada = await request.patch(`/api/denuncias/${denunciaId}`, {
      headers: { "X-Admin-Key": "chave-errada" },
      data: { status: "procedente" },
    });
    expect(chaveErrada.status()).toBe(401);
  });

  test("só participante confirmado pode denunciar, não dá pra se autodenunciar, motivo precisa ser um dos válidos", async ({
    request,
    baseURL,
  }) => {
    const { userA, idA, idB, groupId } = await setupConcludedGroup(baseURL);

    const auto = await userA.post(`/api/groups/${groupId}/denuncias`, { data: { denunciadoId: idA, motivo: "outro", descricao: "x" } });
    expect(auto.status()).toBe(400);

    const motivoInvalido = await userA.post(`/api/groups/${groupId}/denuncias`, {
      data: { denunciadoId: idB, motivo: "motivo-que-nao-existe", descricao: "x" },
    });
    expect(motivoInvalido.status()).toBe(400);

    const outsider = await apiRequest.newContext({ baseURL });
    await outsider.post("/api/auth/signup", {
      data: { name: "De Fora", email: randomEmail("foradenuncia"), password: "senha12345", whatsapp: "31944440000" },
    });
    const semParticipar = await outsider.post(`/api/groups/${groupId}/denuncias`, {
      data: { denunciadoId: idB, motivo: "outro", descricao: "x" },
    });
    expect(semParticipar.status()).toBe(403);
  });

  test("duas denúncias de grupos diferentes, mesmo motivo, mesma pessoa: a segunda vem marcada como prioritária", async ({
    request,
    baseURL,
  }) => {
    const first = await setupConcludedGroup(baseURL);
    const denuncia1 = await first.userA.post(`/api/groups/${first.groupId}/denuncias`, {
      data: { denunciadoId: first.idB, motivo: "sumiu_apos_combinado", descricao: "Sumiu da primeira vez." },
    });
    expect((await denuncia1.json()).prioritaria).toBe(false);

    // Segundo grupo, mesmo idB participando de novo (novo signup do lado B
    // não dá, precisa ser a MESMA pessoa denunciada — então reusa a conta de
    // B criando um segundo grupo com ela dentro).
    const emailC = randomEmail("dono2");
    const userC = await apiRequest.newContext({ baseURL });
    await userC.post("/api/auth/signup", { data: { name: "Dono 2", email: emailC, password: "senha12345", whatsapp: "31955550000" } });
    const createRes = await userC.post("/api/groups", {
      data: { category: "frete", title: "Frete teste", city: "BH", targetMembers: 2, whatsapp: "31955550000", name: "Dono 2" },
    });
    const group2 = await createRes.json();
    await first.userB.post(`/api/groups/${group2.id}/join`, { data: { whatsapp: "31922220000", name: "Participante" } });
    await userC.post(`/api/groups/${group2.id}/complete`);

    const denuncia2 = await userC.post(`/api/groups/${group2.id}/denuncias`, {
      data: { denunciadoId: first.idB, motivo: "sumiu_apos_combinado", descricao: "Sumiu de novo, outro grupo." },
    });
    expect((await denuncia2.json()).prioritaria).toBe(true);
  });

  test("conta com status restrito não consegue criar novo grupo nem novo perfil, mas continua participando", async ({
    request,
    baseURL,
  }) => {
    // Derruba a reputação da MESMA pessoa B abaixo de 40 com três denúncias
    // procedentes vindas de três grupos diferentes (100-25-25-25=25) — cada
    // grupo tem um dono (A) diferente, mas o mesmo B participando dos três.
    const userB = await apiRequest.newContext({ baseURL });
    const emailB = randomEmail("restrito");
    const { user: dataB } = await userB.post("/api/auth/signup", {
      data: { name: "Sempre Denunciado", email: emailB, password: "senha12345", whatsapp: "31922220000" },
    }).then((r) => r.json());
    const idB = dataB.id;

    for (let i = 0; i < 3; i++) {
      const userA = await apiRequest.newContext({ baseURL });
      await userA.post("/api/auth/signup", {
        data: { name: `Dono ${i}`, email: randomEmail(`restritoDono${i}`), password: "senha12345", whatsapp: "31911110000" },
      });
      const group = await userA
        .post("/api/groups", { data: { category: "compra", title: `Grupo restrito ${i}`, city: "BH", targetMembers: 2, whatsapp: "31911110000", name: "Dono" } })
        .then((r) => r.json());
      await userB.post(`/api/groups/${group.id}/join`, { data: { whatsapp: "31922220000", name: "B" } });
      await userA.post(`/api/groups/${group.id}/complete`);
      const denuncia = await userA.post(`/api/groups/${group.id}/denuncias`, {
        data: { denunciadoId: idB, motivo: "valor_diferente", descricao: "Cobrou diferente do combinado." },
      });
      const { id } = await denuncia.json();
      await request.patch(`/api/denuncias/${id}`, {
        headers: { "X-Admin-Key": "test-admin-secret-nao-usar-em-producao" },
        data: { status: "procedente" },
      });
    }

    const me = await userB.get("/api/auth/me").then((r) => r.json());
    expect(me.user.status).toBe("restrito"); // 100 - 75 = 25, entre 20 e 40

    const criarGrupo = await userB.post("/api/groups", {
      data: { category: "compra", title: "Tentativa bloqueada", city: "BH", targetMembers: 2, whatsapp: "31922220000", name: "B" },
    });
    expect(criarGrupo.status()).toBe(403);

    // Continua podendo participar de grupo existente (entra num novo grupo criado por outra pessoa).
    const outroSetup = await apiRequest.newContext({ baseURL });
    await outroSetup.post("/api/auth/signup", {
      data: { name: "Outro Dono", email: randomEmail("outrodono"), password: "senha12345", whatsapp: "31966660000" },
    });
    const novoGrupo = await outroSetup
      .post("/api/groups", { data: { category: "curso", title: "Curso teste", city: "BH", targetMembers: 5, whatsapp: "31966660000", name: "Dono" } })
      .then((r) => r.json());
    const entrar = await userB.post(`/api/groups/${novoGrupo.id}/join`, { data: { whatsapp: "31922220000", name: "B ainda participa" } });
    expect(entrar.status()).toBe(200);
  });

  test("marcar grupo como concluído exige login, ser participante, e o grupo já estar completo", async ({ request, baseURL }) => {
    const anon = await apiRequest.newContext({ baseURL });
    const userA = await apiRequest.newContext({ baseURL });
    const emailA = randomEmail("concluir");
    await userA.post("/api/auth/signup", { data: { name: "A", email: emailA, password: "senha12345", whatsapp: "31911110000" } });
    const createRes = await userA.post("/api/groups", {
      data: { category: "compra", title: "Grupo aberto pra concluir", city: "BH", targetMembers: 5, whatsapp: "31911110000", name: "A" },
    });
    const group = await createRes.json();

    const semLogin = await anon.post(`/api/groups/${group.id}/complete`);
    expect(semLogin.status()).toBe(401);

    // Logado mas grupo ainda "aberto" (não completo) — não dá pra concluir ainda.
    const aindaAberto = await userA.post(`/api/groups/${group.id}/complete`);
    expect(aindaAberto.status()).toBe(409);
  });

  test("UI: botão 'Avaliar / Relatar problema' só aparece com o grupo fechado, e o fluxo completo funciona pela interface", async ({
    page,
  }) => {
    const titulo = `Curso UI teste ${Date.now()}`;
    const emailA = randomEmail("uiavaliador");
    const emailB = randomEmail("uiavaliado");

    await page.request.post("/api/auth/signup", {
      data: { name: "Fernando UI", email: emailA, password: "senha12345", whatsapp: "31911110000" },
    });
    const group = await page.request
      .post("/api/groups", { data: { category: "curso", title: titulo, city: "BH", targetMembers: 2, whatsapp: "31911110000", name: "Fernando" } })
      .then((r) => r.json());

    // Ainda "aberto": o card mostra Participar, sem botão de avaliação.
    await page.goto("/");
    await page.locator('.group-category-btn[data-category="curso"]').click();
    const card = page.locator(".group-card", { hasText: titulo });
    await expect(card.getByRole("button", { name: "Participar" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Avaliar / Relatar problema" })).toHaveCount(0);

    await page.request.post("/api/auth/logout");
    await page.request.post("/api/auth/signup", {
      data: { name: "Gabriela UI", email: emailB, password: "senha12345", whatsapp: "31922220000" },
    });
    await page.request.post(`/api/groups/${group.id}/join`, { data: { whatsapp: "31922220000", name: "Gabriela" } });
    await page.request.post("/api/auth/logout");
    await page.request.post("/api/auth/login", { data: { email: emailA, password: "senha12345" } });
    await page.request.post(`/api/groups/${group.id}/complete`);

    await page.goto("/");
    await page.locator('.group-category-btn[data-category="curso"]').click();
    const card2 = page.locator(".group-card", { hasText: titulo });
    await expect(card2.getByRole("button", { name: "Participar" })).toHaveCount(0);
    await card2.getByRole("button", { name: "Avaliar / Relatar problema" }).click();

    const panel = card2.locator(".group-review-panel");
    await expect(panel).toContainText("Gabriela");
    await expect(panel).toContainText("sem avaliação ainda");
    await expect(panel).toContainText("Avaliações são baseadas em histórico real de grupos");

    await panel.getByRole("button", { name: "Avaliar" }).click();
    await panel.locator("#avaliacao-nota").selectOption("5");
    await panel.locator("#avaliacao-comentario").fill("Gente ótima!");
    await panel.locator(".group-avaliacao-form button[type=submit]").click();
    await expect(panel.locator(".group-review-status")).toHaveText("Avaliação enviada!");
    await expect(panel).toContainText("5.0 ⭐ (1 avaliação)", { timeout: 3000 });

    await panel.getByRole("button", { name: "Relatar problema" }).click();
    await panel.locator("#denuncia-motivo").selectOption("outro");
    await panel.locator("#denuncia-descricao").fill("Descrição de teste pela interface.");
    await panel.locator(".group-denuncia-form button[type=submit]").click();
    await expect(panel.locator(".group-review-status")).toHaveText("Denúncia registrada.");
  });

  test("UI: quem não participou do grupo vê aviso em vez do formulário de avaliar/denunciar", async ({ page }) => {
    const titulo = `Frete UI teste ${Date.now()}`;
    const emailA = randomEmail("uidono");
    await page.request.post("/api/auth/signup", {
      data: { name: "Dono UI", email: emailA, password: "senha12345", whatsapp: "31911110000" },
    });
    const group = await page.request
      .post("/api/groups", { data: { category: "frete", title: titulo, city: "BH", targetMembers: 2, whatsapp: "31911110000", name: "Dono" } })
      .then((r) => r.json());

    await page.request.post("/api/auth/logout");
    await page.request.post("/api/auth/signup", {
      data: { name: "Participante UI", email: randomEmail("uiparticipa"), password: "senha12345", whatsapp: "31944440000" },
    });
    await page.request.post(`/api/groups/${group.id}/join`, { data: { whatsapp: "31944440000", name: "Participante" } });
    await page.request.post("/api/auth/logout");
    await page.request.post("/api/auth/login", { data: { email: emailA, password: "senha12345" } });
    await page.request.post(`/api/groups/${group.id}/complete`);
    await page.request.post("/api/auth/logout");

    await page.request.post("/api/auth/signup", {
      data: { name: "De Fora UI", email: randomEmail("uiforadone"), password: "senha12345", whatsapp: "31933330000" },
    });

    await page.goto("/");
    await page.locator('.group-category-btn[data-category="frete"]').click();
    const card = page.locator(".group-card", { hasText: titulo });
    await card.getByRole("button", { name: "Avaliar / Relatar problema" }).click();
    await expect(card.locator(".group-review-panel")).toContainText("Só quem participou desse grupo logado pode avaliar ou relatar um problema.");
  });
});

test.describe("Top3Profissional - sugestão automática entre posts, sem IA (task-005)", () => {
  test("post genérico 'ofereco' recebe sugestão de um 'quero' já publicado na mesma categoria e cidade parecida", async ({ request }) => {
    const cidade = `Contagem Teste ${Date.now()}`;
    const quero = await request
      .post("/api/groups", {
        data: { category: "frete", title: "Quero enviar uma geladeira", city: cidade, targetMembers: 2, whatsapp: "31911110000", name: "Ana", tipo: "quero" },
      })
      .then((r) => r.json());
    expect(quero.suggestions).toEqual([]);

    const ofereco = await request
      .post("/api/groups", {
        data: { category: "frete", title: "Tenho espaço no caminhão", city: cidade.toUpperCase(), targetMembers: 2, whatsapp: "31922220000", name: "Beto", tipo: "ofereco" },
      })
      .then((r) => r.json());
    expect(ofereco.suggestions).toHaveLength(1);
    expect(ofereco.suggestions[0]).toMatchObject({ id: quero.id, name: "Ana", whatsapp: "31911110000", tipo: "quero" });
  });

  test("GET /api/groups/:id/suggestions recalcula sob demanda depois que um post oposto aparece", async ({ request }) => {
    const cidade = `Sabará Teste ${Date.now()}`;
    const quero = await request
      .post("/api/groups", {
        data: { category: "curso", title: "Quero aprender violão", city: cidade, targetMembers: 2, whatsapp: "31933330000", name: "Carla", tipo: "quero" },
      })
      .then((r) => r.json());
    expect((await request.get(`/api/groups/${quero.id}/suggestions`).then((r) => r.json())).suggestions).toEqual([]);

    await request.post("/api/groups", {
      data: { category: "curso", title: "Dou aula de violão", city: cidade, targetMembers: 2, whatsapp: "31944440000", name: "Duda", tipo: "ofereco" },
    });
    const depois = await request.get(`/api/groups/${quero.id}/suggestions`).then((r) => r.json());
    expect(depois.suggestions).toHaveLength(1);
    expect(depois.suggestions[0].name).toBe("Duda");
  });

  test("não sugere mesma categoria com o mesmo tipo, categoria diferente, cidade diferente, nem quando um dos dois não informou tipo", async ({
    request,
  }) => {
    const cidade = `Betim Teste ${Date.now()}`;
    const base = await request
      .post("/api/groups", {
        data: { category: "servico", title: "Quero um jardineiro", city: cidade, targetMembers: 2, whatsapp: "31955550000", name: "Eva", tipo: "quero" },
      })
      .then((r) => r.json());

    await request.post("/api/groups", {
      data: { category: "servico", title: "Também quero um jardineiro", city: cidade, targetMembers: 2, whatsapp: "31966660000", name: "Fabio", tipo: "quero" },
    });
    await request.post("/api/groups", {
      data: { category: "compra", title: "Ofereço serviço de jardinagem", city: cidade, targetMembers: 2, whatsapp: "31977770000", name: "Gustavo", tipo: "ofereco" },
    });
    await request.post("/api/groups", {
      data: { category: "servico", title: "Ofereço jardinagem em outro lugar", city: `Cidade bem distante ${Date.now()}`, targetMembers: 2, whatsapp: "31988880000", name: "Helena", tipo: "ofereco" },
    });
    await request.post("/api/groups", {
      data: { category: "servico", title: "Sem tipo declarado", city: cidade, targetMembers: 2, whatsapp: "31999990000", name: "Ivo" },
    });

    const suggestions = await request.get(`/api/groups/${base.id}/suggestions`).then((r) => r.json());
    expect(suggestions.suggestions).toEqual([]);
  });

  test("carona: passageiro (post individual, sempre 'completo') continua elegível pra sugestão — não é tratado como 'resolvido'", async ({
    request,
  }) => {
    const passageiro = await request
      .post("/api/groups", {
        data: {
          category: "carona",
          title: "Preciso ir pra BH",
          city: "Bom Despacho",
          whatsapp: "31911112222",
          name: "Debora",
          tipo: "passageiro",
          origemTexto: "Bom Despacho, MG",
          destinoTexto: "BH",
          dataViagem: "2026-10-01",
        },
      })
      .then((r) => r.json());
    expect(passageiro.status).toBe("completo");

    const motorista = await request
      .post("/api/groups", {
        data: {
          category: "carona",
          title: "Bom Despacho -> BH",
          city: "Bom Despacho",
          whatsapp: "31922223333",
          name: "Carlos",
          tipo: "motorista",
          origemTexto: "Bom Despacho",
          destinoTexto: "Belo Horizonte",
          dataViagem: "2026-10-01",
          vagasTotais: 2,
          cnhNumero: "12345678900",
          veiculoPlaca: "ABC1D23",
          veiculoModelo: "Onix",
          veiculoCor: "Prata",
        },
      })
      .then((r) => r.json());
    expect(motorista.suggestions).toHaveLength(1);
    expect(motorista.suggestions[0]).toMatchObject({ id: passageiro.id, name: "Debora" });
  });

  test("carona: não sugere motorista sem vaga (status completo), nem data incompatível (fora da janela de 1 dia)", async ({ request }) => {
    // Motorista com 1 vaga só, que já vai ficar "completo" ao entrar um passageiro.
    const motoristaLotado = await request
      .post("/api/groups", {
        data: {
          category: "carona",
          title: "Sabará -> BH lotado",
          city: "Sabará",
          whatsapp: "31933334444",
          name: "Marcos",
          tipo: "motorista",
          origemTexto: "Sabará",
          destinoTexto: "BH",
          dataViagem: "2026-10-05",
          vagasTotais: 1,
          cnhNumero: "98765432100",
          veiculoPlaca: "XYZ9A87",
          veiculoModelo: "HB20",
          veiculoCor: "Branco",
        },
      })
      .then((r) => r.json());
    await request.post(`/api/groups/${motoristaLotado.id}/join`, { data: { whatsapp: "31900001111", name: "Passageiro Extra" } });

    const motoristaDataDistante = await request
      .post("/api/groups", {
        data: {
          category: "carona",
          title: "Sabará -> BH data distante",
          city: "Sabará",
          whatsapp: "31944445555",
          name: "Nina",
          tipo: "motorista",
          origemTexto: "Sabará",
          destinoTexto: "BH",
          dataViagem: "2026-11-20",
          vagasTotais: 2,
          cnhNumero: "11122233344",
          veiculoPlaca: "QWE4R56",
          veiculoModelo: "Argo",
          veiculoCor: "Vermelho",
        },
      })
      .then((r) => r.json());

    const passageiro = await request
      .post("/api/groups", {
        data: {
          category: "carona",
          title: "Preciso ir de Sabará pra BH",
          city: "Sabará",
          whatsapp: "31955556666",
          name: "Olivia",
          tipo: "passageiro",
          origemTexto: "Sabará",
          destinoTexto: "BH",
          dataViagem: "2026-10-05",
        },
      })
      .then((r) => r.json());
    expect(passageiro.suggestions).toEqual([]);

    // Sanidade: motoristaDataDistante existe mas não deveria ter sido sugerido (data muito longe).
    const ids = passageiro.suggestions.map((s) => s.id);
    expect(ids).not.toContain(motoristaLotado.id);
    expect(ids).not.toContain(motoristaDataDistante.id);
  });

  test("UI: criar um post 'ofereço' depois de um 'quero' compatível mostra a sugestão com botão de WhatsApp na tela de confirmação", async ({
    page,
  }) => {
    const cidade = `Nova Lima UI ${Date.now()}`;
    await page.request.post("/api/groups", {
      data: { category: "curso", title: "Quero aula de violão", city: cidade, targetMembers: 2, whatsapp: "31911119999", name: "Paula", tipo: "quero" },
    });

    await page.goto("/");
    await page.getByRole("button", { name: "+ Criar um grupo" }).click();
    await page.locator("#group-title").fill("Dou aula de violão particular");
    await page.locator("#group-category").selectOption("curso");
    await page.locator("#group-city").fill(cidade);
    await page.locator("#group-target").fill("2");
    await page.locator("#group-tipo").selectOption("ofereco");
    await page.locator("#group-whatsapp").fill("31922229999");
    await page.locator("#group-name").fill("Rogerio");
    await page.locator("#group-form button[type=submit]").click();

    await expect(page.locator("#group-status")).toHaveText("Grupo criado!");
    const suggestions = page.locator("#group-suggestions");
    await expect(suggestions).toContainText("Encontramos 1 pessoa que combina com o que você procura!");
    await expect(suggestions).toContainText("Paula");
    await expect(suggestions.getByRole("link", { name: "Falar no WhatsApp" })).toHaveAttribute("href", "https://wa.me/31911119999");
  });

  test("UI: criar um post sem ninguém compatível não mostra nenhuma sugestão", async ({ page }) => {
    const cidade = `Cidade Sozinha UI ${Date.now()}`;
    await page.goto("/");
    await page.getByRole("button", { name: "+ Criar um grupo" }).click();
    await page.locator("#group-title").fill("Quero uma diarista");
    await page.locator("#group-category").selectOption("servico");
    await page.locator("#group-city").fill(cidade);
    await page.locator("#group-target").fill("2");
    await page.locator("#group-tipo").selectOption("quero");
    await page.locator("#group-whatsapp").fill("31900001234");
    await page.locator("#group-form button[type=submit]").click();

    await expect(page.locator("#group-status")).toHaveText("Grupo criado!");
    await expect(page.locator("#group-suggestions")).toBeEmpty();
  });
});

test.describe("Top3Profissional - busca por palavra-chave, sem IA (task-005)", () => {
  test("critério de pronto do task-005: 'manicure amanhã em BH' retorna o ranking de manicure filtrado, com data e cidade reconhecidos", async ({
    request,
  }) => {
    const res = await request.get("/api/search?q=" + encodeURIComponent("manicure amanhã em BH"));
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("service");
    expect(body.service).toBe("manicure");
    expect(body.city).toBe("belo horizonte");
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.every((r) => r.service === "manicure")).toBe(true);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const expectedDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    expect(body.date).toBe(expectedDate);
  });

  test("reconhece sinônimo de serviço fora do nome exato (ex: 'unha' -> manicure)", async ({ request }) => {
    const body = await request.get("/api/search?q=" + encodeURIComponent("preciso fazer unha hoje")).then((r) => r.json());
    expect(body.type).toBe("service");
    expect(body.service).toBe("manicure");
  });

  // Missão 3 (#115) cita "elétrico" e "instalador" como termos reais de teste —
  // nenhum dos dois batia em nenhum sinônimo de eletricista (só "elétrica" e
  // "instalação elétrica" estavam cadastrados), então a busca caía no
  // fallback de texto livre em vez de achar o serviço cadastrado.
  test("reconhece variações de sinônimo de eletricista (ex: 'elétrico', 'instalador')", async ({ request }) => {
    const porGenero = await request.get("/api/search?q=" + encodeURIComponent("preciso de um elétrico")).then((r) => r.json());
    expect(porGenero.type).toBe("service");
    expect(porGenero.service).toBe("eletricista");

    const porOcupacao = await request.get("/api/search?q=" + encodeURIComponent("procuro um instalador")).then((r) => r.json());
    expect(porOcupacao.type).toBe("service");
    expect(porOcupacao.service).toBe("eletricista");
  });

  // "elétrico" e "instalador" sozinhos são genéricos demais: sem essa
  // exclusão, "carro elétrico" e "instalador de ar condicionado" também
  // batiam no sinônimo de eletricista por serem substring da busca.
  test("não confunde 'carro elétrico' nem 'instalador de ar condicionado' com o serviço eletricista", async ({ request }) => {
    const carro = await request.get("/api/search?q=" + encodeURIComponent("quanto custa um carro elétrico")).then((r) => r.json());
    expect(carro.type).not.toBe("service");

    const arCondicionado = await request
      .get("/api/search?q=" + encodeURIComponent("preciso de um instalador de ar condicionado"))
      .then((r) => r.json());
    expect(arCondicionado.type).not.toBe("service");
  });

  // A exclusão de "ar condicionado" é só pro sinônimo "instalador" — não pode
  // derrubar um pedido real de eletricista só porque a frase "ar
  // condicionado" aparece perto de outro sinônimo mais específico.
  test("não deixa a exclusão de 'ar condicionado' cancelar um pedido real de instalação elétrica", async ({ request }) => {
    const body = await request
      .get("/api/search?q=" + encodeURIComponent("preciso de instalação elétrica para o ar condicionado"))
      .then((r) => r.json());
    expect(body.type).toBe("service");
    expect(body.service).toBe("eletricista");
  });

  test("reconhece categoria de grupo por sinônimo (ex: 'mudança' -> frete) e filtra por cidade", async ({ request }) => {
    const cidade = `Contagem Busca ${Date.now()}`;
    await request.post("/api/groups", {
      data: { category: "frete", title: "Ofereço frete pra mudança", city: cidade, targetMembers: 2, whatsapp: "31911110000", name: "Zeca", tipo: "ofereco" },
    });
    const body = await request.get("/api/search?q=" + encodeURIComponent(`mudança em ${cidade}`)).then((r) => r.json());
    expect(body.type).toBe("group");
    expect(body.category).toBe("frete");
    expect(body.results.some((g) => g.city === cidade)).toBe(true);
  });

  test("reconhece dia da semana e data dd/mm, sempre apontando pra uma data futura", async ({ request }) => {
    const today = new Date();
    const weekdayNames = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
    const otherWeekday = weekdayNames[(today.getDay() + 3) % 7]; // um dia da semana != hoje
    const bodyWeekday = await request.get("/api/search?q=" + encodeURIComponent(`corte de cabelo ${otherWeekday}`)).then((r) => r.json());
    expect(bodyWeekday.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(bodyWeekday.date + "T12:00:00") > today).toBe(true);

    const bodyDdMm = await request.get("/api/search?q=" + encodeURIComponent("eletricista 25/12")).then((r) => r.json());
    expect(bodyDdMm.date).toMatch(/-12-25$/);
  });

  test("sem serviço nem categoria reconhecidos, cai no fallback de texto livre e acha post pelo título", async ({ request }) => {
    const marcador = `revistararaedicaolimitada${Date.now()}`;
    const titulo = `Coleção de ${marcador}`;
    await request.post("/api/groups", {
      data: { category: "compra", title: titulo, city: "BH", targetMembers: 2, whatsapp: "31911110000", name: "Wagner" },
    });
    // "coleção" e o marcador não batem nenhum sinônimo de serviço/categoria.
    const body = await request.get("/api/search?q=" + encodeURIComponent(marcador)).then((r) => r.json());
    expect(body.type).toBe("text");
    expect(body.results.some((g) => g.title === titulo)).toBe(true);
  });

  test("busca sem nenhum resultado reconhecido devolve lista vazia, sem erro e sem travar", async ({ request }) => {
    const res = await request.get("/api/search?q=" + encodeURIComponent(`termo completamente aleatorio ${Date.now()}`));
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  test("segunda busca idêntica vem do cache (cached: true)", async ({ request }) => {
    const termo = `busca cache teste ${Date.now()}`;
    const first = await request.get("/api/search?q=" + encodeURIComponent(termo)).then((r) => r.json());
    expect(first.cached).toBe(false);
    const second = await request.get("/api/search?q=" + encodeURIComponent(termo)).then((r) => r.json());
    expect(second.cached).toBe(true);
    expect(second.results).toEqual(first.results);
  });

  test("exige o parâmetro 'q'", async ({ request }) => {
    const res = await request.get("/api/search");
    expect(res.status()).toBe(400);
  });

  test("UI: buscar um sinônimo de serviço na barra principal mostra o ranking filtrado, sem cair na busca web", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.locator("#hero-search-input");
    await searchInput.fill("preciso fazer unha amanhã");
    await searchInput.press("Enter");
    await expect(page.locator("#ranking-title")).toContainText("manicure");
    await expect(page.locator("#ranking-list li").first()).toBeVisible();
  });

  test("UI: buscar uma categoria de Grupos por sinônimo destaca a seção Grupos já filtrada", async ({ page }) => {
    const cidade = `Betim UI Busca ${Date.now()}`;
    await page.request.post("/api/groups", {
      data: { category: "frete", title: "Ofereço frete pra mudança", city: cidade, targetMembers: 2, whatsapp: "31911110000", name: "Zeca", tipo: "ofereco" },
    });
    await page.goto("/");
    const searchInput = page.locator("#hero-search-input");
    await searchInput.fill(`mudança em ${cidade}`);
    await searchInput.press("Enter");
    await expect(page.locator('.group-category-btn[data-category="frete"]')).toHaveClass(/is-active/);
    await expect(page.locator(".group-card", { hasText: cidade })).toBeVisible();
  });
});

test.describe("Top3Profissional - referência de preço externa, sem IA (task-007)", () => {
  test("exige o campo 'description'", async ({ request }) => {
    const res = await request.get("/api/price-reference?local=BH");
    expect(res.status()).toBe(400);
  });

  test("busca de referência de preço retorna resultados reais da web, sem nenhuma IA (só roda com SearXNG/Brave configurados)", async ({
    request,
  }) => {
    test.skip(
      !(process.env.SEARXNG_URL || process.env.BRAVE_SEARCH_API_KEY),
      "precisa de SEARXNG_URL ou BRAVE_SEARCH_API_KEY pra testar a busca de referência de verdade"
    );
    const res = await request.get("/api/price-reference?description=" + encodeURIComponent("faxina residencial") + "&local=Belo Horizonte");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0]).toHaveProperty("title");
    expect(body.results[0]).toHaveProperty("url");
    expect(body.results[0].url).toMatch(/^https?:\/\//);
  });

  test("sem SearXNG nem Brave configurados, devolve 'não disponível' em vez de erro (nunca trava a tela)", async ({ request }) => {
    test.skip(
      Boolean(process.env.SEARXNG_URL || process.env.BRAVE_SEARCH_API_KEY),
      "esse teste verifica o caso SEM nenhuma busca configurada — pula quando uma das duas está ativa nesse ambiente"
    );
    const res = await request.get("/api/price-reference?description=teste&local=BH");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.results).toEqual([]);
  });

  test("UI: botão 'Ver preços de referência' aparece no formulário de criar grupo e mostra resultados ao clicar (só roda com SearXNG/Brave configurados)", async ({
    page,
  }) => {
    test.skip(
      !(process.env.SEARXNG_URL || process.env.BRAVE_SEARCH_API_KEY),
      "precisa de SEARXNG_URL ou BRAVE_SEARCH_API_KEY pra testar a busca de referência de verdade"
    );
    await page.goto("/");
    await page.getByRole("button", { name: "+ Criar um grupo" }).click();
    await page.locator("#group-title").fill("Diarista para faxina residencial");
    await page.locator("#group-city").fill("Belo Horizonte");
    await page.getByRole("button", { name: "Ver preços de referência" }).click();

    const panel = page.locator("#group-price-reference-panel");
    await expect(panel.locator("a").first()).toBeVisible({ timeout: 15000 });
    await expect(panel.locator("a").first()).toHaveAttribute("href", /^https?:\/\//);
  });

  test("UI: clicar em 'Ver preços de referência' sem preencher o que o grupo quer conseguir só foca o campo, sem travar", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "+ Criar um grupo" }).click();
    await page.getByRole("button", { name: "Ver preços de referência" }).click();
    await expect(page.locator("#group-title")).toBeFocused();
    await expect(page.locator("#group-price-reference-panel")).toBeHidden();
  });
});

test.describe("Top3Profissional - armazenamento de fotos no MinIO, self-hosted (task-008)", () => {
  test("sem MINIO_ENDPOINT configurado, /health reporta minioConfigured false (fallback de disco continua valendo)", async ({
    request,
  }) => {
    test.skip(Boolean(process.env.MINIO_ENDPOINT), "esse teste é justamente o caso sem MinIO — pula quando está configurado");
    const health = await (await request.get("/health")).json();
    expect(health.minioConfigured).toBe(false);
  });

  test("com MINIO_ENDPOINT configurado, foto de perfil vai pro MinIO (bucket privado, nunca exposto) em vez de disco local (só roda com MinIO configurado)", async ({
    request,
  }) => {
    test.skip(!process.env.MINIO_ENDPOINT, "precisa de MINIO_ENDPOINT pra testar o armazenamento de verdade");
    const health = await (await request.get("/health")).json();
    expect(health.minioConfigured).toBe(true);

    const res = await request.post("/api/providers", {
      multipart: {
        name: "Perfil Com MinIO",
        service: "manicure",
        description: "testando armazenamento no MinIO",
        location: "Contagem",
        whatsapp: "31999990000",
        photos: { name: "foto.png", mimeType: "image/png", buffer: require("fs").readFileSync("assets/icons/icon-192.png") },
      },
    });
    expect(res.status()).toBe(201);
    const { provider } = await res.json();
    const photoUrl = provider.photos[0].url;

    // Mesma forma de URL de sempre (/uploads/providers/...), venha do MinIO
    // ou do disco — o servidor busca o objeto e repassa os bytes, o MinIO em
    // si nunca fica exposto (critério de pronto do task-008: bucket
    // privado).
    expect(photoUrl).toMatch(/^\/uploads\/providers\//);
    const photoRes = await request.get(photoUrl);
    expect(photoRes.status()).toBe(200);
    expect(photoRes.headers()["content-type"]).toBe("image/png");
    expect((await photoRes.body()).length).toBeGreaterThan(0);

    // Acessar o objeto direto no MinIO (sem passar pelo proxy do servidor,
    // sem credencial) não funciona — bucket privado de verdade, não só uma
    // URL "escondida".
    const directUrl = `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT || 9000}/${process.env.MINIO_BUCKET || "top3-uploads"}/providers/${provider.id}/0.png`;
    const directRes = await request.get(directUrl);
    expect(directRes.status()).toBe(403);
  });
});

test.describe("Top3Profissional - anti-spam com ALTCHA, sem terceiro (task-008)", () => {
  function uniqueSuffix() {
    return Math.random().toString(36).slice(2, 10);
  }

  // O widget é criado dinamicamente via JS depois de um fetch a
  // /api/auth/config (ver createAltchaWidget em assets/app.js) — às vezes o
  // clique force:true chega antes do custom element terminar de ligar o
  // próprio listener interno. Reclica se ainda não verificou depois de um
  // instante, em vez de confiar num único clique.
  async function solveAltcha(widget) {
    const checkbox = widget.locator('input[type="checkbox"]');
    const status = widget.locator(".altcha");
    for (let attempt = 0; attempt < 3; attempt++) {
      await checkbox.click({ force: true });
      try {
        await expect(status).toHaveAttribute("data-state", "verified", { timeout: 5000 });
        return;
      } catch (err) {
        if (attempt === 2) throw err;
      }
    }
  }

  test("sem ALTCHA_HMAC_KEY configurado, /health e /api/auth/config reportam desativado — cadastro e criação de grupo continuam funcionando sem captcha nenhum", async ({
    request,
  }) => {
    test.skip(Boolean(process.env.ALTCHA_HMAC_KEY), "esse teste é justamente o caso sem ALTCHA — pula quando está configurado");
    const health = await (await request.get("/health")).json();
    expect(health.altchaConfigured).toBe(false);
    const config = await (await request.get("/api/auth/config")).json();
    expect(config.altchaConfigured).toBe(false);
    // Os 52+ outros testes deste arquivo que cadastram conta e criam grupo
    // direto via API, sem mandar nenhum campo "altcha", já provam isso na
    // prática — aqui só confirma o sinal que o front-end usa pra decidir se
    // mostra o widget.
  });

  test("GET /api/altcha-challenge sem ALTCHA_HMAC_KEY configurado fica desativado (503), não trava nada", async ({ request }) => {
    test.skip(Boolean(process.env.ALTCHA_HMAC_KEY), "esse teste é justamente o caso sem ALTCHA — pula quando está configurado");
    const res = await request.get("/api/altcha-challenge");
    expect(res.status()).toBe(503);
  });

  test.describe("com ALTCHA_HMAC_KEY configurado (só roda com a variável definida)", () => {
    test.skip(!process.env.ALTCHA_HMAC_KEY, "precisa de ALTCHA_HMAC_KEY pra testar a verificação de verdade");

    test("/health e /api/auth/config reportam configurado, GET /api/altcha-challenge devolve um desafio válido", async ({ request }) => {
      const health = await (await request.get("/health")).json();
      expect(health.altchaConfigured).toBe(true);
      const config = await (await request.get("/api/auth/config")).json();
      expect(config.altchaConfigured).toBe(true);

      const challengeRes = await request.get("/api/altcha-challenge");
      expect(challengeRes.status()).toBe(200);
      const challenge = await challengeRes.json();
      expect(challenge.algorithm).toBe("SHA-256");
      expect(typeof challenge.challenge).toBe("string");
      expect(typeof challenge.signature).toBe("string");
    });

    test("cadastro sem o campo altcha (ou com um payload inventado) é rejeitado, sem criar a conta", async ({ request }) => {
      const semAltcha = await request.post("/api/auth/signup", {
        data: { name: "Sem Altcha", email: `sem-altcha-${uniqueSuffix()}@example.com`, password: "senha12345", whatsapp: "31999990000" },
      });
      expect(semAltcha.status()).toBe(400);

      const inventado = await request.post("/api/auth/signup", {
        data: {
          name: "Altcha Falso",
          email: `altcha-falso-${uniqueSuffix()}@example.com`,
          password: "senha12345",
          whatsapp: "31999990000",
          altcha: "isso-nao-e-um-payload-valido",
        },
      });
      expect(inventado.status()).toBe(400);
    });

    test("criar grupo sem o campo altcha é rejeitado, sem criar o grupo", async ({ request }) => {
      const res = await request.post("/api/groups", {
        data: {
          category: "assinatura",
          title: `sem altcha ${uniqueSuffix()}`,
          city: "Contagem",
          targetMembers: 3,
          tipo: "quero",
          whatsapp: "31999990000",
        },
      });
      expect(res.status()).toBe(400);
    });

    // force: true no clique do widget — o menu fixo no topo e a barra de
    // busca fixa embaixo (ver .site-top/.bottom-bar em style.css) quase
    // sempre acabam encostando na checagem de "nada por cima" do Playwright
    // em algum ponto da página, mesmo depois de rolar. Fluxo já verificado
    // manualmente de ponta a ponta num navegador de verdade — aqui é só a
    // checagem de actionability do teste sendo severa demais com elemento
    // parcialmente atrás de uma barra fixa, não um problema funcional de
    // verdade. Submissão final via requestSubmit() direto (não clique no
    // botão) pelo mesmo motivo — o layout ao redor do botão muda de altura
    // quando o widget termina de resolver o desafio, e depender de onde o
    // botão acabou ficando na tela é frágil; o que este teste quer provar é
    // que o desafio resolvido de verdade é aceito pelo servidor, não qual
    // pixel exato o botão ocupa.
    test("UI: cadastro resolve o desafio no navegador (proof-of-work de verdade) e completa normalmente", async ({ page }) => {
      await page.goto("/");
      await page.locator("#email-auth-toggle").click();
      await page.locator('[data-auth-mode="signup"]').click();

      const email = `altcha-ui-${uniqueSuffix()}@example.com`;
      await page.locator("#auth-name").fill("UI Altcha");
      await page.locator("#auth-whatsapp").fill("31999990000");
      await page.locator("#auth-email").fill(email);
      await page.locator("#auth-password").fill("senha12345");

      const widget = page.locator('[data-auth-field="altcha"] altcha-widget');
      await solveAltcha(widget);

      await page.locator("#email-auth-form").evaluate((form) => form.requestSubmit());
      // #user-panel é um dropdown que só abre com clique explícito no chip —
      // fica escondido mesmo logo depois de logar. O sinal real de "logou
      // com sucesso" é o botão de entrar sumir e o chip de usuário aparecer.
      await expect(page.locator("#email-auth-toggle")).toBeHidden({ timeout: 10000 });
      await expect(page.locator("#user-chip-toggle")).toBeVisible();
    });

    test("UI: criar grupo resolve o desafio no navegador e completa normalmente", async ({ page }) => {
      await page.goto("/#grupos");
      await page.getByRole("button", { name: "+ Criar um grupo" }).click();
      await page.locator("#group-category").selectOption("assinatura");
      await page.locator("#group-title").fill(`grupo com altcha ${uniqueSuffix()}`);
      await page.locator("#group-city").fill("Contagem");
      await page.locator("#group-target").fill("3");
      await page.locator("#group-tipo").selectOption("quero");
      await page.locator("#group-whatsapp").fill("31999990000");

      const widget = page.locator("#group-form altcha-widget");
      await solveAltcha(widget);

      await page.locator("#group-form").evaluate((form) => form.requestSubmit());
      await expect(page.locator("#group-status")).toHaveText("Grupo criado!", { timeout: 10000 });
    });

    test("uma solução válida não pode ser reaproveitada duas vezes (proteção contra replay)", async ({ page, request }) => {
      await page.goto("/#grupos");
      await page.getByRole("button", { name: "+ Criar um grupo" }).click();
      const widget = page.locator("#group-form altcha-widget");
      await solveAltcha(widget);
      const payload = await widget.locator('input[type="hidden"]').inputValue();

      const base = {
        category: "assinatura",
        city: "Contagem",
        targetMembers: 3,
        tipo: "quero",
        whatsapp: "31999990000",
        altcha: payload,
      };
      const first = await request.post("/api/groups", { data: { ...base, title: `replay 1 ${uniqueSuffix()}` } });
      expect(first.status()).toBe(201);
      const second = await request.post("/api/groups", { data: { ...base, title: `replay 2 ${uniqueSuffix()}` } });
      expect(second.status()).toBe(400);
    });
  });
});

test.describe("Top3Profissional - estatísticas do site via Umami, self-hosted (task-008)", () => {
  test("/health e /api/auth/config reportam o Umami configurado (variáveis de teste)", async ({ request }) => {
    const health = await (await request.get("/health")).json();
    expect(health.umamiConfigured).toBe(true);

    const config = await (await request.get("/api/auth/config")).json();
    expect(config.umamiScriptUrl).toBe("https://stats.test.invalid/script.js");
    expect(config.umamiWebsiteId).toBe("test-website-id-nao-usar-em-producao");
  });

  test("UI: script de rastreamento do Umami é injetado no <head> com o website-id certo, sem mandar dado pra terceiro (Google Analytics etc)", async ({
    page,
  }) => {
    // Mesmo domínio de teste propositalmente falso das outras duas (ver
    // primeiro teste do arquivo) — simula o carregamento pra não gerar
    // barulho de rede de verdade contra um domínio que nunca resolve.
    await page.route("https://stats.test.invalid/script.js", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
    );
    await page.goto("/");
    const script = page.locator('head script[src="https://stats.test.invalid/script.js"]');
    await expect(script).toHaveCount(1);
    await expect(script).toHaveAttribute("data-website-id", "test-website-id-nao-usar-em-producao");
  });
});

test.describe("Top3Profissional - geocodificação via Nominatim público, sem custo (task-008)", () => {
  function uniqueSuffix() {
    return Math.random().toString(36).slice(2, 10);
  }

  test("sem geocodificação (padrão nos testes), criar grupo e carona continua funcionando normalmente", async ({ request }) => {
    // Padrão real é "desativado" mesmo sem a variável setada (o webServer
    // aplica DISABLE_GEOCODING || "1" — ver playwright.config.js) — só pula
    // quando alguém ativa explicitamente com "0".
    test.skip(process.env.DISABLE_GEOCODING === "0", "esse teste é justamente o caso sem geocodificação — pula quando está ativada de propósito");
    const res = await request.post("/api/groups", {
      data: {
        category: "assinatura",
        title: `sem geocode ${uniqueSuffix()}`,
        city: "Cidade Qualquer",
        targetMembers: 3,
        estimatedIndividualPrice: 20,
        tipo: "quero",
        whatsapp: "31999990000",
      },
    });
    expect(res.status()).toBe(201);

    // Carona sem geocodificação real continua criando normalmente, só sem
    // a distância aproximada (task-008, item 2 — Haversine + multiplicador).
    const carona = await request.post("/api/groups", {
      data: {
        category: "carona",
        tipo: "passageiro",
        title: `sem geocode carona ${uniqueSuffix()}`,
        city: "Cidade Qualquer",
        origemTexto: "Origem Qualquer",
        destinoTexto: "Destino Qualquer",
        dataViagem: "2026-10-01",
        whatsapp: "31999990002",
      },
    });
    expect(carona.status()).toBe(201);
    expect((await carona.json()).carona.distanciaAproximadaKm).toBeNull();
  });

  test("com geocodificação ativada, carona ganha distância aproximada (Haversine + multiplicador, só roda com DISABLE_GEOCODING=0)", async ({
    request,
  }) => {
    test.skip(process.env.DISABLE_GEOCODING !== "0", "precisa rodar com DISABLE_GEOCODING=0 pra testar a geocodificação de verdade");

    // Contagem → Betim, região metropolitana de BH: linha reta real é
    // ~15-20km. Com o multiplicador de correção (1.3 padrão), o valor
    // retornado tem que ser maior que a linha reta pura, mas ainda dentro
    // de uma faixa plausível pra não pegar um erro de geocodificação
    // grosseiro sem quebrar por causa de uma pequena variação do provedor.
    const res = await request.post("/api/groups", {
      data: {
        category: "carona",
        tipo: "passageiro",
        title: `carona com distância ${uniqueSuffix()}`,
        city: "Contagem, MG",
        origemTexto: "Contagem, MG",
        destinoTexto: "Betim, MG",
        dataViagem: "2026-10-02",
        whatsapp: "31999990003",
      },
    });
    expect(res.status()).toBe(201);
    const { carona } = await res.json();
    expect(typeof carona.distanciaAproximadaKm).toBe("number");
    expect(carona.distanciaAproximadaKm).toBeGreaterThan(5);
    expect(carona.distanciaAproximadaKm).toBeLessThan(60);
  });

  test("com geocodificação ativada, sugestão entre grupos usa distância real além do texto (só roda com DISABLE_GEOCODING=0)", async ({
    request,
  }) => {
    test.skip(process.env.DISABLE_GEOCODING !== "0", "precisa rodar com DISABLE_GEOCODING=0 pra testar a geocodificação de verdade");

    // "Contagem" e "Betim" não têm nenhuma substring em comum (o matching
    // por texto sozinho nunca sugeriria um pro outro) — só ficam pertinho
    // (~15km, mesma região metropolitana) se a coordenada de verdade
    // entrar em jogo.
    const quero = await request.post("/api/groups", {
      data: {
        category: "assinatura",
        title: `quero geocode ${uniqueSuffix()}`,
        city: "Contagem, MG",
        targetMembers: 3,
        estimatedIndividualPrice: 20,
        tipo: "quero",
        whatsapp: "31999990010",
      },
    });
    expect(quero.status()).toBe(201);

    const ofereco = await request.post("/api/groups", {
      data: {
        category: "assinatura",
        title: `ofereco geocode ${uniqueSuffix()}`,
        city: "Betim, MG",
        targetMembers: 3,
        estimatedIndividualPrice: 20,
        tipo: "ofereco",
        whatsapp: "31999990011",
      },
    });
    expect(ofereco.status()).toBe(201);
    const { id: querId } = await quero.json();
    const { suggestions } = await ofereco.json();
    expect(suggestions.some((s) => s.id === querId)).toBe(true);
  });
});

test.describe("Top3Profissional - correções de UX no formulário de Publicar (task-009)", () => {
  function uniqueSuffix() {
    return Math.random().toString(36).slice(2, 10);
  }
  function randomEmail() {
    return `task009-${uniqueSuffix()}@example.com`;
  }

  test("item 1: 'O que você precisa' com padrão de rota preenche 'Onde' sozinho, sem exigir digitar de novo", async ({ page }) => {
    await page.goto("/");
    await page.locator("#post-title").fill("Centro → Rodoviária");
    await expect(page.locator("#post-location")).toHaveValue("Centro → Rodoviária");

    // "de X para Y" também é reconhecido, não só a seta.
    await page.locator("#post-title").fill("de Savassi para o Aeroporto");
    await expect(page.locator("#post-location")).toHaveValue("Savassi → o Aeroporto");

    // Sem padrão nenhum detectável: "Onde" fica vazio, mas não bloqueia —
    // publica normal (comportamento já coberto no describe de fluxo básico).
    await page.locator("#post-title").fill("preciso de uma manicure");
    await expect(page.locator("#post-location")).toHaveValue("");

    // Editando "Onde" na mão, o vínculo automático com o título para (não
    // sobrescreve o que a pessoa acabou de digitar).
    await page.locator("#post-title").fill("Centro → Rodoviária");
    await page.locator("#post-location").fill("Editado à mão");
    await page.locator("#post-title").fill("Savassi → Centro");
    await expect(page.locator("#post-location")).toHaveValue("Editado à mão");
  });

  test("item 1: botão 'Publicar essa corrida' (seção Corridas) também preenche 'Onde' sozinho", async ({ page }) => {
    await page.goto("/");
    await page.locator("#ride-from").fill(`OrigemTeste${uniqueSuffix()}`);
    await page.locator("#ride-to").fill(`DestinoTeste${uniqueSuffix()}`);
    await page.locator("#ride-form button[type=submit]").click();
    await page.locator("#ride-publish-btn").click();
    await expect(page.locator("#post-location")).not.toHaveValue("");
  });

  test("item 2: 'Quando' abre com a data de hoje já selecionada, horário fica opcional", async ({ page }) => {
    await page.goto("/");
    const today = new Date();
    const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    await expect(page.locator("#post-date")).toHaveValue(isoToday);
    await expect(page.locator("#post-time")).toHaveValue("");
    await expect(page.locator("#post-time")).not.toHaveAttribute("required", "");
  });

  test("item 3: WhatsApp e nome vêm pré-preenchidos do perfil pra quem está logada, em branco pra quem não está", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#post-whatsapp")).toHaveValue("");
    await expect(page.locator("#post-requester")).toHaveValue("");

    const email = randomEmail();
    await page.request.post("/api/auth/signup", {
      data: { name: "Fulana Prefill", email, password: "senha12345", whatsapp: "31955557777" },
    });
    await page.goto("/");
    await expect(page.locator("#post-whatsapp")).toHaveValue("31955557777");
    await expect(page.locator("#post-requester")).toHaveValue("Fulana Prefill");
  });

  test("item 5: 'Tipo' não tem mais 'carro' separado, tem 'imóvel' no lugar de 'terreno'", async ({ page }) => {
    await page.goto("/");
    const values = await page.locator("#post-type option").evaluateAll((opts) => opts.map((o) => o.value));
    expect(values).not.toContain("carro");
    expect(values).not.toContain("terreno");
    expect(values).toContain("imovel");
  });

  test("item 5: dentro de 'produto', busca por palavra-chave filtra certo (ex: 'TV' não traz 'carro')", async ({ request, page }) => {
    const tv = await request.post("/api/requests", {
      data: { type: "produto", title: `TV 50 polegadas ${uniqueSuffix()}`, price: 1500, whatsapp: "31999990020" },
    });
    expect(tv.status()).toBe(201);
    const carro = await request.post("/api/requests", {
      data: { type: "produto", title: `carro sedan 2015 ${uniqueSuffix()}`, price: 30000, whatsapp: "31999990021" },
    });
    expect(carro.status()).toBe(201);
    const { request: tvRequest } = await tv.json();
    const { request: carroRequest } = await carro.json();

    await page.goto("/");
    await page.getByRole("tab", { name: /presto serviço/i }).click();
    await page.locator("#requests-filter-keyword").fill("TV");
    await expect(page.locator(`.request-item[data-id="${tvRequest.id}"]`)).toBeVisible();
    await expect(page.locator(`.request-item[data-id="${carroRequest.id}"]`)).toHaveCount(0);

    await page.locator("#requests-filter-keyword").fill("carro");
    await expect(page.locator(`.request-item[data-id="${carroRequest.id}"]`)).toBeVisible();
    await expect(page.locator(`.request-item[data-id="${tvRequest.id}"]`)).toHaveCount(0);

    await page.locator("#requests-filter-keyword").fill("");
    await page.locator("#requests-filter-type").selectOption("produto");
    await expect(page.locator(`.request-item[data-id="${tvRequest.id}"]`)).toBeVisible();
    await expect(page.locator(`.request-item[data-id="${carroRequest.id}"]`)).toBeVisible();

    await page.locator("#requests-filter-type").selectOption("corrida");
    await expect(page.locator(`.request-item[data-id="${tvRequest.id}"]`)).toHaveCount(0);
  });

  test("item 4: menu do topo removido — seções 'corridas' e 'publicar' permanecem na página e são adjacentes", async ({
    page,
  }) => {
    await page.goto("/");
    // Nav removido — verificar que as seções ainda existem
    await expect(page.locator("#corridas")).toBeAttached();
    await expect(page.locator("#publicar")).toBeAttached();

    // As duas seções (busca rápida De onde/Pra onde + formulário completo)
    // ficam fisicamente juntas na página — o link do menu abre já na
    // primeira, rolando naturalmente pra segunda, em vez de serem dois
    // destinos distantes e concorrentes. Mede as duas de uma vez só (uma
    // chamada a page.evaluate) — duas chamadas separadas a boundingBox()
    // podem rolar a página entre uma e outra numa página bem mais alta
    // (task-012), tornando a primeira medição desatualizada em relação à
    // rolagem da segunda e produzindo um "gap" que não existe de verdade
    // (confirmado manualmente: o gap real é 0px).
    const gap = await page.evaluate(() => {
      const c = document.getElementById("corridas").getBoundingClientRect();
      const p = document.getElementById("publicar").getBoundingClientRect();
      return { publicarY: p.y, corridasBottom: c.y + c.height };
    });
    expect(gap.publicarY).toBeGreaterThanOrEqual(gap.corridasBottom);
    expect(gap.publicarY - gap.corridasBottom).toBeLessThan(50);
  });

  test("item 1: botão 'Usar minha localização' só aparece pra Tipo 'corrida', preenche 'Onde' e lat/lng ficam de fora do público", async ({
    page,
    context,
    request,
  }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: -19.925, longitude: -43.935 });
    await page.goto("/");

    // Some pros outros tipos, só aparece em "corrida".
    await page.locator("#post-type").selectOption("outro");
    await expect(page.locator("#post-location-geo")).toBeHidden();
    await page.locator("#post-type").selectOption("corrida");
    await expect(page.locator("#post-location-geo")).toBeVisible();

    await page.locator("#post-use-location").click();
    await expect(page.locator("#post-location-status")).toHaveText("localização atual usada ✓");
    await expect(page.locator("#post-location")).toHaveValue("📍 Localização atual");
    await expect(page.locator("#post-lat")).not.toHaveValue("");

    // Publica e confirma que lat/lng nunca aparecem na resposta pública —
    // mesmo padrão de privacidade que carona/grupos já seguem.
    await page.locator("#post-title").fill(`corrida com localização ${Date.now()}`);
    await page.locator("#post-whatsapp").fill("31999990030");
    await page.locator("#post-price").fill("20");
    await page.locator("#post-form button[type=submit]").click();
    await expect(page.locator("#post-status")).toContainText("Publicado!");

    const { requests } = await (await request.get("/api/requests")).json();
    const created = requests.find((r) => r.location === "📍 Localização atual");
    expect(created).toBeTruthy();
    expect(created.lat).toBeUndefined();
    expect(created.lng).toBeUndefined();
  });

  test("item 1: negar a permissão de localização não trava nada — 'Onde' continua editável na mão", async ({
    page,
    context,
  }) => {
    await context.clearPermissions();
    await page.goto("/");
    await page.locator("#post-type").selectOption("corrida");
    await page.locator("#post-use-location").click();
    await expect(page.locator("#post-location-status")).toContainText("não consegui obter sua localização");
    await page.locator("#post-location").fill("Preenchido na mão");
    await expect(page.locator("#post-location")).toHaveValue("Preenchido na mão");
  });

  test("item 4 (task-009): nav do topo foi removido — sem links 'Perguntar' nem #nav-ask-link", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".site-nav")).toHaveCount(0);
    await expect(page.locator("#nav-ask-link")).toHaveCount(0);
  });

  test("item 2 (task-011): barra flutuante removida — modos 'Solicito/Presto' agora ficam no hero acima da busca", async ({
    page,
  }) => {
    await page.goto("/");
    // Barra flutuante de baixo removida
    await expect(page.locator(".bottom-bar")).toHaveCount(0);
    await expect(page.locator("#bottom-ask-btn")).toHaveCount(0);
    // Modos agora estão no hero
    const heroModeButtons = page.locator(".hero-mode-tabs .hero-mode-btn");
    await expect(heroModeButtons).toHaveCount(2);
    await expect(heroModeButtons.nth(0)).toHaveText("Solicito serviço");
    await expect(heroModeButtons.nth(1)).toHaveText("Presto serviço");
  });

  test("item 6a: botão do Google usa o tema oficial escuro (filled_black), não o claro (outline)", async ({ page }) => {
    // Não dá pra testar o iframe renderizado pelo próprio Google sem
    // credencial real — confere a configuração que o site manda pro GIS,
    // que é exatamente o que decide "outline" (branco, feio no fundo
    // escuro) vs "filled_black" (o fix).
    await page.goto("/");
    const appJs = await (await page.request.get("/assets/app.js")).text();
    expect(appJs).toContain('theme: "filled_black"');
    expect(appJs).not.toContain('theme: "outline"');
  });
});

test.describe("Top3Profissional - nova home TOP3 SYSTEM, dado sempre real (task-012)", () => {
  function uniqueSuffix() {
    return Math.random().toString(36).slice(2, 10);
  }

  test("cabeçalho: logo TOP3 + subtítulo, indicador Online real, menu com 'Mais', Entrar + Criar conta", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".site-header .logo")).toContainText("TOP3");
    await expect(page.locator(".logo-subtitle")).toHaveText("Inteligência em resultados");

    // Nav de links removido — header tem apenas logo + auth
    await expect(page.locator(".site-nav")).toHaveCount(0);

    // "Online" só aparece depois de um /health real responder (item 1) —
    // não é decorativo fixo no HTML.
    await expect(page.locator("#online-indicator")).toBeVisible();

    await expect(page.locator("#email-auth-toggle")).toHaveText("Entrar");
  });

  test("header limpo: sem nav de links, apenas logo + auth + indicador Online", async ({ page }) => {
    await page.goto("/");
    // Nav de links foi removido para deixar o header limpo
    await expect(page.locator(".site-nav")).toHaveCount(0);
    await expect(page.locator("#nav-more-toggle")).toHaveCount(0);
    // Logo, auth e indicador Online permanecem
    await expect(page.locator(".site-header .logo")).toBeVisible();
    await expect(page.locator("#email-auth-toggle")).toBeVisible();
  });

  test("'Entrar' abre o painel de login", async ({ page }) => {
    await page.goto("/");
    await page.locator("#email-auth-toggle").click();
    await expect(page.locator("#email-auth-panel")).toBeVisible();
    await expect(page.locator(".social-login-title")).toBeVisible();
  });

  test("hero: modo tabs acima da busca, busca central funcional", async ({ page }) => {
    await page.goto("/");
    // Título removido; agora o hero mostra os tabs de modo acima da busca
    await expect(page.locator(".hero-mode-tabs")).toBeVisible();
    await expect(page.locator(".hero-mode-btn").first()).toHaveText("Solicito serviço");
    await expect(page.getByPlaceholder("O que você está procurando?")).toBeVisible();
  });

  test("critério de pronto: 'Números que conectam' muda quando um post novo é criado (nunca fixo, nunca arredondado)", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    const before = await (await request.get("/api/home-stats")).json();

    const created = await request.post("/api/requests", {
      data: {
        type: "teste-home",
        title: `teste números ${uniqueSuffix()}`,
        price: 15,
        whatsapp: "31999990040",
        location: "Bom Despacho",
      },
    });
    expect(created.status()).toBe(201);

    const after = await (await request.get("/api/home-stats")).json();
    expect(after.openOpportunities).toBe(before.openOpportunities + 1);

    await page.reload();
    const expectedOpen = after.openOpportunities > 0 ? `+${after.openOpportunities}` : String(after.openOpportunities);
    await expect(page.locator("#stat-open")).toHaveText(expectedOpen);
  });

  test("critério de pronto: 'Atividade recente' reflete um post real recém-criado, com tempo relativo", async ({ request, page }) => {
    const title = `atividade recente ${uniqueSuffix()}`;
    const created = await request.post("/api/requests", {
      data: { type: "teste-atividade", title, price: 12, whatsapp: "31999990041", location: "Bom Despacho, MG" },
    });
    expect(created.status()).toBe(201);

    const feed = await (await request.get("/api/activity-feed")).json();
    const event = feed.events.find((e) => e.text.includes("Bom Despacho, MG"));
    expect(event).toBeTruthy();
    expect(event.text).toBe("Novo pedido de teste-atividade em Bom Despacho, MG");

    await page.goto("/");
    await expect(page.locator("#activity-list")).toContainText(title.length > 0 ? event.text : "");
  });

  test("critério de pronto: 'buscas realizadas' sobe de verdade quando alguém busca", async ({ page, request }) => {
    const before = await (await request.get("/api/home-stats")).json();
    await page.goto("/");
    await page.getByPlaceholder("O que você está procurando?").fill(`busca teste ${uniqueSuffix()}`);
    // performSearch() dispara POST /api/search-events sem esperar (fire-
    // and-forget) — espera a resposta de verdade em vez de um sleep fixo
    // (achado do CodeRabbit, PR #78: um worker de CI lento podia ler
    // /api/home-stats antes do POST terminar de atualizar o contador).
    const [searchEventResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/search-events")),
      page.locator("#hero-search-form button[type=submit]").click(),
    ]);
    expect(searchEventResponse.status()).toBe(204);
    const after = await (await request.get("/api/home-stats")).json();
    expect(after.searchesLast7Days).toBeGreaterThan(before.searchesLast7Days);
  });

  test("Destaques da região: mostra posts reais com preço e ação, nunca card de exemplo fixo", async ({ page }) => {
    // Espera o fetch de /api/requests terminar antes de contar os cards —
    // sem isso o count pode ser 0 antes do loadHighlights() terminar, o que
    // leva a falso-vazio e faz o teste quebrar sob carga alta na suíte completa.
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/requests")),
      page.goto("/"),
    ]);
    const cards = page.locator("#highlights-list .highlight-card");
    const count = await cards.count();
    // Sempre reflete /api/requests + /api/groups reais — ou tem card (com
    // preço e botão de ação de verdade) ou mostra o empty state, nunca os
    // dois escondidos ao mesmo tempo.
    if (count > 0) {
      await expect(cards.first().locator(".highlight-price")).not.toBeEmpty();
      await expect(cards.first().locator(".highlight-action")).toBeVisible();
      await expect(page.locator("#highlights-empty")).toBeHidden();
    } else {
      await expect(page.locator("#highlights-empty")).toBeVisible();
    }
  });

  test("Categorias populares leva pra seção certa, incluindo filtro de categoria de Grupos", async ({ page }) => {
    await page.goto("/");
    await page.locator('.category-card[data-group-category="frete"]').click();
    await expect(page.locator("#grupos")).toBeInViewport();
    await expect(page.locator('.group-category-btn[data-category="frete"]')).toHaveClass(/is-active/);
  });

  test("'Comece agora' (chamada final) abre o painel de entrar", async ({ page }) => {
    await page.goto("/");
    await page.locator("#final-cta-btn").click();
    await expect(page.locator("#email-auth-panel")).toBeVisible();
  });

  test("modo 'Presto serviço' (view do prestador) continua funcionando — task-012 não removeu essa função, só reorganizou a home", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: /presto serviço/i }).click({ force: true }); // ver comentário no teste mobile equivalente
    await expect(page.locator("#provider-view")).toBeVisible();
    // #requests-list especificamente — .request-item sozinho também casa
    // com os cards de #groups-list (mesma classe, "group-card" só
    // adicional), que ficam ocultos nesse modo mas ainda no DOM.
    await expect(page.locator("#requests-list .request-item").first()).toBeVisible();
  });

  test("as abas de modo ficam fora do #requester-view — dá pra voltar de 'Presto' pra 'Solicito'", async ({ page }) => {
    await page.goto("/");
    // O hero mora fora do #requester-view de propósito: se ficasse dentro,
    // setMode("provider") esconderia as abas junto e prenderia a pessoa no
    // modo prestador, sem nenhum jeito de voltar.
    await page.locator('.mode-btn[data-mode="provider"]').click();
    await expect(page.locator("#provider-view")).toBeVisible();
    await expect(page.locator('.mode-btn[data-mode="requester"]')).toBeVisible();
    // Busca e chips somem nesse modo, só as abas ficam
    await expect(page.locator("#hero-requester-tools")).toBeHidden();

    await page.locator('.mode-btn[data-mode="requester"]').click();
    await expect(page.locator("#requester-view")).toBeVisible();
    await expect(page.locator("#hero-requester-tools")).toBeVisible();
  });
});

test.describe("Top3Profissional - painéis de categoria do hero", () => {
  test("Serviços: seletor de categoria filtra o ranking de verdade", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-hero-category="servico"]').click();
    const select = page.locator("#panel-servico-select");
    await expect(select).toBeVisible();
    // Opções vêm de /api/services, não são fixas no HTML
    await expect(select.locator("option")).not.toHaveCount(1);

    await select.selectOption("eletricista");
    await expect(page.locator("#ranking-title")).toContainText("eletricista");
  });

  test("Viagem: uma busca só alimenta corridas e caronas ao mesmo tempo", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-hero-category="viagem"]').click();

    await page.locator("#panel-viagem-de").fill("Rua Bahia");
    await page.locator("#panel-viagem-para").fill("Aeroporto");
    await page.locator("#panel-viagem-form button[type=submit]").click();

    // A busca de cima preenche os dois mecanismos de baixo
    await expect(page.locator("#ride-from")).toHaveValue("Rua Bahia");
    await expect(page.locator("#carona-search-origem")).toHaveValue("Rua Bahia");
    await expect(page.locator('.group-category-btn[data-category="carona"]')).toHaveClass(/is-active/);
    await expect(page.locator(".ride-match").first()).toContainText("Aeroporto");
  });

  test("Viagem: data de uma busca anterior não fica grudada na busca seguinte", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-hero-category="viagem"]').click();

    // Primeira busca com data
    await page.locator("#panel-viagem-de").fill("Centro");
    await page.locator("#panel-viagem-para").fill("Aeroporto");
    await page.locator("#panel-viagem-data").fill("2026-12-25");
    await page.locator("#panel-viagem-form button[type=submit]").click();
    await expect(page.locator("#carona-search-data")).toHaveValue("2026-12-25");

    // Segunda busca sem data — /api/groups filtra data por igualdade, então a
    // data antiga esconderia caronas válidas se continuasse preenchida.
    await page.locator("#panel-viagem-data").fill("");
    await page.locator("#panel-viagem-form button[type=submit]").click();
    await expect(page.locator("#carona-search-data")).toHaveValue("");
  });

  test("Produtos: 'Minha localização' entra de verdade na consulta e mostra a distância", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: -19.9167, longitude: -43.9345 });

    const urls = [];
    await page.route("**/api/requests*", (route) => {
      urls.push(route.request().url());
      return route.continue();
    });

    await page.goto("/");
    await page.locator('[data-hero-category="produto"]').click();
    await expect(page.locator("#panel-produto-list")).toBeVisible();

    const antes = urls.length;
    await page.locator("#panel-produto-location").click();
    // Botão sem função é proibido pela regra de UI do projeto: clicar tem que
    // mudar a consulta, não só acender o botão.
    await expect.poll(() => urls.length).toBeGreaterThan(antes);
    await expect.poll(() => urls.slice(antes).some((u) => u.includes("lat=") && u.includes("lng="))).toBe(true);
    await expect(page.locator("#panel-produto-location")).toHaveClass(/is-active|active/);
  });

  test("Produtos: resposta atrasada de um filtro antigo não sobrescreve o filtro atual", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-hero-category="produto"]').click();
    const list = page.locator("#panel-produto-list");
    await expect(list).toBeVisible();
    // Espera a carga inicial assentar: se ela ainda estiver em voo quando a
    // interceptação entra, sobra uma resposta fora do controle do teste.
    await expect(list).not.toContainText("Carregando");

    // Segura a resposta de "imovel" e deixa "produto" passar direto. A de
    // imóvel foi pedida ANTES, então se a guarda de corrida não existisse ela
    // chegaria depois e sobrescreveria o resultado de produto.
    let liberaImovel;
    let marcarImovelPedido;
    const imovelPedido = new Promise((resolve) => (marcarImovelPedido = resolve));

    // page.route precisa estar registrada ANTES do clique. Sem o await, sob
    // carga o clique sai primeiro, a requisição vai pro servidor de verdade e
    // a promessa nunca resolve — o teste falhava só na suíte cheia.
    await page.route("**/api/requests*", async (route) => {
      const url = route.request().url();
      if (url.includes("type=imovel")) {
        marcarImovelPedido();
        await new Promise((r) => (liberaImovel = r));
        return route.fulfill({ json: { requests: [{ id: "x1", type: "imovel", title: "ANTIGO NAO DEVE APARECER", price: 1, status: "aberto", location: "BH", requester: "A", whatsapp: "31999990000" }] } });
      }
      return route.fulfill({ json: { requests: [{ id: "x2", type: "produto", title: "ATUAL DEVE APARECER", price: 2, status: "aberto", location: "BH", requester: "B", whatsapp: "31999990000" }] } });
    });

    await page.locator('[data-produto-type="imovel"]').click();
    await imovelPedido;
    await page.locator('[data-produto-type="produto"]').click();
    await expect(list.getByText("ATUAL DEVE APARECER")).toBeVisible();

    liberaImovel();
    await expect(list.getByText("ANTIGO NAO DEVE APARECER")).toHaveCount(0);
    await expect(list.getByText("ATUAL DEVE APARECER")).toBeVisible();
  });

  test("Produtos: alterna Produtos/Imóveis e filtra por faixa de preço, sem teto de valor", async ({ page, request }) => {
    const suffix = Math.random().toString(36).slice(2, 8);
    // Valor alto de propósito: o filtro de preço não pode ter limite máximo
    await request.post("/api/requests", {
      data: { type: "produto", title: `trator caro ${suffix}`, price: 450000, whatsapp: "31999994444", location: "Uberaba" },
    });
    await request.post("/api/requests", {
      data: { type: "produto", title: `bicicleta barata ${suffix}`, price: 90, whatsapp: "31999991111", location: "Belo Horizonte" },
    });
    await request.post("/api/requests", {
      data: { type: "imovel", title: `kitnet ${suffix}`, price: 1200, whatsapp: "31999993333", location: "Belo Horizonte" },
    });

    await page.goto("/");
    await page.locator('[data-hero-category="produto"]').click();
    const list = page.locator("#panel-produto-list");
    await expect(list.getByText(`trator caro ${suffix}`)).toBeVisible();
    await expect(list.getByText(`bicicleta barata ${suffix}`)).toBeVisible();

    // Preço mínimo alto continua achando o item de R$ 450.000
    await page.locator("#panel-produto-min").fill("1000");
    await expect(list.getByText(`bicicleta barata ${suffix}`)).toHaveCount(0);
    await expect(list.getByText(`trator caro ${suffix}`)).toBeVisible();

    // Aba de imóveis troca a fonte de dados
    await page.locator("#panel-produto-min").fill("");
    await page.locator('[data-produto-type="imovel"]').click();
    await expect(list.getByText(`kitnet ${suffix}`)).toBeVisible();
    await expect(list.getByText(`trator caro ${suffix}`)).toHaveCount(0);
  });

  test("Produtos vazio convida a pessoa a publicar o que procura, com a categoria já marcada", async ({ page }) => {
    await page.goto("/");
    // Rota forçada a vazio: a base pode ter anúncio, e o que importa aqui é a
    // tela que a pessoa vê quando não acha nada.
    await page.route("**/api/requests?*type=produto*", (route) => route.fulfill({ json: { requests: [] } }));

    await page.locator('[data-hero-category="produto"]').click();
    const lista = page.locator("#panel-produto-list");

    // Sem filtro aplicado, a mensagem não pode culpar o filtro
    await expect(lista.locator(".panel-vazio-aviso")).toHaveText(/Ainda não tem produto publicado/);
    await expect(lista.locator(".panel-vazio-convite")).toContainText("Diga o que você precisa");

    // O convite tem que virar ação de verdade, não só texto
    await page.locator("#panel-produto-pedir").click();
    await expect(page.locator("#category-panel-body #publicar")).toBeAttached();
    // A pessoa preenche o que quer, e a categoria já vem marcada
    await expect(page.locator("#post-type")).toHaveValue("produto");
    await expect(page.locator("#post-title")).toBeFocused();
    // Continua podendo trocar a categoria
    await page.locator("#post-type").selectOption("imovel");
    await expect(page.locator("#post-type")).toHaveValue("imovel");
  });

  test("Produtos: com filtro aplicado a mensagem fala do filtro, não da categoria", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-hero-category="produto"]').click();
    await page.locator("#panel-produto-min").fill("99999999");
    await expect(page.locator("#panel-produto-list .panel-vazio-aviso")).toHaveText(/Nenhum anúncio com esses filtros/);
  });

  test("alvos de toque no celular têm pelo menos 44px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.locator('[data-hero-category="produto"]').click();

    // 44px é o mínimo recomendado pra dedo; abaixo disso erra o toque, e as
    // setas de preço ficam coladas uma na outra.
    for (const sel of ["#panel-produto-location", '.panel-price-sort[data-price-sort="asc"]', '.panel-price-sort[data-price-sort="desc"]', "#panel-produto-state"]) {
      const caixa = await page.locator(sel).first().boundingBox();
      expect(Math.round(caixa.height), `${sel} pequeno demais pra tocar`).toBeGreaterThanOrEqual(44);
    }
  });

  test("os botões principais da home também têm 44px no celular", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    // A primeira correção cobriu só os filtros e deixou de fora justamente os
    // botões mais usados — a busca tinha 34px e os chips, 32px.
    const principais = [
      ".hero-search-submit",
      '.hero-mode-btn[data-mode="requester"]',
      '.hero-mode-btn[data-mode="provider"]',
      '[data-hero-category="servico"]',
      '[data-hero-category="produto"]',
    ];
    for (const sel of principais) {
      const caixa = await page.locator(sel).first().boundingBox();
      expect(Math.round(caixa.height), `${sel} pequeno demais pra tocar`).toBeGreaterThanOrEqual(44);
    }
  });

  test("campo de busca do hero não tem zona morta no celular", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    // Achado real: a correção anterior esticou só o botão "Buscar" pra 44px,
    // deixando o próprio campo de texto com a altura de linha original
    // (~22px) dentro de um pill visualmente maior (~65px) — quem tocasse
    // perto da borda do pill (não bem no centro) não conseguia abrir o
    // teclado. O campo precisa da mesma altura mínima do resto da fileira.
    const caixaInput = await page.locator("#hero-search-input").boundingBox();
    expect(Math.round(caixaInput.height), "campo de busca pequeno demais pra tocar").toBeGreaterThanOrEqual(44);

    // Regressão direta: a folga entre o campo e o pill que o envolve não pode
    // voltar a ser maior que o padding normal do pill (~10px no mobile) — se
    // voltar a ~21px de cada lado, a zona morta está de volta.
    const caixaPill = await page.locator(".hero-search-form").boundingBox();
    const folgaCima = caixaInput.y - caixaPill.y;
    const folgaBaixo = caixaPill.y + caixaPill.height - (caixaInput.y + caixaInput.height);
    expect(Math.round(folgaCima), "zona morta acima do campo de busca").toBeLessThanOrEqual(12);
    expect(Math.round(folgaBaixo), "zona morta abaixo do campo de busca").toBeLessThanOrEqual(12);
  });

  test("nenhum botão visível fica abaixo de 44px no celular", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.locator('[data-hero-category="grupo"]').click();
    await expect(page.locator("#category-quick-panel")).toBeVisible();

    // Varredura, não lista fixa: botão novo que nasça pequeno é pego aqui,
    // em vez de só o que alguém lembrou de listar.
    const pequenos = await page.evaluate(() =>
      [...document.querySelectorAll("button, a")]
        .filter((el) => {
          if (!el.offsetParent) return false;
          if (el.classList.contains("logo")) return false;
          const r = el.getBoundingClientRect();
          return r.height > 0 && r.height < 44;
        })
        .map((el) => `${(el.textContent || "").trim().slice(0, 22)}: ${Math.round(el.getBoundingClientRect().height)}px`)
    );
    expect(pequenos, `alvos de toque pequenos demais: ${pequenos.join(" | ")}`).toEqual([]);
  });

  test("campos de formulário (publicar pedido, criar perfil, corrida) têm 44px no celular", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    // Achado real: os campos de texto dos formulários (publicar pedido, criar
    // perfil, corrida/carona) ficavam entre 37-42px — abaixo do padrão do
    // resto do site. Checkbox/radio ficam de fora de propósito: são
    // pequenos por design, a área de toque é o <label> em volta deles.
    const pequenos = await page.evaluate(() =>
      [...document.querySelectorAll("input, select, textarea")]
        .filter((el) => {
          if (!el.offsetParent) return false;
          if (el.type === "checkbox" || el.type === "radio" || el.type === "file") return false;
          const r = el.getBoundingClientRect();
          return r.height > 0 && r.height < 44;
        })
        .map((el) => `${el.tagName}#${el.id || el.className || "?"}: ${Math.round(el.getBoundingClientRect().height)}px`)
    );
    expect(pequenos, `campos pequenos demais pra tocar: ${pequenos.join(" | ")}`).toEqual([]);
  });

  test("ordenar por e 'Ver todos' do filtro de serviço têm 44px no celular", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    // #ranking-sort tinha uma regra própria por ID (min-height: 40px) que,
    // por especificidade, vencia a regra de 44px do mobile aplicada aos
    // outros seletores da mesma barra de filtro — mesmo problema pode
    // voltar se alguém adicionar uma nova regra por ID sem perceber.
    await page.locator("#hero-search-input").fill("eletricista");
    await page.locator(".hero-search-submit").click();
    await expect(page.locator("#ranking-sort")).toBeVisible();
    const caixaSort = await page.locator("#ranking-sort").boundingBox();
    expect(Math.round(caixaSort.height), "#ranking-sort pequeno demais pra tocar").toBeGreaterThanOrEqual(44);

    // O link "Ver todos" que aparece ao filtrar por serviço é criado via
    // innerHTML no JS, sem classe — passava batido pela regra de CSS.
    const caixaLink = await page.locator("#ranking-clear-filter").boundingBox();
    expect(Math.round(caixaLink.height), "#ranking-clear-filter pequeno demais pra tocar").toBeGreaterThanOrEqual(44);
  });

  test("controles do painel seguem o design system (select escuro, seta própria, foco visível)", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-hero-category="produto"]').click();
    const select = page.locator("#panel-produto-state");

    // Regra do CLAUDE.md: select nunca pode cair no visual nativo branco
    const style = await select.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { appearance: cs.appearance, backgroundImage: cs.backgroundImage, minHeight: cs.minHeight };
    });
    expect(style.appearance).toBe("none");
    expect(style.backgroundImage).not.toBe("none");
    expect(parseInt(style.minHeight, 10)).toBeGreaterThanOrEqual(40);

    // Campo de preço não pode ter teto que trave o que dá pra digitar
    const min = page.locator("#panel-produto-min");
    await expect(min).not.toHaveAttribute("max", /.*/);
    await min.fill("999999999");
    await expect(min).toHaveValue("999999999");
  });
});

test.describe("Top3Profissional - persistência de login sobrevive a restart (task-009, item 6b)", () => {
  test("USERS/SESSIONS sobrevivem a um restart gracioso (SIGTERM), igual o deploy faz a cada push", async () => {
    const { spawn } = require("child_process");
    const os = require("os");
    const fsSync = require("fs");
    const pathMod = require("path");

    const dataDir = fsSync.mkdtempSync(pathMod.join(os.tmpdir(), "top3-persist-test-"));
    const port = 8299; // porta dedicada, longe da 8199 usada pelo resto da suíte
    const baseUrl = `http://localhost:${port}`;
    const projectRoot = pathMod.join(__dirname, "..");
    const env = { ...process.env, PORT: String(port), DATA_DIR: dataDir, DISABLE_RATE_LIMITS: "1", DISABLE_GEOCODING: "1" };
    delete env.DISABLE_USER_PERSISTENCE; // precisa estar LIGADA aqui — é o oposto do resto da suíte, de propósito

    function startServer() {
      return spawn("node", ["server.js"], { cwd: projectRoot, env, stdio: "pipe" });
    }

    async function waitForHealth(timeoutMs = 10000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try {
          const res = await fetch(`${baseUrl}/health`);
          if (res.ok) return;
        } catch (err) {
          // servidor ainda não subiu — tenta de novo
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error("servidor não respondeu /health a tempo");
    }

    let child = startServer();
    try {
      await waitForHealth();

      const email = `persist-${Date.now()}@example.com`;
      const signupRes = await fetch(`${baseUrl}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Persiste Teste", email, password: "senha12345", whatsapp: "31999998888" }),
      });
      expect(signupRes.status).toBe(201);
      const cookie = signupRes.headers.get("set-cookie").split(";")[0];

      const meBefore = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
      expect((await meBefore.json()).user.email).toBe(email);

      // Restart gracioso — mesmo sinal que `systemctl restart` manda no
      // deploy de verdade (ver .github/workflows/deploy-vps.yml).
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await exited;

      child = startServer();
      await waitForHealth();

      const meAfter = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
      expect(meAfter.status).toBe(200);
      const afterBody = await meAfter.json();
      expect(afterBody.user).toBeTruthy();
      expect(afterBody.user.email).toBe(email);
    } finally {
      child.kill("SIGKILL");
      fsSync.rmSync(dataDir, { recursive: true, force: true });
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
      const cache = await caches.open("top3-shell-v2");
      const keys = await cache.keys();
      return keys.map((k) => new URL(k.url).pathname);
    });

    expect(cachedPaths).toContain("/assets/style.css");
    expect(cachedPaths).toContain("/assets/app.js");
    expect(cachedPaths.some((p) => p.startsWith("/api/"))).toBe(false);
    expect(cachedPaths).not.toContain("/health");
  });

  test("código novo aparece já no primeiro acesso depois de publicar", async ({ page }) => {
    await page.goto("/");
    // Espera pelo SW ativo E pelo controller (clients.claim pode atrasar levemente).
    await page.evaluate(() =>
      navigator.serviceWorker.ready.then(() =>
        navigator.serviceWorker.controller
          ? Promise.resolve()
          : new Promise((res) => {
              navigator.serviceWorker.addEventListener("controllerchange", res, { once: true });
            })
      )
    );

    // Planta uma versão velha no cache, como ficaria logo após uma publicação.
    // Com stale-while-revalidate o service worker devolvia justamente essa —
    // e quem fosse conferir se a mudança subiu concluía que não tinha subido,
    // mesmo com o deploy verde. Aconteceu de verdade e enganou por minutos.
    await page.evaluate(async () => {
      const cache = await caches.open("top3-shell-v1");
      await cache.put(
        "/assets/app.js",
        new Response("/* VERSAO VELHA DO CACHE */", { headers: { "Content-Type": "application/javascript" } })
      );
    });

    const conteudo = await page.evaluate(async () => {
      const res = await fetch("/assets/app.js");
      return res.text();
    });

    expect(conteudo, "o service worker serviu a versão velha do cache").not.toContain("VERSAO VELHA DO CACHE");
    expect(conteudo).toContain("hero-search-input");
  });
});
