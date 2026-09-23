require("dotenv").config();
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const { OAuth2Client } = require("google-auth-library");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const Minio = require("minio");
// v1 (não a v2 default do pacote) porque é o formato que o widget do
// front-end (pacote "altcha") resolve nativamente sem configuração extra —
// challenge simples (SHA-256 + salt + assinatura), sem escolher algoritmo de
// derivação de chave à parte.
const { createChallenge: createAltchaChallenge, verifySolution: verifyAltchaSolution } = require("altcha-lib/v1");
const sharp = require("sharp");
const ort = require("onnxruntime-node");
const { BackgroundRemover } = require("@tugrul/rembg");
const { registerWhatsAppRoutes, isConfigured: isWhatsAppConfigured } = require("./whatsapp");
const { SERVICO_SYNONYMS, SERVICO_SYNONYM_EXCLUSIONS, GROUP_CATEGORY_SYNONYMS, CITY_SYNONYMS } = require("./keywords");

const PROVIDERS = [
  { name: "Ana Souza", service: "manicure", city: "Belo Horizonte", time: "amanhã às 14h", rating: 4.9, reviewCount: 24, distanceKm: 1.2, price: 45, fastReply: true, lat: -19.9245, lng: -43.9352 },
  { name: "Carla Lima", service: "manicure", city: "Belo Horizonte", time: "hoje às 17h30", rating: 4.6, reviewCount: 11, distanceKm: 3.8, price: 35, fastReply: false, lat: -19.9331, lng: -43.9378 },
  { name: "Fernanda Reis", service: "manicure", city: "Belo Horizonte", time: "amanhã às 09h", rating: 4.8, reviewCount: 17, distanceKm: 2.1, price: 40, fastReply: true, lat: -19.9089, lng: -43.9265 },
  { name: "João Pedro", service: "eletricista", city: "Curitiba", time: "hoje às 15h", rating: 4.7, reviewCount: 9, distanceKm: 4.5, price: 90, fastReply: true, lat: -25.4372, lng: -49.2691 },
  { name: "Marcos Vieira", service: "eletricista", city: "Curitiba", time: "amanhã às 10h", rating: 4.5, reviewCount: 6, distanceKm: 6.0, price: 80, fastReply: false, lat: -25.4152, lng: -49.2803 },
  { name: "Beatriz Alves", service: "cabeleireiro", city: "São Paulo", time: "hoje às 18h", rating: 5.0, reviewCount: 38, distanceKm: 0.8, price: 120, fastReply: true, lat: -23.5613, lng: -46.6558 },
  { name: "Ricardo Nunes", service: "encanador", city: "Rio de Janeiro", time: "amanhã às 08h", rating: 4.4, reviewCount: 5, distanceKm: 5.2, price: 100, fastReply: false, lat: -22.9707, lng: -43.1823 },
];

// Perfis profissionais criados pela pessoa (pilar 4.12) — em memória, igual
// REQUESTS: some num redeploy, é o mesmo limite já aceito pra esse
// protótipo. Diferente do PROVIDERS acima (mock fixo usado no ranking), este
// é o perfil de verdade que a pessoa cria pela barra/formulário.
const PROVIDER_PROFILES = [];
let nextProviderId = 1;

function slugify(text) {
  const base = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (base || "prestador") + "-" + Math.random().toString(36).slice(2, 6);
}

// Mapa dia-da-semana (nome em PT) → índice JS (0=dom, 1=seg...)
const DAY_INDEX = { domingo: 0, segunda: 1, terca: 2, terça: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, sábado: 6 };

// Recebe array de { dia, inicio, fim } (ex: [{dia:"segunda",inicio:"09:00",fim:"17:00"}])
// e devolve { label, hour, minute } do próximo horário válido a partir de agora,
// ou null se não houver nenhum nas próximas 7 dias.
function computeNextSlot(availability) {
  if (!Array.isArray(availability) || availability.length === 0) return null;
  const now = new Date();
  const todayIndex = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let best = null;
  for (let offset = 0; offset < 7; offset++) {
    const dayIndex = (todayIndex + offset) % 7;
    const slots = availability.filter((s) => DAY_INDEX[s.dia] === dayIndex && s.inicio && s.fim);
    for (const slot of slots) {
      const [h, m] = slot.inicio.split(":").map(Number);
      const slotMinutes = h * 60 + m;
      if (offset === 0 && slotMinutes <= nowMinutes) continue;
      const candidate = { offset, hour: h, minute: m };
      if (!best || offset < best.offset || (offset === best.offset && slotMinutes < best.hour * 60 + best.minute)) {
        best = candidate;
      }
    }
    if (best && best.offset === offset) break;
  }
  if (!best) return null;
  const hh = String(best.hour).padStart(2, "0");
  const mm = String(best.minute).padStart(2, "0");
  const label = best.offset === 0 ? `Hoje ${hh}:${mm}` : best.offset === 1 ? `Amanhã ${hh}:${mm}` : `Em ${best.offset} dias ${hh}:${mm}`;
  return { label, hour: best.hour, minute: best.minute, offset: best.offset };
}

// Fórmula de Haversine — distância real em km entre dois pontos lat/lng.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Distância aproximada de estrada (task-008, item 2 da 2ª versão do spec):
// linha reta (Haversine) multiplicada por um fator de correção, sem OSRM
// nem nenhum outro serviço de rotas — estrada real é sempre mais longa que
// a linha reta, e esse multiplicador é só uma aproximação grosseira disso,
// suficiente pra estimativa de rateio de carona (não é a rota exata).
// Number(process.env...) || 1.3 sozinho deixaria passar qualquer valor
// "truthy" incluindo negativo ou Infinity (ex: DISTANCE_CORRECTION_FACTOR="-1"
// gera distância negativa, guardada e devolvida por groupSummary() —
// achado do CodeRabbit, PR #74) — por isso a validação explícita abaixo.
const configuredDistanceCorrectionFactor = Number(process.env.DISTANCE_CORRECTION_FACTOR);
const DISTANCE_CORRECTION_FACTOR =
  Number.isFinite(configuredDistanceCorrectionFactor) && configuredDistanceCorrectionFactor > 0
    ? configuredDistanceCorrectionFactor
    : 1.3;

function estimatedRoadDistanceKm(lat1, lng1, lat2, lng2) {
  return haversineKm(lat1, lng1, lat2, lng2) * DISTANCE_CORRECTION_FACTOR;
}

const REQUESTS = [
  {
    id: "r1",
    type: "corrida",
    title: "Rua Bahia, 500 → Aeroporto de Confins",
    requester: "Juliana M.",
    when: "hoje às 19h",
    whatsapp: "5531999990001",
    location: "Belo Horizonte",
    distanceKm: 3.2,
    price: 28,
    status: "aberto",
  },
  {
    id: "r2",
    type: "entrega",
    title: "Farmácia Popular → Rua dos Ipês, 120 (Savassi)",
    requester: "Farmácia Popular",
    when: "hoje às 16h30",
    whatsapp: "5531999990002",
    location: "Savassi, Belo Horizonte",
    distanceKm: 1.8,
    price: 12,
    status: "aberto",
  },
  {
    id: "r3",
    type: "corrida",
    title: "Praça da Liberdade → Shopping Cidade",
    requester: "Marcos T.",
    when: "amanhã às 09h",
    whatsapp: "5531999990003",
    location: "Belo Horizonte",
    distanceKm: 5.6,
    price: 22,
    status: "aberto",
  },
  {
    id: "r4",
    type: "entrega",
    title: "Drogaria São Paulo → Av. Contorno, 890",
    requester: "Drogaria São Paulo",
    when: "hoje às 20h",
    whatsapp: "5531999990004",
    location: "Belo Horizonte",
    distanceKm: 2.4,
    price: 15,
    status: "aberto",
  },
];

let nextRequestId = REQUESTS.length + 1;
const REQUEST_TYPE_MAX_LENGTH = 30;
const REQUEST_WHATSAPP_MAX_LENGTH = 20;
const REQUEST_LOCATION_MAX_LENGTH = 80;

// Valida e normaliza número de WhatsApp brasileiro.
// Retorna { ok: true, digits } ou { ok: false, error }.
function validateBrazilianPhone(raw) {
  if (!raw || typeof raw !== "string") return { ok: false, error: "informe um WhatsApp para contato" };
  const digits = raw.replace(/\D/g, "");
  // Aceita 10 (DDD + 8 dígitos, fixo) ou 11 (DDD + 9 dígitos, celular)
  if (digits.length < 10 || digits.length > 11) {
    return { ok: false, error: "WhatsApp inválido — use o formato (DD) 9XXXX-XXXX" };
  }
  const ddd = Number(digits.slice(0, 2));
  if (ddd < 11 || ddd > 99) {
    return { ok: false, error: "DDD inválido no WhatsApp informado" };
  }
  // Celular com 11 dígitos deve começar com 6, 7, 8 ou 9 após o DDD
  if (digits.length === 11 && !["6","7","8","9"].includes(digits[2])) {
    return { ok: false, error: "WhatsApp inválido — número celular deve começar com 9 após o DDD" };
  }
  // Rejeita números obviamente falsos (todos iguais ou sequenciais)
  if (/^(\d)\1+$/.test(digits)) {
    return { ok: false, error: "WhatsApp inválido — número não pode ser todo repetido" };
  }
  return { ok: true, digits };
}


// Teto de segurança pro orçamento (ver docs/visao-produto.md seção 7). Brave
// Search cobra US$5/1000 buscas; esse número fica com margem confortável
// abaixo do que o orçamento cobre — só é usado como fallback agora (ver
// searchWeb abaixo), então na prática deve custar bem menos que isso.
const BRAVE_SEARCH_MONTHLY_LIMIT = 1500;
let braveSearchCount = 0;
let braveSearchMonth = null;

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()}`;
}

// Reserva a cota ANTES do fetch (não depois da resposta) pra duas chamadas
// concorrentes (ex: /api/chat e /api/price-reference quase ao mesmo tempo)
// não lerem o mesmo braveSearchCount desatualizado e passarem as duas do
// teto mensal juntas. Libera a reserva de novo se o fetch falhar, já que
// uma chamada que não completou não deveria contar pra cota.
function reserveBraveSearchQuota() {
  const monthKey = currentMonthKey();
  if (braveSearchMonth !== monthKey) {
    braveSearchMonth = monthKey;
    braveSearchCount = 0;
  }
  if (braveSearchCount >= BRAVE_SEARCH_MONTHLY_LIMIT) return false;
  braveSearchCount++;
  return true;
}

// Chamada em qualquer caminho que não completou uma busca de verdade (HTTP
// não-ok, JSON malformado, erro de rede) — nunca deixa uma reserva presa por
// causa de uma falha que não é da pessoa usando o site.
function releaseBraveSearchQuota() {
  braveSearchCount = Math.max(0, braveSearchCount - 1);
}

// Caminho grátis, preferido (decisão da Jéssica, 2026-09-14): SearXNG
// autohospedado (Docker, sem chave, sem custo por busca — ver
// docs/visao-produto.md seção 4.3). Só ativa se SEARXNG_URL estiver
// configurada; devolve null (não string) em qualquer falha, pra searchWeb()
// saber que deve cair pro fallback pago em vez de mostrar erro pro agente.
async function searchWebViaSearxng(query) {
  if (!process.env.SEARXNG_URL) return null;
  try {
    const base = process.env.SEARXNG_URL.replace(/\/+$/, "");
    const url = `${base}/search?q=${encodeURIComponent(query)}&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.results || [];
    if (results.length === 0) return "Nenhum resultado encontrado na web pra essa busca.";
    return results
      .slice(0, 5)
      .map((r) => `- ${r.title}\n  ${r.url}\n  ${r.content || ""}`)
      .join("\n");
  } catch (err) {
    return null;
  }
}

// Fallback pago (Brave Search): só roda se o SearXNG grátis não estiver
// configurado ou falhar — mantém a busca funcionando mesmo se o SearXNG
// autohospedado cair, sem custo nenhum enquanto ele estiver saudável.
async function searchWebViaBrave(query) {
  if (!process.env.BRAVE_SEARCH_API_KEY) {
    return "Busca na web não configurada neste servidor.";
  }
  if (!reserveBraveSearchQuota()) {
    return "Limite mensal de buscas na web atingido. Responda só com os dados internos disponíveis.";
  }

  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Não conta pro teto mensal: falha de rede/API não é uma busca que
      // efetivamente consumiu a cota da Brave.
      releaseBraveSearchQuota();
      return `Busca na web falhou (status ${res.status}).`;
    }
    const data = await res.json();
    const results = (data.web && data.web.results) || [];
    if (results.length === 0) {
      return "Nenhum resultado encontrado na web pra essa busca.";
    }
    return results
      .slice(0, 5)
      .map((r) => `- ${r.title}\n  ${r.url}\n  ${r.description || ""}`)
      .join("\n");
  } catch (err) {
    releaseBraveSearchQuota();
    return "Busca na web falhou. Tente de novo em instantes.";
  }
}

async function searchWeb(query) {
  const searxResult = await searchWebViaSearxng(query);
  if (searxResult !== null) return searxResult;
  return searchWebViaBrave(query);
}

// Versões estruturadas (task-007) — mesma fonte (SearXNG preferido, Brave
// como fallback), mas devolvem array de {title, url, snippet} em vez de
// texto formatado, pra "Ver preços de referência" mostrar como lista de
// cards clicáveis em vez de um bloco de texto corrido. Funções separadas
// das de cima de propósito (searchWeb já está em produção, testada — evita
// arriscar mudar o formato que /api/chat e o WhatsApp já dependem).
// SearXNG/Brave devolvem a URL do resultado como veio da web — nunca confia
// nela sem checar o esquema antes de expor pro front-end (que usa direto
// como href): um resultado indexado com "javascript:..." não pode virar link
// clicável.
function isSafeHttpUrl(url) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch (err) {
    return false;
  }
}

async function searchWebStructuredViaSearxng(query) {
  if (!process.env.SEARXNG_URL) return null;
  try {
    const base = process.env.SEARXNG_URL.replace(/\/+$/, "");
    const url = `${base}/search?q=${encodeURIComponent(query)}&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.results || [];
    return results
      .filter((r) => isSafeHttpUrl(r.url))
      .slice(0, 5)
      .map((r) => ({ title: r.title, url: r.url, snippet: r.content || "" }));
  } catch (err) {
    return null;
  }
}

async function searchWebStructuredViaBrave(query) {
  if (!process.env.BRAVE_SEARCH_API_KEY) return null;
  if (!reserveBraveSearchQuota()) return null;
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      releaseBraveSearchQuota();
      return null;
    }
    const data = await res.json();
    const results = (data.web && data.web.results) || [];
    return results
      .filter((r) => isSafeHttpUrl(r.url))
      .slice(0, 5)
      .map((r) => ({ title: r.title, url: r.url, snippet: r.description || "" }));
  } catch (err) {
    releaseBraveSearchQuota();
    return null;
  }
}

// null (não array vazio) quando NENHUMA fonte respondeu — diferencia "busca
// rodou e não achou nada" de "SearXNG/Brave indisponíveis agora", pra o
// front-end saber quando simplesmente esconder o botão em vez de mostrar
// "nenhum resultado" (task-007: "se a instância do SearXNG estiver fora do
// ar... o botão simplesmente não aparece").
async function searchWebStructured(query) {
  const searx = await searchWebStructuredViaSearxng(query);
  if (searx !== null) return searx;
  return searchWebStructuredViaBrave(query);
}

// Teto de segurança pra melhoria de foto (pilar 4.12 — ver docs/visao-produto.md
// seção 4.12). O Gemini (Nano Banana) cobra por foto processada acima do
// tier grátis (500 imagens/dia no Google AI Studio) — 150/mês fica bem
// dentro até do próprio tier grátis, e nem chega a tocar o orçamento pago
// combinado de R$50/mês com Claude e Brave Search.
const PHOTO_ENHANCE_MONTHLY_LIMIT = 150;
let photoEnhanceCount = 0;
let photoEnhanceMonth = null;

// Camada grátis, sempre ativa, sem depender de nenhuma chave/cartão: ajuste
// técnico automático via `sharp` (biblioteca local, roda no próprio
// servidor) — normaliza exposição/contraste, dá uma nitidez leve e realça um
// pouco a cor. Não é IA generativa (não reimagina a foto), mas é o mesmo
// tipo de ajuste que um filtro automático básico de Instagram faz, e nunca
// custa nada nem depende de terceiro.
async function basicEnhancePhoto(buffer) {
  try {
    return await sharp(buffer).normalize().sharpen().modulate({ saturation: 1.15 }).png().toBuffer();
  } catch (err) {
    return null;
  }
}

// Troca de fundo (opcional, a pessoa escolhe marcando no formulário — nunca
// automático). Modelo local (U²-Net portátil, licença Apache 2.0, roda no
// próprio servidor via onnxruntime-node — grátis, sem chave, sem depender de
// terceiro em tempo de execução) recorta a pessoa e compõe num fundo em
// degradê combinando com as cores do site.
let backgroundRemoverPromise = null;
function getBackgroundRemover() {
  if (!backgroundRemoverPromise) {
    backgroundRemoverPromise = ort.InferenceSession.create(path.join(__dirname, "models", "u2netp.onnx")).then(
      (session) => new BackgroundRemover(session, [0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    );
  }
  return backgroundRemoverPromise;
}

async function applyNewBackground(buffer) {
  try {
    const remover = await getBackgroundRemover();
    const rgbBuffer = await sharp(buffer).flatten({ background: "#0a0c0d" }).toBuffer();
    const { width, height } = await sharp(rgbBuffer).metadata();
    const cutoutBuffer = await (await remover.mask(sharp(rgbBuffer))).toBuffer();

    const backgroundSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0a0c0d" />
            <stop offset="65%" stop-color="#0a0c0d" />
            <stop offset="100%" stop-color="#21e6c1" stop-opacity="0.55" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg)" />
      </svg>`;
    const background = await sharp(Buffer.from(backgroundSvg)).png().toBuffer();

    return await sharp(background).composite([{ input: cutoutBuffer }]).png().toBuffer();
  } catch (err) {
    return null;
  }
}

// Camada opcional de IA de verdade (edição por instrução, não só ajuste
// técnico) — só roda com GEMINI_API_KEY configurada e dentro do teto
// mensal; qualquer falha (sem chave, cota excedida, erro de rede) devolve
// null sem lançar erro.
async function enhancePhotoWithGemini(buffer, mimeType) {
  if (!process.env.GEMINI_API_KEY) return null;
  const monthKey = currentMonthKey();
  if (photoEnhanceMonth !== monthKey) {
    photoEnhanceMonth = monthKey;
    photoEnhanceCount = 0;
  }
  if (photoEnhanceCount >= PHOTO_ENHANCE_MONTHLY_LIMIT) return null;

  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        model: "gemini-3.1-flash-image",
        input: [
          {
            type: "text",
            text:
              "Melhore a iluminação, o contraste e a nitidez dessa foto de perfil profissional, deixando com " +
              "aparência mais limpa e profissional. Não altere a pessoa, a roupa, o fundo nem o conteúdo da " +
              "imagem — só a qualidade técnica da foto.",
          },
          { type: "image", mime_type: mimeType, data: buffer.toString("base64") },
        ],
      }),
      // Sem isso, uma resposta travada do Gemini prende a criação do
      // perfil inteira.
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null; // falha não conta pro teto mensal
    photoEnhanceCount++;
    const data = await res.json();
    // Formato da Interactions API (introduzida em 2026) — o item de
    // resposta com a imagem pode variar o nome exato do campo de dados
    // conforme a versão da API; confere as variações mais prováveis.
    const imageOutput = (data.outputs || []).find((o) => o.type === "image");
    const b64 = imageOutput && (imageOutput.data || imageOutput.image_data || (imageOutput.image && imageOutput.image.data));
    return b64 ? Buffer.from(b64, "base64") : null;
  } catch (err) {
    return null;
  }
}

// Ponto único chamado no cadastro do perfil: tenta a IA de verdade primeiro
// (se configurada e funcionar), cai pro ajuste técnico básico — grátis,
// sempre disponível — se não tiver chave ou a chamada falhar. Só devolve
// null se nem o ajuste básico local conseguir rodar (praticamente nunca).
async function enhancePhoto(buffer, mimeType) {
  const geminiResult = await enhancePhotoWithGemini(buffer, mimeType);
  if (geminiResult) return geminiResult;
  return basicEnhancePhoto(buffer);
}

// Decisão da Jéssica (2026-09-14): a Claude API foi removida do site inteiro
// pra não gastar nada em produção (o subscription do Claude Code que edita
// este repositório é separado da API paga que o servidor usaria em runtime —
// ver docs/visao-produto.md seção 7). Bio de perfil usa a descrição que a
// própria pessoa escreveu, sem reescrever; busca fora do catálogo mostra os
// resultados do SearXNG/Brave direto, sem texto gerado por IA; publicar
// pedido por conversa (que dependia do agente entender a frase) saiu de
// circulação — publicar continua funcionando pelo formulário, que já cobria
// o mesmo caso de uso sem custo nenhum.
const webSearchConfigured = Boolean(process.env.SEARXNG_URL || process.env.BRAVE_SEARCH_API_KEY);
if (!webSearchConfigured) {
  console.warn("Nem SEARXNG_URL nem BRAVE_SEARCH_API_KEY definidas — busca fora do catálogo interno fica sem resultado nenhum.");
}
if (!process.env.GEMINI_API_KEY) {
  console.warn(
    "GEMINI_API_KEY não definida — fotos de perfil recebem só o ajuste técnico automático (sharp), sem a edição por IA generativa do Gemini."
  );
}

// O multer só filtra pelo mimetype que o próprio cliente declarou no
// multipart — um cliente malicioso pode mandar qualquer conteúdo com
// "Content-Type: image/png". Confere a assinatura binária de verdade do
// arquivo antes de salvar, não só o cabeçalho.
function matchesImageSignature(buffer, mimetype) {
  if (mimetype === "image/png") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimetype === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimetype === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}

const UPLOADS_DIR = path.join(__dirname, "uploads");

// Armazenamento de foto (task-008): MinIO self-hosted (S3-compatível, grátis,
// sem custo por uso) quando configurado; sem isso, cai pro disco local do
// próprio servidor (comportamento de sempre) — nunca trava a criação de
// perfil por falta dessa infra opcional. Bucket é privado (nunca público) e
// o MinIO nunca é exposto na internet: o próprio servidor Node busca o
// objeto e repassa os bytes pra quem pediu (ver rota /uploads/providers
// abaixo) — a URL que o front-end recebe é sempre a mesma
// "/uploads/providers/<id>/<arquivo>" de sempre, funcionando com o
// domínio/TLS que o site já tem, sem precisar de subdomínio nem certificado
// novo só pro MinIO.
// Só dispensa HTTPS (MINIO_USE_SSL=true) pra um endereço que nunca sai da
// própria máquina/rede privada do VPS — qualquer host roteável de verdade
// sem TLS mandaria credencial e foto em texto puro pela rede.
function isLocalOrPrivateHost(host) {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  return /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host);
}

const MINIO_BUCKET = process.env.MINIO_BUCKET || "top3-uploads";
if (process.env.MINIO_ENDPOINT && process.env.MINIO_USE_SSL !== "true" && !isLocalOrPrivateHost(process.env.MINIO_ENDPOINT)) {
  throw new Error(
    `MINIO_ENDPOINT="${process.env.MINIO_ENDPOINT}" não é local/privado — configure MINIO_USE_SSL=true, ou aponte pra um endereço só da rede interna do VPS (localhost, 127.0.0.1, ou IP privado).`
  );
}
const minioClient = process.env.MINIO_ENDPOINT
  ? new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT,
      port: process.env.MINIO_PORT ? Number(process.env.MINIO_PORT) : 9000,
      useSSL: process.env.MINIO_USE_SSL === "true",
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
    })
  : null;

// Promise única e compartilhada — toda escrita/leitura no MinIO espera ela
// primeiro, garantindo que o bucket já existe antes de qualquer putObject,
// mesmo pra o primeiro upload logo depois do servidor subir (sem isso, uma
// foto enviada nos primeiros instantes podia chegar antes do bucket existir).
const minioBucketReady = minioClient
  ? minioClient
      .bucketExists(MINIO_BUCKET)
      .then((exists) => (exists ? null : minioClient.makeBucket(MINIO_BUCKET)))
      .catch((err) => {
        console.warn("[minio] não consegui confirmar/criar o bucket:", err.message);
        throw err;
      })
  : null;
// Observador silencioso, só pra evitar o warning de "unhandled rejection" do
// Node caso a falha aconteça antes de qualquer upload/leitura chegar a dar
// await nessa mesma promise (ela continua rejeitando de verdade pra quem
// espera — isso aqui não engole o erro, só marca que alguém já está ciente).
if (minioBucketReady) minioBucketReady.catch(() => {});

if (!minioClient) {
  fs.mkdirSync(path.join(UPLOADS_DIR, "providers"), { recursive: true });
  fs.mkdirSync(path.join(UPLOADS_DIR, "requests"), { recursive: true });
  console.warn("MINIO_ENDPOINT não definida — fotos de perfil ficam salvas em disco local (uploads/), como antes.");
}

// Grava um arquivo enviado (foto original, versão melhorada, ou com fundo
// novo) no backend configurado. Devolve sempre a mesma forma de URL
// pública ("/uploads/<kind>/<id>/<arquivo>"), independente de onde o
// arquivo realmente está guardado — quem consome a resposta (front-end,
// página pública do prestador) nunca precisa saber qual backend está ativo.
// kind por padrão "providers" (uso original) — "requests" pra foto opcional
// de pedido (task de anexo de imagem no formulário de solicitar).
async function storePhoto(buffer, dir, id, filename, mimetype, kind = "providers") {
  if (minioClient) {
    await minioBucketReady;
    const key = `${kind}/${id}/${filename}`;
    await minioClient.putObject(MINIO_BUCKET, key, buffer, buffer.length, { "Content-Type": mimetype });
  } else {
    fs.writeFileSync(path.join(dir, filename), buffer);
  }
  return `/uploads/${kind}/${id}/${filename}`;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g|webp)$/.test(file.mimetype)),
});

// Middleware do multer não devolve JSON em erro (limite de tamanho/qtd de
// arquivo) por padrão — sem isso, o Express manda uma página HTML de erro
// e o fetch() do front-end quebra tentando ler como JSON.
function uploadProviderPhotos(req, res, next) {
  upload.array("photos", 6)(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "cada foto pode ter no máximo 8MB"
          : err.code === "LIMIT_FILE_COUNT"
            ? "no máximo 6 fotos"
            : "não consegui processar as fotos enviadas";
      return res.status(400).json({ error: message });
    }
    res.status(500).json({ error: "falha ao processar upload" });
  });
}

// Mesma ideia acima, mas pra foto opcional de UM pedido (não é obrigatório
// como as fotos de perfil — sem foto anexada, req.file simplesmente não
// existe e o pedido segue sem imagem, sem erro nenhum).
function uploadRequestPhoto(req, res, next) {
  upload.single("photo")(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const message = err.code === "LIMIT_FILE_SIZE" ? "a foto pode ter no máximo 8MB" : "não consegui processar a foto enviada";
      return res.status(400).json({ error: message });
    }
    res.status(500).json({ error: "falha ao processar upload" });
  });
}

// Limite básico por IP contra abuso — o site ainda não tem conta de usuário
// obrigatória (protótipo), então isso não é proteção definitiva, mas evita
// que um script em loop esgote sozinho o teto mensal de IA de imagem/texto
// que devia sobrar pra gente de verdade usando o site. `makeHourlyRateLimiter`
// é reaproveitado por outros endpoints mais abaixo (grupos de economia).
function makeHourlyRateLimiter(limitPerHour) {
  const counts = new Map();
  let callsSinceSweep = 0;
  return function isRateLimited(ip) {
    // Só desativa com a env var explícita, setada só pelo servidor isolado
    // de teste do Playwright (ver playwright.config.js) — nunca em produção.
    // Sem isso, a suíte de testes (que cria muitas contas/grupos em sequência
    // pra cobrir as regras de negócio) esbarra nos mesmos limites pensados
    // pra tráfego de abuso real.
    if (process.env.DISABLE_RATE_LIMITS === "1") return false;
    const now = Date.now();
    // Varredura periódica (achado do CodeRabbit, PR #78): sem isso, `counts`
    // só limpa a entrada do PRÓPRIO IP que voltou a pedir depois da janela
    // expirar — um IP que aparece uma vez só fica esquecido no Map pra
    // sempre, crescimento sem limite ao longo da vida do processo. A cada
    // 1000 chamadas (de qualquer IP, em qualquer limitador — essa função é
    // reaproveitada por cadastro/login/grupo/busca), remove entrada já
    // expirada de todo mundo.
    callsSinceSweep += 1;
    if (callsSinceSweep >= 1000) {
      callsSinceSweep = 0;
      for (const [trackedIp, trackedEntry] of counts) {
        if (now - trackedEntry.windowStart > 60 * 60 * 1000) counts.delete(trackedIp);
      }
    }
    const entry = counts.get(ip);
    if (!entry || now - entry.windowStart > 60 * 60 * 1000) {
      counts.set(ip, { count: 1, windowStart: now });
      return false;
    }
    entry.count++;
    return entry.count > limitPerHour;
  };
}
const isProviderCreateRateLimited = makeHourlyRateLimiter(20);

// Escapa texto pra HTML renderizado no servidor (página pública do
// prestador) — mesma lógica do escapeHtml() de assets/app.js, mas essa
// página não passa pelo bundle do cliente.
function escapeHtmlServer(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const app = express();
// Confia só no próximo salto (o proxy reverso na frente do VPS) pra
// req.ip refletir o IP real de quem fez a requisição, não o do proxy —
// necessário pro rate limit por IP abaixo funcionar de verdade.
app.set("trust proxy", 1);
app.use(express.json());
app.use(cookieParser());
// Modo MinIO: o servidor busca o objeto e repassa os bytes — o bucket nunca
// fica exposto na internet, e a URL que o resto do site usa não muda (ver
// storePhoto acima). Modo disco local (sem MINIO_ENDPOINT): cai direto pro
// express.static de sempre, sem passar por aqui.
if (minioClient) {
  app.get("/uploads/providers/:id/:filename", async (req, res) => {
    const ext = path.extname(req.params.filename).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".jpg" ? "image/jpeg" : null;
    if (!contentType) return res.status(404).end();
    try {
      await minioBucketReady;
      const key = `providers/${req.params.id}/${req.params.filename}`;
      const stream = await minioClient.getObject(MINIO_BUCKET, key);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, max-age=3600");
      stream.on("error", () => res.status(404).end());
      stream.pipe(res);
    } catch (err) {
      res.status(404).end();
    }
  });
  // Mesma coisa, pra foto opcional de pedido (ver storePhoto/uploadRequestPhoto).
  app.get("/uploads/requests/:id/:filename", async (req, res) => {
    const ext = path.extname(req.params.filename).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".jpg" ? "image/jpeg" : null;
    if (!contentType) return res.status(404).end();
    try {
      await minioBucketReady;
      const key = `requests/${req.params.id}/${req.params.filename}`;
      const stream = await minioClient.getObject(MINIO_BUCKET, key);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, max-age=3600");
      stream.on("error", () => res.status(404).end());
      stream.pipe(res);
    } catch (err) {
      res.status(404).end();
    }
  });
}
app.use("/uploads", express.static(UPLOADS_DIR));
// Widget do ALTCHA (task-008) servido do próprio site, não de CDN de
// terceiro — pacote já baixado via npm, só expõe o bundle pronto.
app.use("/vendor/altcha", express.static(path.join(__dirname, "node_modules", "altcha", "dist", "main")));
// Bloqueia /data ANTES do static(__dirname) logo abaixo — esse diretório
// guarda USERS/SESSIONS persistidos em disco (task-009, item 6b), com
// passwordHash e dado pessoal; sem isso, express.static(__dirname) serviria
// data/users.json pra qualquer um que pedisse GET /data/users.json.
app.use("/data", (req, res) => res.status(404).end());
app.use(express.static(__dirname));

// Pilar 4.13 — login com Google, opcional (perfil continua podendo ser
// criado sem login, como já funcionava — logar só desbloqueia editar depois
// e ver os próprios perfis). Sem GOOGLE_CLIENT_ID configurado, o botão
// simplesmente não aparece no site; nada quebra.
const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;
if (!googleClient) {
  console.warn("GOOGLE_CLIENT_ID não definida — login com Google fica desativado (perfil continua podendo ser criado sem login).");
}

const USERS = [];
let nextUserId = 1;
const SESSIONS = new Map(); // token de sessão -> { userId, expiresAt }
const SESSION_COOKIE = "top3_session";

// Persistência de USERS/SESSIONS em disco (task-009, item 6b) — o cookie
// já durava 30 dias (SESSION_MAX_AGE_MS abaixo), mas USERS/SESSIONS
// sempre viveram só na memória do processo Node. Como o deploy reinicia
// o processo (systemctl restart top3profissional) a cada push pra main —
// e isso acontece com frequência neste projeto — toda conta e toda
// sessão eram apagadas silenciosamente em cada deploy, mesmo com o
// cookie do navegador ainda válido. Isso, não o tempo de expiração, era
// a causa real de "a sessão cai sozinha". Resto do estado (grupos,
// pedidos, perfis de prestador) continua só em memória de propósito —
// esse arquivo resolve especificamente login/sessão, que é o que a
// Jéssica reportou; persistir tudo o mais é uma decisão maior, fora do
// escopo desta correção de UX.
// Configurável via env var só pra teste automatizado conseguir isolar
// (data/ próprio, descartável, num diretório temporário) sem sujar o
// data/ real do checkout — produção/dev local nunca precisam setar isso.
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
// USERS e SESSIONS num arquivo só, de propósito (achado do CodeRabbit no
// PR #76): com dois arquivos separados, um processo morto bem no meio das
// duas escritas (ex: durante logout) podia deixar um sessions.json velho
// (ainda com o token removido) ao lado de um users.json novo — sem nenhum
// jeito de detectar essa inconsistência na próxima subida, um token já
// deslogado voltava a funcionar até expirar (30 dias). Um arquivo só
// elimina esse cenário: ou a escrita inteira (users + sessions) entra,
// ou fica a versão anterior completa — nunca uma mistura das duas.
const DATA_FILE = path.join(DATA_DIR, "state.json");

// Testes automatizados (Playwright) nunca devem ler nem escrever
// data/state.json de verdade — sem isso, cada rodada de teste carregaria
// contas de uma rodada anterior (colisão de e-mail, contagem de usuário
// inesperada) e ainda por cima sujaria o arquivo real usado em
// desenvolvimento local. Desligado por padrão só quando essa env var
// explícita está setada (ver playwright.config.js).
function isUserPersistenceDisabled() {
  return process.env.DISABLE_USER_PERSISTENCE === "1";
}

function loadPersistedUsersAndSessions() {
  if (isUserPersistenceDisabled()) return;
  try {
    if (fs.existsSync(DATA_FILE)) {
      const loaded = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      USERS.push(...(loaded.users || []));
      const maxId = USERS.reduce((max, u) => Math.max(max, Number(String(u.id).replace(/\D/g, "")) || 0), 0);
      nextUserId = maxId + 1;
      for (const [token, session] of loaded.sessions || []) SESSIONS.set(token, session);
    }
  } catch (err) {
    console.error("[persistencia] falha ao carregar users/sessions salvos, começando do zero:", err.message);
  }
}

// Escrita síncrona, atômica e com permissão restrita (achados do
// CodeRabbit no PR #76):
// - Atômica: escreve num arquivo temporário e troca com fs.renameSync
//   (mesma técnica já usada pra foto de perfil, ver buildPhotosFromFiles)
//   — um SIGKILL/queda de energia no meio da escrita nunca deixa
//   state.json pela metade (JSON inválido apagaria todo mundo no próximo
//   boot); o pior caso vira "perdeu só o autosave mais recente".
// - 0600/0700: o arquivo tem passwordHash e token de sessão — sem
//   restringir, um umask permissivo no VPS deixaria qualquer usuário do
//   sistema ler esse arquivo.
// - Síncrona de propósito: roda também no handler de SIGTERM logo antes
//   do processo morrer, precisa terminar antes do `process.exit`.
function persistUsersAndSessions() {
  if (isUserPersistenceDisabled()) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    fs.chmodSync(DATA_DIR, 0o700);
    const tmpFile = `${DATA_FILE}.tmp-${process.pid}`;
    const payload = JSON.stringify({ users: USERS, sessions: [...SESSIONS.entries()] });
    const fd = fs.openSync(tmpFile, "w", 0o600);
    try {
      fs.writeFileSync(fd, payload);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpFile, DATA_FILE);
    // Decisão consciente (CodeRabbit, PR #76): não chama fsync no arquivo
    // temporário nem no diretório antes/depois do rename. Isso protegeria
    // contra queda de energia física bem no instante entre o rename e o
    // disco confirmar a escrita de verdade — sem fsync, esse caso muito
    // raro poderia perder só o autosave mais recente (no máximo os
    // últimos 5s de estado, ver setInterval mais abaixo). O que esse
    // arquivo resolve de fato — sessão sendo apagada a cada deploy
    // (systemctl restart, SIGTERM) — já fica coberto sem fsync algum,
    // porque o processo sempre termina normalmente nesse caminho, nunca
    // é cortado no meio da escrita. Adicionar fsync (E fsync no
    // diretório, pra garantir que o próprio rename persista) é proteção
    // desproporcional pro risco real deste projeto (dado de sessão, não
    // financeiro, num VPS) frente à complexidade que adiciona.
  } catch (err) {
    console.error("[persistencia] falha ao salvar users/sessions:", err.message);
  }
}

loadPersistedUsersAndSessions();
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// maxAge do cookie só controla até quando o NAVEGADOR guarda o cookie — não
// impede alguém de mandar um token capturado manualmente depois desse
// prazo. Confere e expira a sessão aqui também (achado do CodeRabbit no
// PR #46).
function getCurrentUser(req) {
  const token = req.cookies && req.cookies[SESSION_COOKIE];
  if (!token) return null;
  const session = SESSIONS.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    SESSIONS.delete(token);
    return null;
  }
  return USERS.find((u) => u.id === session.userId) || null;
}

// Compartilhado entre login com Google e login por email/senha (task-003)
// — os dois caminhos terminam no mesmo tipo de sessão, cookie httpOnly de
// 30 dias, mesma lógica de expiração no servidor.
function startSession(req, res, user) {
  const token = crypto.randomBytes(24).toString("hex");
  SESSIONS.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_MAX_AGE_MS });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    maxAge: SESSION_MAX_AGE_MS,
  });
  persistUsersAndSessions();
}

// Só os campos seguros pra devolver ao cliente — nunca passwordHash, nunca
// reputacaoScore numérico (interno, task-004).
function publicUserFields(user) {
  return {
    // id nunca foi sensível — já é exposto publicamente em GET
    // /api/groups/:id (members[].userId); sem ele aqui, o front-end não
    // teria como saber "esse membro do grupo sou eu" pra montar o payload
    // de avaliação/denúncia ou esconder o próprio card na lista (task-004).
    id: user.id,
    name: user.name,
    email: user.email,
    picture: user.picture,
    whatsapp: user.whatsapp,
    tipoUso: user.tipoUso,
    motorista: user.motorista,
    disponibilidade: user.disponibilidade,
    mediaAvaliacao: user.mediaAvaliacao,
    totalAvaliacoes: user.totalAvaliacoes,
    status: user.status,
  };
}

// Anti-spam (task-008) — ALTCHA: proof-of-work resolvido no navegador,
// verificado aqui sem nenhum serviço de terceiro. ALTCHA_HMAC_KEY assina o
// desafio pra garantir que a solução veio de um desafio que este servidor
// gerou (não um forjado). Sem a chave configurada, a checagem sempre passa
// (mesmo padrão de infra opcional de sempre) — proteger contra spam é bônus,
// não pode travar o cadastro/post de ninguém se não estiver configurada.
function isAltchaConfigured() {
  return Boolean(process.env.ALTCHA_HMAC_KEY);
}

const ALTCHA_EXPIRES_MS = 5 * 60 * 1000;

// verifySolution (v1) só confere assinatura HMAC + expiração — não impede
// reenviar a MESMA solução válida várias vezes antes de expirar. Guarda as
// assinaturas já usadas (com o mesmo prazo do desafio) pra cada uma só
// contar uma vez — sem isso, um payload capturado (ex: inspecionando a
// rede) poderia ser reaproveitado pra passar pelo anti-spam repetidas vezes.
const ALTCHA_USED_SIGNATURES = new Map();

function isAltchaSignatureReused(signature) {
  const now = Date.now();
  for (const [sig, expiresAt] of ALTCHA_USED_SIGNATURES) {
    if (expiresAt < now) ALTCHA_USED_SIGNATURES.delete(sig);
  }
  if (ALTCHA_USED_SIGNATURES.has(signature)) return true;
  ALTCHA_USED_SIGNATURES.set(signature, now + ALTCHA_EXPIRES_MS);
  return false;
}

async function verifyAltcha(payload) {
  if (!isAltchaConfigured()) return true;
  if (!payload || typeof payload !== "string") return false;
  try {
    const verified = await verifyAltchaSolution(payload, process.env.ALTCHA_HMAC_KEY, true);
    if (!verified) return false;
    const { signature } = JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));
    if (!signature || isAltchaSignatureReused(signature)) return false;
    return true;
  } catch (err) {
    return false;
  }
}

app.get("/api/altcha-challenge", async (req, res) => {
  if (!isAltchaConfigured()) return res.status(503).json({ error: "anti-spam não configurado neste servidor" });
  try {
    // maxNumber baixo de propósito: o objetivo aqui é filtrar bot em massa
    // (custo marginal por tentativa), não virar fricção perceptível pra
    // gente de verdade preenchendo um formulário — poucos segundos de
    // proof-of-work em background (auto="onfocus") já cumprem isso.
    const challenge = await createAltchaChallenge({
      hmacKey: process.env.ALTCHA_HMAC_KEY,
      maxNumber: 20000,
      expires: new Date(Date.now() + ALTCHA_EXPIRES_MS),
    });
    res.json(challenge);
  } catch (err) {
    res.status(500).json({ error: "falha ao gerar desafio anti-spam" });
  }
});

// Estatísticas do site (task-008) — Umami self-hosted, sem mandar dado de
// visita pra terceiro (Google Analytics etc). UMAMI_SCRIPT_URL é a URL do
// script de rastreamento da própria instância (ex:
// "https://stats.exemplo.com/script.js"), UMAMI_WEBSITE_ID é o id do site
// cadastrado nela. Sem as duas, o site funciona normalmente, só sem
// rastreamento nenhum.
function isUmamiConfigured() {
  return Boolean(process.env.UMAMI_SCRIPT_URL && process.env.UMAMI_WEBSITE_ID);
}

app.get("/api/auth/config", (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    altchaConfigured: isAltchaConfigured(),
    umamiScriptUrl: isUmamiConfigured() ? process.env.UMAMI_SCRIPT_URL : null,
    umamiWebsiteId: isUmamiConfigured() ? process.env.UMAMI_WEBSITE_ID : null,
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
  });
});

app.post("/api/auth/google", async (req, res) => {
  if (!googleClient) return res.status(503).json({ error: "login com Google não configurado neste servidor" });
  const { credential } = req.body || {};
  if (!credential || typeof credential !== "string") {
    return res.status(400).json({ error: "credencial ausente" });
  }
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    let user = USERS.find((u) => u.googleId === payload.sub);
    if (!user) {
      // Mesmo e-mail já cadastrado por senha (task-003) — evita duas contas
      // separadas pra mesma pessoa por acidente.
      const existingByEmail = USERS.find((u) => u.email && u.email.toLowerCase() === (payload.email || "").toLowerCase());
      if (existingByEmail) {
        existingByEmail.googleId = payload.sub;
        existingByEmail.picture = existingByEmail.picture || payload.picture;
        user = existingByEmail;
      } else {
        user = createUser({ googleId: payload.sub, email: payload.email, name: payload.name, picture: payload.picture });
      }
    }
    startSession(req, res, user);
    res.json({ user: publicUserFields(user) });
  } catch (err) {
    res.status(401).json({ error: "credencial do Google inválida" });
  }
});

// Login social via Supabase (Facebook / Instagram) — o frontend usa o SDK
// do Supabase pra fazer o OAuth e nos manda o access_token de volta. A gente
// verifica com o endpoint /auth/v1/user do próprio Supabase e cria/acha o
// usuário no nosso sistema, igual ao fluxo do Google.
app.post("/api/auth/supabase-social", async (req, res) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return res.status(503).json({ error: "login social não configurado neste servidor" });
  }
  const { access_token } = req.body || {};
  if (!access_token || typeof access_token !== "string") {
    return res.status(400).json({ error: "token ausente" });
  }
  let supabaseUser;
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        apikey: process.env.SUPABASE_ANON_KEY,
      },
    });
    if (!r.ok) return res.status(401).json({ error: "token social inválido" });
    supabaseUser = await r.json();
  } catch (err) {
    return res.status(502).json({ error: "falha ao verificar token com Supabase" });
  }
  const email = (supabaseUser.email || "").toLowerCase().trim();
  const provider = supabaseUser.app_metadata?.provider || "social";
  const meta = supabaseUser.user_metadata || {};
  const name = meta.full_name || meta.name || email.split("@")[0] || "Usuário";
  const picture = meta.avatar_url || meta.picture || null;

  let user = USERS.find((u) => u.supabaseId === supabaseUser.id);
  if (!user && email) {
    const byEmail = USERS.find((u) => u.email && u.email.toLowerCase() === email);
    if (byEmail) {
      byEmail.supabaseId = supabaseUser.id;
      byEmail.picture = byEmail.picture || picture;
      user = byEmail;
    }
  }
  if (!user) {
    user = createUser({ email: email || null, name, picture });
    user.supabaseId = supabaseUser.id;
  }
  startSession(req, res, user);
  res.json({ user: publicUserFields(user) });
});

// Login simples por email/senha (task-003) — alternativa que não depende de
// GOOGLE_CLIENT_ID configurada, sempre disponível.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const NAME_MAX_LENGTH = 60;
const BCRYPT_ROUNDS = 10;

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

// Cria usuário com todos os campos de perfil (task-003) e reputação
// (task-004) já inicializados — usado tanto pelo login com Google quanto
// pelo cadastro por email/senha, pra nunca deixar um caminho com campo
// faltando que o outro tem.
function createUser({ googleId = null, passwordHash = null, email, name, picture = null, whatsapp = null }) {
  const user = {
    id: `u${nextUserId++}`,
    googleId,
    passwordHash,
    email,
    name,
    picture,
    whatsapp,
    tipoUso: null,
    motorista: null,
    disponibilidade: [],
    mediaAvaliacao: null,
    totalAvaliacoes: 0,
    reputacaoScore: 100,
    status: "ativo",
  };
  USERS.push(user);
  return user;
}

const isSignupRateLimited = makeHourlyRateLimiter(20);
const isLoginRateLimited = makeHourlyRateLimiter(30);

app.post("/api/auth/signup", async (req, res) => {
  if (isSignupRateLimited(req.ip)) {
    return res.status(429).json({ error: "muitas tentativas de cadastro a partir daqui — tente de novo mais tarde" });
  }
  if (!(await verifyAltcha((req.body || {}).altcha))) {
    return res.status(400).json({ error: "verificação anti-spam inválida — recarregue a página e tente de novo" });
  }
  const { name, email, password, whatsapp } = req.body || {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "informe seu nome" });
  }
  if (name.trim().length > NAME_MAX_LENGTH) {
    return res.status(400).json({ error: `nome muito longo (máximo ${NAME_MAX_LENGTH} caracteres)` });
  }
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !EMAIL_PATTERN.test(normalizedEmail)) {
    return res.status(400).json({ error: "informe um e-mail válido" });
  }
  if (!password || typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return res.status(400).json({ error: `senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres` });
  }
  const wpResult = validateBrazilianPhone(whatsapp);
  if (!wpResult.ok) return res.status(400).json({ error: wpResult.error });
  if (USERS.some((u) => u.email && u.email.toLowerCase() === normalizedEmail)) {
    return res.status(409).json({ error: "já existe conta com esse e-mail — tente entrar em vez de cadastrar" });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = createUser({ passwordHash, email: normalizedEmail, name: name.trim(), whatsapp: wpResult.digits });
  startSession(req, res, user);
  res.status(201).json({ user: publicUserFields(user) });
});

app.post("/api/auth/login", async (req, res) => {
  if (isLoginRateLimited(req.ip)) {
    return res.status(429).json({ error: "muitas tentativas de login a partir daqui — tente de novo mais tarde" });
  }
  const { email, password } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || typeof password !== "string" || !password) {
    return res.status(400).json({ error: "informe e-mail e senha" });
  }
  const user = USERS.find((u) => u.email && u.email.toLowerCase() === normalizedEmail && u.passwordHash);
  // Mesma mensagem de erro pra "não existe" e "senha errada" — não dar pista
  // pra quem tenta adivinhar e-mails cadastrados.
  if (!user) {
    return res.status(401).json({ error: "e-mail ou senha incorretos" });
  }
  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json({ error: "e-mail ou senha incorretos" });
  }
  startSession(req, res, user);
  res.json({ user: publicUserFields(user) });
});

const AVAILABLE_DAYS = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"];

function validateDisponibilidade(disponibilidade) {
  if (disponibilidade === undefined || disponibilidade === null) return { ok: true, value: [] };
  if (!Array.isArray(disponibilidade)) return { ok: false, error: "disponibilidade inválida" };
  const value = [];
  for (const janela of disponibilidade) {
    if (!janela || typeof janela !== "object") return { ok: false, error: "janela de disponibilidade inválida" };
    const { dia, inicio, fim } = janela;
    if (!AVAILABLE_DAYS.includes(dia)) {
      return { ok: false, error: `dia inválido (use: ${AVAILABLE_DAYS.join(", ")})` };
    }
    if (!inicio || !fim) continue; // dia em branco = indisponível, ignora a janela
    if (!/^\d{2}:\d{2}$/.test(inicio) || !/^\d{2}:\d{2}$/.test(fim)) {
      return { ok: false, error: "horário inválido (use HH:MM)" };
    }
    value.push({ dia, inicio, fim });
  }
  return { ok: true, value };
}

function validateMotorista(motorista) {
  if (motorista === undefined || motorista === null) return { ok: true, value: null };
  if (typeof motorista !== "object") return { ok: false, error: "dados de motorista inválidos" };
  const { cnhNumero, veiculoPlaca, veiculoModelo, veiculoCor } = motorista;
  const fields = { cnhNumero, veiculoPlaca, veiculoModelo, veiculoCor };
  const labels = { cnhNumero: "a CNH", veiculoPlaca: "a placa do veículo", veiculoModelo: "o modelo do veículo", veiculoCor: "a cor do veículo" };
  // Só grava se pelo menos um campo foi preenchido — pessoa pode não querer
  // oferecer carona nunca, e nesse caso o formulário fica vazio mesmo.
  const anyFilled = Object.values(fields).some((v) => typeof v === "string" && v.trim());
  if (!anyFilled) return { ok: true, value: null };
  const value = {};
  for (const key of Object.keys(fields)) {
    const val = fields[key];
    if (!val || typeof val !== "string" || !val.trim()) {
      return { ok: false, error: `informe ${labels[key]} (ou deixe todos os campos de veículo em branco)` };
    }
    if (val.trim().length > CARONA_DOC_MAX_LENGTH) {
      return { ok: false, error: `${labels[key]} está muito longo (máximo ${CARONA_DOC_MAX_LENGTH} caracteres)` };
    }
    value[key] = val.trim();
  }
  return { ok: true, value };
}

const TIPO_USO_VALUES = ["solicitante", "prestador", "ambos"];

app.put("/api/auth/profile", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "não autenticado" });

  const { name, whatsapp, tipoUso, motorista, disponibilidade } = req.body || {};
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "nome inválido" });
    if (name.trim().length > NAME_MAX_LENGTH) return res.status(400).json({ error: `nome muito longo (máximo ${NAME_MAX_LENGTH} caracteres)` });
  }
  if (whatsapp !== undefined) {
    if (typeof whatsapp !== "string" || !whatsapp.trim()) return res.status(400).json({ error: "WhatsApp inválido" });
    if (whatsapp.trim().length > REQUEST_WHATSAPP_MAX_LENGTH) {
      return res.status(400).json({ error: `WhatsApp muito longo (máximo ${REQUEST_WHATSAPP_MAX_LENGTH} caracteres)` });
    }
  }
  if (tipoUso !== undefined && tipoUso !== null && !TIPO_USO_VALUES.includes(tipoUso)) {
    return res.status(400).json({ error: `tipo de uso inválido (use: ${TIPO_USO_VALUES.join(", ")})` });
  }
  const motoristaResult = validateMotorista(motorista);
  if (!motoristaResult.ok) return res.status(400).json({ error: motoristaResult.error });
  const disponibilidadeResult = validateDisponibilidade(disponibilidade);
  if (!disponibilidadeResult.ok) return res.status(400).json({ error: disponibilidadeResult.error });

  if (name !== undefined) user.name = name.trim();
  if (whatsapp !== undefined) user.whatsapp = whatsapp.trim();
  if (tipoUso !== undefined) user.tipoUso = tipoUso;
  if (motorista !== undefined) user.motorista = motoristaResult.value;
  if (disponibilidade !== undefined) user.disponibilidade = disponibilidadeResult.value;

  res.json({ user: publicUserFields(user) });
});

// Status 200 mesmo sem sessão (user: null) — esse endpoint é consultado sem
// condição a cada carregamento de página pra saber se já existe uma sessão
// (task-003: login por email/senha, ao contrário do Google, não tem como o
// próprio front-end saber se está configurado, então sempre pergunta). Um
// 401 aqui apareceria como "Failed to load resource" no console de todo
// visitante anônimo — não é um erro de verdade, é o caso normal de "ninguém
// logado".
app.get("/api/auth/me", (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return res.json({ user: null, providers: [], groups: [], requests: [] });
  const providers = PROVIDER_PROFILES.filter((p) => p.ownerUserId === user.id).map((p) => ({ name: p.name, service: p.service, slug: p.slug }));
  const groups = GROUP_OPPORTUNITIES.filter((g) => g.ownerUserId === user.id).map((g) => ({
    id: g.id,
    title: g.title,
    category: g.category,
    categoryLabel: GROUP_CATEGORY_LABELS[g.category],
    status: g.status,
  }));
  // "Meus pedidos" — só pega o que foi publicado pelo formulário direto do
  // site (POST /api/requests), que tem sessão de navegador pra amarrar.
  // Pedido publicado por conversa (chat do site ou WhatsApp) fica sem dono
  // mesmo — não tem sessão nenhuma nesses dois caminhos.
  const requests = REQUESTS.filter((r) => r.ownerUserId === user.id).map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    status: r.status,
  }));
  res.json({ user: publicUserFields(user), providers, groups, requests });
});

app.post("/api/auth/logout", (req, res) => {
  const token = req.cookies && req.cookies[SESSION_COOKIE];
  if (token) {
    SESSIONS.delete(token);
    persistUsersAndSessions();
  }
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

function findRequest(id) {
  // Normalizado aqui (não só no lado do WhatsApp) pra cobrir qualquer
  // chamador que receba o id com espaços, maiúsculas ou pontuação solta
  // (ex: "aceitar R1." digitado no WhatsApp).
  const normalized = String(id).trim().replace(/[.,!?;:]+$/, "").toLowerCase();
  return REQUESTS.find((r) => r.id.toLowerCase() === normalized);
}

function acceptRequest(id, providerName) {
  const request = findRequest(id);
  if (!request) {
    return { ok: false, error: "pedido não encontrado" };
  }
  if (request.status !== "aberto") {
    const error = request.status === "aceito" ? "este pedido já foi aceito" : "este pedido já foi concluído";
    return { ok: false, error };
  }
  request.status = "aceito";
  request.provider = (providerName && providerName.trim().slice(0, 60)) || "Prestador";
  return { ok: true, request };
}

function completeRequest(id) {
  const request = findRequest(id);
  if (!request) {
    return { ok: false, error: "pedido não encontrado" };
  }
  if (request.status !== "aceito") {
    return { ok: false, error: "só dá pra concluir um pedido que já foi aceito" };
  }
  request.status = "concluído";
  return { ok: true, request };
}

function rateRequest(id, rating, comment) {
  const request = findRequest(id);
  if (!request) {
    return { ok: false, error: "pedido não encontrado" };
  }
  if (request.status !== "concluído") {
    return { ok: false, error: "só dá pra avaliar um pedido concluído" };
  }
  if (request.rating !== undefined) {
    return { ok: false, error: "este pedido já foi avaliado" };
  }
  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return { ok: false, error: "avaliação precisa ser um número inteiro de 1 a 5" };
  }
  request.rating = ratingNum;
  request.comment = (typeof comment === "string" && comment.trim().slice(0, 300)) || "";
  return { ok: true, request };
}

// Contador de buscas de verdade (task-012, "Números que conectam") — só
// timestamp, nenhum texto de busca guardado. Precisa de um endpoint
// próprio (em vez de reaproveitar recordDemandSignal) porque bastante
// busca resolve inteira no front-end via classifyIntent() (ex: "corrida
// até o aeroporto" já casa local, nunca chega no servidor) — sem esse
// contador explícito, chamado no mesmo handler de submit que dispara
// qualquer busca (ver bottomSearchForm em assets/app.js), o número de
// "buscas realizadas" ficaria bem menor que o real.
const SEARCH_EVENTS = [];
const SEARCH_EVENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // guarda até 30 dias, mais que suficiente pra "últimos 7 dias"
// Poda por tempo (abaixo) sozinha não impede alguém de inundar o endpoint
// com requisição repetida — crescimento de memória sem limite mesmo
// dentro dos 30 dias (achado do CodeRabbit, PR #78). Mesmo limitador de
// hora por IP já usado em cadastro/login/criar grupo (ver
// makeHourlyRateLimiter), bem generoso — é só sinal de "alguém buscou",
// não precisa ser tão restrito quanto cadastro.
const isSearchEventRateLimited = makeHourlyRateLimiter(300);

app.post("/api/search-events", (req, res) => {
  if (isSearchEventRateLimited(req.ip)) return res.status(204).end();
  SEARCH_EVENTS.push(Date.now());
  // Poda por TEMPO, não por contagem (achado do CodeRabbit, PR #78): um
  // corte por quantidade (shift() ao passar de N) descartava evento ainda
  // dentro da janela de 7 dias sempre que passava de N buscas acumuladas
  // — /api/home-stats nunca conseguiria reportar mais que esse teto fixo,
  // mesmo que todos os N+1 tivessem acontecido nos últimos 7 dias de
  // verdade. Removendo só o que já passou dos 30 dias, o array cresce e
  // encolhe de acordo com o uso real, sem limitar artificialmente o
  // número que devia ser real.
  const cutoff = Date.now() - SEARCH_EVENT_WINDOW_MS;
  while (SEARCH_EVENTS.length > 0 && SEARCH_EVENTS[0] < cutoff) SEARCH_EVENTS.shift();
  res.status(204).end();
});

// Pilar 4.2 — sinal de demanda não publicada: toda busca que chega aqui já
// passou pela classificação do front-end e não caiu em serviço cadastrado
// nem corrida/carona (ver classifyIntent em assets/app.js) — ou seja, é
// exatamente o tipo de "alguém procurando algo que ninguém anunciou
// formalmente" que a seção 4.2 do docs/visao-produto.md descreve (terreno,
// carro, produto...). Guarda só categoria + região, nunca o texto exato
// digitado — vira uma estatística agregada, não expõe quem procurou o quê.
const DEMAND_SIGNALS = [];
const DEMAND_SIGNAL_CAP = 500;
const DEMAND_SIGNAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const DEMAND_SIGNAL_MIN_COUNT = 2;

const DEMAND_CATEGORY_KEYWORDS = {
  terreno: ["terreno", "lote", "chácara", "sítio", "fazenda"],
  imóvel: ["casa", "apartamento", "kitnet", "alugar", "aluguel", "imóvel"],
  carro: ["carro", "veículo", "moto", "caminhão", "caminhonete"],
  produto: ["celular", "computador", "notebook", "geladeira", "fogão", "móveis", "sofá", "televisão"],
};

function classifyDemandCategory(message) {
  const lower = message.toLowerCase();
  for (const [category, keywords] of Object.entries(DEMAND_CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return category;
  }
  return null;
}

// Best-effort: pega o que vem depois de "em <lugar>" (ex: "terreno em
// Contagem" → "Contagem"). Não acha sempre, e tudo bem — location fica null
// nesse caso, o sinal ainda soma pra categoria geral.
function extractDemandLocation(message) {
  const match = message.match(/\bem\s+([a-zà-úA-ZÀ-Ú]+(?:\s+[a-zà-úA-ZÀ-Ú]+){0,2})/i);
  return match ? match[1].trim() : null;
}

// "quero chamar X" é o clique em "Chamar agora" de um card do ranking —
// contato com alguém que já existe, não uma busca por algo que falta.
// Nunca deve contar como demanda não atendida.
function recordDemandSignal(message) {
  if (/^quero chamar\s/i.test(message.trim())) return;
  const category = classifyDemandCategory(message);
  if (!category) return;
  DEMAND_SIGNALS.push({ category, location: extractDemandLocation(message), timestamp: Date.now() });
  if (DEMAND_SIGNALS.length > DEMAND_SIGNAL_CAP) DEMAND_SIGNALS.shift();
}

app.get("/api/demand-signals", (req, res) => {
  const since = Date.now() - DEMAND_SIGNAL_WINDOW_MS;
  const counts = new Map();
  for (const signal of DEMAND_SIGNALS) {
    if (signal.timestamp < since) continue;
    const key = `${signal.category}|${signal.location || ""}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const signals = [...counts.entries()]
    .map(([key, count]) => {
      const [category, location] = key.split("|");
      return { category, location: location || null, count };
    })
    .filter((s) => s.count >= DEMAND_SIGNAL_MIN_COUNT)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  res.json({ signals });
});

// "Números que conectam" (task-012) — os 4 sempre calculados na hora, a
// partir do estado real (nunca fixo, nunca arredondado). Reaproveita os
// mesmos arrays que o resto do site já usa pra listar posts/prestadores —
// nenhum dado novo guardado só pra essa tela.
app.get("/api/home-stats", (req, res) => {
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const searchesLast7Days = SEARCH_EVENTS.filter((t) => t >= since).length;
  const openRequests = REQUESTS.filter((r) => r.status === "aberto").length;
  const openGroups = GROUP_OPPORTUNITIES.filter((g) => g.status === "aberto").length;
  res.json({
    searchesLast7Days,
    openOpportunities: openRequests + openGroups,
    groupsForming: openGroups,
    providersListed: PROVIDERS.length + PROVIDER_PROFILES.length,
  });
});

// "TOP3 SYSTEM — Atividade recente" (task-012) — eventos reais mais
// recentes, sem nome de pessoa nenhum (só categoria/cidade, dado que já é
// público em outro lugar do site — o próprio card do post/grupo). Mistura
// GROUP_EVENTS (log que já existia, sem tela própria até agora — pilar
// 4.14) com a criação de pedidos (REQUESTS), ordenado por data, sem
// preencher com item inventado quando tem pouco: a lista simplesmente
// fica curta.
app.get("/api/activity-feed", (req, res) => {
  // Math.min(N, 20) sozinho não barra N negativo (ex: ?limit=-1 passava
  // direto, e slice(0, -1) devolve "tudo menos o último" — muito mais que
  // os 20 combinados; achado do CodeRabbit, PR #78). Math.max trava no
  // mínimo de 1 antes do teto de 20.
  const requestedLimit = Number(req.query.limit);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 8, 1), 20);
  const events = [];

  for (const ev of GROUP_EVENTS) {
    if (ev.type !== "created") continue;
    const group = GROUP_OPPORTUNITIES.find((g) => g.id === ev.groupId);
    if (!group) continue;
    const label = group.category === "carona" ? "carona" : "grupo";
    events.push({ text: `Novo ${label} criado em ${group.city}`, createdAt: ev.at });
  }

  for (const r of REQUESTS) {
    if (!r.createdAt) continue;
    const where = r.location ? ` em ${r.location}` : "";
    events.push({ text: `Novo pedido de ${r.type}${where}`, createdAt: r.createdAt });
  }

  events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ events: events.slice(0, limit) });
});

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "campo 'message' é obrigatório" });
  }

  recordDemandSignal(message);

  try {
    const reply = await searchWeb(message);
    res.json({ reply });
  } catch (err) {
    console.error("Erro ao buscar na web:", err.message);
    res.status(500).json({ error: "Falha ao buscar. Tente novamente." });
  }
});

// Sem dado (ex: perfil real recém-criado, ainda sem avaliação/preço/
// distância) sempre vai pro fim da lista, não pro topo por acaso de
// comparação com undefined/NaN.
function compareNullsLast(aVal, bVal, compare) {
  if (aVal == null && bVal == null) return 0;
  if (aVal == null) return 1;
  if (bVal == null) return -1;
  return compare(aVal, bVal);
}

const SORTERS = {
  rating: (a, b) => compareNullsLast(a.rating, b.rating, (x, y) => y - x),
  price: (a, b) => compareNullsLast(a.price, b.price, (x, y) => x - y),
  distance: (a, b) => compareNullsLast(a.distanceKm, b.distanceKm, (x, y) => x - y),
};

// Perfis reais (pilar 4.12) entram no ranking igual aos prestadores mock —
// sem isso, um perfil criado pela pessoa nunca aparece em lugar nenhum além
// do próprio link, o que não faz sentido (a busca é o principal ponto de
// entrada do site). Ainda não têm avaliação/preço/distância de verdade
// (fica null, tratado pelo sort acima e pelo front-end como "novo").
// Reputação abaixo do limiar mais severo (task-004) esconde o perfil de
// quem publicou — some do ranking, da busca por serviço, e a própria página
// devolve 404 (ver GET /prestador/:slug). Sem dono (ownerUserId null,
// perfil criado sem login) nunca fica suspenso por essa regra — não tem
// conta nenhuma pra carregar reputação.
function isOwnerSuspended(ownerUserId) {
  if (!ownerUserId) return false;
  const owner = USERS.find((u) => u.id === ownerUserId);
  return owner ? owner.status === "suspenso" : false;
}

// Escolhe a melhor URL de uma foto: versão com fundo novo > versão aprimorada > original.
function bestPhotoUrlFromPhoto(photo) {
  return photo.newBackgroundUrl || photo.enhancedUrl || photo.url || null;
}

function providerProfilesForRanking() {
  return PROVIDER_PROFILES.filter((p) => !isOwnerSuspended(p.ownerUserId)).map((p) => {
    const nextSlot = computeNextSlot(p.availability);
    const firstPhoto = p.photos && p.photos.length > 0 ? p.photos[0] : null;
    return {
      name: p.name,
      service: p.service,
      city: p.location,
      rating: null,
      reviewCount: null,
      distanceKm: null,
      price: null,
      fastReply: false,
      lat: null,
      lng: null,
      slug: p.slug,
      photoUrl: firstPhoto ? bestPhotoUrlFromPhoto(firstPhoto) : null,
      availability: p.availability || [],
      nextSlot: nextSlot ? nextSlot.label : null,
      isAvailable: Boolean(nextSlot),
    };
  });
}

app.get("/api/ranking", (req, res) => {
  const rawSortBy = req.query.sortBy;
  const sortPrice = req.query.sortPrice; // "asc" | "desc"
  const sortBy = SORTERS[rawSortBy] ? rawSortBy : "rating";

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const hasRealLocation = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  const stateFilter = typeof req.query.state === "string" ? req.query.state.trim().toLowerCase() : "";
  const cityFilter = typeof req.query.city === "string" ? req.query.city.trim().toLowerCase() : "";

  const allProviders = [...PROVIDERS, ...providerProfilesForRanking()];

  const serviceFilter = typeof req.query.service === "string" ? req.query.service.trim().toLowerCase() : "";
  const matchesService = serviceFilter && allProviders.some((p) => p.service.toLowerCase() === serviceFilter);
  let pool = matchesService ? allProviders.filter((p) => p.service.toLowerCase() === serviceFilter) : allProviders;

  if (stateFilter) pool = pool.filter((p) => (p.city || "").toLowerCase().includes(stateFilter) || (p.state || "").toLowerCase().includes(stateFilter));
  if (cityFilter) pool = pool.filter((p) => (p.city || "").toLowerCase().includes(cityFilter));

  const withDistance = pool.map((p) => ({
    ...p,
    distanceKm: hasRealLocation && p.lat != null && p.lng != null ? haversineKm(lat, lng, p.lat, p.lng) : p.distanceKm,
  }));

  let sorted;
  if (sortPrice === "asc") sorted = withDistance.slice().sort((a, b) => (a.price || 0) - (b.price || 0));
  else if (sortPrice === "desc") sorted = withDistance.slice().sort((a, b) => (b.price || 0) - (a.price || 0));
  else sorted = withDistance.sort(SORTERS[sortBy]);

  const top3 = sorted
    .slice(0, 3)
    .map(({ name, service, city, rating, reviewCount, distanceKm, price, slug, nextSlot, isAvailable, time, photoUrl }) => ({
      name, service, city, rating,
      reviewCount: typeof reviewCount === "number" ? reviewCount : null,
      distanceKm, price, slug: slug || null,
      photoUrl: typeof photoUrl === "string" && photoUrl ? photoUrl : null,
      nextSlot: nextSlot || (time ? `Disponível ${time}` : null),
      isAvailable: isAvailable != null ? isAvailable : Boolean(nextSlot || time),
    }));
  res.json({ top3, sortBy, usedRealLocation: hasRealLocation && sortBy === "distance" });
});

// Lista de serviços "cadastrados" pra o front-end saber quando uma busca
// deve rotear pro ranking (em vez de cair no texto de IA) — inclui os mock
// E os perfis reais que as pessoas foram criando, não só uma lista fixa
// (senão um serviço novo criado via "Criar meu perfil" nunca aparecia na
// busca, só no próprio link — mesmo bug de raiz do pilar 4.12).
app.get("/api/services", (req, res) => {
  const services = [...new Set([...PROVIDERS, ...PROVIDER_PROFILES].map((p) => p.service.toLowerCase()))];
  res.json({ services });
});

// Busca por palavra-chave (task-005), sem IA nenhuma envolvida — reconhece
// serviço/categoria/data/cidade só com o dicionário de sinônimos
// (keywords.js) e devolve o resultado já filtrado direto, igual /api/chat
// fazia antes só que sem nenhuma chamada externa nem custo.
const WEEKDAY_NAMES_PT = ["domingo", "segunda", "terca", "terça", "quarta", "quinta", "sexta", "sabado", "sábado"];
const WEEKDAY_INDEX = { domingo: 0, segunda: 1, terca: 2, terça: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, sábado: 6 };

function normalizeSearchText(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function dateInputValueFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Reconhece "hoje", "amanhã", dia da semana (próxima ocorrência) e datas
// dd/mm — devolve uma data no formato YYYY-MM-DD (mesmo formato usado nos
// filtros de carona) ou null se não achou nada reconhecível.
function parseDateFromQuery(normalizedQuery) {
  const today = new Date();
  if (/\bhoje\b/.test(normalizedQuery)) return dateInputValueFromDate(today);
  if (/\bamanha\b/.test(normalizedQuery)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return dateInputValueFromDate(d);
  }
  for (const dayName of WEEKDAY_NAMES_PT) {
    const normalizedDayName = normalizeSearchText(dayName);
    if (normalizedQuery.includes(normalizedDayName)) {
      const targetIndex = WEEKDAY_INDEX[dayName];
      const d = new Date(today);
      const diff = (targetIndex - d.getDay() + 7) % 7 || 7; // sempre a PRÓXIMA ocorrência, nunca hoje mesmo
      d.setDate(d.getDate() + diff);
      return dateInputValueFromDate(d);
    }
  }
  const ddmm = normalizedQuery.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (ddmm) {
    const day = Number(ddmm[1]);
    const month = Number(ddmm[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      let year = today.getFullYear();
      // dd/mm sem ano: se a data já passou esse ano, assume o próximo ano
      // (ninguém busca "carona 10/03" querendo uma data do ano passado).
      const candidate = new Date(year, month - 1, day);
      if (candidate < today) year += 1;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return null;
}

function parseCityFromQuery(normalizedQuery) {
  for (const [canonical, variants] of Object.entries(CITY_SYNONYMS)) {
    if (variants.some((v) => normalizedQuery.includes(normalizeSearchText(v)))) return canonical;
  }
  return null;
}

// Serviço profissional (ranking) — inclui os sinônimos fixos do dicionário
// E os perfis reais cadastrados (mesmo raciocínio de /api/services: um
// serviço novo criado via "Criar meu perfil" também precisa ser achável
// pela busca, não só pelo link direto).
function parseServiceFromQuery(normalizedQuery) {
  for (const [service, synonyms] of Object.entries(SERVICO_SYNONYMS)) {
    // Sinônimo válido pra esse serviço: bateu na busca E, se for um dos
    // termos genéricos com exclusão (ex.: "instalador"), a busca não contém
    // nenhuma das frases que tiram o contexto dele. Só precisa de UM
    // sinônimo válido pra confirmar o serviço — "instalação elétrica"
    // continua valendo mesmo se "instalador" tiver sido excluído na mesma
    // busca.
    const hasValidSynonym = synonyms.some((s) => {
      if (!normalizedQuery.includes(normalizeSearchText(s))) return false;
      const exclusions = SERVICO_SYNONYM_EXCLUSIONS[s] || [];
      return !exclusions.some((e) => normalizedQuery.includes(normalizeSearchText(e)));
    });
    if (hasValidSynonym) return service;
  }
  const knownServices = [...new Set([...PROVIDERS, ...PROVIDER_PROFILES].map((p) => p.service.toLowerCase()))];
  return knownServices.find((s) => normalizedQuery.includes(normalizeSearchText(s))) || null;
}

function parseGroupCategoryFromQuery(normalizedQuery) {
  for (const [category, synonyms] of Object.entries(GROUP_CATEGORY_SYNONYMS)) {
    if (synonyms.some((s) => normalizedQuery.includes(normalizeSearchText(s)))) return category;
  }
  return null;
}

// Cache de buscas resolvidas (query normalizada -> resultado já
// interpretado) — se 1.000 pessoas buscarem "manicure amanhã em bh", só a
// primeira paga o custo de reprocessar; as próximas 999 pegam do cache.
// Vale a pena mesmo sem IA nenhuma ligada ainda: acelera a busca por
// palavra-chave também. TTL curto (resultado muda conforme posts
// novos/vagas preenchidas) — cache não pode ficar velho demais.
const SEARCH_CACHE = new Map();
const SEARCH_CACHE_TTL_MS = 60 * 1000;

// Toda busca que não reconheceu nem serviço nem categoria de grupo (caiu no
// fallback de texto livre) — revisar essa lista de vez em quando e
// adicionar os termos mais comuns em keywords.js. Cresce o dicionário
// conforme mais gente usa o site, em vez de crescer a dependência de IA.
const SEARCH_UNRECOGNIZED = [];
const SEARCH_UNRECOGNIZED_MAX_ENTRIES = 500;

function recordUnrecognizedSearch(query) {
  SEARCH_UNRECOGNIZED.push({ query, at: new Date().toISOString() });
  if (SEARCH_UNRECOGNIZED.length > SEARCH_UNRECOGNIZED_MAX_ENTRIES) SEARCH_UNRECOGNIZED.shift();
}

// Persiste em disco a cada 15 min pra o worker ler via cron
setInterval(() => {
  try {
    fs.writeFileSync(
      path.join(__dirname, "dados-oportunidades.json"),
      JSON.stringify({ gerado_em: new Date().toISOString(), buscas: SEARCH_UNRECOGNIZED }, null, 2)
    );
  } catch {}
}, 15 * 60 * 1000);

// TODO: fallback de IA (Groq, gratuito, sem cartão) — ativar só se o
// dicionário de sinônimos não for suficiente na prática. Desativado por
// padrão (SEARCH_AI_FALLBACK_ENABLED sempre false nesta v1) — nenhuma
// chamada de rede externa acontece em nenhum fluxo desta busca. Quando/se
// for ativado de verdade, aplicar um limite de chamadas por IP/pessoa por
// dia (mesmo padrão de makeHourlyRateLimiter) antes de qualquer chamada
// real, pra nunca deixar o custo crescer proporcional ao tráfego.
const SEARCH_AI_FALLBACK_ENABLED = false;
async function searchWithAiFallback(query) {
  return null;
}

function buildServiceSearchResult(service) {
  const allProviders = [...PROVIDERS, ...providerProfilesForRanking()];
  const results = allProviders
    .filter((p) => p.service.toLowerCase() === service)
    .sort(SORTERS.rating)
    .slice(0, 3)
    .map(({ name, service: s, city, rating, distanceKm, price, fastReply, slug }) => ({
      name,
      service: s,
      city,
      rating,
      distanceKm,
      price,
      fastReply,
      slug: slug || null,
    }));
  return { type: "service", service, results };
}

function buildGroupCategorySearchResult(category, { dataFilter, cityFilter }) {
  let pool = GROUP_OPPORTUNITIES.filter((g) => g.status !== "encerrado" && g.category === category);
  if (cityFilter) pool = pool.filter((g) => locationsMatch(g.city, cityFilter));
  if (dataFilter && category === "carona") pool = pool.filter((g) => g.carona && g.carona.dataViagem === dataFilter);
  return { type: "group", category, results: pool.slice(0, 10).map(groupSummary) };
}

// Fallback final: sem nenhum serviço/categoria reconhecido, busca só texto
// livre nos títulos dos posts de Grupos (LIKE %termo% simplificado — sem
// índice de verdade, é uma lista pequena em memória, um filter já resolve).
function buildFreeTextSearchResult(normalizedQuery) {
  const results = GROUP_OPPORTUNITIES.filter(
    (g) => g.status !== "encerrado" && normalizeSearchText(g.title).includes(normalizedQuery)
  )
    .slice(0, 10)
    .map(groupSummary);
  return { type: "text", results };
}

app.get("/api/search", (req, res) => {
  const rawQuery = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!rawQuery) return res.status(400).json({ error: "informe o campo 'q' com o texto da busca" });

  const normalizedQuery = normalizeSearchText(rawQuery);
  const cached = SEARCH_CACHE.get(normalizedQuery);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) {
    return res.json({ ...cached.result, cached: true });
  }

  const dataFilter = parseDateFromQuery(normalizedQuery);
  const cityFilter = parseCityFromQuery(normalizedQuery);
  const service = parseServiceFromQuery(normalizedQuery);
  const groupCategory = !service ? parseGroupCategoryFromQuery(normalizedQuery) : null;

  let result;
  if (service) {
    result = buildServiceSearchResult(service);
  } else if (groupCategory) {
    result = buildGroupCategorySearchResult(groupCategory, { dataFilter, cityFilter });
  } else {
    result = buildFreeTextSearchResult(normalizedQuery);
  }
  result.date = dataFilter;
  result.city = cityFilter;

  if (result.results.length === 0) {
    recordUnrecognizedSearch(rawQuery);
  }
  SEARCH_CACHE.set(normalizedQuery, { result, at: Date.now() });

  res.json({ ...result, cached: false });
});

// Referência de preço externa (task-007), sem IA — busca crua na web
// (SearXNG grátis, Brave como fallback pago) pra ajudar quem está criando
// um post a ver preços reais de referência antes de publicar. Devolve os
// resultados brutos, sem resumir/interpretar (extrair "faixa de preço"
// automaticamente exigiria IA lendo texto, o que contraria a decisão de
// manter isso sem custo de API — a pessoa lê e decide sozinha).
const isPriceReferenceRateLimited = makeHourlyRateLimiter(60);

app.get("/api/price-reference", async (req, res) => {
  if (isPriceReferenceRateLimited(req.ip)) {
    return res.status(429).json({ error: "muitas buscas de referência recentemente a partir daqui — tente de novo mais tarde" });
  }
  const description = typeof req.query.description === "string" ? req.query.description.trim().slice(0, 120) : "";
  const local = typeof req.query.local === "string" ? req.query.local.trim().slice(0, 80) : "";
  if (!description) {
    return res.status(400).json({ error: "informe o campo 'description' (o que você está oferecendo/precisando)" });
  }
  const query = ["preço", description, local].filter(Boolean).join(" ");

  try {
    const results = await searchWebStructured(query);
    if (results === null) {
      // Nem SearXNG nem Brave responderam — "não disponível no momento", não
      // um erro (task-007: nunca trava a tela principal de criar post).
      return res.json({ available: false, results: [] });
    }
    res.json({ available: true, results });
  } catch (err) {
    res.json({ available: false, results: [] });
  }
});

// lat/lng (task-009, item 1) ficam de fora do público — coordenada exata
// é mais sensível que o texto de localização que a própria pessoa já escolheu
// mostrar. ownerUserId é exposto como ID opaco (não revela nome/contato)
// e é necessário para que passageiros consultem o tracking ao vivo do motorista.
function requestSummary(r) {
  const { lat, lng, ...rest } = r;
  return rest;
}

// Localização ao vivo (rastreamento de corridas em tempo real).
// Motoristas autenticados publicam posição GPS; passageiros consultam.
const LIVE_LOCATIONS = new Map(); // userId -> { lat, lng, updatedAt }
const LIVE_LOCATION_TTL_MS = 2 * 60 * 1000; // 2 min sem atualizar = offline

app.post("/api/location", (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: "não autenticado" });
  const { lat, lng } = req.body || {};
  const latN = Number(lat);
  const lngN = Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN) || Math.abs(latN) > 90 || Math.abs(lngN) > 180) {
    return res.status(400).json({ error: "coordenadas inválidas" });
  }
  LIVE_LOCATIONS.set(user.id, { lat: latN, lng: lngN, updatedAt: Date.now() });
  res.json({ ok: true });
});

app.delete("/api/location", (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: "não autenticado" });
  LIVE_LOCATIONS.delete(user.id);
  res.json({ ok: true });
});

app.get("/api/location/:userId", (req, res) => {
  const entry = LIVE_LOCATIONS.get(req.params.userId);
  if (!entry || Date.now() - entry.updatedAt > LIVE_LOCATION_TTL_MS) {
    return res.json({ online: false });
  }
  res.json({ online: true, lat: entry.lat, lng: entry.lng, updatedAt: entry.updatedAt });
});

app.get("/api/requests", (req, res) => {
  const { state, city, sortPrice, type: typeFilter, lat, lng, minPrice, maxPrice } = req.query;
  const userLat = Number(lat);
  const userLng = Number(lng);
  const hasUserLocation = Number.isFinite(userLat) && Number.isFinite(userLng) && Math.abs(userLat) <= 90 && Math.abs(userLng) <= 180;

  let list = REQUESTS.map(requestSummary);

  if (typeFilter) list = list.filter((r) => r.type === typeFilter);

  if (state) {
    const s = state.toLowerCase().trim();
    list = list.filter((r) => (r.location || "").toLowerCase().includes(s));
  }
  if (city) {
    const c = city.toLowerCase().trim();
    list = list.filter((r) => (r.location || "").toLowerCase().includes(c));
  }

  // Faixa de preço, sem teto: qualquer valor é aceito. Ausente, vazio ou não
  // numérico é ignorado em vez de zerar a lista — Number("") é 0, então um
  // `maxPrice=` vazio filtraria preço <= 0 e devolveria nada, parecendo
  // "nenhum resultado" por engano.
  const parsePriceFilter = (value) => {
    if (typeof value !== "string" || !value.trim()) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const minPriceFilter = parsePriceFilter(minPrice);
  if (minPriceFilter !== null) list = list.filter((r) => r.price >= minPriceFilter);
  const maxPriceFilter = parsePriceFilter(maxPrice);
  if (maxPriceFilter !== null) list = list.filter((r) => r.price <= maxPriceFilter);

  // Distância aproximada: só para pedidos que têm lat/lng guardados
  if (hasUserLocation) {
    list = list.map((r) => {
      const summary = REQUESTS.find((x) => x.id === r.id);
      if (summary && summary.lat != null && summary.lng != null) {
        return { ...r, distanceKm: haversineKm(userLat, userLng, summary.lat, summary.lng) };
      }
      return r;
    });
  }

  if (sortPrice === "asc") list = list.slice().sort((a, b) => a.price - b.price);
  else if (sortPrice === "desc") list = list.slice().sort((a, b) => b.price - a.price);

  res.json({ requests: list });
});

// ownerUserId só é gravado quando quem publica está logada (POST
// /api/requests, abaixo) — sem sessão de navegador pra amarrar, o post
// fica sem dono (ver docs/visao-produto.md pilar 4.13).
async function createRequest({ type, title, requester, when, price, whatsapp, location, lat, lng, ownerUserId, photoFile }) {
  if (!type || typeof type !== "string" || !type.trim()) {
    return { ok: false, error: "diga o tipo do que você precisa (ex: corrida, imóvel, produto...)" };
  }
  const normalizedType = type.trim().toLowerCase();
  if (normalizedType.length > REQUEST_TYPE_MAX_LENGTH) {
    return { ok: false, error: `tipo muito longo (máximo ${REQUEST_TYPE_MAX_LENGTH} caracteres)` };
  }
  if (!title || typeof title !== "string" || !title.trim()) {
    return { ok: false, error: "descreva o que você precisa" };
  }
  if (requester !== undefined && requester !== null && typeof requester !== "string") {
    return { ok: false, error: "nome inválido" };
  }
  if (when !== undefined && when !== null && typeof when !== "string") {
    return { ok: false, error: "campo 'quando' inválido" };
  }
  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    return { ok: false, error: "valor inválido" };
  }
  // Sem WhatsApp, quem aceitar o pedido não tem como contatar quem pediu —
  // continua obrigatório, assim como o valor. Localização (task-009, item
  // 1) deixou de ser obrigatória: o front-end já tenta extrair
  // origem/destino de dentro do próprio título quando dá (ex: "Centro →
  // Rodoviária") e preenche sozinho — exigir de novo aqui bloquearia esse
  // caso à toa. Quando realmente não vem nenhuma (nem digitada, nem
  // extraída), o post segue sem local (mostrado como "local não
  // informado" no card) em vez de travar a publicação.
  const wpResult = validateBrazilianPhone(whatsapp);
  if (!wpResult.ok) return { ok: false, error: wpResult.error };
  const normalizedWhatsapp = wpResult.digits;
  if (location !== undefined && location !== null && typeof location !== "string") {
    return { ok: false, error: "localização inválida" };
  }
  const normalizedLocation = (location && location.trim()) || "";
  if (normalizedLocation.length > REQUEST_LOCATION_MAX_LENGTH) {
    return { ok: false, error: `localização muito longa (máximo ${REQUEST_LOCATION_MAX_LENGTH} caracteres)` };
  }
  // lat/lng (task-009, item 1) só vêm do botão "Usar minha localização" —
  // guardados direto, sem reverse geocoding (mesmo "se for mais simples"
  // que o próprio arquivo da task permite). Best-effort, igual location:
  // inválido vira null em vez de travar a publicação.
  let latNum = null;
  let lngNum = null;
  if (lat !== undefined && lat !== null && lat !== "") {
    const n = Number(lat);
    if (Number.isFinite(n) && Math.abs(n) <= 90) latNum = n;
  }
  if (lng !== undefined && lng !== null && lng !== "") {
    const n = Number(lng);
    if (Number.isFinite(n) && Math.abs(n) <= 180) lngNum = n;
  }

  const id = `r${nextRequestId++}`;
  const request = {
    id,
    type: normalizedType,
    title: title.trim(),
    requester: (requester && requester.trim()) || "Você",
    when: (when && when.trim()) || "a combinar",
    whatsapp: normalizedWhatsapp,
    location: normalizedLocation,
    lat: latNum,
    lng: lngNum,
    distanceKm: null,
    price: priceNum,
    status: "aberto",
    ownerUserId: ownerUserId || null,
    photoUrl: null,
    createdAt: new Date().toISOString(),
  };
  // Foto é opcional e não deve travar a publicação do pedido — se salvar
  // falhar (disco cheio, MinIO fora do ar), o pedido ainda vai pra frente
  // sem imagem, igual location/lat/lng inválidos acima.
  if (photoFile && matchesImageSignature(photoFile.buffer, photoFile.mimetype)) {
    try {
      const dir = path.join(UPLOADS_DIR, "requests", id);
      fs.mkdirSync(dir, { recursive: true });
      const ext = photoFile.mimetype === "image/png" ? "png" : photoFile.mimetype === "image/webp" ? "webp" : "jpg";
      request.photoUrl = await storePhoto(photoFile.buffer, dir, id, `foto.${ext}`, photoFile.mimetype, "requests");
    } catch (err) {
      console.warn("[requests] falha ao salvar foto do pedido:", err.message);
    }
  }
  REQUESTS.unshift(request);
  return { ok: true, request };
}

app.post("/api/requests", uploadRequestPhoto, async (req, res) => {
  const result = await createRequest({ ...req.body, ownerUserId: getCurrentUser(req)?.id || null, photoFile: req.file });
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  res.status(201).json({ request: requestSummary(result.request) });
});

// Erros que merecem um status diferente do 409 padrão (conflito de estado).
// Compartilhado pelos três endpoints abaixo pra não divergir entre eles.
const REQUEST_ERROR_STATUS = {
  "pedido não encontrado": 404,
  "avaliação precisa ser um número inteiro de 1 a 5": 400,
};

function sendRequestResult(res, result) {
  if (!result.ok) {
    const status = REQUEST_ERROR_STATUS[result.error] || 409;
    return res.status(status).json({ error: result.error });
  }
  res.json({ request: requestSummary(result.request) });
}

app.post("/api/requests/:id/accept", (req, res) => {
  const { provider } = req.body || {};
  if (provider !== undefined && typeof provider !== "string") {
    return res.status(400).json({ error: "nome inválido" });
  }
  sendRequestResult(res, acceptRequest(req.params.id, provider));
});

app.post("/api/requests/:id/complete", (req, res) => {
  sendRequestResult(res, completeRequest(req.params.id));
});

app.post("/api/requests/:id/rate", (req, res) => {
  const { rating, comment } = req.body || {};
  if (comment !== undefined && typeof comment !== "string") {
    return res.status(400).json({ error: "comentário inválido" });
  }
  sendRequestResult(res, rateRequest(req.params.id, rating, comment));
});

// Grupos de Economia v1 (decisão da Jéssica, 2026-09-14 — ver
// docs/visao-produto.md pilar 4.14). Motor geral de "gente quer a mesma
// coisa, o site junta o grupo": compra coletiva, frete compartilhado,
// viagem, serviço local em grupo, curso/evento — NUNCA assinatura
// compartilhada (Netflix etc, viola termos de uso de terceiros) e NUNCA
// retém pagamento (combinação e pagamento acontecem fora do site, por
// WhatsApp, igual o resto do site já funciona). Ver seção 4.14 pra por que
// essas duas coisas ficam de fora de propósito.
// "assinatura" (2026-09-14, task-001): categoria genérica igual as outras —
// sem engine especial, sem verificação de credencial, sem reter pagamento.
// O front-end mostra um aviso fixo nos grupos dessa categoria (ver
// docs/futuro-assinaturas-e-pagamentos.md pro que continua fora de escopo:
// reputação/denúncia, que depende de login que o site ainda não tem aqui).
// "carona" (2026-09-14, task-002): carona compartilhada AGENDADA (não
// corrida sob demanda) — motorista posta rota com vagas, passageiro posta
// rota desejada, o site conecta. Sem verificação contra base oficial
// (DETRAN), sem rastreamento contínuo, sem pagamento — só coleta e exibe o
// que o motorista declarou (CNH/placa/veículo), pro passageiro decidir com
// informação antes de embarcar. Ver docs/visao-produto.md pilar 4.14 pro
// contexto jurídico (carona solidária x transporte remunerado) e
// docs/futuro-assinaturas-e-pagamentos.md pro que fica de fora (app de
// corrida sob demanda com GPS ao vivo/despacho/pagamento pro motorista).
const GROUP_CATEGORIES = ["compra", "frete", "viagem", "servico", "curso", "assinatura", "carona"];
const GROUP_CATEGORY_LABELS = {
  compra: "Compra coletiva",
  frete: "Frete compartilhado",
  viagem: "Viagem",
  servico: "Serviço local em grupo",
  curso: "Curso/evento",
  assinatura: "Assinatura compartilhada",
  carona: "Carona compartilhada",
};
const GROUP_TITLE_MAX_LENGTH = 100;
const GROUP_MIN_TARGET_MEMBERS = 2;
const GROUP_MAX_TARGET_MEMBERS = 50;

const CARONA_TIPOS = ["motorista", "passageiro"];
const CARONA_TEXT_MAX_LENGTH = 80;
const CARONA_DOC_MAX_LENGTH = 40;
const CARONA_MAX_VAGAS = 8;

// Valida os campos extras que só existem pra categoria "carona" — separado
// de validateGroupFields porque a forma é genuinamente diferente (motorista
// x passageiro têm campos obrigatórios diferentes), não porque a regra de
// negócio muda.
function validateCaronaFields({ tipo, origemTexto, destinoTexto, dataViagem, horarioAproximado, lat, lng, vagasTotais, cnhNumero, veiculoPlaca, veiculoModelo, veiculoCor }) {
  if (!CARONA_TIPOS.includes(tipo)) {
    return { ok: false, error: `tipo precisa ser: ${CARONA_TIPOS.join(" ou ")}` };
  }
  if (!origemTexto || typeof origemTexto !== "string" || !origemTexto.trim()) {
    return { ok: false, error: "informe a origem" };
  }
  if (origemTexto.trim().length > CARONA_TEXT_MAX_LENGTH) {
    return { ok: false, error: `origem muito longa (máximo ${CARONA_TEXT_MAX_LENGTH} caracteres)` };
  }
  if (!destinoTexto || typeof destinoTexto !== "string" || !destinoTexto.trim()) {
    return { ok: false, error: "informe o destino" };
  }
  if (destinoTexto.trim().length > CARONA_TEXT_MAX_LENGTH) {
    return { ok: false, error: `destino muito longo (máximo ${CARONA_TEXT_MAX_LENGTH} caracteres)` };
  }
  if (!dataViagem || typeof dataViagem !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dataViagem.trim())) {
    return { ok: false, error: "data da viagem inválida (use AAAA-MM-DD)" };
  }
  let latNum = null;
  let lngNum = null;
  if (lat !== undefined && lat !== null && lat !== "") {
    latNum = Number(lat);
    if (!Number.isFinite(latNum) || Math.abs(latNum) > 90) return { ok: false, error: "localização inválida" };
  }
  if (lng !== undefined && lng !== null && lng !== "") {
    lngNum = Number(lng);
    if (!Number.isFinite(lngNum) || Math.abs(lngNum) > 180) return { ok: false, error: "localização inválida" };
  }
  const normalizedHorario = (typeof horarioAproximado === "string" && horarioAproximado.trim().slice(0, 20)) || null;

  if (tipo === "passageiro") {
    return {
      ok: true,
      tipo,
      origemTexto: origemTexto.trim(),
      destinoTexto: destinoTexto.trim(),
      dataViagem: dataViagem.trim(),
      horarioAproximado: normalizedHorario,
      lat: latNum,
      lng: lngNum,
      vagasTotais: null,
      cnhNumero: null,
      veiculoPlaca: null,
      veiculoModelo: null,
      veiculoCor: null,
    };
  }

  // motorista — CNH/placa/veículo são auto-declarados (sem checar contra
  // DETRAN ou qualquer base oficial), só exigidos e exibidos pro passageiro
  // antes de decidir (ver task-002).
  const vagasNum = Number(vagasTotais);
  if (!Number.isInteger(vagasNum) || vagasNum < 1 || vagasNum > CARONA_MAX_VAGAS) {
    return { ok: false, error: `vagas precisa ser um número inteiro entre 1 e ${CARONA_MAX_VAGAS}` };
  }
  const docs = { cnhNumero, veiculoPlaca, veiculoModelo, veiculoCor };
  const docLabels = { cnhNumero: "a CNH", veiculoPlaca: "a placa do veículo", veiculoModelo: "o modelo do veículo", veiculoCor: "a cor do veículo" };
  for (const key of Object.keys(docs)) {
    const val = docs[key];
    if (!val || typeof val !== "string" || !val.trim()) {
      return { ok: false, error: `informe ${docLabels[key]}` };
    }
    if (val.trim().length > CARONA_DOC_MAX_LENGTH) {
      return { ok: false, error: `${docLabels[key]} está muito longo (máximo ${CARONA_DOC_MAX_LENGTH} caracteres)` };
    }
  }
  return {
    ok: true,
    tipo,
    origemTexto: origemTexto.trim(),
    destinoTexto: destinoTexto.trim(),
    dataViagem: dataViagem.trim(),
    horarioAproximado: normalizedHorario,
    lat: latNum,
    lng: lngNum,
    vagasTotais: vagasNum,
    cnhNumero: cnhNumero.trim(),
    veiculoPlaca: veiculoPlaca.trim(),
    veiculoModelo: veiculoModelo.trim(),
    veiculoCor: veiculoCor.trim(),
  };
}

const GROUP_OPPORTUNITIES = [];
let nextGroupId = 1;

// Log de eventos básico (pilar 4.14) — não tem tela nem API própria ainda;
// existe só pra já ter dado real acumulando pro dia que formos calcular
// reputação por comportamento (etapa explicitamente posterior à v1, ver
// docs/visao-produto.md).
const GROUP_EVENTS = [];
function recordGroupEvent(groupId, type) {
  GROUP_EVENTS.push({ groupId, type, at: new Date().toISOString() });
}

// "quero" | "ofereco" (task-005) — opcional, alimenta o motor de sugestão
// automática (ver findGroupSuggestions). Sem informar, o post continua
// funcionando normalmente, só fica de fora do matching automático (não dá
// pra sugerir "o oposto de nada"). Carona já tem esse conceito embutido em
// carona.tipo (motorista/passageiro) — não duplica aqui, ver tipoForMatching.
const GROUP_TIPO_VALUES = ["quero", "ofereco"];

function validateGroupFields({ category, title, city, targetMembers, estimatedIndividualPrice, deadline, whatsapp, tipo }) {
  const normalizedCategory = typeof category === "string" ? category.trim().toLowerCase() : "";
  if (!GROUP_CATEGORIES.includes(normalizedCategory)) {
    return { ok: false, error: `categoria inválida (use: ${GROUP_CATEGORIES.join(", ")})` };
  }
  if (tipo !== undefined && tipo !== null && tipo !== "" && !GROUP_TIPO_VALUES.includes(tipo)) {
    return { ok: false, error: `tipo inválido (use: ${GROUP_TIPO_VALUES.join(", ")})` };
  }
  if (!title || typeof title !== "string" || !title.trim()) {
    return { ok: false, error: "descreva o que o grupo quer conseguir" };
  }
  if (title.trim().length > GROUP_TITLE_MAX_LENGTH) {
    return { ok: false, error: `descrição muito longa (máximo ${GROUP_TITLE_MAX_LENGTH} caracteres)` };
  }
  if (!city || typeof city !== "string" || !city.trim()) {
    return { ok: false, error: "informe a cidade/bairro" };
  }
  if (city.trim().length > REQUEST_LOCATION_MAX_LENGTH) {
    return { ok: false, error: `cidade/bairro muito longo (máximo ${REQUEST_LOCATION_MAX_LENGTH} caracteres)` };
  }
  const targetNum = Number(targetMembers);
  if (!Number.isInteger(targetNum) || targetNum < GROUP_MIN_TARGET_MEMBERS || targetNum > GROUP_MAX_TARGET_MEMBERS) {
    return {
      ok: false,
      error: `número de participantes precisa ser um inteiro entre ${GROUP_MIN_TARGET_MEMBERS} e ${GROUP_MAX_TARGET_MEMBERS}`,
    };
  }
  let priceNum = null;
  if (estimatedIndividualPrice !== undefined && estimatedIndividualPrice !== null && estimatedIndividualPrice !== "") {
    priceNum = Number(estimatedIndividualPrice);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      return { ok: false, error: "valor estimado inválido" };
    }
  }
  if (deadline !== undefined && deadline !== null && typeof deadline !== "string") {
    return { ok: false, error: "prazo inválido" };
  }
  if (!whatsapp || typeof whatsapp !== "string" || !whatsapp.trim()) {
    return { ok: false, error: "informe um WhatsApp pra contato" };
  }
  const normalizedWhatsapp = whatsapp.trim();
  if (normalizedWhatsapp.length > REQUEST_WHATSAPP_MAX_LENGTH) {
    return { ok: false, error: `WhatsApp muito longo (máximo ${REQUEST_WHATSAPP_MAX_LENGTH} caracteres)` };
  }
  return {
    ok: true,
    category: normalizedCategory,
    title: title.trim(),
    city: city.trim(),
    targetMembers: targetNum,
    estimatedIndividualPrice: priceNum,
    deadline: (typeof deadline === "string" && deadline.trim().slice(0, 40)) || null,
    whatsapp: normalizedWhatsapp,
    tipo: GROUP_TIPO_VALUES.includes(tipo) ? tipo : null,
  };
}

// Mesma janela de 1h por IP já usada em /api/providers (makeHourlyRateLimiter
// acima) — reduz o mesmo tipo de risco (fraude/spam) que a Jéssica apontou
// pra esse recurso, sem reinventar a lógica de rate limit. Criar grupo é
// mais barato que criar perfil (não processa imagem/IA), então o teto é
// mais folgado que o de /api/providers — 40, não 20.
const isGroupCreateRateLimited = makeHourlyRateLimiter(40);
const isGroupJoinRateLimited = makeHourlyRateLimiter(60);

// Geocodificação (task-008) — Nominatim público do próprio OpenStreetMap
// (nominatim.openstreetmap.org), grátis, sem chave. Self-hosted (Docker)
// ficou de fora por enquanto: o VPS de produção (1 vCPU, 3.8GB RAM) não
// aguenta importar o extrato do Brasil inteiro sem risco de derrubar o site
// (ver docs/visao-produto.md seção 4.19) — a instância pública resolve o
// mesmo problema sem precisar de servidor nenhum, respeitando a política de
// uso deles (nominatim.org/release-docs/latest/api/Usage-Policy/): no
// máximo 1 requisição por segundo, com User-Agent identificando o site.
//
// Duas observações da revisão do CodeRabbit (PR #71) que ficam registradas
// aqui como decisão consciente, não corrigidas:
// 1) O texto digitado (cidade ou origem da carona) é mandado pro Nominatim
//    público como parte do próprio processo de geocodificar — isso é
//    inerente à funcionalidade (não dá pra traduzir texto em coordenada sem
//    mandar o texto pra quem faz essa tradução), o mesmo vale pra qualquer
//    app que geocodifica endereço (Google Maps, Uber, etc.) com qualquer
//    provedor, incluindo um self-hosted. O campo já é tipicamente
//    cidade/bairro, não endereço completo — mitigar mais que isso (ex:
//    tentar filtrar "parece endereço residencial") não dá pra fazer de
//    forma confiável sem heurística frágil, e trocar de provedor
//    contrariaria a decisão de usar o público justamente por causa do VPS
//    sem RAM pra self-hosted.
// 2) O throttle abaixo (nominatimQueue/lastNominatimCallAt) é em memória do
//    processo — funciona porque o servidor roda como processo único via
//    systemd (sem PM2 cluster nem múltiplas réplicas atrás de load
//    balancer, ver .github/workflows/*.yml e a seção "Worker do TOP3" do
//    README). Se isso mudar um dia (múltiplas instâncias), precisaria virar
//    um throttle compartilhado (Redis ou parecido) — não implementado agora
//    porque não existe hoje nenhum banco/cache compartilhado no projeto
//    (tudo em memória, de propósito, ver docs/visao-produto.md).
const NOMINATIM_USER_AGENT = "Top3Profissional/1.0 (https://top3profissional.com.br)";
const NOMINATIM_MIN_INTERVAL_MS = 1100; // margem de segurança acima de 1 req/s
// Prazo total por chamada, contando o tempo esperando na fila (não só o
// fetch em si) — achado na revisão do CodeRabbit, PR #71: sem isso, uma
// rajada de posts criados ao mesmo tempo enfileira várias geocodificações
// (cada uma esperando ~1.1s pela anterior), e quem criou o post no fim da
// fila ficaria esperando dezenas de segundos pela resposta HTTP, mesmo o
// fetch em si sendo rápido. Passado o prazo, abandona sem nem tentar o
// fetch — geocodificação é sempre um extra opcional, nunca vale a pena
// segurar a criação do post por muito tempo esperando por ela.
const GEOCODE_TOTAL_TIMEOUT_MS = 6_000;
const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // endereço não muda de um dia pro outro
const GEOCODE_CACHE = new Map();
let lastNominatimCallAt = 0;
// Fila encadeada (não só "esperar desde a última chamada") — evita corrida
// entre chamadas concorrentes lendo lastNominatimCallAt ao mesmo tempo e
// furando o intervalo mínimo.
let nominatimQueue = Promise.resolve();

function normalizeGeocodeQuery(text) {
  return (text || "").trim().toLowerCase();
}

// Nunca lança erro nem trava quem chamou — geolocalização real é sempre um
// extra opcional aqui (mesmo padrão de fallback grátis-primeiro de sempre),
// o matching por texto (abaixo) continua sendo a base que sempre funciona.
async function geocodeAddress(query) {
  // Desativa em testes automatizados (ver playwright.config.js) — sem
  // chave/env var pra "desligar" como as outras integrações opcionais, essa
  // aqui está sempre ativa por padrão (é grátis, sem cadastro). Sem esse
  // escape, a suíte inteira bateria de verdade no Nominatim público a cada
  // grupo/carona criado nos testes — lento, instável, e arriscaria estourar
  // a política de uso deles com volume de automação.
  if (process.env.DISABLE_GEOCODING === "1") return null;
  const normalized = normalizeGeocodeQuery(query);
  if (!normalized) return null;

  const cached = GEOCODE_CACHE.get(normalized);
  if (cached && Date.now() - cached.at < GEOCODE_CACHE_TTL_MS) return cached.result;

  const deadline = Date.now() + GEOCODE_TOTAL_TIMEOUT_MS;
  const call = nominatimQueue.then(async () => {
    const timeLeft = deadline - Date.now();
    if (timeLeft <= 0) return null; // já estourou o prazo só esperando na fila — nem tenta o fetch

    const wait = Math.min(lastNominatimCallAt + NOMINATIM_MIN_INTERVAL_MS - Date.now(), timeLeft);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    if (Date.now() >= deadline) return null;
    lastNominatimCallAt = Date.now();

    try {
      // Sem piso mínimo aqui de propósito (CodeRabbit, PR #71): um piso tipo
      // Math.max(.., 1000) deixaria o fetch estourar o prazo total de 6s em
      // até ~1s quando sobra pouco tempo — recalcula o tempo restante na
      // hora e desiste antes do fetch se já não sobrou nada.
      const fetchTimeLeft = deadline - Date.now();
      if (fetchTimeLeft <= 0) return null;
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(normalized)}&format=json&limit=1&countrycodes=br`;
      const res = await fetch(url, {
        headers: { "User-Agent": NOMINATIM_USER_AGENT },
        signal: AbortSignal.timeout(fetchTimeLeft),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const first = data[0];
      if (!first) return null;
      const result = { lat: Number(first.lat), lng: Number(first.lon) };
      if (!Number.isFinite(result.lat) || !Number.isFinite(result.lng)) return null;
      return result;
    } catch (err) {
      return null;
    }
  });
  // Nunca deixa uma falha travar a fila pras próximas chamadas — cada
  // requisição trata o próprio erro dentro do .then acima.
  nominatimQueue = call.catch(() => null);

  const result = await call;
  // Só cacheia resultado válido — uma falha de rede passageira não deveria
  // "travar" um endereço como não encontrado até o cache expirar.
  if (result) GEOCODE_CACHE.set(normalized, { result, at: Date.now() });
  return result;
}

// Motor de sugestão automática entre posts opostos (task-005), sem IA —
// compara texto/categoria/data direto, sem gastar nenhuma chamada de API.
// "Local parecido" é intencionalmente simples (normaliza acento/maiúscula e
// compara substring nos dois sentidos) — cobre bem os casos reais óbvios
// ("Bom Despacho" bate com "bom despacho, mg"). Geolocalização real (lat/lng
// via geocodeAddress acima) complementa isso como sinal adicional, ver
// findGroupSuggestions abaixo — o texto continua sendo a base que sempre
// funciona, mesmo se a geocodificação falhar ou não tiver coordenada.
function normalizeLocationText(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function locationsMatch(a, b) {
  const na = normalizeLocationText(a);
  const nb = normalizeLocationText(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

// Sinal adicional além do texto (locationsMatch acima) — cobre o caso de
// cidades vizinhas na mesma região metropolitana que o texto não capturaria
// como parecido (ex: "Contagem" e "Betim" não têm substring em comum, mas
// ficam a uns 15km uma da outra). Só entra em jogo quando os dois lados têm
// coordenada de verdade (geocodeAddress rodou com sucesso na criação dos
// dois posts) — sem isso, o matching por texto continua sendo a única base.
const NEARBY_KM_THRESHOLD = 50;

function locationsNearby(latA, lngA, latB, lngB) {
  if (![latA, lngA, latB, lngB].every((n) => typeof n === "number" && Number.isFinite(n))) return false;
  return haversineKm(latA, lngA, latB, lngB) <= NEARBY_KM_THRESHOLD;
}

const SUGGESTION_DATE_WINDOW_DAYS = 1;

// Sem data em algum dos dois lados, não filtra por data (categorias fora de
// carona só têm "deadline" em texto livre tipo "até sexta-feira", não uma
// data estruturada pra comparar).
function datesCompatible(dateA, dateB) {
  if (!dateA || !dateB) return true;
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  return Math.abs(a - b) <= SUGGESTION_DATE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

// Unifica o "tipo" pra fins de matching — carona já tinha motorista/
// passageiro antes do task-005; mapeia pro mesmo vocabulário quero/ofereco
// usado nas categorias genéricas, sem duplicar o campo dentro de carona.
function tipoForMatching(group) {
  if (group.carona) return group.carona.tipo === "motorista" ? "ofereco" : "quero";
  return group.tipo || null;
}

function oppositeTipo(tipo) {
  return tipo === "quero" ? "ofereco" : "quero";
}

function suggestionSummary(g) {
  const contact = g.members[0];
  return {
    id: g.id,
    title: g.title,
    city: g.city,
    tipo: tipoForMatching(g),
    whatsapp: contact ? contact.whatsapp : null,
    name: contact ? contact.name : null,
    carona: g.carona
      ? { origemTexto: g.carona.origemTexto, destinoTexto: g.carona.destinoTexto, dataViagem: g.carona.dataViagem }
      : null,
  };
}

// Passageiro de carona nasce sempre "completo" (o post inteiro é a única
// vaga, ver handleCreateCaronaGroup) — isso não significa "resolvido", é só
// o jeito do mecanismo genérico marcar "post individual". Continua sendo
// uma pessoa disponível procurando carona, então continua elegível pra
// sugestão — diferente de um grupo genérico "completo" (esse sim já achou
// todo mundo que precisava).
function isGroupAvailableForSuggestion(g) {
  if (g.status === "aberto") return true;
  return Boolean(g.carona) && g.carona.tipo === "passageiro" && g.status === "completo";
}

// Só sugere grupo ainda disponível (ver isGroupAvailableForSuggestion) do
// lado oposto, mesma categoria, local parecido e data compatível. Post sem
// tipo declarado (campo opcional) não entra nem como origem nem como alvo
// do matching — não dá pra sugerir "o oposto de nada".
function findGroupSuggestions(group) {
  const myTipo = tipoForMatching(group);
  if (!myTipo) return [];
  const wantedTipo = oppositeTipo(myTipo);
  return GROUP_OPPORTUNITIES.filter((g) => {
    if (g.id === group.id || g.category !== group.category || !isGroupAvailableForSuggestion(g)) return false;
    if (tipoForMatching(g) !== wantedTipo) return false;
    if (group.carona) {
      return (
        (locationsMatch(g.carona.origemTexto, group.carona.origemTexto) ||
          locationsMatch(g.carona.destinoTexto, group.carona.destinoTexto) ||
          locationsNearby(g.carona.lat, g.carona.lng, group.carona.lat, group.carona.lng)) &&
        datesCompatible(g.carona.dataViagem, group.carona.dataViagem)
      );
    }
    return locationsMatch(g.city, group.city) || locationsNearby(g.lat, g.lng, group.lat, group.lng);
  }).map(suggestionSummary);
}

// Visão resumida (sem contato de ninguém, sem CNH/placa) pra listagem
// pública — usada tanto em GET /api/groups quanto dentro da resposta de
// criar/entrar num grupo. Pra "carona", só a parte pública do motorista
// (nunca os documentos) — esses só aparecem no detalhe (ver
// GET /api/groups/:id), a mesma regra de "informação de verdade só na
// página do grupo específico" já usada pro resto do mecanismo.
function groupSummary(group) {
  return {
    id: group.id,
    category: group.category,
    categoryLabel: GROUP_CATEGORY_LABELS[group.category],
    title: group.title,
    city: group.city,
    targetMembers: group.targetMembers,
    currentMembers: group.members.length,
    estimatedIndividualPrice: group.estimatedIndividualPrice,
    deadline: group.deadline,
    status: group.status,
    createdAt: group.createdAt,
    // "quero"/"ofereco" (task-005) — opcional, null quando a pessoa não
    // informou. Carona não usa esse campo (tem o próprio carona.tipo).
    tipo: group.tipo || null,
    carona: group.carona
      ? {
          tipo: group.carona.tipo,
          origemTexto: group.carona.origemTexto,
          destinoTexto: group.carona.destinoTexto,
          dataViagem: group.carona.dataViagem,
          horarioAproximado: group.carona.horarioAproximado,
          // targetMembers do motorista já inclui o próprio motorista (ver
          // handleCreateCaronaGroup) — a diferença é exatamente os assentos
          // de passageiro ainda livres.
          vagasRestantes: group.carona.tipo === "motorista" ? group.targetMembers - group.members.length : null,
          // Estimativa pro rateio (task-008, Haversine + multiplicador) —
          // null quando origem e/ou destino não foram geocodificados. Só o
          // número aproximado sai daqui, nunca lat/lng cru (mesmo padrão já
          // usado pro resto da geocodificação: coordenada fica só no
          // servidor).
          distanciaAproximadaKm: group.carona.distanciaAproximadaKm ?? null,
        }
      : null,
  };
}

app.get("/api/groups", (req, res) => {
  const categoryFilter = typeof req.query.category === "string" ? req.query.category.trim().toLowerCase() : "";
  const origemFilter = typeof req.query.origem === "string" ? req.query.origem.trim().toLowerCase() : "";
  const destinoFilter = typeof req.query.destino === "string" ? req.query.destino.trim().toLowerCase() : "";
  const dataFilter = typeof req.query.data === "string" ? req.query.data.trim() : "";
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  // "encerrado" (grupo esvaziado, ver /leave) não tem nada útil pra mostrar
  // numa listagem de "entre nesse grupo" — fica de fora daqui, mas continua
  // consultável direto por GET /api/groups/:id.
  let pool = GROUP_OPPORTUNITIES.filter((g) => g.status !== "encerrado" && (!categoryFilter || g.category === categoryFilter));
  if (origemFilter) pool = pool.filter((g) => g.carona && g.carona.origemTexto.toLowerCase().includes(origemFilter));
  if (destinoFilter) pool = pool.filter((g) => g.carona && g.carona.destinoTexto.toLowerCase().includes(destinoFilter));
  if (dataFilter) pool = pool.filter((g) => g.carona && g.carona.dataViagem === dataFilter);

  // Ordenação por proximidade só faz sentido pra carona (único lugar com
  // lat/lng) — quando a pessoa não usou localização, cai pra ordenar por
  // data da viagem (mais relevante que "mais recente publicado" pra esse
  // caso específico); outras categorias mantêm a ordem padrão (mais novo
  // primeiro), sem esses parâmetros de busca fazerem diferença nelas.
  if (hasLocation) {
    pool = pool
      .map((g) => ({
        g,
        distanceKm: g.carona && g.carona.lat != null && g.carona.lng != null ? haversineKm(lat, lng, g.carona.lat, g.carona.lng) : null,
      }))
      .sort((a, b) => compareNullsLast(a.distanceKm, b.distanceKm, (x, y) => x - y))
      .map((x) => x.g);
  } else if (origemFilter || destinoFilter || dataFilter) {
    pool = [...pool].sort((a, b) =>
      compareNullsLast(a.carona && a.carona.dataViagem, b.carona && b.carona.dataViagem, (x, y) => (x < y ? -1 : x > y ? 1 : 0))
    );
  }

  res.json({ groups: pool.map(groupSummary) });
});

// Contato (e, pra motorista de carona, CNH/placa/veículo) só aparece aqui
// (na página do grupo específico), nunca na listagem geral — e só o do
// criador enquanto o grupo ainda está aberto (pra quem tem dúvida poder
// perguntar/decidir antes de entrar); a lista completa de contatos só
// libera quando o grupo fecha (todo mundo que entrou já sabia que isso ia
// acontecer ao entrar — mesmo consentimento implícito que já existe hoje
// quando alguém aceita um pedido do quadro geral).
// userId + média/total de avaliação (task-004) só entram quando o membro
// tem conta (participou logado) — sem isso o front-end não teria como
// montar o botão "Avaliar" (precisa do id de quem vai ser avaliado) nem
// mostrar a reputação de quem já tem histórico.
function visibleMemberFields(m) {
  const user = m.userId ? USERS.find((u) => u.id === m.userId) : null;
  return {
    name: m.name,
    whatsapp: m.whatsapp,
    userId: m.userId || null,
    mediaAvaliacao: user ? user.mediaAvaliacao : null,
    totalAvaliacoes: user ? user.totalAvaliacoes : 0,
  };
}

app.get("/api/groups/:id", (req, res) => {
  applyReputationBonusForStaleGroups();
  const group = GROUP_OPPORTUNITIES.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "grupo não encontrado" });
  // "encerrado" pode ter ficado sem ninguém (todo mundo saiu) — sem membro
  // nenhum pra mostrar contato nesse caso.
  const visibleMembers =
    group.status === "completo" || group.status === "concluido"
      ? group.members.map(visibleMemberFields)
      : group.members.length > 0
        ? [visibleMemberFields(group.members[0])]
        : [];
  const summary = groupSummary(group);
  const carona =
    group.carona && group.carona.tipo === "motorista"
      ? {
          ...summary.carona,
          cnhNumero: group.carona.cnhNumero,
          veiculoPlaca: group.carona.veiculoPlaca,
          veiculoModelo: group.carona.veiculoModelo,
          veiculoCor: group.carona.veiculoCor,
        }
      : summary.carona;
  const currentUser = getCurrentUser(req);
  res.json({
    ...summary,
    carona,
    members: visibleMembers,
    concluded: isGroupConcluded(group),
    // Ajuda o front-end a decidir se mostra os botões "Avaliar"/"Relatar
    // problema" sem precisar recalcular a regra de elegibilidade no cliente.
    currentUserIsConfirmedMember: currentUser ? isConfirmedMember(group, currentUser.id) : false,
  });
});

// Recalcula sugestões sob demanda (task-005) — além de já vir na resposta
// de criar um post, serve pra "sugestões pra você" quando a pessoa abre a
// lista geral de novo depois (ex: um post oposto compatível apareceu só
// depois que ela já tinha publicado o dela).
app.get("/api/groups/:id/suggestions", (req, res) => {
  const group = GROUP_OPPORTUNITIES.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "grupo não encontrado" });
  res.json({ suggestions: findGroupSuggestions(group) });
});

// Criar grupo de carona é um caminho à parte (task-002) — a forma dos dados
// é genuinamente diferente (motorista x passageiro têm campos obrigatórios
// diferentes, e "vagas" tem um significado específico), então não força
// isso dentro de validateGroupFields/criação genérica; reaproveita só o que
// já é igual (rate limit, título, cidade, WhatsApp, eventos, resposta).
async function handleCreateCaronaGroup(req, res) {
  const caronaFields = validateCaronaFields(req.body || {});
  if (!caronaFields.ok) {
    return res.status(400).json({ error: caronaFields.error });
  }
  const { title, city, whatsapp, name } = req.body || {};
  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "descreva o post (ex: 'Bom Despacho → BH')" });
  }
  if (title.trim().length > GROUP_TITLE_MAX_LENGTH) {
    return res.status(400).json({ error: `descrição muito longa (máximo ${GROUP_TITLE_MAX_LENGTH} caracteres)` });
  }
  if (!city || typeof city !== "string" || !city.trim()) {
    return res.status(400).json({ error: "informe a cidade/região" });
  }
  if (city.trim().length > REQUEST_LOCATION_MAX_LENGTH) {
    return res.status(400).json({ error: `cidade/região muito longa (máximo ${REQUEST_LOCATION_MAX_LENGTH} caracteres)` });
  }
  if (!whatsapp || typeof whatsapp !== "string" || !whatsapp.trim()) {
    return res.status(400).json({ error: "informe um WhatsApp pra contato" });
  }
  const normalizedWhatsapp = whatsapp.trim();
  if (normalizedWhatsapp.length > REQUEST_WHATSAPP_MAX_LENGTH) {
    return res.status(400).json({ error: `WhatsApp muito longo (máximo ${REQUEST_WHATSAPP_MAX_LENGTH} caracteres)` });
  }

  // Geocodificação só depois de TODAS as validações síncronas acima
  // (achado na revisão do CodeRabbit, PR #71) — sem isso, um POST com
  // título/cidade/whatsapp inválido ainda gastava uma chamada de rede no
  // Nominatim antes de descobrir que a requisição ia falhar de qualquer
  // jeito. Sem coordenada vinda do navegador (botão "usar minha
  // localização" não usado), tenta geocodificar o texto da origem digitado
  // — best-effort, segue em frente com lat/lng null se falhar, o matching
  // por texto (locationsMatch) continua funcionando normalmente sem isso.
  // Destino nunca vem do navegador (o botão "usar minha localização" só
  // preenche a origem) — sempre tenta geocodificar o texto digitado. As duas
  // chamadas (origem, quando falta, e destino) são disparadas juntas: o
  // throttle global de geocodeAddress() já serializa as requisições de rede
  // de verdade, então Promise.all só evita esperar uma pra só então começar
  // a outra.
  const [origemGeocoded, destinoGeocoded] = await Promise.all([
    caronaFields.lat == null || caronaFields.lng == null ? geocodeAddress(caronaFields.origemTexto) : Promise.resolve(null),
    geocodeAddress(caronaFields.destinoTexto),
  ]);
  if (origemGeocoded) {
    caronaFields.lat = origemGeocoded.lat;
    caronaFields.lng = origemGeocoded.lng;
  }
  if (destinoGeocoded) {
    caronaFields.destinoLat = destinoGeocoded.lat;
    caronaFields.destinoLng = destinoGeocoded.lng;
  }
  // Distância aproximada (Haversine + multiplicador, task-008 item 2) só
  // sai do null quando os dois pontos foram geocodificados — best-effort,
  // igual o resto da geocodificação: se faltar um dos dois, a criação do
  // post segue normalmente sem essa informação.
  const distanciaAproximadaKm =
    caronaFields.lat != null && caronaFields.lng != null && caronaFields.destinoLat != null && caronaFields.destinoLng != null
      ? estimatedRoadDistanceKm(caronaFields.lat, caronaFields.lng, caronaFields.destinoLat, caronaFields.destinoLng)
      : null;

  // Motorista: "vagas" são assentos de PASSAGEIRO — o motorista não é um
  // deles, então targetMembers = vagas + o próprio motorista (que já entra
  // como membro na criação, igual todo o resto do mecanismo). Isso deixa
  // "vagas restantes" = targetMembers - currentMembers automaticamente
  // certo, reaproveitando o join/leave que já existe sem precisar de um
  // conceito de "assento" à parte.
  // Passageiro: o post inteiro É a "vaga" (a própria pessoa) — sempre 1.
  const targetMembers = caronaFields.tipo === "motorista" ? caronaFields.vagasTotais + 1 : 1;

  const group = {
    id: `g${nextGroupId++}`,
    category: "carona",
    title: title.trim(),
    city: city.trim(),
    targetMembers,
    estimatedIndividualPrice: null,
    deadline: caronaFields.dataViagem,
    status: "aberto",
    // userId (task-004) só é gravado se a pessoa estiver logada — avaliação e
    // denúncia exigem identidade real, então um membro sem userId (entrou
    // anônimo) participa do grupo normalmente mas fica de fora do sistema de
    // reputação (não tem conta pra vincular nota/denúncia).
    members: [
      {
        whatsapp: normalizedWhatsapp,
        name: (typeof name === "string" && name.trim().slice(0, 60)) || "Quem criou o post",
        joinedAt: new Date().toISOString(),
        userId: getCurrentUser(req)?.id || null,
      },
    ],
    createdAt: new Date().toISOString(),
    // Login é opcional (pilar 4.13) — grupo continua podendo ser criado sem
    // logar, só fica sem dono (ownerUserId null) nesse caso, igual perfil.
    ownerUserId: getCurrentUser(req)?.id || null,
    carona: {
      tipo: caronaFields.tipo,
      origemTexto: caronaFields.origemTexto,
      destinoTexto: caronaFields.destinoTexto,
      dataViagem: caronaFields.dataViagem,
      horarioAproximado: caronaFields.horarioAproximado,
      lat: caronaFields.lat,
      lng: caronaFields.lng,
      destinoLat: caronaFields.destinoLat ?? null,
      destinoLng: caronaFields.destinoLng ?? null,
      distanciaAproximadaKm,
      cnhNumero: caronaFields.cnhNumero,
      veiculoPlaca: caronaFields.veiculoPlaca,
      veiculoModelo: caronaFields.veiculoModelo,
      veiculoCor: caronaFields.veiculoCor,
    },
  };
  // Passageiro (targetMembers=1) já nasce "completo" — não é uma conquista,
  // é só o jeito do mecanismo genérico marcar "não aceita entrada por
  // /join" pra um post que é, por natureza, individual (o front-end não
  // mostra esse post com a aparência de "grupo fechado", mostra como o que
  // é: alguém procurando carona).
  if (group.members.length >= group.targetMembers) group.status = "completo";
  GROUP_OPPORTUNITIES.unshift(group);
  recordGroupEvent(group.id, "created");
  if (group.status === "completo") recordGroupEvent(group.id, "completed");
  res.status(201).json({ ...groupSummary(group), suggestions: findGroupSuggestions(group) });
}

app.post("/api/groups", async (req, res) => {
  if (isGroupCreateRateLimited(req.ip)) {
    return res.status(429).json({ error: "muitos grupos criados recentemente a partir daqui — tente de novo mais tarde" });
  }
  if (!(await verifyAltcha((req.body || {}).altcha))) {
    return res.status(400).json({ error: "verificação anti-spam inválida — recarregue a página e tente de novo" });
  }
  // Reputação abaixo do limiar (task-004) bloqueia criar grupo novo, mesma
  // regra de POST /api/providers — participar de grupo já existente continua
  // liberado (task-004: "restrito" pode participar, só não pode publicar).
  const requestingUser = getCurrentUser(req);
  if (requestingUser && (requestingUser.status === "restrito" || requestingUser.status === "suspenso")) {
    return res.status(403).json({ error: "sua conta está com restrição ativa por causa de denúncias confirmadas — não é possível criar um novo grupo agora." });
  }
  const normalizedCategory = typeof (req.body || {}).category === "string" ? req.body.category.trim().toLowerCase() : "";
  if (normalizedCategory === "carona") {
    return await handleCreateCaronaGroup(req, res);
  }
  const fields = validateGroupFields(req.body || {});
  if (!fields.ok) {
    return res.status(400).json({ error: fields.error });
  }
  const { name } = req.body || {};
  // Best-effort: geocodifica a cidade digitada pra ter coordenada real como
  // sinal extra de "local parecido" (findGroupSuggestions) além do texto —
  // segue em frente com lat/lng null se a geocodificação falhar.
  const geocoded = await geocodeAddress(fields.city);
  const group = {
    id: `g${nextGroupId++}`,
    category: fields.category,
    title: fields.title,
    city: fields.city,
    lat: geocoded ? geocoded.lat : null,
    lng: geocoded ? geocoded.lng : null,
    targetMembers: fields.targetMembers,
    estimatedIndividualPrice: fields.estimatedIndividualPrice,
    deadline: fields.deadline,
    status: "aberto",
    tipo: fields.tipo,
    members: [
      {
        whatsapp: fields.whatsapp,
        name: (typeof name === "string" && name.trim().slice(0, 60)) || "Quem criou o grupo",
        joinedAt: new Date().toISOString(),
        userId: getCurrentUser(req)?.id || null,
      },
    ],
    createdAt: new Date().toISOString(),
    ownerUserId: getCurrentUser(req)?.id || null,
  };
  // Grupo com meta de 2 (o mínimo) já nasce completo com o próprio criador —
  // caso de borda real (ex: "só preciso de mais 1 pessoa" com target=2).
  if (group.members.length >= group.targetMembers) group.status = "completo";
  GROUP_OPPORTUNITIES.unshift(group);
  recordGroupEvent(group.id, "created");
  if (group.status === "completo") recordGroupEvent(group.id, "completed");
  // Sugestões (task-005) calculadas na hora, só pra devolver na resposta —
  // não muda nada salvo, é recalculável a qualquer momento via
  // GET /api/groups/:id/suggestions.
  res.status(201).json({ ...groupSummary(group), suggestions: findGroupSuggestions(group) });
});

app.post("/api/groups/:id/join", (req, res) => {
  if (isGroupJoinRateLimited(req.ip)) {
    return res.status(429).json({ error: "muitas entradas em grupo recentemente a partir daqui — tente de novo mais tarde" });
  }
  const group = GROUP_OPPORTUNITIES.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "grupo não encontrado" });
  if (group.status !== "aberto") {
    return res.status(409).json({ error: group.status === "completo" ? "esse grupo já está completo" : "esse grupo já foi encerrado" });
  }

  const { whatsapp, name } = req.body || {};
  if (!whatsapp || typeof whatsapp !== "string" || !whatsapp.trim()) {
    return res.status(400).json({ error: "informe um WhatsApp pra contato" });
  }
  const normalizedWhatsapp = whatsapp.trim();
  if (normalizedWhatsapp.length > REQUEST_WHATSAPP_MAX_LENGTH) {
    return res.status(400).json({ error: `WhatsApp muito longo (máximo ${REQUEST_WHATSAPP_MAX_LENGTH} caracteres)` });
  }
  if (group.members.some((m) => m.whatsapp === normalizedWhatsapp)) {
    return res.status(409).json({ error: "esse WhatsApp já está nesse grupo" });
  }

  group.members.push({
    whatsapp: normalizedWhatsapp,
    name: (typeof name === "string" && name.trim().slice(0, 60)) || "Participante",
    joinedAt: new Date().toISOString(),
    userId: getCurrentUser(req)?.id || null,
  });
  recordGroupEvent(group.id, "joined");
  if (group.members.length >= group.targetMembers) {
    group.status = "completo";
    recordGroupEvent(group.id, "completed");
  }
  res.json(groupSummary(group));
});

// "Sair antes de fechar" (escopo v1 travado pela Jéssica, 2026-09-14) — só
// funciona enquanto o grupo ainda está "aberto"; depois de "completo" não dá
// pra sair por aqui (v1 não lida com reabrir vaga de grupo já fechado).
// Grupo que fica sem ninguém vira "encerrado" (terceiro status do escopo).
app.post("/api/groups/:id/leave", (req, res) => {
  const group = GROUP_OPPORTUNITIES.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "grupo não encontrado" });
  if (group.status !== "aberto") {
    return res.status(409).json({ error: "só dá pra sair de um grupo que ainda está se formando" });
  }
  const { whatsapp } = req.body || {};
  if (!whatsapp || typeof whatsapp !== "string" || !whatsapp.trim()) {
    return res.status(400).json({ error: "informe o WhatsApp que você usou pra entrar" });
  }
  const normalizedWhatsapp = whatsapp.trim();
  const memberIndex = group.members.findIndex((m) => m.whatsapp === normalizedWhatsapp);
  if (memberIndex === -1) {
    return res.status(404).json({ error: "esse WhatsApp não está nesse grupo" });
  }
  group.members.splice(memberIndex, 1);
  recordGroupEvent(group.id, "left");
  if (group.members.length === 0) {
    group.status = "encerrado";
    recordGroupEvent(group.id, "closed");
  }
  res.json(groupSummary(group));
});

// Avaliações e denúncia (task-004), estilo pós-transação de apps de
// carona/serviço — nunca mediamos pagamento, só registramos histórico real
// de quem participou de qual grupo com quem, pra construir reputação com
// base em fato (grupo concluído de verdade), não em anúncio sem histórico.
//
// "Confirmado" = tem userId no member do grupo (entrou logado). Quem entra
// anônimo participa do grupo normalmente, mas fica de fora do sistema de
// avaliação/denúncia — não tem conta pra vincular nota ou denúncia a ela.
function isConfirmedMember(group, userId) {
  return userId != null && group.members.some((m) => m.userId === userId);
}

// Carona com data de viagem já passada conta como concluída mesmo sem
// ninguém ter clicado em nada — computado na hora, sem precisar de um job
// rodando em segundo plano. Outras categorias (sem data estruturada, só
// "deadline" em texto livre) dependem do POST .../complete manual.
function isGroupConcluded(group) {
  if (group.status === "concluido") return true;
  if (group.status !== "completo") return false;
  if (group.carona && group.carona.dataViagem) {
    return new Date(`${group.carona.dataViagem}T23:59:59`) < new Date();
  }
  return false;
}

app.post("/api/groups/:id/complete", (req, res) => {
  const group = GROUP_OPPORTUNITIES.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "grupo não encontrado" });
  const user = getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "não autenticado" });
  if (!isConfirmedMember(group, user.id)) {
    return res.status(403).json({ error: "só quem participou desse grupo pode marcar como concluído" });
  }
  if (group.status !== "completo") {
    return res.status(409).json({ error: "só um grupo completo (todo mundo já entrou) pode ser marcado como concluído" });
  }
  group.status = "concluido";
  recordGroupEvent(group.id, "concluded");
  res.json(groupSummary(group));
});

const REPUTACAO_INICIAL = 100;
const REPUTACAO_PENALIDADE_PROCEDENTE = 25;
const REPUTACAO_LIMIAR_RESTRITO = 40;
const REPUTACAO_LIMIAR_SUSPENSO = 20;
// Bônus por grupo concluído sem denúncia (regra do task-004) — valor
// pequeno de propósito: reputação sobe devagar com uso legítimo contínuo,
// não deveria ser possível "farmar" reputação com poucos grupos.
const REPUTACAO_BONUS_SEM_DENUNCIA = 5;
const REPUTACAO_BONUS_JANELA_DIAS = 7;

function recalculateUserStatus(user) {
  if (user.reputacaoScore < REPUTACAO_LIMIAR_SUSPENSO) user.status = "suspenso";
  else if (user.reputacaoScore < REPUTACAO_LIMIAR_RESTRITO) user.status = "restrito";
  else user.status = "ativo";
}

// Grupo concluído há mais de 7 dias, sem nenhuma denúncia contra nenhum
// membro confirmado: +reputação pra todo mundo que participou (uma vez só
// por grupo — `reputationBonusApplied` evita aplicar de novo a cada
// chamada). Computado sob demanda (sem cron/scheduler no projeto) nos
// pontos onde reputação é consultada/alterada.
function applyReputationBonusForStaleGroups() {
  const cutoff = Date.now() - REPUTACAO_BONUS_JANELA_DIAS * 24 * 60 * 60 * 1000;
  for (const group of GROUP_OPPORTUNITIES) {
    if (group.reputationBonusApplied) continue;
    if (!isGroupConcluded(group)) continue;
    // Carona concluída automaticamente (data da viagem já passou) nunca
    // grava um evento "concluded" — usa a própria data da viagem, mais
    // precisa que createdAt pra saber há quanto tempo isso "aconteceu" de
    // verdade. Outras categorias só concluem via POST .../complete, que
    // grava o evento de verdade.
    const concludedEvent = GROUP_EVENTS.find((e) => e.groupId === group.id && e.type === "concluded");
    const concludedAt = concludedEvent
      ? new Date(concludedEvent.at).getTime()
      : group.carona && group.carona.dataViagem
        ? new Date(`${group.carona.dataViagem}T23:59:59`).getTime()
        : new Date(group.createdAt).getTime();
    if (concludedAt > cutoff) continue;
    const confirmedMemberIds = group.members.map((m) => m.userId).filter(Boolean);
    const hasDenuncia = DENUNCIAS.some((d) => d.grupoId === group.id);
    group.reputationBonusApplied = true;
    if (hasDenuncia || confirmedMemberIds.length === 0) continue;
    for (const userId of confirmedMemberIds) {
      const user = USERS.find((u) => u.id === userId);
      if (user) user.reputacaoScore += REPUTACAO_BONUS_SEM_DENUNCIA;
    }
  }
}

const AVALIACOES = [];
let nextAvaliacaoId = 1;
const AVALIACAO_COMENTARIO_MAX_LENGTH = 200;

app.post("/api/groups/:id/avaliacoes", (req, res) => {
  applyReputationBonusForStaleGroups();
  const group = GROUP_OPPORTUNITIES.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "grupo não encontrado" });
  const avaliador = getCurrentUser(req);
  if (!avaliador) return res.status(401).json({ error: "não autenticado" });
  if (!isGroupConcluded(group)) {
    return res.status(409).json({ error: "só dá pra avaliar depois que o grupo for concluído" });
  }
  if (!isConfirmedMember(group, avaliador.id)) {
    return res.status(403).json({ error: "só quem participou desse grupo pode avaliar" });
  }

  const { avaliadoId, nota, comentario } = req.body || {};
  if (avaliadoId === avaliador.id) {
    return res.status(400).json({ error: "não dá pra avaliar a si mesmo" });
  }
  if (!isConfirmedMember(group, avaliadoId)) {
    return res.status(400).json({ error: "essa pessoa não participou desse grupo" });
  }
  const notaNum = Number(nota);
  if (!Number.isInteger(notaNum) || notaNum < 1 || notaNum > 5) {
    return res.status(400).json({ error: "nota precisa ser um número inteiro de 1 a 5" });
  }
  if (comentario !== undefined && comentario !== null) {
    if (typeof comentario !== "string") return res.status(400).json({ error: "comentário inválido" });
    if (comentario.length > AVALIACAO_COMENTARIO_MAX_LENGTH) {
      return res.status(400).json({ error: `comentário muito longo (máximo ${AVALIACAO_COMENTARIO_MAX_LENGTH} caracteres)` });
    }
  }
  const jaAvaliou = AVALIACOES.some((a) => a.grupoId === group.id && a.avaliadorId === avaliador.id && a.avaliadoId === avaliadoId);
  if (jaAvaliou) {
    return res.status(409).json({ error: "você já avaliou essa pessoa nesse grupo" });
  }

  const avaliacao = {
    id: `av${nextAvaliacaoId++}`,
    grupoId: group.id,
    avaliadorId: avaliador.id,
    avaliadoId,
    nota: notaNum,
    comentario: (typeof comentario === "string" && comentario.trim()) || null,
    createdAt: new Date().toISOString(),
  };
  AVALIACOES.push(avaliacao);

  const avaliado = USERS.find((u) => u.id === avaliadoId);
  const avaliacoesDoAvaliado = AVALIACOES.filter((a) => a.avaliadoId === avaliadoId);
  avaliado.totalAvaliacoes = avaliacoesDoAvaliado.length;
  avaliado.mediaAvaliacao = avaliacoesDoAvaliado.reduce((sum, a) => sum + a.nota, 0) / avaliacoesDoAvaliado.length;

  res.status(201).json({ id: avaliacao.id, nota: avaliacao.nota, comentario: avaliacao.comentario, createdAt: avaliacao.createdAt });
});

// Média + total + comentários mais recentes de um usuário — não existe
// página de perfil de usuário separada ainda (só perfil de PRESTADOR,
// pilar 4.12, que é outra coisa: um userId pode ter vários perfis de
// prestador, ou nenhum). Esse endpoint serve pra qualquer tela que precise
// mostrar reputação de uma pessoa (ex: detalhe de grupo concluído). Nunca
// devolve reputacaoScore (interno, nunca público) nem quem avaliou.
app.get("/api/users/:id/avaliacoes", (req, res) => {
  const user = USERS.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "usuário não encontrado" });
  const recentes = AVALIACOES.filter((a) => a.avaliadoId === user.id)
    .slice()
    .reverse()
    .slice(0, 10)
    .map((a) => ({ nota: a.nota, comentario: a.comentario, createdAt: a.createdAt }));
  res.json({ mediaAvaliacao: user.mediaAvaliacao, totalAvaliacoes: user.totalAvaliacoes, recentes });
});

const DENUNCIAS = [];
let nextDenunciaId = 1;
const DENUNCIA_MOTIVOS = ["nao_entregou", "sumiu_apos_combinado", "valor_diferente", "outro"];
const DENUNCIA_DESCRICAO_MAX_LENGTH = 500;
const DENUNCIA_EVIDENCIA_MAX_LENGTH = 300;
// 2+ denúncias de grupos DIFERENTES, mesmo motivo, contra a mesma pessoa —
// vira prioridade de revisão manual (ainda sem fila/tela própria, só o
// campo `prioritaria` marcado pra quem for revisar manualmente saber por
// onde começar).
const DENUNCIA_LIMIAR_PRIORIDADE = 2;

app.post("/api/groups/:id/denuncias", (req, res) => {
  const group = GROUP_OPPORTUNITIES.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "grupo não encontrado" });
  const denunciante = getCurrentUser(req);
  if (!denunciante) return res.status(401).json({ error: "não autenticado" });
  // Denúncia não espera o grupo estar "concluído" (ex: motorista sumiu ANTES
  // da data da viagem) — só que já tenha fechado (completo/concluído), pra
  // ter certeza de que os dois lados realmente confirmaram participação.
  if (group.status !== "completo" && !isGroupConcluded(group)) {
    return res.status(409).json({ error: "só dá pra denunciar depois que o grupo fechar (completo)" });
  }
  if (!isConfirmedMember(group, denunciante.id)) {
    return res.status(403).json({ error: "só quem participou desse grupo pode denunciar" });
  }

  const { denunciadoId, motivo, descricao, evidencia } = req.body || {};
  if (denunciadoId === denunciante.id) {
    return res.status(400).json({ error: "não dá pra denunciar a si mesmo" });
  }
  if (!isConfirmedMember(group, denunciadoId)) {
    return res.status(400).json({ error: "essa pessoa não participou desse grupo" });
  }
  if (!DENUNCIA_MOTIVOS.includes(motivo)) {
    return res.status(400).json({ error: `motivo inválido (use: ${DENUNCIA_MOTIVOS.join(", ")})` });
  }
  if (!descricao || typeof descricao !== "string" || !descricao.trim()) {
    return res.status(400).json({ error: "descreva o que aconteceu" });
  }
  if (descricao.trim().length > DENUNCIA_DESCRICAO_MAX_LENGTH) {
    return res.status(400).json({ error: `descrição muito longa (máximo ${DENUNCIA_DESCRICAO_MAX_LENGTH} caracteres)` });
  }
  if (evidencia !== undefined && evidencia !== null) {
    if (typeof evidencia !== "string") return res.status(400).json({ error: "evidência inválida" });
    if (evidencia.length > DENUNCIA_EVIDENCIA_MAX_LENGTH) {
      return res.status(400).json({ error: `evidência muito longa (máximo ${DENUNCIA_EVIDENCIA_MAX_LENGTH} caracteres)` });
    }
  }
  const jaDenunciou = DENUNCIAS.some((d) => d.grupoId === group.id && d.denuncianteId === denunciante.id && d.denunciadoId === denunciadoId);
  if (jaDenunciou) {
    return res.status(409).json({ error: "você já denunciou essa pessoa nesse grupo" });
  }

  const outrasDenunciasMesmoMotivo = DENUNCIAS.filter(
    (d) => d.denunciadoId === denunciadoId && d.motivo === motivo && d.grupoId !== group.id && d.status !== "improcedente"
  );
  const prioritaria = outrasDenunciasMesmoMotivo.length + 1 >= DENUNCIA_LIMIAR_PRIORIDADE;

  const denuncia = {
    id: `den${nextDenunciaId++}`,
    grupoId: group.id,
    denuncianteId: denunciante.id,
    denunciadoId,
    motivo,
    descricao: descricao.trim(),
    evidencia: (typeof evidencia === "string" && evidencia.trim()) || null,
    status: "aberta",
    prioritaria,
    createdAt: new Date().toISOString(),
    resolvidaAt: null,
  };
  DENUNCIAS.push(denuncia);
  // "aberta" não afeta reputação (regra do task-004) — só a resolução
  // (ver resolveDenuncia) muda reputacaoScore, e só se for procedente.

  res.status(201).json({ id: denuncia.id, status: denuncia.status, prioritaria: denuncia.prioritaria });
});

// Contagem pública de "N denúncias confirmadas" — nunca expõe a denúncia
// em si (descrição, evidência, quem denunciou), só o número de vezes que
// uma denúncia contra essa pessoa foi julgada procedente. Denúncia aberta
// ou em análise não aparece aqui — só depois de resolvida como procedente
// (regra do task-004: denúncia fica invisível publicamente até resolver).
app.get("/api/users/:id/denuncias-confirmadas", (req, res) => {
  const user = USERS.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "usuário não encontrado" });
  const total = DENUNCIAS.filter((d) => d.denunciadoId === user.id && d.status === "procedente").length;
  res.json({ total });
});

// Resolução de denúncia (aberta/em_analise -> procedente/improcedente) é
// capacidade só-API, sem tela própria nesta v1 (revisão manual "por
// enquanto", conforme o task-004) — mas nenhum endpoint de resolução deveria
// ficar aberto sem autenticação nenhuma (mudaria reputação de terceiros).
// Protegido por uma chave simples (ADMIN_SECRET no .env, comparada num
// header) em vez de um sistema de contas de administrador completo — mesmo
// nível de proteção que o suficiente pro tamanho atual do projeto, sem
// inventar infraestrutura que ninguém vai usar. Sem a variável configurada,
// a rota fica desativada (503), igual o padrão já usado pras outras
// integrações opcionais (Gemini, WhatsApp).
function requireAdminSecret(req, res) {
  if (!process.env.ADMIN_SECRET) {
    res.status(503).json({ error: "resolução de denúncia não configurada nesse ambiente (ADMIN_SECRET ausente)" });
    return false;
  }
  if (req.get("X-Admin-Key") !== process.env.ADMIN_SECRET) {
    res.status(401).json({ error: "chave de administração inválida" });
    return false;
  }
  return true;
}

app.patch("/api/denuncias/:id", (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  const denuncia = DENUNCIAS.find((d) => d.id === req.params.id);
  if (!denuncia) return res.status(404).json({ error: "denúncia não encontrada" });
  const { status } = req.body || {};
  if (!["em_analise", "procedente", "improcedente"].includes(status)) {
    return res.status(400).json({ error: "status inválido (use: em_analise, procedente, improcedente)" });
  }
  if (denuncia.status === "procedente" || denuncia.status === "improcedente") {
    return res.status(409).json({ error: "essa denúncia já foi resolvida" });
  }

  denuncia.status = status;
  if (status === "procedente" || status === "improcedente") {
    denuncia.resolvidaAt = new Date().toISOString();
  }
  if (status === "procedente") {
    const denunciado = USERS.find((u) => u.id === denuncia.denunciadoId);
    if (denunciado) {
      denunciado.reputacaoScore -= REPUTACAO_PENALIDADE_PROCEDENTE;
      recalculateUserStatus(denunciado);
    }
  }
  res.json({ id: denuncia.id, status: denuncia.status, resolvidaAt: denuncia.resolvidaAt });
});

const PROVIDER_NAME_MAX_LENGTH = 60;
const PROVIDER_DESCRIPTION_MAX_LENGTH = 500;

// Compartilhado entre criar (POST) e editar (PUT) perfil — mesma regra de
// validação pros dois caminhos, sem divergir. `requireDescription` é false
// na edição: quem já tem perfil pode só atualizar nome/local/WhatsApp sem
// reescrever a bio toda vez.
function validateProviderFields({ name, service, description, location, whatsapp }, { requireDescription }) {
  if (!name || typeof name !== "string" || !name.trim()) {
    return { ok: false, error: "informe seu nome" };
  }
  if (name.trim().length > PROVIDER_NAME_MAX_LENGTH) {
    return { ok: false, error: `nome muito longo (máximo ${PROVIDER_NAME_MAX_LENGTH} caracteres)` };
  }
  if (!service || typeof service !== "string" || !service.trim()) {
    return { ok: false, error: "informe o serviço que você presta" };
  }
  const hasDescription = typeof description === "string" && description.trim();
  if (requireDescription && !hasDescription) {
    return { ok: false, error: "descreva o que você faz" };
  }
  if (hasDescription && description.trim().length > PROVIDER_DESCRIPTION_MAX_LENGTH) {
    return { ok: false, error: `descrição muito longa (máximo ${PROVIDER_DESCRIPTION_MAX_LENGTH} caracteres)` };
  }
  if (!location || typeof location !== "string" || !location.trim()) {
    return { ok: false, error: "informe a localização" };
  }
  if (location.trim().length > REQUEST_LOCATION_MAX_LENGTH) {
    return { ok: false, error: `localização muito longa (máximo ${REQUEST_LOCATION_MAX_LENGTH} caracteres)` };
  }
  if (!whatsapp || typeof whatsapp !== "string" || !whatsapp.trim()) {
    return { ok: false, error: "informe um WhatsApp pra contato" };
  }
  if (whatsapp.trim().length > REQUEST_WHATSAPP_MAX_LENGTH) {
    return { ok: false, error: `WhatsApp muito longo (máximo ${REQUEST_WHATSAPP_MAX_LENGTH} caracteres)` };
  }
  return {
    ok: true,
    name: name.trim(),
    service: service.trim().toLowerCase(),
    description: hasDescription ? description.trim() : null,
    location: location.trim(),
    whatsapp: whatsapp.trim(),
  };
}

// Compartilhado entre criar e editar — grava os arquivos recebidos, roda o
// ajuste automático (sempre) e a troca de fundo (só se marcada), devolvendo
// o array de fotos no formato já salvo em PROVIDER_PROFILES.
async function buildPhotosFromFiles(files, dir, id, newBackground) {
  const photos = [];
  for (const [index, file] of files.entries()) {
    const ext = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
    const filename = `${index}.${ext}`;
    const url = await storePhoto(file.buffer, dir, id, filename, file.mimetype);
    let enhancedUrl = null;
    const enhancedBuffer = await enhancePhoto(file.buffer, file.mimetype);
    if (enhancedBuffer) {
      const enhancedFilename = `${index}-melhorada.png`;
      enhancedUrl = await storePhoto(enhancedBuffer, dir, id, enhancedFilename, "image/png");
    }
    // Fundo novo é opcional — só roda se a pessoa marcar no formulário,
    // nunca automático (às vezes o fundo original importa pro trabalho).
    let newBackgroundUrl = null;
    if (newBackground === "true" || newBackground === "on") {
      const bgBuffer = await applyNewBackground(file.buffer);
      if (bgBuffer) {
        const bgFilename = `${index}-fundo-novo.png`;
        newBackgroundUrl = await storePhoto(bgBuffer, dir, id, bgFilename, "image/png");
      }
    }
    photos.push({ url, enhancedUrl, newBackgroundUrl });
  }
  return photos;
}

// Pilar 4.12 — perfil profissional gerado por IA: a pessoa manda fotos e
// descreve o que faz, a IA escreve a bio e as fotos recebem ajuste técnico
// automático (sempre) mais edição por IA generativa (se GEMINI_API_KEY
// configurada). Devolve uma página própria compartilhável.
app.post("/api/providers", (req, res, next) => {
  if (isProviderCreateRateLimited(req.ip)) {
    return res.status(429).json({ error: "muitos perfis criados recentemente a partir daqui — tente de novo mais tarde" });
  }
  next();
}, uploadProviderPhotos, async (req, res) => {
  // Reputação abaixo do limiar (task-004) bloqueia criar post novo — quem já
  // tem posts continua com eles no ar, só não consegue publicar mais um até
  // a reputação se recuperar (ex: mais grupos concluídos sem denúncia).
  const requestingUser = getCurrentUser(req);
  if (requestingUser && (requestingUser.status === "restrito" || requestingUser.status === "suspenso")) {
    return res.status(403).json({ error: "sua conta está com restrição ativa por causa de denúncias confirmadas — não é possível criar um novo perfil agora." });
  }
  const fields = validateProviderFields(req.body || {}, { requireDescription: true });
  if (!fields.ok) {
    return res.status(400).json({ error: fields.error });
  }
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "envie pelo menos uma foto" });
  }
  if (!req.files.every((file) => matchesImageSignature(file.buffer, file.mimetype))) {
    return res.status(400).json({ error: "um dos arquivos enviados não é uma imagem válida" });
  }

  const id = `pf${nextProviderId++}`;
  const slug = slugify(fields.name);
  const dir = path.join(UPLOADS_DIR, "providers", id);
  const { newBackground } = req.body || {};

  try {
    fs.mkdirSync(dir, { recursive: true });
    const photos = await buildPhotosFromFiles(req.files, dir, id, newBackground);
    const bio = fields.description;

    const currentUser = getCurrentUser(req);
    let availability = [];
    try {
      const raw = req.body.availability;
      if (raw) availability = JSON.parse(raw);
    } catch (_) {}
    availability = (Array.isArray(availability) ? availability : []).filter(
      (s) => s && s.dia && s.inicio && s.fim
    );

    const provider = {
      id,
      slug,
      name: fields.name,
      service: fields.service,
      bio,
      location: fields.location,
      whatsapp: fields.whatsapp,
      photos,
      availability,
      // Login é opcional (pilar 4.13) — perfil continua podendo ser criado
      // sem logar, só fica sem dono (ownerUserId null) nesse caso.
      ownerUserId: currentUser ? currentUser.id : null,
      createdAt: new Date().toISOString(),
    };
    PROVIDER_PROFILES.unshift(provider);
    res.status(201).json({ provider });
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    res.status(500).json({ error: "falha ao criar o perfil, tente de novo" });
  }
});

// Pilar 4.13 — editar perfil (só quem logou e é dono do perfil). Descrição
// e fotos são opcionais aqui: manda só o que quer trocar, o resto (bio,
// fotos) continua como estava. Slug/id/dono nunca mudam — é o mesmo link
// de antes, só o conteúdo é atualizado.
app.put("/api/providers/:slug", uploadProviderPhotos, async (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: "faça login pra editar seu perfil" });
  }
  const provider = PROVIDER_PROFILES.find((p) => p.slug === req.params.slug);
  if (!provider) {
    return res.status(404).json({ error: "perfil não encontrado" });
  }
  if (provider.ownerUserId !== currentUser.id) {
    return res.status(403).json({ error: "esse perfil não é seu" });
  }

  const fields = validateProviderFields(req.body || {}, { requireDescription: false });
  if (!fields.ok) {
    return res.status(400).json({ error: fields.error });
  }
  if (req.files && req.files.length > 0 && !req.files.every((file) => matchesImageSignature(file.buffer, file.mimetype))) {
    return res.status(400).json({ error: "um dos arquivos enviados não é uma imagem válida" });
  }

  const { newBackground } = req.body || {};
  const dir = path.join(UPLOADS_DIR, "providers", provider.id);

  try {
    if (req.files && req.files.length > 0) {
      // Monta as fotos novas num diretório temporário primeiro — só apaga as
      // fotos antigas depois que a montagem toda deu certo. Sem isso, uma
      // falha no meio do processo (ex: disco cheio) apagaria as fotos de
      // quem estava editando sem colocar nada no lugar.
      const tmpDir = `${dir}-edit-${Date.now()}`;
      fs.mkdirSync(tmpDir, { recursive: true });
      try {
        const newPhotos = await buildPhotosFromFiles(req.files, tmpDir, provider.id, newBackground);
        fs.rmSync(dir, { recursive: true, force: true });
        fs.renameSync(tmpDir, dir);
        provider.photos = newPhotos;
      } catch (buildErr) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        throw buildErr;
      }
    }
    if (fields.description) {
      provider.bio = fields.description;
    }
    provider.name = fields.name;
    provider.service = fields.service;
    provider.location = fields.location;
    provider.whatsapp = fields.whatsapp;
    try {
      const rawAvail = req.body.availability;
      if (rawAvail !== undefined) {
        const parsed = JSON.parse(rawAvail);
        provider.availability = (Array.isArray(parsed) ? parsed : []).filter(
          (s) => s && s.dia && s.inicio && s.fim
        );
      }
    } catch (_) {}
    provider.updatedAt = new Date().toISOString();
    res.json({ provider });
  } catch (err) {
    res.status(500).json({ error: "falha ao salvar as alterações, tente de novo" });
  }
});

// Sem checar suspensão aqui de propósito — esse endpoint alimenta a própria
// tela de edição do dono (ver startEditingProvider em assets/app.js), que
// precisa continuar funcionando mesmo com a conta suspensa (task-004 esconde
// o perfil de visitantes, não tira da própria pessoa a capacidade de gerir
// o que ela já tem). Quem fica de fato escondido é a página pública
// compartilhável (ver GET /prestador/:slug) e o ranking/busca.
app.get("/api/providers/:slug", (req, res) => {
  const provider = PROVIDER_PROFILES.find((p) => p.slug === req.params.slug);
  if (!provider) return res.status(404).json({ error: "perfil não encontrado" });
  res.json({ provider });
});

// Página pública do prestador — renderizada no servidor porque é um link
// compartilhável de verdade (WhatsApp, Instagram etc precisam de uma URL
// que funcione sem JS do resto do site rodar primeiro).
app.get("/prestador/:slug", (req, res) => {
  const provider = PROVIDER_PROFILES.find((p) => p.slug === req.params.slug);
  if (!provider || isOwnerSuspended(provider.ownerUserId)) return res.status(404).send("Perfil não encontrado.");

  const bestPhotoUrl = (p) => p.newBackgroundUrl || p.enhancedUrl || p.url;
  const cover = provider.photos[0];
  const coverUrl = cover ? bestPhotoUrl(cover) : null;
  const whatsappDigits = provider.whatsapp.replace(/\D/g, "");
  const galleryHtml = provider.photos
    .slice(1)
    .map((p) => `<img src="${escapeHtmlServer(bestPhotoUrl(p))}" alt="" class="provider-gallery-photo" />`)
    .join("");

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtmlServer(provider.name)} — Top3Profissional</title>
<meta name="description" content="${escapeHtmlServer(provider.bio)}" />
<link rel="stylesheet" href="/assets/style.css" />
</head>
<body>
<div class="provider-page">
  ${coverUrl ? `<img src="${escapeHtmlServer(coverUrl)}" alt="${escapeHtmlServer(provider.name)}" class="provider-cover-photo" />` : ""}
  <div class="provider-page-body">
    <h1>${escapeHtmlServer(provider.name)}</h1>
    <p class="provider-page-service">${escapeHtmlServer(provider.service)} · ${escapeHtmlServer(provider.location)}</p>
    <p class="provider-page-bio">${escapeHtmlServer(provider.bio)}</p>
    <a class="cta-button" href="https://wa.me/${encodeURIComponent(whatsappDigits)}">Chamar no WhatsApp</a>
    ${galleryHtml ? `<div class="provider-gallery">${galleryHtml}</div>` : ""}
  </div>
</div>
</body>
</html>`);
});

// Health check pro host (Railway, etc.) saber se o processo está de pé.
// De propósito não depende de nenhum serviço externo — só confirma que o
// servidor Express está respondendo, pra não marcar "unhealthy" por um
// problema de terceiro que não impede o site de carregar.
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    whatsappConfigured: isWhatsAppConfigured(),
    searxngConfigured: Boolean(process.env.SEARXNG_URL),
    braveSearchConfigured: Boolean(process.env.BRAVE_SEARCH_API_KEY),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    googleLoginConfigured: Boolean(googleClient),
    minioConfigured: Boolean(minioClient),
    altchaConfigured: isAltchaConfigured(),
    umamiConfigured: isUmamiConfigured(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

registerWhatsAppRoutes(app, { searchWeb, acceptRequest, completeRequest, rateRequest });

// Autosave periódico (task-009, item 6b) — rede de segurança contra um
// encerramento não-gracioso (crash, SIGKILL) que pularia o handler de
// SIGTERM abaixo. .unref() deixa o processo terminar sozinho mesmo com
// esse timer pendente (importante pro servidor de teste do Playwright,
// que precisa encerrar limpo entre rodadas).
if (!isUserPersistenceDisabled()) {
  setInterval(persistUsersAndSessions, 5_000).unref();
}

// systemctl restart (usado no deploy, ver .github/workflows/deploy-vps.yml)
// manda SIGTERM antes de matar o processo — esse handler garante que o
// estado mais recente de USERS/SESSIONS é gravado em disco bem antes do
// processo morrer, pra ninguém deslogar sozinho a cada deploy (a causa
// real do problema reportado, não o tempo de expiração do cookie).
function shutdownGracefully() {
  persistUsersAndSessions();
  process.exit(0);
}
process.on("SIGTERM", shutdownGracefully);
process.on("SIGINT", shutdownGracefully);

const PORT = process.env.PORT || 8123;
app.listen(PORT, () => {
  console.log(`Top3Profissional rodando em http://localhost:${PORT}`);
  console.log(
    isWhatsAppConfigured()
      ? "[whatsapp] credenciais configuradas — webhook ativo em /webhook/whatsapp"
      : "[whatsapp] credenciais ausentes — webhook registrado mas não vai enviar mensagens (veja whatsapp.js)"
  );
});
