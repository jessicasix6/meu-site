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
    env: {
      PORT: String(TEST_PORT),
      // Chave fixa só pro servidor de teste isolado (porta dedicada acima) —
      // nunca usada em produção, onde ADMIN_SECRET vem do .env/VPS de
      // verdade. Sem isso, a rota de resolução de denúncia (task-004) fica
      // sempre desativada (503) e não dá pra testar o fluxo completo.
      ADMIN_SECRET: "test-admin-secret-nao-usar-em-producao",
      // Valores fixos só pro servidor de teste isolado — testa que o script
      // de rastreamento do Umami (task-008) é injetado corretamente com as
      // variáveis configuradas, sem precisar de uma instância real rodando
      // (o teste confere o <script> no DOM, não se ele carrega de verdade).
      UMAMI_SCRIPT_URL: "https://stats.test.invalid/script.js",
      UMAMI_WEBSITE_ID: "test-website-id-nao-usar-em-producao",
      // A suíte cria muitas contas/grupos em sequência pra cobrir regras de
      // negócio (avaliação, denúncia, task-004) — sem isso, os rate limits
      // pensados pra abuso real (ex: 20 cadastros/hora por IP) travam a
      // própria suíte de teste, que roda tudo do mesmo IP (localhost).
      DISABLE_RATE_LIMITS: "1",
      // Geocodificação (task-008, Nominatim público) não tem chave pra
      // "faltar" como as outras integrações opcionais — fica sempre ativa
      // por padrão. Sem desligar aqui, a suíte inteira bateria de verdade
      // no Nominatim a cada grupo/carona criado nos testes (lenta, sujeita
      // à rede real, e arrisca estourar a política de uso deles com volume
      // de automação). Default "1" (desligado) — passe
      // DISABLE_GEOCODING=0 na hora de rodar pra testar a geocodificação de
      // verdade (ver tests/e2e.spec.js).
      DISABLE_GEOCODING: process.env.DISABLE_GEOCODING || "1",
      // Persistência de USERS/SESSIONS em disco (task-009, item 6b) — sem
      // desligar aqui, cada rodada de teste carregaria contas de uma rodada
      // anterior (data/users.json) em vez de começar do zero, e ainda
      // sujaria esse arquivo com e-mails de teste.
      DISABLE_USER_PERSISTENCE: "1",
    },
    // Sempre falso, mesmo localmente: já aconteceu mais de uma vez nesta
    // máquina de um processo de teste anterior ficar preso na porta (uma
    // sessão de terminal fechada sem encerrar o webServer, por exemplo), e
    // "true" faria o Playwright reaproveitar esse processo com código
    // desatualizado em silêncio em vez de reclamar. Falhar alto (porta em
    // uso) é preferível a passar teste contra código errado.
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
