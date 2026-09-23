/**
 * Smoke test de produção — só leitura, sem criar dados.
 * Roda contra https://www.top3profissional.com.br via GitHub Actions agendado.
 * Usa playwright.smoke.config.js (sem webServer local).
 */
const { test, expect } = require("@playwright/test");

test.describe("Smoke — produção", () => {
  test("/health responde 200 com status ok", async ({ request }) => {
    const res = await request.get("/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("homepage carrega em menos de 5 segundos", async ({ page }) => {
    const start = Date.now();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });

  test("hero com título e campo de busca está visível", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".hero-title")).toBeVisible();
    await expect(page.locator("#hero-search-input")).toBeVisible();
    await expect(page.locator(".hero-search-submit")).toBeVisible();
  });

  test("navegação principal está presente", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // .logo aparece duas vezes de propósito (header e rodapé) — escopar ao header
    await expect(page.locator(".site-header .logo")).toBeVisible();
    await expect(page.locator(".site-header")).toBeVisible();
  });

  test("sem erro crítico no console (404 de recurso ou exceção JS)", async ({ page }) => {
    const erros = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") erros.push(msg.text());
    });
    page.on("pageerror", (err) => erros.push(err.message));
    await page.goto("/", { waitUntil: "networkidle" });
    const criticos = erros.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("manifest") &&
        !e.includes("google") &&
        !e.includes("Google") &&
        !e.includes("GSI") &&
        !e.includes("supabase") &&
        !e.includes("Supabase") &&
        !e.includes("403")   // recursos de terceiros (GSI, OAuth) bloqueados fora da origem permitida
    );
    expect(criticos, `Erros no console: ${criticos.join(" | ")}`).toHaveLength(0);
  });

  test("busca retorna resultado sem erro (fluxo principal)", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator("#hero-search-input").fill("eletricista");
    await page.locator(".hero-search-submit").click();
    // Aguarda ranking ou mensagem de vazio — qualquer um é sinal de que a busca chegou ao servidor.
    // Pode haver múltiplos .rank-card quando a busca retorna vários resultados, então usa .first().
    await expect(
      page.locator(".rank-card, .rank-empty, .result-answer").first()
    ).toBeVisible({ timeout: 20_000 });
  });

  test("celular (375px) — hero e busca visíveis sem scroll horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".hero-title")).toBeVisible();
    await expect(page.locator("#hero-search-input")).toBeVisible();
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(375 + 2); // tolerância de 2px p/ borda
  });
});
