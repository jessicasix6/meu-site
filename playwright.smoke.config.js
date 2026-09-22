const { defineConfig, devices } = require("@playwright/test");

// Config exclusiva do smoke test de produção.
// NÃO sobe servidor local — aponta direto pra https://www.top3profissional.com.br.
// Rodada separada dos testes de integração (playwright.config.js) que usam localhost.
// Para testar localmente: SMOKE_BASE_URL=http://localhost:8123 npx playwright test --config playwright.smoke.config.js
const BASE_URL = process.env.SMOKE_BASE_URL || "https://www.top3profissional.com.br";

module.exports = defineConfig({
  testDir: "./tests",
  testMatch: "**/smoke-producao.spec.js",
  fullyParallel: false,
  retries: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // Sem webServer — testa a produção diretamente.
  timeout: 30_000,
});
