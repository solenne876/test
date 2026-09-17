const app = document.getElementById("app");
const stepperEl = document.getElementById("stepper");
const pageTitle = document.getElementById("pageTitle");

const slug = location.pathname.replace(/^\/q1\/?/, "").split("/")[0];
const STORAGE_KEY = `kleiomne_q1_${slug}`;

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const state = {
  lieu: null, // réponse de /api/public/q1/:slug (catalogues statiques inclus)
  step: 0,
  answers: {
    lieu_nom: "",
    prestations: [],
    services: [],
    intervenants_a: [],
    intervenants_b: [],
    qualification: {}, // G11, G12, G12a, G17
  },
};

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ step: state.step, answers: state.answers }));
  } catch {
    // stockage indisponible - on continue sans persistance
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

// ---------- Rendu d'une case à cocher de catalogue (QC) ----------

function renderCatalogItem(item, selectedArray, onChange) {
  const checked = selectedArray.includes(item.code);
  const row = el(`
    <label class="catalog-item">
      <input type="checkbox" ${checked ? "checked" : ""}>
      <div>
        <div class="label">${escapeHtml(item.label)}</div>
        ${item.description ? `<div class="desc">${escapeHtml(item.description)}</div>` : ""}
      </div>
    </label>
  `);
  row.querySelector("input").addEventListener("change", (e) => {
    const idx = selectedArray.indexOf(item.code);
    if (e.target.checked && idx === -1) selectedArray.push(item.code);
    else if (!e.target.checked && idx !== -1) selectedArray.splice(idx, 1);
    onChange();
  });
  return row;
}

// ---------- Rendu d'une question QO/QF (qualification légère) ----------

function renderQuestion(q, answersObj, { nested = false, onChange } = {}) {
  const wrapper = el(`<div class="question${nested ? " nested" : ""}" data-qid="${q.id}"></div>`);
  wrapper.appendChild(el(`<div class="qtext">${escapeHtml(q.text)}</div>`));

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
        if (onChange) onChange();
      });
      row.appendChild(btn);
    }
    wrapper.appendChild(row);
  }
  return wrapper;
}

// ---------- Étapes ----------

function renderStepper() {
  stepperEl.innerHTML = "";
  for (let i = 0; i <= 5; i++) {
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
      <p class="intro">Cochez tout ce qui vous parle, rien n'est engageant, on affine ensemble par la suite.</p>
      <div class="question">
        <input type="text" id="lieuNomInput" placeholder="Nom du lieu (optionnel)" value="${escapeHtml(state.answers.lieu_nom)}" style="width:100%;background:var(--navy-3);border:1px solid var(--hairline);color:var(--ivory);padding:10px;border-radius:6px;font-family:inherit;font-size:17px">
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
  const card = el(`<section class="card"><h2>Prestations Kleiomné</h2><p class="intro">Cochez ce qui vous intéresse - une ou plusieurs.</p></section>`);
  for (const item of state.lieu.prestations) {
    card.appendChild(renderCatalogItem(item, state.answers.prestations, persist));
  }
  app.appendChild(card);
  app.appendChild(navRow(() => { state.step = 0; render(); }, () => { state.step = 2; persist(); render(); }));
}

function renderStep2() {
  const card = el(`<section class="card"><h2>Services complémentaires</h2><p class="intro">Des compléments possibles autour de l'expérience.</p></section>`);
  for (const item of state.lieu.services_complementaires) {
    card.appendChild(renderCatalogItem(item, state.answers.services, persist));
  }
  app.appendChild(card);
  app.appendChild(navRow(() => { state.step = 1; render(); }, () => { state.step = 3; persist(); render(); }));
}

function renderStep3() {
  const card = el(`
    <section class="card">
      <h2>Types d'intervenants</h2>
      <p class="intro">Ce sont des pistes pour voir ce qui pourrait vous intéresser, pas une liste exhaustive ni un engagement : tout dépend de l'événement final, d'autres options sont possibles.</p>
      <div class="group-title">Intervenants cœur d'expérience</div>
    </section>
  `);
  for (const item of state.lieu.intervenants_groupe_a) {
    card.appendChild(renderCatalogItem(item, state.answers.intervenants_a, persist));
  }

  const groupeBActive = state.answers.prestations.some((p) => state.lieu.groupe_b_trigger_prestations.includes(p));
  if (!groupeBActive && state.answers.intervenants_b.length) {
    state.answers.intervenants_b = [];
    persist();
  }
  if (groupeBActive) {
    card.appendChild(el(`<div class="group-title">Prestations annexes</div>`));
    for (const item of state.lieu.intervenants_groupe_b) {
      card.appendChild(renderCatalogItem(item, state.answers.intervenants_b, persist));
    }
  }

  app.appendChild(card);
  app.appendChild(
    navRow(
      () => { state.step = 2; render(); },
      () => { state.step = 4; persist(); render(); }
    )
  );
}

function renderStep4() {
  const card = el(`<section class="card"><h2>Encore deux ou trois choses</h2></section>`);
  const q = state.lieu.qualification; // [G11, G12, G12a, G17]
  const byId = {};
  for (const item of q) byId[item.id] = item;

  function rerenderQualification() {
    const host = card.querySelector("#qualHost");
    host.innerHTML = "";
    renderQualification(host);
  }

  function renderQualification(host) {
    host.appendChild(renderQuestion(byId.G11, state.answers.qualification, {}));
    host.appendChild(renderQuestion(byId.G12, state.answers.qualification, { onChange: rerenderQualification }));
    if (state.answers.qualification.G12 === "Récurrent") {
      host.appendChild(renderQuestion(byId.G12a, state.answers.qualification, { nested: true }));
    } else if (state.answers.qualification.G12a !== undefined) {
      delete state.answers.qualification.G12a;
      persist();
    }
    host.appendChild(renderQuestion(byId.G17, state.answers.qualification, {}));
  }

  const host = el(`<div id="qualHost"></div>`);
  card.appendChild(host);
  renderQualification(host);

  app.appendChild(card);
  app.appendChild(navRow(() => { state.step = 3; render(); }, () => { state.step = 5; persist(); render(); }, "Voir le récapitulatif"));
}

function buildSubmissionPayload() {
  return {
    lieu_nom: state.answers.lieu_nom || state.lieu.nom,
    prestations_interessees: state.answers.prestations,
    services_complementaires_interesses: state.answers.services,
    intervenants_groupe_a: state.answers.intervenants_a,
    intervenants_groupe_b: state.answers.intervenants_b,
    reponses_qualification: state.answers.qualification,
  };
}

function buildMailBody(payload) {
  const lines = [`Réponses au questionnaire intérêt - ${payload.lieu_nom}`, ""];
  lines.push("Prestations : " + (payload.prestations_interessees.join(", ") || "aucune"));
  lines.push("Services complémentaires : " + (payload.services_complementaires_interesses.join(", ") || "aucun"));
  lines.push("Intervenants (cœur) : " + (payload.intervenants_groupe_a.join(", ") || "aucun"));
  lines.push("Intervenants (annexes) : " + (payload.intervenants_groupe_b.join(", ") || "aucun"));
  lines.push("", "Qualification :");
  for (const [id, val] of Object.entries(payload.reponses_qualification)) lines.push(`${id}: ${val}`);
  return lines.join("\n");
}

function labelFor(list, code) {
  const item = (list || []).find((i) => i.code === code);
  return item ? item.label : code;
}

function renderStep5() {
  const payload = buildSubmissionPayload();
  const card = el(`<section class="card"><h2>Récapitulatif</h2><p class="intro">Relisez vos réponses avant l'envoi.</p></section>`);

  function listBlock(title, codes, catalog) {
    if (!codes.length) return;
    const b = el(`<div class="recap-block"><h3>${escapeHtml(title)}</h3></div>`);
    b.appendChild(el(`<div class="recap-item">${codes.map((c) => escapeHtml(labelFor(catalog, c))).join(", ")}</div>`));
    card.appendChild(b);
  }
  listBlock("Prestations", payload.prestations_interessees, state.lieu.prestations);
  listBlock("Services complémentaires", payload.services_complementaires_interesses, state.lieu.services_complementaires);
  listBlock("Intervenants (cœur)", payload.intervenants_groupe_a, state.lieu.intervenants_groupe_a);
  listBlock("Intervenants (annexes)", payload.intervenants_groupe_b, state.lieu.intervenants_groupe_b);

  const qBlock = el(`<div class="recap-block"><h3>Qualification</h3></div>`);
  let any = false;
  for (const item of state.lieu.qualification) {
    const val = payload.reponses_qualification[item.id];
    if (val === undefined || val === "") continue;
    any = true;
    qBlock.appendChild(el(`<div class="recap-item"><b>${escapeHtml(item.text)}</b><br>${escapeHtml(val)}</div>`));
  }
  if (any) card.appendChild(qBlock);

  app.appendChild(card);

  const actionsCard = el(`<section class="card"><div id="sendStatus"></div><div class="footer-actions"></div></section>`);
  const actionsRow = actionsCard.querySelector(".footer-actions");

  const sendBtn = el(`<button type="button" class="primary">Envoyer mes réponses à Kleiomné</button>`);
  sendBtn.addEventListener("click", async () => {
    sendBtn.disabled = true;
    sendBtn.textContent = "Envoi en cours…";
    try {
      const res = await fetch(`/api/public/q1/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Erreur serveur");
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      app.innerHTML = "";
      stepperEl.innerHTML = "";
      app.appendChild(el(`<div class="confirm-banner"><h2>Merci !</h2><p>Vos réponses ont bien été transmises à Kleiomné. La suite arrive très vite.</p></div>`));
    } catch (e) {
      actionsCard.querySelector("#sendStatus").textContent = "Erreur lors de l'envoi : " + e.message;
      sendBtn.disabled = false;
      sendBtn.textContent = "Envoyer mes réponses à Kleiomné";
    }
  });
  actionsRow.appendChild(sendBtn);

  const mailBtn = el(`<a class="secondary" style="text-decoration:none;display:inline-block;text-align:center" href="mailto:?subject=${encodeURIComponent("Questionnaire intérêt - " + payload.lieu_nom)}&body=${encodeURIComponent(buildMailBody(payload))}">Envoyer par email</a>`);
  actionsRow.appendChild(mailBtn);

  app.appendChild(actionsCard);
  app.appendChild(navRow(() => { state.step = 4; render(); }, null));
}

function render() {
  app.innerHTML = "";
  renderStepper();
  [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4, renderStep5][state.step]();
}

async function init() {
  try {
    const lieuRes = await fetch(`/api/public/q1/${slug}`).then((r) => {
      if (!r.ok) throw new Error("Lien introuvable ou expiré.");
      return r.json();
    });
    state.lieu = lieuRes;
    pageTitle.textContent = `Questionnaire intérêt - ${lieuRes.nom}`;

    const hadPersisted = loadPersisted();
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
