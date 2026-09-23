// Dicionário de sinônimos pra busca por palavra-chave (task-005), sem IA —
// arquivo separado de propósito, fácil de editar/crescer sem mexer no resto
// do server.js. Duas listas diferentes, não misturar:
//
// - SERVICO_SYNONYMS: aponta pra um SERVIÇO PROFISSIONAL cadastrado (o que
//   aparece no ranking/Top3, pilar 4.1) — a chave é o nome exato do serviço
//   como as pessoas cadastram o próprio perfil.
// - GROUP_CATEGORY_SYNONYMS: aponta pra uma CATEGORIA de Grupos de Economia
//   (pilar 4.14) — a chave é o valor aceito por GROUP_CATEGORIES em
//   server.js.
//
// Log de buscas não reconhecidas (ver SEARCH_UNRECOGNIZED em server.js) é o
// jeito de saber quais termos reais estão faltando aqui — revisar de vez em
// quando e adicionar os mais comuns, em vez de tentar adivinhar tudo de uma
// vez.

const SERVICO_SYNONYMS = {
  manicure: ["manicure", "unha", "unhas", "esmalteria", "esmaltação"],
  eletricista: ["eletricista", "elétrica", "elétrico", "fiação", "instalação elétrica", "instalador"],
  cabeleireiro: ["cabeleireiro", "cabeleireira", "salão de beleza", "corte de cabelo", "cabelo"],
  encanador: ["encanador", "encanamento", "hidráulica", "vazamento", "cano"],
};

const GROUP_CATEGORY_SYNONYMS = {
  carona: ["carona", "carro compartilhado", "rachar carona"],
  frete: ["frete", "mudança", "transporte de carga", "caminhão", "carreto"],
  compra: ["compra coletiva", "comprar junto", "compra em grupo", "atacado"],
  curso: ["curso", "aula em grupo", "workshop", "oficina"],
  assinatura: ["assinatura compartilhada", "dividir assinatura", "streaming", "netflix", "spotify"],
  viagem: ["viagem em grupo", "excursão", "viagem compartilhada"],
  servico: ["serviço em grupo", "serviço compartilhado"],
};

// Cidades/bairros da região onde o site já tem uso real (Grande BH,
// principalmente) — lista configurável, cresce conforme o site expande pra
// outras regiões. Cada entrada mapeia variações (abreviação, com/sem
// acento) pro nome "canônico" usado nos filtros (?city=, origem/destino).
const CITY_SYNONYMS = {
  "belo horizonte": ["belo horizonte", "bh", "b.h.", "bhz"],
  contagem: ["contagem"],
  betim: ["betim"],
  sabara: ["sabará", "sabara"],
  "nova lima": ["nova lima"],
  "bom despacho": ["bom despacho"],
  uberlandia: ["uberlândia", "uberlandia"],
};

module.exports = { SERVICO_SYNONYMS, GROUP_CATEGORY_SYNONYMS, CITY_SYNONYMS };
