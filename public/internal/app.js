const CATEGORIES = [
  { code: "F-VIS", label: "Visite théâtralisée / nocturne" },
  { code: "F-DIN", label: "Dîner immersif" },
  { code: "F-MUR", label: "Murder party" },
  { code: "F-ENQ", label: "Enquête immersive / jeu de piste" },
  { code: "F-BAL", label: "Bal fantasy (appel qualifié)" },
  { code: "F-PON", label: "Événement ponctuel (devis)" },
];

const app = document.getElementById("app");
const tabsEl = document.getElementById("tabs");

async function api(path, opts = {}) {
  const res = await fetch("/api" + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erreur ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Router ----------

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [route, id] = hash.split("/");
  return { route: route || "historique", id };
}

async function router() {
  const { route, id } = currentRoute();
  for (const btn of tabsEl.querySelectorAll(".tab-btn")) {
    btn.classList.toggle("active", btn.dataset.route === (route === "lieu" ? "historique" : route));
  }
  app.innerHTML = "";
  try {
    if (route === "nouveau") await renderNouveau();
    else if (route === "lieu" && id) await renderFiche(id);
    else await renderHistorique();
  } catch (e) {
    app.appendChild(el(`<div class="warning-banner">Erreur : ${escapeHtml(e.message)}</div>`));
  }
}

window.addEventListener("hashchange", router);
tabsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  location.hash = "#/" + btn.dataset.route;
});

// ---------- Header: settings + status ----------

async function initHeader() {
  const settings = await api("/settings");
  const checkbox = document.getElementById("premierClientSigne");
  checkbox.checked = !!settings.premier_client_signe;
  checkbox.addEventListener("change", async () => {
    await api("/settings", { method: "PATCH", body: JSON.stringify({ premier_client_signe: checkbox.checked }) });
  });

  const status = await api("/status");
  const badges = document.getElementById("statusBadges");
  badges.innerHTML =
    `Claude<span class="badge ${status.claude_configure ? "ok" : "err"}">${status.claude_configure ? "connecté" : "non configuré"}</span>` +
    `&nbsp;&nbsp;Gmail<span class="badge ${status.gmail_configure ? "ok" : "err"}">${status.gmail_configure ? "connecté" : "non configuré"}</span>`;
}

// ---------- Vue : Nouveau lieu ----------

async function renderNouveau() {
  const form = el(`
    <section class="card">
      <h2>Nouveau lieu</h2>
      <p class="small-note">Le nom suffit pour lancer la recherche. L'outil interroge le web (histoire, offre événementielle, décisionnaire probable) et Gmail (échanges déjà eus avec ce contact), puis génère un tunnel sur-mesure et un lien questionnaire préempli.</p>
      <form id="nouveauForm">
        <div class="field"><label>Nom du lieu *</label><input type="text" name="nom" required placeholder="Château de Villeconin"></div>
        <div class="field"><label>Contact — email</label><input type="email" name="contact_email" placeholder="contact@lieu.fr"></div>
        <div class="field"><label>Contact — téléphone</label><input type="tel" name="contact_telephone"></div>
        <div class="field">
          <label>Catégorie(s) envisagée(s) — laisser vide pour que l'outil les suggère</label>
          <div class="checkbox-row" id="catBox">
            ${CATEGORIES.map((c) => `<label><input type="checkbox" name="categories" value="${c.code}"> ${c.label}</label>`).join("")}
          </div>
        </div>
        <div class="field">
          <label>Notes issues de conversations Claude passées (à coller manuellement — la recherche automatique ne couvre pas cette source)</label>
          <textarea name="notes_conversations_claude" placeholder="Ce lieu a-t-il déjà été évoqué, pitché ou écarté dans une conversation Claude précédente ? Collez ici ce qui est pertinent."></textarea>
        </div>
        <button class="primary" type="submit">Lancer la recherche et générer le tunnel</button>
        <div id="nouveauStatus" class="small-note"></div>
      </form>
    </section>
  `);
  app.appendChild(form);

  form.querySelector("#nouveauForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const categories = fd.getAll("categories");
    const payload = {
      nom: fd.get("nom"),
      contact_email: fd.get("contact_email") || null,
      contact_telephone: fd.get("contact_telephone") || null,
      categories,
      notes_conversations_claude: fd.get("notes_conversations_claude") || "",
    };
    const statusEl = form.querySelector("#nouveauStatus");
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    statusEl.textContent = "Recherche et génération du tunnel en cours (cela peut prendre 20 à 60 secondes)…";
    try {
      const { lieu, generation_warning } = await api("/lieux", { method: "POST", body: JSON.stringify(payload) });
      if (generation_warning) {
        statusEl.textContent = "Lieu créé, mais la génération a échoué : " + generation_warning;
        btn.disabled = false;
      } else {
        location.hash = "#/lieu/" + lieu.id;
      }
    } catch (err) {
      statusEl.textContent = "Erreur : " + err.message;
      btn.disabled = false;
    }
  });
}

// ---------- Vue : Historique ----------

async function renderHistorique() {
  const lieux = await api("/lieux");
  if (lieux.length === 0) {
    app.appendChild(el(`<div class="empty-state">Aucun lieu traité pour l'instant. <a href="#/nouveau">Créer le premier</a>.</div>`));
    return;
  }
  const section = el(`
    <section class="card">
      <h2>Historique des lieux</h2>
      <table class="historique">
        <thead><tr><th>Lieu</th><th>Catégories</th><th>Statut</th><th>Questionnaire</th><th>Mis à jour</th></tr></thead>
        <tbody></tbody>
      </table>
    </section>
  `);
  const tbody = section.querySelector("tbody");
  for (const lieu of lieux) {
    const cats = (lieu.categories || []).join(", ") || "—";
    const questionnaireState = lieu.questionnaire_reponses ? "Réponses reçues" : lieu.questionnaire_meta && Object.keys(lieu.questionnaire_meta).length ? "En attente" : "—";
    const tr = el(`
      <tr data-id="${lieu.id}">
        <td>${escapeHtml(lieu.nom)}</td>
        <td>${escapeHtml(cats)}</td>
        <td><span class="pill ${lieu.statut}">${escapeHtml(lieu.statut_label)}</span></td>
        <td>${escapeHtml(questionnaireState)}</td>
        <td>${escapeHtml(lieu.updated_at)}</td>
      </tr>
    `);
    tr.addEventListener("click", () => (location.hash = "#/lieu/" + lieu.id));
    tbody.appendChild(tr);
  }
  app.appendChild(section);
}

// ---------- Vue : Fiche lieu ----------

function statutOptions(current) {
  const statuts = [
    ["nouveau", "Nouveau"],
    ["recherche_en_cours", "Recherche en cours"],
    ["erreur_generation", "Erreur de génération"],
    ["tunnel_genere", "Tunnel généré"],
    ["questionnaire_envoye", "Questionnaire envoyé"],
    ["questionnaire_recu", "Questionnaire reçu, tunnel à affiner"],
    ["tunnel_affine", "Tunnel affiné"],
  ];
  return statuts.map(([v, l]) => `<option value="${v}" ${v === current ? "selected" : ""}>${l}</option>`).join("");
}

function tunnelStepHtml(step, idx) {
  return `
    <div class="tunnel-step" data-idx="${idx}">
      <div class="field"><label>Étape</label><input type="text" data-field="etape" value="${escapeHtml(step.etape)}"></div>
      <div class="row">
        <div class="field" style="margin:0"><label>Timing estimé</label><input type="text" data-field="timing_estime" value="${escapeHtml(step.timing_estime)}"></div>
        <div class="field" style="margin:0"><label>Budget estimé</label><input type="text" data-field="budget_estime" value="${escapeHtml(step.budget_estime)}"></div>
        <div class="field" style="margin:0"><label>Statut budget</label>
          <select data-field="statut_budget">
            ${["confirmé", "estimé", "à vérifier"].map((s) => `<option ${s === step.statut_budget ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field" style="margin-bottom:0"><label>Note</label><textarea data-field="note" style="min-height:50px">${escapeHtml(step.note)}</textarea></div>
      ${step.exception_appel ? `<div class="exception-flag">⚠ Exception assumée : appel qualifié (format Bal fantasy)</div>` : ""}
      <div class="step-actions"><button class="secondary" data-action="remove-step" type="button">Retirer cette étape</button></div>
    </div>
  `;
}

async function renderFiche(id) {
  const lieu = await api("/lieux/" + id);

  const wrap = el(`<div></div>`);

  if (lieu.statut === "erreur_generation" && lieu.generation_error) {
    wrap.appendChild(el(`<div class="warning-banner">La génération a échoué : ${escapeHtml(lieu.generation_error)}</div>`));
  }
  if (lieu.statut === "recherche_en_cours") {
    wrap.appendChild(el(`<div class="warning-banner">Recherche / génération en cours pour ce lieu…</div>`));
  }

  wrap.appendChild(
    el(`
      <div class="top-actions">
        <h2>${escapeHtml(lieu.nom)} <span class="pill ${lieu.statut}">${escapeHtml(lieu.statut_label)}</span></h2>
        <button class="secondary" id="regenerateBtn" type="button">${lieu.questionnaire_reponses ? "Régénérer le tunnel avec les réponses reçues" : "Relancer la génération"}</button>
      </div>
    `)
  );

  // Fiche : identité
  const identite = el(`
    <section class="card">
      <h2>Fiche lieu</h2>
      <div class="row" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px">
        <div class="field" style="margin:0"><label>Nom</label><input type="text" id="f-nom" value="${escapeHtml(lieu.nom)}"></div>
        <div class="field" style="margin:0"><label>Contact — email</label><input type="email" id="f-email" value="${escapeHtml(lieu.contact_email || "")}"></div>
        <div class="field" style="margin:0"><label>Contact — téléphone</label><input type="tel" id="f-tel" value="${escapeHtml(lieu.contact_telephone || "")}"></div>
      </div>
      <div class="field"><label>Statut interne</label><select id="f-statut">${statutOptions(lieu.statut)}</select></div>
      <div class="field"><label>Cas pilote pour ce lieu (tant que non coché : tarifs réduits)</label>
        <label class="switch-label"><input type="checkbox" id="f-pilote" ${!lieu.premier_client_signe ? "checked" : ""}> Tarif pilote actif</label>
      </div>
      <button class="primary" id="saveIdentite" type="button">Enregistrer</button>
    </section>
  `);
  wrap.appendChild(identite);

  // Lien questionnaire
  const link = `${location.origin}/q/${lieu.slug}`;
  wrap.appendChild(
    el(`
      <section class="card">
        <h2>Lien questionnaire</h2>
        <div class="link-box">
          <code>${escapeHtml(link)}</code>
          <button class="secondary" id="copyLink" type="button">Copier le lien</button>
        </div>
        <p class="small-note">À coller dans le mail de prospection à la place d'un lien générique. Les questions déjà répondues via la recherche sont préremplies côté prospect avec la mention « d'après nos recherches ».</p>
      </section>
    `)
  );

  // Profil déduit
  if (lieu.profil_lieu_deduit) {
    wrap.appendChild(
      el(`
        <section class="card">
          <h2>Profil du lieu (déduit par l'outil)</h2>
          <p><strong>${escapeHtml(lieu.profil_lieu_deduit.type)}</strong> — <span class="pill ${lieu.profil_lieu_deduit.statut === "confirmé" ? "tunnel_genere" : "questionnaire_recu"}">${escapeHtml(lieu.profil_lieu_deduit.statut)}</span></p>
          <p class="small-note">${escapeHtml(lieu.profil_lieu_deduit.justification)}</p>
        </section>
      `)
    );
  }

  // Points à vérifier
  if (lieu.points_a_verifier && lieu.points_a_verifier.length) {
    wrap.appendChild(
      el(`
        <section class="card">
          <h2>Points à vérifier avant tout envoi</h2>
          <ul class="mono-list">${lieu.points_a_verifier.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>
        </section>
      `)
    );
  }

  // Tunnel éditable
  const tunnelSection = el(`
    <section class="card">
      <h2>Tunnel de prospection</h2>
      <div id="tunnelSteps"></div>
      <button class="secondary" id="addStep" type="button">Ajouter une étape</button>
      <div style="margin-top:14px"><button class="primary" id="saveTunnel" type="button">Enregistrer le tunnel</button></div>
    </section>
  `);
  const stepsHost = tunnelSection.querySelector("#tunnelSteps");
  let steps = (lieu.tunnel || []).map((s) => ({ ...s }));
  function renderSteps() {
    stepsHost.innerHTML = steps.map((s, i) => tunnelStepHtml(s, i)).join("") || `<p class="small-note">Aucune étape.</p>`;
  }
  renderSteps();
  wrap.appendChild(tunnelSection);

  // Sources / échanges connus
  const infos = lieu.infos_recueillies || {};
  const sourcesSection = el(`
    <section class="card">
      <h2>Informations recueillies</h2>
      <h3>Sources web</h3>
      ${infos.web && infos.web.length ? `<ul class="mono-list">${infos.web.map((s) => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title || s.url)}</a></li>`).join("")}</ul>` : `<p class="small-note">Aucune source web enregistrée.</p>`}
      <h3>Gmail</h3>
      ${infos.gmail_configure === false ? `<p class="small-note">Gmail non connecté sur ce déploiement.</p>` : infos.gmail && infos.gmail.length ? `<ul class="mono-list">${infos.gmail.map((m) => `<li>${escapeHtml(m.date)} — ${escapeHtml(m.subject)}</li>`).join("")}</ul>` : `<p class="small-note">Aucun échange trouvé.</p>`}
      <h3>Notes conversations Claude passées</h3>
      <textarea id="f-notes">${escapeHtml(lieu.notes_conversations_claude || "")}</textarea>
      <div style="margin-top:10px"><button class="secondary" id="saveNotes" type="button">Enregistrer les notes</button></div>
    </section>
  `);
  wrap.appendChild(sourcesSection);

  // Réponses questionnaire
  if (lieu.questionnaire_reponses) {
    const r = lieu.questionnaire_reponses;
    wrap.appendChild(
      el(`
        <section class="card">
          <h2>Réponses du questionnaire (reçues le ${escapeHtml(r.date_soumission)})</h2>
          <pre style="white-space:pre-wrap;font-family:inherit;font-size:15px;color:var(--ivory-dim)">${escapeHtml(JSON.stringify(r, null, 2))}</pre>
        </section>
      `)
    );
  }

  app.appendChild(wrap);

  // --- interactions ---
  wrap.querySelector("#regenerateBtn").addEventListener("click", async () => {
    const b = wrap.querySelector("#regenerateBtn");
    b.disabled = true;
    b.textContent = "Génération en cours…";
    try {
      await api(`/lieux/${id}/regenerate`, { method: "POST" });
      router();
    } catch (e) {
      alert("Erreur : " + e.message);
      b.disabled = false;
    }
  });

  wrap.querySelector("#saveIdentite").addEventListener("click", async () => {
    await api(`/lieux/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        nom: wrap.querySelector("#f-nom").value,
        contact_email: wrap.querySelector("#f-email").value || null,
        contact_telephone: wrap.querySelector("#f-tel").value || null,
        statut: wrap.querySelector("#f-statut").value,
        premier_client_signe: !wrap.querySelector("#f-pilote").checked,
      }),
    });
    router();
  });

  wrap.querySelector("#copyLink").addEventListener("click", async () => {
    await navigator.clipboard.writeText(link);
    const btn = wrap.querySelector("#copyLink");
    const original = btn.textContent;
    btn.textContent = "Copié !";
    setTimeout(() => (btn.textContent = original), 1500);
  });

  wrap.querySelector("#saveNotes").addEventListener("click", async () => {
    await api(`/lieux/${id}`, { method: "PATCH", body: JSON.stringify({ notes_conversations_claude: wrap.querySelector("#f-notes").value }) });
    alert("Notes enregistrées.");
  });

  wrap.querySelector("#addStep").addEventListener("click", () => {
    steps.push({ etape: "", timing_estime: "", budget_estime: "", statut_budget: "estimé", note: "" });
    renderSteps();
  });

  stepsHost.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action=remove-step]");
    if (!btn) return;
    const idx = Number(btn.closest(".tunnel-step").dataset.idx);
    steps.splice(idx, 1);
    renderSteps();
  });

  wrap.querySelector("#saveTunnel").addEventListener("click", async () => {
    // collecte les valeurs actuelles des champs avant sauvegarde
    stepsHost.querySelectorAll(".tunnel-step").forEach((stepEl) => {
      const idx = Number(stepEl.dataset.idx);
      stepEl.querySelectorAll("[data-field]").forEach((input) => {
        steps[idx][input.dataset.field] = input.value;
      });
    });
    await api(`/lieux/${id}`, { method: "PATCH", body: JSON.stringify({ tunnel: steps }) });
    alert("Tunnel enregistré.");
  });
}

// ---------- Init ----------
initHeader();
router();
