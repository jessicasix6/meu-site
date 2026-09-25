// "Solicitar" (Preciso de algo) e "Cadastrar minha oferta" (Quero oferecer):
// um diálogo com 4 tipos — Serviço, Loja, Produto, Viagem — que MOVE o
// formulário que já existe na página pra dentro dele (mesma técnica dos painéis
// de categoria do hero): ids, validação e envio continuam os de sempre, e ao
// fechar cada seção volta ao lugar de origem. Carregado depois de app.js.

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const dialog = $("compose-dialog");
  if (!dialog) return;
  const body = $("compose-body");
  const title = $("compose-title");
  const hint = $("compose-hint");
  const tabs = $("compose-tabs");

  let mode = "requester";
  let kind = "servico";
  let opener = null;
  const moved = []; // { el, parent, next }
  const undo = []; // funções que desfazem relabel/preset

  // ── textos por modo e tipo ─────────────────────────────────────────────
  const TITLES = { requester: "O que você precisa?", provider: "O que você quer oferecer?" };
  const HINTS = {
    requester: {
      servico: "Conte o serviço que você quer contratar — quem atende na sua região vê e te chama no WhatsApp.",
      loja: "Procura uma loja ou comércio específico? Descreva o que você precisa achar.",
      produto: "Quer comprar ou alugar algo? Descreva o produto e quanto pode pagar.",
      viagem: "Precisa de corrida, carona ou entrega? Informe o trajeto (de → pra) e o horário.",
    },
    provider: {
      servico: "Crie seu perfil profissional: foto, o que você faz e onde atende. A página é sua, com link pra compartilhar.",
      loja: "Cadastre sua loja: nome, o que vende e onde fica. Com fotos, aparece nas ofertas.",
      produto: "Cadastre o que você vende: descreva o produto e mande fotos.",
      viagem: "Ofereça uma carona ou viagem compartilhada: trajeto, data, horário e vagas.",
    },
  };
  const REQUEST_TYPE = { servico: "profissional", loja: "loja", produto: "produto", viagem: "corrida" };
  const TITLE_PLACEHOLDER = {
    servico: "ex: Preciso de um pedreiro amanhã cedo, Savassi",
    loja: "ex: Procuro loja de tintas aberta hoje, Centro",
    produto: "ex: Quero comprar uma bicicleta aro 29",
    viagem: "ex: Centro → Rodoviária, hoje às 18h",
  };
  const PROVIDER_LABELS = {
    servico: { name: "Seu nome", namePh: "ex: Juliana Martins", service: "O que você faz", servicePh: "ex: manicure, eletricista...", location: "Onde você atende", desc: "Descreva o que você faz, com suas palavras", descPh: "ex: faço unha há 5 anos, atendo em casa e a domicílio...", submit: "Criar meu perfil" },
    loja: { name: "Nome da loja", namePh: "ex: Padaria Tradição", service: "O que a loja vende", servicePh: "ex: padaria, pet shop, papelaria", location: "Onde a loja fica", desc: "Fale sobre a loja", descPh: "ex: pães artesanais e café da manhã todos os dias, aberta das 6h às 20h", submit: "Cadastrar minha loja" },
    produto: { name: "Seu nome (ou da loja)", namePh: "ex: Carlos Souza", service: "O que você vende", servicePh: "ex: bicicleta, sofá, celular", location: "Onde está o produto", desc: "Descreva o produto (estado, valor, detalhes)", descPh: "ex: bicicleta aro 29, pouco uso, R$ 900, aceito troca", submit: "Cadastrar produto" },
  };

  // ── mover seções pra dentro do diálogo e devolver ──────────────────────
  function moveIn(el) {
    if (!el) return;
    moved.push({ el, parent: el.parentElement, next: el.nextSibling });
    body.appendChild(el);
  }

  function restore() {
    while (undo.length) undo.pop()();
    while (moved.length) {
      const { el, parent, next } = moved.pop();
      parent.insertBefore(el, next && next.parentElement === parent ? next : null);
    }
  }

  function setText(el, text) {
    if (!el) return;
    const before = el.textContent;
    el.textContent = text;
    undo.push(() => (el.textContent = before));
  }

  function setPlaceholder(el, text) {
    if (!el) return;
    const before = el.getAttribute("placeholder");
    el.setAttribute("placeholder", text);
    undo.push(() => (before === null ? el.removeAttribute("placeholder") : el.setAttribute("placeholder", before)));
  }

  // O tipo já foi escolhido nas abas — esconde o campo repetido do formulário.
  function presetField(select) {
    const field = select && select.closest(".post-field");
    if (!field) return;
    field.classList.add("is-preset");
    undo.push(() => field.classList.remove("is-preset"));
  }

  function fire(el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  // ── conteúdo por modo/tipo ─────────────────────────────────────────────
  function showRequester() {
    moveIn($("publicar"));
    const type = $("post-type");
    type.value = REQUEST_TYPE[kind];
    fire(type, "change");
    presetField(type);
    setPlaceholder($("post-title"), TITLE_PLACEHOLDER[kind]);
    setText(document.querySelector('label[for="post-location"]'), "Onde (bairro e cidade)");
  }

  function showProvider() {
    if (kind === "viagem") {
      moveIn($("grupos"));
      document.querySelector('.group-category-btn[data-category="carona"]')?.click();
      const form = $("group-form");
      if (form && form.hidden) $("group-create-toggle").click();
      const cat = $("group-category");
      cat.value = "carona";
      fire(cat, "change");
      presetField(cat);
      return;
    }
    const L = PROVIDER_LABELS[kind];
    moveIn($("criar-perfil"));
    setText(document.querySelector('label[for="provider-name"]'), L.name);
    setPlaceholder($("provider-name"), L.namePh);
    setPlaceholder($("provider-description"), L.descPh);
    setText(document.querySelector('label[for="provider-service"]'), L.service);
    setPlaceholder($("provider-service"), L.servicePh);
    setText(document.querySelector('label[for="provider-location"]'), L.location);
    setText($("provider-description-label"), L.desc);
    setText($("provider-form-submit"), L.submit);
  }

  function render() {
    restore();
    title.textContent = TITLES[mode];
    hint.textContent = HINTS[mode][kind];
    tabs.querySelectorAll(".compose-tab").forEach((tab) => {
      const on = tab.dataset.kind === kind;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", String(on));
    });
    dialog.dataset.mode = mode;
    if (mode === "requester") showRequester();
    else showProvider();
  }

  // ── abrir / fechar ─────────────────────────────────────────────────────
  function open(newMode, newKind, from) {
    if (typeof closeCategoryPanel === "function") closeCategoryPanel();
    mode = newMode === "provider" ? "provider" : "requester";
    kind = newKind || "servico";
    opener = from || document.activeElement;
    dialog.hidden = false;
    document.body.classList.add("compose-locked");
    render();
    const active = tabs.querySelector(".compose-tab.is-active");
    if (active) active.focus();
  }

  function close() {
    if (dialog.hidden) return;
    restore();
    dialog.hidden = true;
    document.body.classList.remove("compose-locked");
    if (typeof window.reloadHomeFeed === "function") window.reloadHomeFeed();
    if (opener && typeof opener.focus === "function") opener.focus();
  }

  document.addEventListener("click", (event) => {
    const btn = event.target.closest(".compose-open");
    if (btn) {
      open(btn.dataset.composeMode, btn.dataset.composeKind || "servico", btn);
      return;
    }
    if (dialog.hidden) return;
    if (event.target === dialog || event.target.closest("#compose-close")) close();
  });

  tabs.addEventListener("click", (event) => {
    const tab = event.target.closest(".compose-tab");
    if (!tab || tab.dataset.kind === kind) return;
    kind = tab.dataset.kind;
    render();
  });

  // Esc fecha; Tab fica preso dentro do diálogo enquanto ele está aberto.
  document.addEventListener("keydown", (event) => {
    if (dialog.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea')].filter(
      (el) => !el.disabled && !el.closest("[hidden]") && el.offsetParent !== null
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.openCompose = open;
})();
