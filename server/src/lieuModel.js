export const STATUTS = {
  NOUVEAU: "nouveau",
  RECHERCHE_EN_COURS: "recherche_en_cours",
  ERREUR_GENERATION: "erreur_generation",
  TUNNEL_GENERE: "tunnel_genere",
  QUESTIONNAIRE_ENVOYE: "questionnaire_envoye",
  QUESTIONNAIRE_RECU: "questionnaire_recu",
  TUNNEL_AFFINE: "tunnel_affine",
};

export const STATUT_LABELS = {
  [STATUTS.NOUVEAU]: "Nouveau",
  [STATUTS.RECHERCHE_EN_COURS]: "Recherche en cours",
  [STATUTS.ERREUR_GENERATION]: "Erreur de génération",
  [STATUTS.TUNNEL_GENERE]: "Tunnel généré",
  [STATUTS.QUESTIONNAIRE_ENVOYE]: "Questionnaire envoyé",
  [STATUTS.QUESTIONNAIRE_RECU]: "Questionnaire reçu, tunnel à affiner",
  [STATUTS.TUNNEL_AFFINE]: "Tunnel affiné",
};

const JSON_FIELDS = [
  "categories",
  "infos_recueillies",
  "profil_lieu_deduit",
  "tunnel",
  "questionnaire_meta",
  "questionnaire_prefill",
  "questionnaire_reponses",
  "points_a_verifier",
];

export function parseLieuRow(row) {
  if (!row) return null;
  const out = { ...row };
  for (const field of JSON_FIELDS) {
    if (out[field] == null) {
      out[field] = null;
      continue;
    }
    try {
      out[field] = JSON.parse(out[field]);
    } catch {
      out[field] = null;
    }
  }
  out.premier_client_signe = !!out.premier_client_signe;
  out.statut_label = STATUT_LABELS[out.statut] || out.statut;
  return out;
}

// Champs exposés côté public (surface 2) — jamais le contact, les notes
// internes, ou l'historique d'échanges, qui n'ont rien à faire chez le prospect.
export function publicQuestionnaireView(lieu) {
  return {
    slug: lieu.slug,
    nom: lieu.nom,
    questionnaire_meta: lieu.questionnaire_meta,
    questionnaire_prefill: lieu.questionnaire_prefill,
    deja_soumis: !!lieu.questionnaire_reponses,
  };
}
