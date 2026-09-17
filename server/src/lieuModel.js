// profil_lieu_deduit.type utilise un vocabulaire différent (chateau_manoir /
// domaine_viticole / autre) des codes de bloc_lieu (L-CH / L-DOM).
export function profilTypeToLieuCode(type) {
  if (type === "chateau_manoir") return "L-CH";
  if (type === "domaine_viticole") return "L-DOM";
  return null;
}

export const STATUTS = {
  NOUVEAU: "nouveau",
  RECHERCHE_EN_COURS: "recherche_en_cours",
  ERREUR_GENERATION: "erreur_generation",
  TUNNEL_GENERE: "tunnel_genere",
  Q1_ENVOYE: "q1_envoye",
  Q1_RECU_INTERET_CONFIRME: "q1_recu_interet_confirme",
  Q1_RECU_EXCEPTION: "q1_recu_exception",
  Q2_GENERE: "q2_genere",
  Q2_ENVOYE: "q2_envoye",
  Q2_RECU: "q2_recu",
  TUNNEL_AFFINE: "tunnel_affine",
};

export const STATUT_LABELS = {
  [STATUTS.NOUVEAU]: "Nouveau",
  [STATUTS.RECHERCHE_EN_COURS]: "Recherche en cours",
  [STATUTS.ERREUR_GENERATION]: "Erreur de génération",
  [STATUTS.TUNNEL_GENERE]: "Tunnel généré, Questionnaire 1 prêt",
  [STATUTS.Q1_ENVOYE]: "Questionnaire 1 envoyé",
  [STATUTS.Q1_RECU_INTERET_CONFIRME]: "Intérêt confirmé, Questionnaire 2 à générer",
  [STATUTS.Q1_RECU_EXCEPTION]: "Q1 reçu - hors périmètre écrit (appel/devis)",
  [STATUTS.Q2_GENERE]: "Questionnaire 2 généré, à valider",
  [STATUTS.Q2_ENVOYE]: "Questionnaire 2 envoyé",
  [STATUTS.Q2_RECU]: "Questionnaire 2 reçu, tunnel à affiner",
  [STATUTS.TUNNEL_AFFINE]: "Tunnel affiné",
};

const JSON_FIELDS = [
  "categories",
  "infos_recueillies",
  "profil_lieu_deduit",
  "tunnel",
  "questionnaire_1_reponses",
  "questionnaire_2_meta",
  "questionnaire_2_prefill",
  "questionnaire_2_selection",
  "questionnaire_2_reponses",
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
  out.questionnaire_2_valide = !!out.questionnaire_2_valide;
  out.statut_label = STATUT_LABELS[out.statut] || out.statut;
  return out;
}

function stripQuestion({ id, text, type, options }) {
  return { id, text, type, options: options || null };
}

// Questionnaire 1 (Intérêt) : statique, aucune curation par lieu - toujours
// prêt dès que la fiche existe. Le prospect ne voit jamais les champs
// internes (contact, notes, statut).
export function publicQ1View(lieu, bank) {
  return {
    slug: lieu.slug_q1,
    nom: lieu.nom,
    deja_soumis: !!lieu.questionnaire_1_reponses,
    prestations: bank.PRESTATIONS,
    services_complementaires: bank.SERVICES_COMPLEMENTAIRES,
    intervenants_groupe_a: bank.INTERVENANTS_GROUPE_A,
    intervenants_groupe_b: bank.INTERVENANTS_GROUPE_B,
    groupe_b_trigger_prestations: bank.GROUPE_B_TRIGGER_PRESTATIONS,
    qualification: bank.QUALIFICATION_LEGERE,
    reveals: bank.REVEALS_Q1,
  };
}

// Questionnaire 2 (Lieu) : curaté + validé par Solenne avant d'être visible.
// Tant que ce n'est pas validé (ou pas encore généré), le prospect ne voit
// qu'un statut "en préparation" (`pret: false`).
export function publicQ2View(lieu) {
  const base = {
    slug: lieu.slug_q2,
    nom: lieu.nom,
    deja_soumis: !!lieu.questionnaire_2_reponses,
    pret: !!(lieu.slug_q2 && lieu.questionnaire_2_valide),
  };
  if (!base.pret) return base;

  const sel = lieu.questionnaire_2_selection || {};
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
    prefill: lieu.questionnaire_2_prefill || {},
  };
}
