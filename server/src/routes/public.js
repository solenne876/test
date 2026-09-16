import express from "express";
import { db } from "../db.js";
import { parseLieuRow, publicQuestionnaireView, STATUTS } from "../lieuModel.js";
import {
  GENERAL_GROUPS,
  LIEU_BLOCKS,
  FORMAT_BLOCKS,
  FORMAT_EXCEPTIONS,
  REVEALS,
  G15_WARNING,
} from "../questionBank.js";

export const publicRouter = express.Router();

// Banque de questions statique — identique pour tous les lieux, servie à
// part pour être mise en cache facilement côté navigateur.
publicRouter.get("/question-bank", (req, res) => {
  res.json({ GENERAL_GROUPS, LIEU_BLOCKS, FORMAT_BLOCKS, FORMAT_EXCEPTIONS, REVEALS, G15_WARNING });
});

publicRouter.get("/questionnaire/:slug", (req, res) => {
  const row = db.prepare("SELECT * FROM lieux WHERE slug = ?").get(req.params.slug);
  if (!row) return res.status(404).json({ error: "Lien inconnu" });
  const lieu = parseLieuRow(row);
  res.json(publicQuestionnaireView(lieu));
});

publicRouter.post("/questionnaire/:slug/submit", (req, res) => {
  const row = db.prepare("SELECT * FROM lieux WHERE slug = ?").get(req.params.slug);
  if (!row) return res.status(404).json({ error: "Lien inconnu" });

  const payload = req.body || {};
  const reponses = {
    lieu_nom: payload.lieu_nom || row.nom,
    date_soumission: new Date().toISOString(),
    type_lieu: payload.type_lieu || null,
    reponses_general: payload.reponses_general || {},
    reponses_lieu: payload.reponses_lieu || {},
    formats_selectionnes_standard: payload.formats_selectionnes_standard || [],
    reponses_formats: payload.reponses_formats || {},
    formats_exception_selectionnes: payload.formats_exception_selectionnes || [],
    contact_exception: payload.contact_exception || {},
    avertissements_actifs: payload.avertissements_actifs || [],
  };

  db.prepare(
    "UPDATE lieux SET questionnaire_reponses = ?, statut = ?, updated_at = datetime('now') WHERE slug = ?"
  ).run(JSON.stringify(reponses), STATUTS.QUESTIONNAIRE_RECU, req.params.slug);

  res.status(201).json({ ok: true });
});
