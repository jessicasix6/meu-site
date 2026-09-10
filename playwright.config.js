require("dotenv").config();
const { defineConfig, devices } = require("@playwright/test");

// Porta dedicada pros testes, propositalmente diferente de 8123: nesta
// máquina, 8123 costuma ter o serviço systemd do backup 24h já rodando
// (top3profissional.service), e "reuseExistingServer" localmente aproveitaria
// esse processo com código antigo em vez de subir um novo com as mudanças
// atuais — testando código desatualizado em silêncio. Usando outra porta,
// o teste sempre sobe seu próprio servidor isolado, local e no CI.
const TEST_PORT = process.env.TEST_PORT || 8199;
const BASE_URL = `http://localhost:${TEST_PORT}`;

module.exports = defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm start",
    url: BASE_URL,
    env: { PORT: String(TEST_PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
