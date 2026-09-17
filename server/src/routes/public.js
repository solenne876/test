import express from "express";
import { db } from "../db.js";
import { parseLieuRow, publicQ1View, publicQ2View, STATUTS } from "../lieuModel.js";
import * as bank from "../questionBank.js";
import { PRESTATION_TO_FORMAT } from "../questionBank.js";

export const publicRouter = express.Router();

// Banque de questions statique - identique pour tous les lieux, servie à
// part pour être mise en cache facilement côté navigateur. Couvre les deux
// questionnaires (catalogues Q1 + blocs Q2).
publicRouter.get("/question-bank", (req, res) => {
  res.json({
    PRESTATIONS: bank.PRESTATIONS,
    SERVICES_COMPLEMENTAIRES: bank.SERVICES_COMPLEMENTAIRES,
    INTERVENANTS_GROUPE_A: bank.INTERVENANTS_GROUPE_A,
    INTERVENANTS_GROUPE_B: bank.INTERVENANTS_GROUPE_B,
    GROUPE_B_TRIGGER_PRESTATIONS: bank.GROUPE_B_TRIGGER_PRESTATIONS,
    QUALIFICATION_LEGERE: bank.QUALIFICATION_LEGERE,
    REVEALS_Q1: bank.REVEALS_Q1,
    LIEU_BLOCKS: bank.LIEU_BLOCKS,
    FORMAT_BLOCKS: bank.FORMAT_BLOCKS,
    FORMAT_EXCEPTIONS: bank.FORMAT_EXCEPTIONS,
    REVEALS_Q2: bank.REVEALS_Q2,
    G15_WARNING: bank.G15_WARNING,
  });
});

// ---------- Questionnaire 1 (Intérêt) ----------

publicRouter.get("/q1/:slug", (req, res) => {
  const row = db.prepare("SELECT * FROM lieux WHERE slug_q1 = ?").get(req.params.slug);
  if (!row) return res.status(404).json({ error: "Lien inconnu" });
  const lieu = parseLieuRow(row);
  res.json(publicQ1View(lieu, bank));
});

publicRouter.post("/q1/:slug/submit", (req, res) => {
  const row = db.prepare("SELECT * FROM lieux WHERE slug_q1 = ?").get(req.params.slug);
  if (!row) return res.status(404).json({ error: "Lien inconnu" });

  const payload = req.body || {};
  const reponses = {
    lieu_nom: payload.lieu_nom || row.nom,
    date_soumission: new Date().toISOString(),
    prestations_interessees: payload.prestations_interessees || [],
    services_complementaires_interesses: payload.services_complementaires_interesses || [],
    intervenants_groupe_a: payload.intervenants_groupe_a || [],
    intervenants_groupe_b: payload.intervenants_groupe_b || [],
    reponses_qualification: payload.reponses_qualification || {},
  };

  const hasStandard = reponses.prestations_interessees.some((p) => PRESTATION_TO_FORMAT[p]);
  const interetStatut = hasStandard ? "confirme" : "exception_uniquement";
  const newStatut = hasStandard ? STATUTS.Q1_RECU_INTERET_CONFIRME : STATUTS.Q1_RECU_EXCEPTION;

  db.prepare(
    "UPDATE lieux SET questionnaire_1_reponses = ?, interet_statut = ?, statut = ?, updated_at = datetime('now') WHERE slug_q1 = ?"
  ).run(JSON.stringify(reponses), interetStatut, newStatut, req.params.slug);

  res.status(201).json({ ok: true });
});

// ---------- Questionnaire 2 (Lieu) ----------

publicRouter.get("/q2/:slug", (req, res) => {
  const row = db.prepare("SELECT * FROM lieux WHERE slug_q2 = ?").get(req.params.slug);
  if (!row) return res.status(404).json({ error: "Lien inconnu" });
  const lieu = parseLieuRow(row);
  res.json(publicQ2View(lieu));
});

publicRouter.post("/q2/:slug/submit", (req, res) => {
  const row = db.prepare("SELECT * FROM lieux WHERE slug_q2 = ?").get(req.params.slug);
  if (!row) return res.status(404).json({ error: "Lien inconnu" });

  const payload = req.body || {};
  const reponses = {
    lieu_nom: payload.lieu_nom || row.nom,
    date_soumission: new Date().toISOString(),
    type_lieu: payload.type_lieu || null,
    reponses_general: payload.reponses_general || {},
    reponses_lieu: payload.reponses_lieu || {},
    formats_affiches: payload.formats_affiches || [],
    reponses_formats: payload.reponses_formats || {},
    formats_exception_selectionnes: payload.formats_exception_selectionnes || [],
    contact_exception: payload.contact_exception || {},
    avertissements_actifs: payload.avertissements_actifs || [],
  };

  db.prepare(
    "UPDATE lieux SET questionnaire_2_reponses = ?, statut = ?, updated_at = datetime('now') WHERE slug_q2 = ?"
  ).run(JSON.stringify(reponses), STATUTS.Q2_RECU, req.params.slug);

  res.status(201).json({ ok: true });
});
