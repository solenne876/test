const app = document.getElementById("app");
const stepperEl = document.getElementById("stepper");
const pageTitle = document.getElementById("pageTitle");

const slug = location.pathname.replace(/^\/q\/?/, "").split("/")[0];
const STORAGE_KEY = `kleiomne_questionnaire_${slug}`;

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- État ----------

const state = {
  bank: null,
  lieu: null,
  step: 0,
  answers: {
    lieu_nom: "",
    general: {},
    type_lieu: null,
    lieu: {},
    formatsStandard: [], // codes cochés, dans l'ordre de coche
    formats: {}, // code -> {id: valeur}
    formatsException: [], // codes F-BAL/F-PON cochés
    contactException: {}, // code -> téléphone
  },
};

let ALL_QUESTIONS_BY_ID = {};

function buildAllQuestionsIndex(bank) {
  const map = {};
  for (const group of bank.GENERAL_GROUPS) for (const q of group.questions) map[q.id] = q;
  for (const block of Object.values(bank.LIEU_BLOCKS)) for (const q of block.questions) map[q.id] = q;
  for (const block of Object.values(bank.FORMAT_BLOCKS)) for (const q of block.questions) map[q.id] = q;
  ALL_QUESTIONS_BY_ID = map;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ step: state.step, answers: state.answers }));
  } catch {
    // stockage indisponible (navigation privée, etc.) — on continue sans persistance
  }
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.answers) {
      state.step = parsed.step || 0;
      Object.assign(state.answers, parsed.answers);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

// ---------- Rendu d'une question ----------

function prefillFor(id) {
  const prefill = state.lieu.questionnaire_prefill || {};
  return prefill[id] || null;
}

function renderQuestion(q, answersObj, { nested = false, forceOpen = false } = {}) {
  const wrapper = el(`<div class="question${nested ? " nested" : ""}" data-qid="${q.id}"></div>`);
  const pf = prefillFor(q.id);

  if (pf && !forceOpen) {
    // Vue préremplie compacte : la mention explicite du caractère déduit est
    // toujours visible, pas présentée comme une question neutre.
    const collapsed = el(`
      <div class="prefill-collapsed">
        <div>
          <div class="qtext">${escapeHtml(q.text)}</div>
          <div class="val"><b>D'après nos recherches${pf.source ? " (" + escapeHtml(pf.source) + ")" : ""}</b> — ${escapeHtml(answersObj[q.id] ?? pf.valeur)} <em>(${escapeHtml(pf.statut)}, corrigez si besoin)</em></div>
        </div>
        <button type="button" data-action="edit-prefill">Corriger</button>
      </div>
    `);
    collapsed.querySelector("[data-action=edit-prefill]").addEventListener("click", () => {
      wrapper.dataset.forceOpen = "1";
      rerenderQuestionInPlace(wrapper, q, answersObj, nested);
    });
    wrapper.appendChild(collapsed);
    return wrapper;
  }

  if (pf) wrapper.dataset.forceOpen = "1";
  const textEl = el(`<div class="qtext">${escapeHtml(q.text)}</div>`);
  wrapper.appendChild(textEl);
  if (pf) {
    wrapper.appendChild(
      el(`<div class="prefill-note">D'après nos recherches${pf.source ? " (" + escapeHtml(pf.source) + ")" : ""} — <b>${escapeHtml(pf.statut)}</b> : corrigez si besoin.</div>`)
    );
  }

  if (q.type === "QO") {
    const ta = el(`<textarea placeholder="Votre réponse…">${escapeHtml(answersObj[q.id] ?? "")}</textarea>`);
    ta.addEventListener("input", () => {
      answersObj[q.id] = ta.value;
      persist();
    });
    wrapper.appendChild(ta);
  } else {
    const row = el(`<div class="pill-row"></div>`);
    for (const opt of q.options) {
      const btn = el(`<button type="button" class="pill-btn${answersObj[q.id] === opt ? " selected" : ""}">${escapeHtml(opt)}</button>`);
      btn.addEventListener("click", () => {
        answersObj[q.id] = opt;
        persist();
        rerenderQuestionInPlace(wrapper, q, answersObj, nested);
      });
      row.appendChild(btn);
    }
    wrapper.appendChild(row);
  }

  return wrapper;
}

function rerenderQuestionInPlace(oldWrapper, q, answersObj, nested) {
  const forceOpen = oldWrapper.dataset.forceOpen === "1";
  const fresh = renderQuestionWithReveals(q, answersObj, nested, forceOpen);
  oldWrapper.replaceWith(fresh);
}

function renderQuestionWithReveals(q, answersObj, nested = false, forceOpen = false) {
  const wrapper = renderQuestion(q, answersObj, { nested, forceOpen });
  const rules = state.bank.REVEALS.filter((r) => r.from === q.id);
  for (const rule of rules) {
    if (answersObj[q.id] === rule.value) {
      for (const revId of rule.reveal) {
        const revQ = ALL_QUESTIONS_BY_ID[revId];
        if (revQ) wrapper.appendChild(renderQuestionWithReveals(revQ, answersObj, true));
      }
    } else {
      for (const revId of rule.reveal) {
        if (revId in answersObj) delete answersObj[revId];
      }
    }
  }
  return wrapper;
}

function applyPrefillIfFirstLoad(questions, answersObj) {
  if (!state.firstLoad) return;
  for (const q of questions) {
    const pf = prefillFor(q.id);
    if (pf && answersObj[q.id] === undefined) answersObj[q.id] = pf.valeur;
  }
}

function renderBlockQuestions(container, questions, answersObj) {
  applyPrefillIfFirstLoad(questions, answersObj);
  const revealedIds = new Set(state.bank.REVEALS.flatMap((r) => r.reveal));
  const topLevel = questions.filter((q) => !revealedIds.has(q.id));
  for (const q of topLevel) {
    container.appendChild(renderQuestionWithReveals(q, answersObj, false));
  }
}

// ---------- Étapes ----------

function renderStepper() {
  stepperEl.innerHTML = "";
  for (let i = 0; i <= 4; i++) {
    const dot = el(`<div class="dot${i === state.step ? " active" : i < state.step ? " done" : ""}"></div>`);
    stepperEl.appendChild(dot);
  }
}

function navRow(onPrev, onNext, nextLabel = "Suivant") {
  const row = el(`
    <div class="nav-row">
      <div>${onPrev ? `<button type="button" class="secondary" id="navPrev">Précédent</button>` : ""}</div>
      <div style="display:flex;gap:10px;align-items:center">
        <button type="button" class="link-btn" id="navRestart">Recommencer</button>
        <button type="button" class="primary" id="navNext">${nextLabel}</button>
      </div>
    </div>
  `);
  if (onPrev) row.querySelector("#navPrev").addEventListener("click", onPrev);
  row.querySelector("#navNext").addEventListener("click", onNext);
  row.querySelector("#navRestart").addEventListener("click", () => {
    if (!confirm("Effacer toutes vos réponses et recommencer le questionnaire ?")) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    location.reload();
  });
  return row;
}

function renderStep0() {
  const card = el(`
    <section class="card">
      <h2>Votre lieu</h2>
      <p class="intro">Vérifiez le nom de votre lieu avant de commencer.</p>
      <div class="question">
        <input type="text" id="lieuNomInput" value="${escapeHtml(state.answers.lieu_nom)}" style="width:100%;background:var(--navy-3);border:1px solid var(--hairline);color:var(--ivory);padding:10px;border-radius:6px;font-family:inherit;font-size:17px">
      </div>
    </section>
  `);
  card.querySelector("#lieuNomInput").addEventListener("input", (e) => {
    state.answers.lieu_nom = e.target.value;
    persist();
  });
  app.appendChild(card);
  app.appendChild(navRow(null, () => { state.step = 1; persist(); render(); }));
}

function renderStep1() {
  const card = el(`<section class="card"><h2>À propos de votre lieu</h2><p class="intro">Toutes ces questions sont optionnelles — répondez à ce qui vous semble pertinent.</p></section>`);
  applyPrefillIfFirstLoad(state.bank.GENERAL_GROUPS.flatMap((g) => g.questions), state.answers.general);
  for (const group of state.bank.GENERAL_GROUPS) {
    card.appendChild(el(`<div class="group-title">${escapeHtml(group.subtitle)}</div>`));
    for (const q of group.questions) {
      card.appendChild(renderQuestionWithReveals(q, state.answers.general, false));
    }
  }
  app.appendChild(card);
  app.appendChild(navRow(() => { state.step = 0; render(); }, () => { state.step = 2; persist(); render(); }));
}

function renderStep2() {
  const card = el(`
    <section class="card">
      <h2>Type de lieu</h2>
      <div class="radio-row" id="typeLieuRow"></div>
      <div id="lieuBlockHost" style="margin-top:18px"></div>
    </section>
  `);
  const row = card.querySelector("#typeLieuRow");
  for (const [key, block] of Object.entries(state.bank.LIEU_BLOCKS)) {
    const label = el(`<label><input type="radio" name="typeLieu" value="${key}" ${state.answers.type_lieu === key ? "checked" : ""}> ${escapeHtml(block.label)}</label>`);
    label.querySelector("input").addEventListener("change", () => {
      if (state.answers.type_lieu !== key) {
        state.answers.lieu = {}; // on vide les réponses du bloc précédent, jamais les deux superposés
        state.answers.type_lieu = key;
        persist();
        render();
      }
    });
    row.appendChild(label);
  }
  const host = card.querySelector("#lieuBlockHost");
  if (state.answers.type_lieu) {
    const block = state.bank.LIEU_BLOCKS[state.answers.type_lieu];
    renderBlockQuestions(host, block.questions, state.answers.lieu);
  }
  app.appendChild(card);
  app.appendChild(navRow(() => { state.step = 1; render(); }, () => { state.step = 3; persist(); render(); }));
}

function g15Answer() {
  return state.answers.general["G15"];
}

function renderStep3() {
  const card = el(`
    <section class="card">
      <h2>Formats envisagés</h2>
      <p class="intro">Cochez un ou plusieurs formats — chacun ouvre ses propres questions.</p>
      <div class="checkbox-row" id="formatsRow"></div>
      <div id="formatsHost" style="margin-top:10px"></div>
    </section>
  `);
  const row = card.querySelector("#formatsRow");
  const standardCodes = Object.keys(state.bank.FORMAT_BLOCKS);
  const exceptionCodes = Object.keys(state.bank.FORMAT_EXCEPTIONS);

  function isChecked(code) {
    return state.answers.formatsStandard.includes(code) || state.answers.formatsException.includes(code);
  }
  function toggle(code, isException) {
    const listKey = isException ? "formatsException" : "formatsStandard";
    const list = state.answers[listKey];
    const idx = list.indexOf(code);
    if (idx === -1) {
      list.push(code);
    } else {
      list.splice(idx, 1);
      if (isException) delete state.answers.contactException[code];
      else delete state.answers.formats[code];
    }
    persist();
    render();
  }

  for (const code of standardCodes) {
    const block = state.bank.FORMAT_BLOCKS[code];
    const label = el(`<label><input type="checkbox" ${isChecked(code) ? "checked" : ""}> ${escapeHtml(block.label)}</label>`);
    label.querySelector("input").addEventListener("change", () => toggle(code, false));
    row.appendChild(label);
    if (code === "F-VIS" && state.bank.G15_WARNING && g15Answer() === state.bank.G15_WARNING.triggerValue) {
      row.appendChild(el(`<div class="g15-warning">⚠ ${escapeHtml(state.bank.G15_WARNING.message)}</div>`));
    }
  }
  for (const code of exceptionCodes) {
    const block = state.bank.FORMAT_EXCEPTIONS[code];
    const label = el(`<label><input type="checkbox" ${isChecked(code) ? "checked" : ""}> ${escapeHtml(block.label)}</label>`);
    label.querySelector("input").addEventListener("change", () => toggle(code, true));
    row.appendChild(label);
  }

  const host = card.querySelector("#formatsHost");
  for (const code of state.answers.formatsStandard) {
    const block = state.bank.FORMAT_BLOCKS[code];
    if (!block) continue;
    host.appendChild(el(`<div class="group-title">${escapeHtml(block.label)}</div>`));
    if (!state.answers.formats[code]) state.answers.formats[code] = {};
    renderBlockQuestions(host, block.questions, state.answers.formats[code]);
  }
  for (const code of state.answers.formatsException) {
    const block = state.bank.FORMAT_EXCEPTIONS[code];
    if (!block) continue;
    const box = el(`
      <div class="exception-box">
        <p><b>${escapeHtml(block.label)}</b> — ${escapeHtml(block.encart)}</p>
        ${block.contactField ? `<input type="tel" placeholder="Numéro de téléphone (optionnel)" value="${escapeHtml(state.answers.contactException[code] || "")}">` : ""}
      </div>
    `);
    if (block.contactField) {
      box.querySelector("input").addEventListener("input", (e) => {
        state.answers.contactException[code] = e.target.value;
        persist();
      });
    }
    host.appendChild(box);
  }

  app.appendChild(card);
  app.appendChild(navRow(() => { state.step = 2; render(); }, () => { state.step = 4; persist(); render(); }, "Voir le récapitulatif"));
}

function buildSubmissionPayload() {
  const reponses_formats = {};
  for (const code of state.answers.formatsStandard) {
    reponses_formats[code] = state.answers.formats[code] || {};
  }
  return {
    lieu_nom: state.answers.lieu_nom || state.lieu.nom,
    type_lieu: state.answers.type_lieu || null,
    reponses_general: state.answers.general,
    reponses_lieu: state.answers.lieu,
    formats_selectionnes_standard: state.answers.formatsStandard,
    reponses_formats,
    formats_exception_selectionnes: state.answers.formatsException,
    contact_exception: state.answers.contactException,
    avertissements_actifs:
      g15Answer() === "Oui" && state.answers.formatsStandard.includes("F-VIS")
        ? ["G15=Oui → F-VIS à valider"]
        : [],
  };
}

function buildMailBody(payload) {
  const lines = [`Réponses au questionnaire découverte — ${payload.lieu_nom}`, ""];
  lines.push("— Général —");
  for (const [id, val] of Object.entries(payload.reponses_general)) lines.push(`${id}: ${val}`);
  if (payload.type_lieu) {
    lines.push("", `— ${payload.type_lieu} —`);
    for (const [id, val] of Object.entries(payload.reponses_lieu)) lines.push(`${id}: ${val}`);
  }
  for (const code of payload.formats_selectionnes_standard) {
    lines.push("", `— ${code} —`);
    for (const [id, val] of Object.entries(payload.reponses_formats[code] || {})) lines.push(`${id}: ${val}`);
  }
  for (const code of payload.formats_exception_selectionnes) {
    lines.push("", `— ${code} (hors questionnaire écrit) —`);
    if (payload.contact_exception[code]) lines.push(`Téléphone : ${payload.contact_exception[code]}`);
  }
  return lines.join("\n");
}

function renderStep4() {
  const payload = buildSubmissionPayload();
  const card = el(`<section class="card"><h2>Récapitulatif</h2><p class="intro">Relisez vos réponses avant l'envoi.</p></section>`);

  const genBlock = el(`<div class="recap-block"><h3>Général</h3></div>`);
  for (const [id, val] of Object.entries(payload.reponses_general)) {
    if (val === undefined || val === "") continue;
    genBlock.appendChild(el(`<div class="recap-item"><b>${escapeHtml(ALL_QUESTIONS_BY_ID[id]?.text || id)}</b><br>${escapeHtml(val)}</div>`));
  }
  card.appendChild(genBlock);

  if (payload.type_lieu) {
    const lieuBlock = el(`<div class="recap-block"><h3>${escapeHtml(state.bank.LIEU_BLOCKS[payload.type_lieu].label)}</h3></div>`);
    for (const [id, val] of Object.entries(payload.reponses_lieu)) {
      if (val === undefined || val === "") continue;
      lieuBlock.appendChild(el(`<div class="recap-item"><b>${escapeHtml(ALL_QUESTIONS_BY_ID[id]?.text || id)}</b><br>${escapeHtml(val)}</div>`));
    }
    card.appendChild(lieuBlock);
  }

  for (const code of payload.formats_selectionnes_standard) {
    const fmtBlock = el(`<div class="recap-block"><h3>${escapeHtml(state.bank.FORMAT_BLOCKS[code].label)}</h3></div>`);
    for (const [id, val] of Object.entries(payload.reponses_formats[code] || {})) {
      if (val === undefined || val === "") continue;
      fmtBlock.appendChild(el(`<div class="recap-item"><b>${escapeHtml(ALL_QUESTIONS_BY_ID[id]?.text || id)}</b><br>${escapeHtml(val)}</div>`));
    }
    card.appendChild(fmtBlock);
  }

  for (const code of payload.formats_exception_selectionnes) {
    const block = state.bank.FORMAT_EXCEPTIONS[code];
    card.appendChild(
      el(`<div class="recap-block"><h3>${escapeHtml(block.label)}</h3><div class="recap-item">${escapeHtml(block.encart)}${payload.contact_exception[code] ? " — Téléphone : " + escapeHtml(payload.contact_exception[code]) : ""}</div></div>`)
    );
  }

  app.appendChild(card);

  const actionsCard = el(`<section class="card"><div id="sendStatus"></div><div class="footer-actions"></div></section>`);
  const actionsRow = actionsCard.querySelector(".footer-actions");

  const sendBtn = el(`<button type="button" class="primary">Envoyer mes réponses à Kleiomné</button>`);
  sendBtn.addEventListener("click", async () => {
    sendBtn.disabled = true;
    sendBtn.textContent = "Envoi en cours…";
    try {
      const res = await fetch(`/api/public/questionnaire/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Erreur serveur");
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      app.innerHTML = "";
      stepperEl.innerHTML = "";
      app.appendChild(el(`<div class="confirm-banner"><h2>Merci !</h2><p>Vos réponses ont bien été transmises à Kleiomné.</p></div>`));
    } catch (e) {
      actionsCard.querySelector("#sendStatus").textContent = "Erreur lors de l'envoi : " + e.message;
      sendBtn.disabled = false;
      sendBtn.textContent = "Envoyer mes réponses à Kleiomné";
    }
  });
  actionsRow.appendChild(sendBtn);

  const mailBtn = el(`<a class="secondary" style="text-decoration:none;display:inline-block;text-align:center" href="mailto:?subject=${encodeURIComponent("Questionnaire découverte — " + payload.lieu_nom)}&body=${encodeURIComponent(buildMailBody(payload))}">Envoyer par email</a>`);
  actionsRow.appendChild(mailBtn);

  app.appendChild(actionsCard);
  app.appendChild(navRow(() => { state.step = 3; render(); }, null));
  // pas de bouton "suivant" sur la dernière étape — on retire celui ajouté par navRow
  app.lastElementChild.querySelector("#navNext").remove();
}

// ---------- Rendu principal ----------

function render() {
  app.innerHTML = "";
  renderStepper();
  [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4][state.step]();
}

// ---------- Init ----------

async function init() {
  try {
    const [bankRes, lieuRes] = await Promise.all([
      fetch("/api/public/question-bank").then((r) => r.json()),
      fetch(`/api/public/questionnaire/${slug}`).then((r) => {
        if (!r.ok) throw new Error("Lien introuvable ou expiré.");
        return r.json();
      }),
    ]);
    state.bank = bankRes;
    state.lieu = lieuRes;
    buildAllQuestionsIndex(bankRes);
    pageTitle.textContent = `Questionnaire découverte — ${lieuRes.nom}`;

    const hadPersisted = loadPersisted();
    state.firstLoad = !hadPersisted;
    if (!hadPersisted) {
      state.answers.lieu_nom = lieuRes.nom || "";
    }
    render();
  } catch (e) {
    app.innerHTML = "";
    app.appendChild(el(`<div class="empty-state">${escapeHtml(e.message || "Une erreur est survenue.")}</div>`));
  }
}

init();
