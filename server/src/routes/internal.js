import express from "express";
import { db, getSetting, setSetting } from "../db.js";
import { parseLieuRow, STATUTS } from "../lieuModel.js";
import { makeId, makeSlug } from "../util.js";
import { generateTunnel, isClaudeConfigured } from "../services/claude.js";
import { searchThreadsWithContact, summarizeThreadForPrompt, isGmailConfigured } from "../services/gmail.js";
import { allQuestionsById, FORMAT_EXCEPTIONS } from "../questionBank.js";

export const internalRouter = express.Router();

// Construit la proposition de questionnaire (curatable ensuite par Solenne)
// à partir de la sélection d'IDs renvoyée par l'IA + de la banque de
// questions. Tout est inclus par défaut : c'est la fiche lieu qui permet
// ensuite de décocher/éditer avant validation.
function buildDefaultSelection(meta, categories) {
  const byId = allQuestionsById();
  const toRow = (id) => {
    const q = byId[id];
    if (!q) return null;
    return { id: q.id, text: q.text, type: q.type, options: q.options || null, included: true };
  };

  const general = (meta?.bloc_general || []).map(toRow).filter(Boolean);
  const lieuQuestions = (meta?.bloc_lieu?.questions || []).map(toRow).filter(Boolean);
  const formats = {};
  for (const [code, ids] of Object.entries(meta?.bloc_format?.questions_par_categorie || {})) {
    const rows = (ids || []).map(toRow).filter(Boolean);
    if (rows.length) formats[code] = rows;
  }
  const formatsException = (categories || [])
    .filter((code) => FORMAT_EXCEPTIONS[code])
    .map((code) => ({ code, included: true }));

  return {
    general,
    lieu: { type_lieu: meta?.bloc_lieu?.type_lieu || null, questions: lieuQuestions },
    formats,
    formatsException,
  };
}

async function performGeneration(id, { useQuestionnaireReponses = false } = {}) {
  const row = db.prepare("SELECT * FROM lieux WHERE id = ?").get(id);
  const lieu = parseLieuRow(row);
  db.prepare("UPDATE lieux SET statut = ?, updated_at = datetime('now') WHERE id = ?").run(
    STATUTS.RECHERCHE_EN_COURS,
    id
  );

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

  let historiqueTexte = gmailSummary;

  if (useQuestionnaireReponses && lieu.questionnaire_reponses) {
    infosTexte +=
      "\n\nRéponses confirmées par le prospect via le questionnaire découverte (statut confirmé, à privilégier sur toute déduction précédente) :\n" +
      JSON.stringify(lieu.questionnaire_reponses, null, 2);
  }

  try {
    const { parsed, webSources } = await generateTunnel({
      nom: lieu.nom,
      contactEmail: lieu.contact_email,
      contactTelephone: lieu.contact_telephone,
      categories: lieu.categories,
      typeLieuForce: lieu.type_lieu_force,
      infosRecueilliesTexte: infosTexte,
      historiqueEchangesTexte: historiqueTexte,
      premierClientSigne: lieu.premier_client_signe,
    });

    const infos_recueillies = {
      web: webSources,
      gmail_configure: gmailResult.configured,
      gmail: gmailResult.messages,
      notes_conversations_claude: lieu.notes_conversations_claude || "",
    };

    const newStatut = useQuestionnaireReponses ? STATUTS.TUNNEL_AFFINE : STATUTS.TUNNEL_GENERE;
    const selection = buildDefaultSelection(parsed.questionnaire, lieu.categories);

    db.prepare(
      `UPDATE lieux SET
        statut = @statut,
        infos_recueillies = @infos_recueillies,
        profil_lieu_deduit = @profil_lieu_deduit,
        tunnel = @tunnel,
        questionnaire_meta = @questionnaire_meta,
        questionnaire_prefill = @questionnaire_prefill,
        questionnaire_selection = @questionnaire_selection,
        questionnaire_valide = 0,
        points_a_verifier = @points_a_verifier,
        generation_error = NULL,
        updated_at = datetime('now')
      WHERE id = @id`
    ).run({
      id,
      statut: newStatut,
      infos_recueillies: JSON.stringify(infos_recueillies),
      profil_lieu_deduit: JSON.stringify(parsed.profil_lieu_deduit || null),
      tunnel: JSON.stringify(parsed.tunnel || []),
      questionnaire_meta: JSON.stringify(parsed.questionnaire || {}),
      questionnaire_prefill: JSON.stringify(parsed.prefill || {}),
      questionnaire_selection: JSON.stringify(selection),
      points_a_verifier: JSON.stringify(parsed.points_a_verifier || []),
    });
  } catch (e) {
    db.prepare(
      "UPDATE lieux SET statut = ?, generation_error = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(STATUTS.ERREUR_GENERATION, e.message, id);
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
  const slug = makeSlug(nom);
  const premierClientSigne = getSetting("premier_client_signe", false);

  db.prepare(
    `INSERT INTO lieux (id, slug, nom, contact_email, contact_telephone, categories, type_lieu_force, notes_conversations_claude, premier_client_signe, statut)
     VALUES (@id, @slug, @nom, @contact_email, @contact_telephone, @categories, @type_lieu_force, @notes_conversations_claude, @premier_client_signe, @statut)`
  ).run({
    id,
    slug,
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
    await performGeneration(id);
  } catch (e) {
    generationWarning = e.message;
  }

  const row = db.prepare("SELECT * FROM lieux WHERE id = ?").get(id);
  res.status(201).json({ lieu: parseLieuRow(row), generation_warning: generationWarning });
});

const EDITABLE_FIELDS = [
  "nom",
  "contact_email",
  "contact_telephone",
  "notes_conversations_claude",
  "statut",
  "type_lieu_force",
];
const EDITABLE_JSON_FIELDS = [
  "categories",
  "tunnel",
  "points_a_verifier",
  "questionnaire_prefill",
  "questionnaire_selection",
];

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
  if (typeof req.body.questionnaire_valide === "boolean") {
    sets.push("questionnaire_valide = @questionnaire_valide");
    params.questionnaire_valide = req.body.questionnaire_valide ? 1 : 0;
  }

  if (sets.length === 0) return res.status(400).json({ error: "Aucun champ éditable fourni" });

  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE lieux SET ${sets.join(", ")} WHERE id = @id`).run(params);

  const updated = db.prepare("SELECT * FROM lieux WHERE id = ?").get(req.params.id);
  res.json(parseLieuRow(updated));
});

internalRouter.post("/lieux/:id/regenerate", async (req, res) => {
  const row = db.prepare("SELECT * FROM lieux WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Lieu introuvable" });

  try {
    await performGeneration(req.params.id, { useQuestionnaireReponses: true });
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
