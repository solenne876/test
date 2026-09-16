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
// La sélection des questions (type de lieu, formats couverts, IDs retenus)
// est désormais figée par Solenne côté interne (curation + validation) avant
// que ce lien ne soit envoyé : le prospect répond au questionnaire proposé,
// il ne choisit plus lui-même son type de lieu ni ses formats.

const state = {
  bank: null, // FORMAT_BLOCKS / LIEU_BLOCKS / FORMAT_EXCEPTIONS / REVEALS / G15_WARNING (labels + branchement)
  lieu: null, // réponse de /api/public/questionnaire/:slug (curatée, incluses uniquement)
  step: 0,
  firstLoad: true,
  answers: {
    lieu_nom: "",
    general: {},
    lieu: {},
    formats: {}, // code -> { id: valeur }
    contactException: {}, // code -> téléphone laissé (formats hors questionnaire écrit)
  },
};

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ step: state.step, answers: state.answers }));
  } catch {
    // stockage indisponible (navigation privée, etc.) - on continue sans persistance
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
  const prefill = state.lieu.prefill || {};
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
          <div class="val"><b>D'après nos recherches${pf.source ? " (" + escapeHtml(pf.source) + ")" : ""}</b> - ${escapeHtml(answersObj[q.id] ?? pf.valeur)} <em>(${escapeHtml(pf.statut)}, corrigez si besoin)</em></div>
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
      el(`<div class="prefill-note">D'après nos recherches${pf.source ? " (" + escapeHtml(pf.source) + ")" : ""} - <b>${escapeHtml(pf.statut)}</b> : corrigez si besoin.</div>`)
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
    for (const opt of q.options || []) {
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
  const fresh = renderQuestionWithReveals(q, answersObj, nested, forceOpen, oldWrapper.__idx);
  oldWrapper.replaceWith(fresh);
}

// `idx` : map id -> question curatée, scopé à la liste en cours de rendu
// (général, lieu, ou un format donné) - permet de savoir si une question
// révélée par REVEALS a bien été retenue par Solenne dans cette liste.
function renderQuestionWithReveals(q, answersObj, nested = false, forceOpen = false, idx) {
  const wrapper = renderQuestion(q, answersObj, { nested, forceOpen });
  wrapper.__idx = idx;
  const rules = state.bank.REVEALS.filter((r) => r.from === q.id);
  for (const rule of rules) {
    if (answersObj[q.id] === rule.value) {
      for (const revId of rule.reveal) {
        const revQ = idx[revId];
        if (revQ) wrapper.appendChild(renderQuestionWithReveals(revQ, answersObj, true, false, idx));
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

function renderCuratedList(container, questions, answersObj) {
  if (!questions || questions.length === 0) return;
  applyPrefillIfFirstLoad(questions, answersObj);
  const idx = {};
  for (const q of questions) idx[q.id] = q;
  const revealedIds = new Set(state.bank.REVEALS.flatMap((r) => r.reveal));
  const topLevel = questions.filter((q) => {
    if (!revealedIds.has(q.id)) return true;
    const rule = state.bank.REVEALS.find((r) => r.reveal.includes(q.id));
    return !idx[rule.from]; // pas de déclencheur retenu dans cette liste -> affichage direct
  });
  for (const q of topLevel) {
    container.appendChild(renderQuestionWithReveals(q, answersObj, false, false, idx));
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
        ${onNext ? `<button type="button" class="primary" id="navNext">${nextLabel}</button>` : ""}
      </div>
    </div>
  `);
  if (onPrev) row.querySelector("#navPrev").addEventListener("click", onPrev);
  if (onNext) row.querySelector("#navNext").addEventListener("click", onNext);
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
  const card = el(`<section class="card"><h2>À propos de votre lieu</h2><p class="intro">Toutes ces questions sont optionnelles - répondez à ce qui vous semble pertinent.</p></section>`);
  renderCuratedList(card, state.lieu.questions_general, state.answers.general);
  app.appendChild(card);
  app.appendChild(navRow(() => { state.step = 0; render(); }, () => { state.step = 2; persist(); render(); }));
}

function renderStep2() {
  const typeLabel = state.lieu.type_lieu && state.bank.LIEU_BLOCKS[state.lieu.type_lieu]
    ? state.bank.LIEU_BLOCKS[state.lieu.type_lieu].label
    : "Votre lieu";
  const card = el(`<section class="card"><h2>${escapeHtml(typeLabel)}</h2></section>`);
  renderCuratedList(card, state.lieu.questions_lieu, state.answers.lieu);
  if (!state.lieu.questions_lieu || state.lieu.questions_lieu.length === 0) {
    card.appendChild(el(`<p class="intro">Rien à préciser ici pour ce lieu.</p>`));
  }
  app.appendChild(card);
  app.appendChild(navRow(() => { state.step = 1; render(); }, () => { state.step = 3; persist(); render(); }));
}

function g15Answer() {
  return state.answers.general["G15"];
}

function renderStep3() {
  const formatCodes = Object.keys(state.lieu.formats || {});
  const exceptionCodes = state.lieu.formats_exception || [];

  if (formatCodes.length === 0 && exceptionCodes.length === 0) {
    app.appendChild(el(`<section class="card"><h2>Formats envisagés</h2><p class="intro">Rien à préciser ici.</p></section>`));
    app.appendChild(navRow(() => { state.step = 2; render(); }, () => { state.step = 4; persist(); render(); }, "Voir le récapitulatif"));
    return;
  }

  for (const code of formatCodes) {
    const label = state.bank.FORMAT_BLOCKS[code] ? state.bank.FORMAT_BLOCKS[code].label : code;
    const card = el(`<section class="card"><h2>${escapeHtml(label)}</h2></section>`);
    if (code === "F-VIS" && state.bank.G15_WARNING && g15Answer() === state.bank.G15_WARNING.triggerValue) {
      card.appendChild(el(`<div class="g15-warning" style="margin-left:0">⚠ ${escapeHtml(state.bank.G15_WARNING.message)}</div>`));
    }
    if (!state.answers.formats[code]) state.answers.formats[code] = {};
    renderCuratedList(card, state.lieu.formats[code], state.answers.formats[code]);
    app.appendChild(card);
  }

  for (const code of exceptionCodes) {
    const block = state.bank.FORMAT_EXCEPTIONS[code];
    if (!block) continue;
    const box = el(`
      <section class="card">
        <div class="exception-box" style="margin:0">
          <p><b>${escapeHtml(block.label)}</b> - ${escapeHtml(block.encart)}</p>
          ${block.contactField ? `<input type="tel" placeholder="Numéro de téléphone (optionnel)" value="${escapeHtml(state.answers.contactException[code] || "")}">` : ""}
        </div>
      </section>
    `);
    if (block.contactField) {
      box.querySelector("input").addEventListener("input", (e) => {
        state.answers.contactException[code] = e.target.value;
        persist();
      });
    }
    app.appendChild(box);
  }

  app.appendChild(navRow(() => { state.step = 2; render(); }, () => { state.step = 4; persist(); render(); }, "Voir le récapitulatif"));
}

function buildSubmissionPayload() {
  const formatCodes = Object.keys(state.lieu.formats || {});
  const reponses_formats = {};
  for (const code of formatCodes) reponses_formats[code] = state.answers.formats[code] || {};
  return {
    lieu_nom: state.answers.lieu_nom || state.lieu.nom,
    type_lieu: state.lieu.type_lieu || null,
    reponses_general: state.answers.general,
    reponses_lieu: state.answers.lieu,
    formats_selectionnes_standard: formatCodes,
    reponses_formats,
    formats_exception_selectionnes: state.lieu.formats_exception || [],
    contact_exception: state.answers.contactException,
    avertissements_actifs:
      g15Answer() === "Oui" && formatCodes.includes("F-VIS")
        ? ["G15=Oui -> F-VIS à valider"]
        : [],
  };
}

function buildMailBody(payload) {
  const lines = [`Réponses au questionnaire découverte - ${payload.lieu_nom}`, ""];
  lines.push("- Général -");
  for (const [id, val] of Object.entries(payload.reponses_general)) lines.push(`${id}: ${val}`);
  if (payload.type_lieu) {
    lines.push("", `- ${payload.type_lieu} -`);
    for (const [id, val] of Object.entries(payload.reponses_lieu)) lines.push(`${id}: ${val}`);
  }
  for (const code of payload.formats_selectionnes_standard) {
    lines.push("", `- ${code} -`);
    for (const [id, val] of Object.entries(payload.reponses_formats[code] || {})) lines.push(`${id}: ${val}`);
  }
  for (const code of payload.formats_exception_selectionnes) {
    lines.push("", `- ${code} (hors questionnaire écrit) -`);
    if (payload.contact_exception[code]) lines.push(`Téléphone : ${payload.contact_exception[code]}`);
  }
  return lines.join("\n");
}

function renderStep4() {
  const payload = buildSubmissionPayload();
  const card = el(`<section class="card"><h2>Récapitulatif</h2><p class="intro">Relisez vos réponses avant l'envoi.</p></section>`);

  function block(title, questions, values) {
    if (!questions || questions.length === 0) return;
    const b = el(`<div class="recap-block"><h3>${escapeHtml(title)}</h3></div>`);
    let any = false;
    for (const q of questions) {
      const val = values[q.id];
      if (val === undefined || val === "") continue;
      any = true;
      b.appendChild(el(`<div class="recap-item"><b>${escapeHtml(q.text)}</b><br>${escapeHtml(val)}</div>`));
    }
    if (any) card.appendChild(b);
  }

  block("Général", state.lieu.questions_general, state.answers.general);
  const typeLabel = state.lieu.type_lieu && state.bank.LIEU_BLOCKS[state.lieu.type_lieu] ? state.bank.LIEU_BLOCKS[state.lieu.type_lieu].label : null;
  if (typeLabel) block(typeLabel, state.lieu.questions_lieu, state.answers.lieu);
  for (const code of Object.keys(state.lieu.formats || {})) {
    const label = state.bank.FORMAT_BLOCKS[code] ? state.bank.FORMAT_BLOCKS[code].label : code;
    block(label, state.lieu.formats[code], state.answers.formats[code] || {});
  }
  for (const code of state.lieu.formats_exception || []) {
    const b = state.bank.FORMAT_EXCEPTIONS[code];
    if (!b) continue;
    card.appendChild(
      el(`<div class="recap-block"><h3>${escapeHtml(b.label)}</h3><div class="recap-item">${escapeHtml(b.encart)}${payload.contact_exception[code] ? " - Téléphone : " + escapeHtml(payload.contact_exception[code]) : ""}</div></div>`)
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

  const mailBtn = el(`<a class="secondary" style="text-decoration:none;display:inline-block;text-align:center" href="mailto:?subject=${encodeURIComponent("Questionnaire découverte - " + payload.lieu_nom)}&body=${encodeURIComponent(buildMailBody(payload))}">Envoyer par email</a>`);
  actionsRow.appendChild(mailBtn);

  app.appendChild(actionsCard);
  app.appendChild(navRow(() => { state.step = 3; render(); }, null));
}

// ---------- Rendu principal ----------

function render() {
  app.innerHTML = "";
  renderStepper();
  [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4][state.step]();
}

function renderNotReady() {
  stepperEl.innerHTML = "";
  app.innerHTML = "";
  app.appendChild(el(`
    <section class="card">
      <h2>Questionnaire en préparation</h2>
      <p class="intro">Ce lien n'est pas encore prêt à être rempli. Kleiomné finalise le questionnaire pour votre lieu - repassez un peu plus tard, ou rapprochez-vous de votre contact.</p>
    </section>
  `));
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
    pageTitle.textContent = `Questionnaire découverte - ${lieuRes.nom}`;

    if (!lieuRes.pret) {
      renderNotReady();
      return;
    }

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
