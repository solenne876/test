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
  "questionnaire_selection",
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
  out.questionnaire_valide = !!out.questionnaire_valide;
  out.statut_label = STATUT_LABELS[out.statut] || out.statut;
  return out;
}

function stripQuestion({ id, text, type, options }) {
  return { id, text, type, options: options || null };
}

// Champs exposés côté public (surface 2) - jamais le contact, les notes
// internes, ou l'historique d'échanges, qui n'ont rien à faire chez le prospect.
// Tant que Solenne n'a pas validé la sélection de questions (surface 1), le
// prospect ne voit rien d'autre que "en préparation" (voir `pret`).
export function publicQuestionnaireView(lieu) {
  const base = {
    slug: lieu.slug,
    nom: lieu.nom,
    deja_soumis: !!lieu.questionnaire_reponses,
    pret: !!lieu.questionnaire_valide,
  };
  if (!base.pret) return base;

  const sel = lieu.questionnaire_selection || {};
  const formats = {};
  for (const [code, questions] of Object.entries(sel.formats || {})) {
    const included = (questions || []).filter((q) => q.included).map(stripQuestion);
    if (included.length) formats[code] = included;
  }

  return {
    ...base,
    type_lieu: sel.lieu?.type_lieu || null,
    questions_general: (sel.general || []).filter((q) => q.included).map(stripQuestion),
    questions_lieu: (sel.lieu?.questions || []).filter((q) => q.included).map(stripQuestion),
    formats,
    formats_exception: (sel.formatsException || []).filter((e) => e.included).map((e) => e.code),
    prefill: lieu.questionnaire_prefill || {},
  };
}
