import express from "express";
import { db, getSetting, setSetting } from "../db.js";
import { parseLieuRow, STATUTS, profilTypeToLieuCode } from "../lieuModel.js";
import { makeId, makeSlug } from "../util.js";
import { generateTunnel, isClaudeConfigured } from "../services/claude.js";
import { searchThreadsWithContact, summarizeThreadForPrompt, isGmailConfigured } from "../services/gmail.js";
import { allQuestionsById, GENERAL_Q2_IDS, LIEU_BLOCKS, FORMAT_BLOCKS, PRESTATION_TO_FORMAT, PRESTATION_TO_EXCEPTION } from "../questionBank.js";

export const internalRouter = express.Router();

// Construit le contenu du Questionnaire 2 de façon déterministe (jamais
// laissé à l'appréciation du modèle) : bloc général toujours affiché en
// intégralité, bloc lieu selon le type résolu, blocs de format selon les
// prestations cochées au Questionnaire 1 (mapping P-xx -> F-xx).
function buildQ2Selection(typeLieu, prestationsInteressees) {
  const byId = allQuestionsById();
  const toRow = (id) => {
    const q = byId[id];
    if (!q) return null;
    return { id: q.id, text: q.text, type: q.type, options: q.options || null, included: true };
  };

  const general = GENERAL_Q2_IDS.map(toRow).filter(Boolean);
  const lieuBlock = typeLieu && LIEU_BLOCKS[typeLieu] ? LIEU_BLOCKS[typeLieu] : null;
  const lieuQuestions = lieuBlock ? lieuBlock.questions.map((q) => toRow(q.id)).filter(Boolean) : [];

  const formats = {};
  for (const p of prestationsInteressees || []) {
    const fcode = PRESTATION_TO_FORMAT[p];
    if (fcode && FORMAT_BLOCKS[fcode]) {
      formats[fcode] = FORMAT_BLOCKS[fcode].questions.map((q) => toRow(q.id)).filter(Boolean);
    }
  }
  const formatsException = (prestationsInteressees || [])
    .filter((p) => PRESTATION_TO_EXCEPTION[p])
    .map((p) => ({ code: PRESTATION_TO_EXCEPTION[p], included: true }));

  return {
    general,
    lieu: { type_lieu: typeLieu || null, questions: lieuQuestions },
    formats,
    formatsException,
  };
}

function formatQ1ReponsesTexte(reponses) {
  if (!reponses) return null;
  const lines = [];
  lines.push("Prestations cochées : " + (reponses.prestations_interessees || []).join(", ") || "(aucune)");
  lines.push("Services complémentaires cochés : " + ((reponses.services_complementaires_interesses || []).join(", ") || "(aucun)"));
  lines.push("Intervenants groupe A : " + ((reponses.intervenants_groupe_a || []).join(", ") || "(aucun)"));
  lines.push("Intervenants groupe B : " + ((reponses.intervenants_groupe_b || []).join(", ") || "(aucun)"));
  const q = reponses.reponses_qualification || {};
  lines.push(`Qualification : G11 (motivation) = ${q.G11 || "(non renseigné)"} | G12 (ponctuel/récurrent) = ${q.G12 || "(non renseigné)"}${q.G12a ? " (" + q.G12a + ")" : ""} | G17 (budget) = ${q.G17 || "(non renseigné)"}`);
  return lines.join("\n");
}

async function gatherResearch(lieu) {
  let gmailResult = { configured: false, messages: [] };
  let gmailSummary = "Gmail non connecté - source non interrogée.";
  try {
    gmailResult = await searchThreadsWithContact(lieu.contact_email);
    gmailSummary = summarizeThreadForPrompt(gmailResult);
  } catch (e) {
    gmailSummary = "Erreur lors de la recherche Gmail : " + e.message;
  }

  let infosTexte = "";
  if (lieu.notes_conversations_claude) {
    infosTexte +=
      "Notes issues de conversations Claude passées (collées manuellement par Solenne, à traiter comme piste à vérifier sauf mention contraire) :\n" +
      lieu.notes_conversations_claude +
      "\n\n";
  }
  infosTexte += "Échanges Gmail connus avec ce contact :\n" + gmailSummary;

  return { gmailResult, infosTexte, historiqueTexte: gmailSummary };
}

// Génération initiale : recherche + tunnel + Questionnaire 1 (statique, prêt
// immédiatement) + prefill du Questionnaire 2 (déjà utile même avant que le
// Questionnaire 1 soit répondu). Le contenu du Questionnaire 2 lui-même
// n'est pas encore construit : voir performQ2Generation.
async function performInitialGeneration(id) {
  const row = db.prepare("SELECT * FROM lieux WHERE id = ?").get(id);
  const lieu = parseLieuRow(row);
  db.prepare("UPDATE lieux SET statut = ?, updated_at = datetime('now') WHERE id = ?").run(STATUTS.RECHERCHE_EN_COURS, id);

  const { gmailResult, infosTexte, historiqueTexte } = await gatherResearch(lieu);

  try {
    const { parsed, webSources } = await generateTunnel({
      nom: lieu.nom,
      contactEmail: lieu.contact_email,
      contactTelephone: lieu.contact_telephone,
      categories: lieu.categories,
      typeLieuForce: lieu.type_lieu_force,
      infosRecueilliesTexte: infosTexte,
      historiqueEchangesTexte: historiqueTexte,
      q1ReponsesTexte: null,
      premierClientSigne: lieu.premier_client_signe,
    });

    const infos_recueillies = {
      web: webSources,
      gmail_configure: gmailResult.configured,
      gmail: gmailResult.messages,
      notes_conversations_claude: lieu.notes_conversations_claude || "",
    };

    db.prepare(
      `UPDATE lieux SET
        statut = @statut,
        infos_recueillies = @infos_recueillies,
        profil_lieu_deduit = @profil_lieu_deduit,
        tunnel = @tunnel,
        questionnaire_2_meta = @questionnaire_2_meta,
        questionnaire_2_prefill = @questionnaire_2_prefill,
        points_a_verifier = @points_a_verifier,
        generation_error = NULL,
        updated_at = datetime('now')
      WHERE id = @id`
    ).run({
      id,
      statut: STATUTS.TUNNEL_GENERE,
      infos_recueillies: JSON.stringify(infos_recueillies),
      profil_lieu_deduit: JSON.stringify(parsed.profil_lieu_deduit || null),
      tunnel: JSON.stringify(parsed.tunnel || []),
      questionnaire_2_meta: JSON.stringify(parsed.questionnaire_2 || {}),
      questionnaire_2_prefill: JSON.stringify(parsed.prefill || {}),
      points_a_verifier: JSON.stringify(parsed.points_a_verifier || []),
    });
  } catch (e) {
    db.prepare("UPDATE lieux SET statut = ?, generation_error = ?, updated_at = datetime('now') WHERE id = ?").run(
      STATUTS.ERREUR_GENERATION,
      e.message,
      id
    );
    throw e;
  }
}

// Génère (ou régénère) le Questionnaire 2 : nécessite que le Questionnaire 1
// ait été reçu avec au moins une prestation standard cochée. La sélection de
// questions elle-même est déterministe (buildQ2Selection) ; l'appel à l'IA
// sert à rafraîchir le tunnel, le profil déduit et le prefill maintenant que
// l'intérêt (et éventuellement les réponses du Questionnaire 2) sont connus.
async function performQ2Generation(id, { useQ2Reponses = false } = {}) {
  const row = db.prepare("SELECT * FROM lieux WHERE id = ?").get(id);
  const lieu = parseLieuRow(row);

  if (!lieu.questionnaire_1_reponses) {
    const err = new Error("Le Questionnaire 1 n'a pas encore été reçu.");
    err.code = "Q1_MANQUANT";
    throw err;
  }
  const prestationsInteressees = lieu.questionnaire_1_reponses.prestations_interessees || [];
  const hasStandard = prestationsInteressees.some((p) => PRESTATION_TO_FORMAT[p]);
  if (!hasStandard) {
    const err = new Error(
      "Seules des prestations hors périmètre écrit (Bal fantasy / Événement sur-mesure) ont été cochées : pas de Questionnaire 2 standard à générer."
    );
    err.code = "Q1_EXCEPTION_UNIQUEMENT";
    throw err;
  }

  db.prepare("UPDATE lieux SET statut = ?, updated_at = datetime('now') WHERE id = ?").run(STATUTS.RECHERCHE_EN_COURS, id);

  const { gmailResult, infosTexte, historiqueTexte } = await gatherResearch(lieu);
  let infosTexteEnrichi = infosTexte;
  if (useQ2Reponses && lieu.questionnaire_2_reponses) {
    infosTexteEnrichi +=
      "\n\nRéponses confirmées par le prospect via le Questionnaire 2 (statut confirmé, à privilégier sur toute déduction précédente) :\n" +
      JSON.stringify(lieu.questionnaire_2_reponses, null, 2);
  }

  try {
    const { parsed, webSources } = await generateTunnel({
      nom: lieu.nom,
      contactEmail: lieu.contact_email,
      contactTelephone: lieu.contact_telephone,
      categories: lieu.categories,
      typeLieuForce: lieu.type_lieu_force,
      infosRecueilliesTexte: infosTexteEnrichi,
      historiqueEchangesTexte: historiqueTexte,
      q1ReponsesTexte: formatQ1ReponsesTexte(lieu.questionnaire_1_reponses),
      premierClientSigne: lieu.premier_client_signe,
    });

    const typeLieu = lieu.type_lieu_force || profilTypeToLieuCode(parsed.profil_lieu_deduit?.type);
    const selection = buildQ2Selection(typeLieu, prestationsInteressees);

    const infos_recueillies = {
      web: webSources,
      gmail_configure: gmailResult.configured,
      gmail: gmailResult.messages,
      notes_conversations_claude: lieu.notes_conversations_claude || "",
    };

    let slugQ2 = lieu.slug_q2;
    if (!slugQ2) slugQ2 = makeSlug(lieu.nom);

    const newStatut = useQ2Reponses ? STATUTS.TUNNEL_AFFINE : STATUTS.Q2_GENERE;

    db.prepare(
      `UPDATE lieux SET
        statut = @statut,
        slug_q2 = @slug_q2,
        infos_recueillies = @infos_recueillies,
        profil_lieu_deduit = @profil_lieu_deduit,
        tunnel = @tunnel,
        questionnaire_2_meta = @questionnaire_2_meta,
        questionnaire_2_prefill = @questionnaire_2_prefill,
        questionnaire_2_selection = @questionnaire_2_selection,
        questionnaire_2_valide = 0,
        points_a_verifier = @points_a_verifier,
        generation_error = NULL,
        updated_at = datetime('now')
      WHERE id = @id`
    ).run({
      id,
      statut: newStatut,
      slug_q2: slugQ2,
      infos_recueillies: JSON.stringify(infos_recueillies),
      profil_lieu_deduit: JSON.stringify(parsed.profil_lieu_deduit || null),
      tunnel: JSON.stringify(parsed.tunnel || []),
      questionnaire_2_meta: JSON.stringify(parsed.questionnaire_2 || {}),
      questionnaire_2_prefill: JSON.stringify(parsed.prefill || {}),
      questionnaire_2_selection: JSON.stringify(selection),
      points_a_verifier: JSON.stringify(parsed.points_a_verifier || []),
    });
  } catch (e) {
    db.prepare("UPDATE lieux SET statut = ?, generation_error = ?, updated_at = datetime('now') WHERE id = ?").run(
      STATUTS.ERREUR_GENERATION,
      e.message,
      id
    );
    throw e;
  }
}

internalRouter.get("/status", (req, res) => {
  res.json({
    claude_configure: isClaudeConfigured(),
    gmail_configure: isGmailConfigured(),
  });
});

internalRouter.get("/settings", (req, res) => {
  res.json({ premier_client_signe: getSetting("premier_client_signe", false) });
});

internalRouter.patch("/settings", (req, res) => {
  if (typeof req.body.premier_client_signe === "boolean") {
    setSetting("premier_client_signe", req.body.premier_client_signe);
  }
  res.json({ premier_client_signe: getSetting("premier_client_signe", false) });
});

internalRouter.get("/lieux", (req, res) => {
  const rows = db.prepare("SELECT * FROM lieux ORDER BY updated_at DESC").all();
  res.json(rows.map(parseLieuRow));
});

internalRouter.get("/lieux/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM lieux WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Lieu introuvable" });
  res.json(parseLieuRow(row));
});

internalRouter.post("/lieux", async (req, res) => {
  const { nom, contact_email, contact_telephone, categories, type_lieu_force, notes_conversations_claude } = req.body;
  if (!nom || !nom.trim()) return res.status(400).json({ error: "Le nom du lieu est requis" });
  if (type_lieu_force && !["L-CH", "L-DOM"].includes(type_lieu_force)) {
    return res.status(400).json({ error: "type_lieu_force invalide" });
  }

  const id = makeId();
  const slugQ1 = makeSlug(nom);
  const premierClientSigne = getSetting("premier_client_signe", false);

  db.prepare(
    `INSERT INTO lieux (id, slug_q1, nom, contact_email, contact_telephone, categories, type_lieu_force, notes_conversations_claude, premier_client_signe, statut)
     VALUES (@id, @slug_q1, @nom, @contact_email, @contact_telephone, @categories, @type_lieu_force, @notes_conversations_claude, @premier_client_signe, @statut)`
  ).run({
    id,
    slug_q1: slugQ1,
    nom: nom.trim(),
    contact_email: contact_email || null,
    contact_telephone: contact_telephone || null,
    categories: JSON.stringify(Array.isArray(categories) ? categories : []),
    type_lieu_force: type_lieu_force || null,
    notes_conversations_claude: notes_conversations_claude || "",
    premier_client_signe: premierClientSigne ? 1 : 0,
    statut: STATUTS.NOUVEAU,
  });

  let generationWarning = null;
  try {
    await performInitialGeneration(id);
  } catch (e) {
    generationWarning = e.message;
  }

  const row = db.prepare("SELECT * FROM lieux WHERE id = ?").get(id);
  res.status(201).json({ lieu: parseLieuRow(row), generation_warning: generationWarning });
});

internalRouter.post("/lieux/:id/regenerate-initial", async (req, res) => {
  const row = db.prepare("SELECT * FROM lieux WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Lieu introuvable" });

  try {
    await performInitialGeneration(req.params.id);
  } catch (e) {
    return res.status(502).json({ error: "Échec de la génération : " + e.message });
  }

  const updated = db.prepare("SELECT * FROM lieux WHERE id = ?").get(req.params.id);
  res.json(parseLieuRow(updated));
});

const EDITABLE_FIELDS = ["nom", "contact_email", "contact_telephone", "notes_conversations_claude", "statut", "type_lieu_force"];
const EDITABLE_JSON_FIELDS = ["categories", "tunnel", "points_a_verifier", "questionnaire_2_prefill", "questionnaire_2_selection"];

internalRouter.patch("/lieux/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM lieux WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Lieu introuvable" });

  const sets = [];
  const params = { id: req.params.id };

  for (const field of EDITABLE_FIELDS) {
    if (field in req.body) {
      sets.push(`${field} = @${field}`);
      params[field] = req.body[field];
    }
  }
  for (const field of EDITABLE_JSON_FIELDS) {
    if (field in req.body) {
      sets.push(`${field} = @${field}`);
      params[field] = JSON.stringify(req.body[field]);
    }
  }
  if (typeof req.body.premier_client_signe === "boolean") {
    sets.push("premier_client_signe = @premier_client_signe");
    params.premier_client_signe = req.body.premier_client_signe ? 1 : 0;
  }
  if (typeof req.body.questionnaire_2_valide === "boolean") {
    sets.push("questionnaire_2_valide = @questionnaire_2_valide");
    params.questionnaire_2_valide = req.body.questionnaire_2_valide ? 1 : 0;
  }

  if (sets.length === 0) return res.status(400).json({ error: "Aucun champ éditable fourni" });

  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE lieux SET ${sets.join(", ")} WHERE id = @id`).run(params);

  const updated = db.prepare("SELECT * FROM lieux WHERE id = ?").get(req.params.id);
  res.json(parseLieuRow(updated));
});

internalRouter.post("/lieux/:id/generate-q2", async (req, res) => {
  const row = db.prepare("SELECT * FROM lieux WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Lieu introuvable" });

  try {
    await performQ2Generation(req.params.id);
  } catch (e) {
    return res.status(422).json({ error: e.message, code: e.code });
  }

  const updated = db.prepare("SELECT * FROM lieux WHERE id = ?").get(req.params.id);
  res.json(parseLieuRow(updated));
});

internalRouter.post("/lieux/:id/regenerate", async (req, res) => {
  const row = db.prepare("SELECT * FROM lieux WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Lieu introuvable" });

  try {
    await performQ2Generation(req.params.id, { useQ2Reponses: true });
  } catch (e) {
    return res.status(502).json({ error: "Échec de la régénération : " + e.message });
  }

  const updated = db.prepare("SELECT * FROM lieux WHERE id = ?").get(req.params.id);
  res.json(parseLieuRow(updated));
});

internalRouter.delete("/lieux/:id", (req, res) => {
  const info = db.prepare("DELETE FROM lieux WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Lieu introuvable" });
  res.status(204).end();
});
