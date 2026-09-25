// "Meu perfil": foto, nome, WhatsApp com verificação por código, tipo de uso,
// dados de motorista/horários (o formulário que já existe é movido pra dentro)
// e um resumo da atividade. Carregado depois de app.js — usa
// currentUserProfile, renderLoggedInUser, ownProviders/ownGroups/ownRequests,
// profileEditForm/profileEditPanel, openProfileEditPanel e escapeHtml dele.

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const dialog = $("profile-dialog");
  if (!dialog) return;

  const status = $("pf-status");
  let opener = null;
  let verificationAvailable = null; // true/false depois de ler /api/auth/config
  let movedForm = null; // { el, parent, next }

  function say(text, kind) {
    status.textContent = text || "";
    status.className = `post-status pf-status${kind === "error" ? " post-status--error" : kind === "ok" ? " post-status--ok" : ""}`;
  }

  function initialsOf(name) {
    return String(name || "?")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
  }

  async function api(method, url, body) {
    const opts = { method, headers: {} };
    if (body instanceof FormData) opts.body = body;
    else if (body) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    let data = {};
    try {
      data = await res.json();
    } catch (_) {
      // corpo vazio ou não-JSON
    }
    return { ok: res.ok, status: res.status, data };
  }

  // Depois de qualquer mudança: atualiza o usuário global, o cabeçalho e o diálogo.
  function applyUser(user) {
    renderLoggedInUser(user, ownProviders, ownGroups, ownRequests);
    fill();
  }

  // ── preencher ──────────────────────────────────────────────────────────
  function fill() {
    const u = currentUserProfile;
    if (!u) return;
    const avatar = $("pf-avatar");
    if (u.picture) {
      avatar.style.backgroundImage = `url("${String(u.picture).replace(/"/g, "%22")}")`;
      avatar.textContent = "";
      avatar.classList.add("has-photo");
    } else {
      avatar.style.backgroundImage = "";
      avatar.textContent = initialsOf(u.name);
      avatar.classList.remove("has-photo");
    }
    $("pf-photo-remove").hidden = !u.picture;
    $("pf-name").value = u.name || "";
    $("pf-email").textContent = u.email || "";
    $("pf-email").hidden = !u.email;
    $("pf-whatsapp").value = u.whatsapp || "";
    $("pf-tipo").value = u.tipoUso || "";
    renderWhatsappState();
    renderActivity();
    // mantém o formulário antigo (motorista/horários) em sincronia; o painel do cabeçalho fica fechado
    if (typeof openProfileEditPanel === "function") {
      openProfileEditPanel();
      profileEditPanel.hidden = true;
    }
  }

  function renderWhatsappState() {
    const u = currentUserProfile;
    const badge = $("pf-wa-badge");
    const send = $("pf-wa-send");
    const note = $("pf-wa-note");
    const codeRow = $("pf-wa-code-row");
    const hasNumber = Boolean(u.whatsapp && u.whatsapp.trim());
    if (u.whatsappVerified) {
      badge.textContent = "✓ Verificado";
      badge.className = "pf-badge pf-badge--ok";
      send.hidden = true;
      codeRow.hidden = true;
      note.textContent = "Este número foi confirmado por código no WhatsApp. Se você trocar o número, será preciso verificar de novo.";
      return;
    }
    badge.textContent = hasNumber ? "Não verificado" : "Sem número";
    badge.className = "pf-badge pf-badge--warn";
    send.hidden = false;
    if (verificationAvailable === false) {
      send.disabled = true;
      note.textContent = "A verificação por WhatsApp ainda não está ativa neste site. Seu número continua salvo e é usado normalmente nos pedidos.";
    } else {
      send.disabled = !hasNumber;
      note.textContent = hasNumber
        ? "Confirme que o número é seu: vamos mandar um código de 6 dígitos pelo WhatsApp."
        : "Salve seu número de WhatsApp (com DDD) pra poder verificar.";
    }
  }

  function renderActivity() {
    const box = $("pf-activity");
    const part = (title, items, render) =>
      `<div class="pf-act-block"><strong>${title}</strong>${
        items.length ? `<ul class="pf-act-list">${items.slice(0, 5).map(render).join("")}</ul>` : '<p class="pf-act-empty">Nada por aqui ainda.</p>'
      }</div>`;
    box.innerHTML =
      part("Meus perfis", ownProviders, (p) => `<li><span>${escapeHtml(p.name)} <em>· ${escapeHtml(p.service)}</em></span><a href="/prestador/${encodeURIComponent(p.slug)}" target="_blank" rel="noopener noreferrer">Ver</a></li>`) +
      part("Meus grupos", ownGroups, (g) => `<li><span>${escapeHtml(g.title)} <em>· ${escapeHtml(g.categoryLabel || g.category)}</em></span></li>`) +
      part("Meus pedidos", ownRequests, (r) => `<li><span>${escapeHtml(r.title)} <em>· ${escapeHtml(r.status)}</em></span></li>`);
  }

  // ── ações ──────────────────────────────────────────────────────────────
  async function saveField(payload, okMessage) {
    say("Salvando…");
    const r = await api("PUT", "/api/auth/profile", payload);
    if (!r.ok) return say(r.data.error || "Não consegui salvar.", "error");
    applyUser(r.data.user);
    say(okMessage, "ok");
  }

  $("pf-name-save").addEventListener("click", () => saveField({ name: $("pf-name").value }, "Nome salvo."));
  $("pf-tipo").addEventListener("change", () => saveField({ tipoUso: $("pf-tipo").value || null }, "Preferência salva."));
  $("pf-whatsapp-save").addEventListener("click", () => {
    const value = $("pf-whatsapp").value.trim();
    if (!value) return say("Digite seu número de WhatsApp.", "error");
    const changed = value !== (currentUserProfile.whatsapp || "");
    saveField({ whatsapp: value }, changed ? "Número salvo. Verifique-o pra confirmar que é seu." : "Número salvo.");
    $("pf-wa-code-row").hidden = true;
  });

  $("pf-photo-input").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return say("Use uma imagem png, jpg ou webp.", "error");
    if (file.size > 8 * 1024 * 1024) return say("A foto pode ter no máximo 8MB.", "error");
    say("Enviando foto…");
    const form = new FormData();
    form.append("photo", file);
    const r = await api("POST", "/api/auth/photo", form);
    if (!r.ok) return say(r.data.error || "Não consegui enviar a foto.", "error");
    applyUser(r.data.user);
    say("Foto atualizada.", "ok");
  });

  $("pf-photo-remove").addEventListener("click", async () => {
    const r = await api("DELETE", "/api/auth/photo");
    if (!r.ok) return say(r.data.error || "Não consegui remover a foto.", "error");
    applyUser(r.data.user);
    say("Foto removida.", "ok");
  });

  $("pf-wa-send").addEventListener("click", async () => {
    const btn = $("pf-wa-send");
    btn.disabled = true;
    say("Enviando o código…");
    const r = await api("POST", "/api/auth/whatsapp/code");
    btn.disabled = false;
    if (!r.ok) {
      if (r.data.code === "unavailable") {
        verificationAvailable = false;
        renderWhatsappState();
      }
      return say(r.data.error || "Não consegui enviar o código.", "error");
    }
    if (r.data.alreadyVerified) return applyUser(r.data.user);
    $("pf-wa-code-row").hidden = false;
    $("pf-wa-code").value = "";
    $("pf-wa-code").focus();
    say(`Código enviado pro WhatsApp ${r.data.maskedNumber}. Ele vale por 10 minutos.`, "ok");
    if (r.data.devCode) $("pf-wa-code").dataset.devCode = r.data.devCode; // só no servidor de teste
  });

  $("pf-wa-confirm").addEventListener("click", async () => {
    const code = $("pf-wa-code").value.replace(/\D/g, "");
    if (code.length !== 6) return say("Digite o código de 6 dígitos.", "error");
    const r = await api("POST", "/api/auth/whatsapp/verify", { code });
    if (!r.ok) {
      const left = typeof r.data.attemptsLeft === "number" ? ` (${r.data.attemptsLeft} tentativas restantes)` : "";
      return say((r.data.error || "Código inválido.") + left, "error");
    }
    $("pf-wa-code-row").hidden = true;
    applyUser(r.data.user);
    say("Número verificado!", "ok");
  });

  $("pf-logout").addEventListener("click", () => {
    fetch("/api/auth/logout", { method: "POST" }).then(() => window.location.reload());
  });

  // ── abrir / fechar ─────────────────────────────────────────────────────
  async function loadAvailability() {
    if (verificationAvailable !== null) return;
    try {
      const cfg = await (await fetch("/api/auth/config")).json();
      verificationAvailable = Boolean(cfg.whatsappVerification);
    } catch (_) {
      verificationAvailable = false;
    }
  }

  async function open(from) {
    if (!currentUserProfile) return false;
    opener = from || document.activeElement;
    await loadAvailability();
    // formulário de motorista/horários: o mesmo de "Meus dados", movido pra cá
    const form = profileEditForm;
    movedForm = { el: form, parent: form.parentElement, next: form.nextSibling };
    $("pf-more-slot").appendChild(form);
    form.classList.add("pf-embedded");
    say("");
    dialog.hidden = false;
    document.body.classList.add("compose-locked");
    fill();
    $("profile-close").focus();
    return true;
  }

  function close() {
    if (dialog.hidden) return;
    if (movedForm) {
      movedForm.el.classList.remove("pf-embedded");
      movedForm.parent.insertBefore(movedForm.el, movedForm.next && movedForm.next.parentElement === movedForm.parent ? movedForm.next : null);
      movedForm = null;
    }
    dialog.hidden = true;
    document.body.classList.remove("compose-locked");
    if (opener && typeof opener.focus === "function") opener.focus();
  }

  document.addEventListener("click", (event) => {
    if (dialog.hidden) return;
    if (event.target === dialog || event.target.closest("#profile-close")) close();
  });

  document.addEventListener("keydown", (event) => {
    if (dialog.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, summary')].filter(
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

  window.openProfile = open;
})();
