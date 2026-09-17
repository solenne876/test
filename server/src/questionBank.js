// Banque de questions, transcrite depuis prompt-systeme-generation-tunnel.md
// et prompt-branching-questionnaire.md (deux questionnaires distincts : Q1
// Intérêt, envoyé tôt avec le mail de prospection, et Q2 Lieu, envoyé après
// confirmation d'intérêt). Ce module est la SEULE source de vérité pour la
// banque, utilisée à la fois par le générateur de tunnel et les deux
// surfaces publiques (/q1/<slug>, /q2/<slug>).

// ---------- Questionnaire 2 (Lieu) - bloc général restant ----------
// G11, G12, G17 sont posées en Questionnaire 1 (qualification légère) et ne
// sont jamais reposées ici. G18 est retirée définitivement (doublon de G12,
// déjà tranché par la réponse au Questionnaire 1).
export const GENERAL_GROUPS = [
  {
    subtitle: "Identité et histoire",
    questions: [
      { id: "G01", type: "QF", text: "Cette histoire est-elle déjà racontée quelque part (site, brochure, visite guidée) ?", options: ["Oui", "Non", "Partiellement"] },
      { id: "G02", type: "QO", text: "Y a-t-il un personnage, un événement historique ou une anecdote peu exploitée que vous aimeriez mettre en avant ?" },
      { id: "G03", type: "QO", text: "Comment gérez-vous votre identité de marque/communication ?" },
    ],
  },
  {
    subtitle: "Activité actuelle",
    questions: [
      { id: "G04", type: "QO", text: "Quelle est votre activité principale aujourd'hui ?" },
      { id: "G05", type: "QO", text: "Avez-vous déjà accueilli des animations ou événements à thème ? Lesquels ?" },
      { id: "G06", type: "QO", text: "Qu'est-ce qui a bien fonctionné, et qu'est-ce qui a déçu, dans vos expériences passées avec des prestataires ?" },
      { id: "G07", type: "QF", text: "Travaillez-vous déjà avec des partenaires réguliers (traiteurs, décorateurs, troupes) ?", options: ["Oui", "Non"] },
      { id: "G08", type: "QO", text: "Quelle est votre fréquentation actuelle, et comment varie-t-elle selon les saisons ?" },
    ],
  },
  {
    subtitle: "Public et clientèle",
    questions: [
      { id: "G09", type: "QO", text: "Qui est votre clientèle actuelle ?" },
      { id: "G10", type: "QO", text: "Souhaitez-vous toucher un nouveau public avec ce type d'événement, ou fidéliser l'existant ?" },
    ],
  },
  {
    subtitle: "Objectifs et motivations",
    questions: [
      { id: "G13", type: "QO", text: "Avez-vous une échéance précise en tête (inauguration, anniversaire du lieu, ouverture de saison) ?" },
    ],
  },
  {
    subtitle: "Cadre pratique et contraintes",
    questions: [
      { id: "G14", type: "QO", text: "Quelle est votre capacité d'accueil en intérieur et en extérieur ?" },
      { id: "G15", type: "QF", text: "Le lieu est-il classé ou protégé, avec des contraintes particulières (bruit, feu, structures) ?", options: ["Oui", "Non"] },
      { id: "G16", type: "QF", text: "Avez-vous du personnel disponible le jour J, ou faut-il tout externaliser ?", options: ["Personnel disponible", "Tout externaliser"] },
    ],
  },
  {
    subtitle: "Vision et ambition",
    questions: [
      { id: "G19", type: "QF", text: "Seriez-vous ouvert à ce que l'événement serve aussi de vitrine pour attirer d'autres types de clients (privatisations, entreprises) ?", options: ["Oui", "Non"] },
      { id: "G20", type: "QO", text: "Avez-vous des freins ou réticences que vous anticipez déjà ?" },
    ],
  },
];

// IDs du bloc général Q2 (toujours affichées en intégralité, "Toutes
// affichées sur la même étape" - pas de sélection par lieu à ce niveau).
export const GENERAL_Q2_IDS = GENERAL_GROUPS.flatMap((g) => g.questions.map((q) => q.id));

// ---------- Questionnaire 1 (Intérêt) - qualification légère ----------
export const QUALIFICATION_LEGERE = [
  { id: "G11", type: "QO", text: "Qu'est-ce qui vous a donné envie d'explorer ce type d'expérience aujourd'hui ?" },
  { id: "G12", type: "QF", text: "Voyez-vous ça comme un événement ponctuel ou comme une nouvelle offre récurrente ?", options: ["Ponctuel", "Récurrent", "Je ne sais pas encore"] },
  { id: "G12a", type: "QF", text: "À quelle fréquence imaginez-vous cela ?", options: ["Quotidien", "Hebdomadaire", "Mensuel", "Saisonnier", "Annuel", "Je ne sais pas encore"] },
  { id: "G17", type: "QO", text: "Avez-vous déjà une enveloppe budgétaire en tête, ou souhaitez-vous une proposition selon le format ?" },
];

export const REVEALS_Q1 = [{ from: "G12", value: "Récurrent", reveal: ["G12a"] }];

// ---------- Questionnaire 1 - catalogues (cases à cocher, QC) ----------
export const PRESTATIONS = [
  { code: "P-VIS", label: "Visite théâtralisée / nocturne aux chandelles", description: "Un parcours costumé dans votre lieu, de jour ou aux chandelles" },
  { code: "P-DIN", label: "Dîner immersif", description: "Une soirée à thème scénarisée autour du repas" },
  { code: "P-MUR", label: "Murder party", description: "Une enquête à énigme jouée en huis clos" },
  { code: "P-ENQ", label: "Enquête immersive / jeu de piste", description: "Un parcours à énigmes dans vos espaces" },
  { code: "P-BAL", label: "Bal fantasy", description: "Une soirée dansante costumée dans un univers imaginaire" },
  { code: "P-PON", label: "Événement sur-mesure", description: "Une idée précise en tête, ou une occasion particulière à célébrer" },
];

export const SERVICES_COMPLEMENTAIRES = [
  { code: "A-CHA", label: "Charte narrative / storytelling du lieu", description: "Mise en récit permanente de l'histoire du lieu" },
  { code: "A-SUP", label: "Supports imprimés in-diegesis", description: "Programme thématisé, indices, flyers dans l'univers de l'événement" },
  { code: "A-SPJ", label: "Supervision narrative le jour J", description: "" },
  { code: "A-ACC", label: "Accompagnement annuel / programmation récurrente", description: "" },
  { code: "A-COM", label: "Supports marketing / communication", description: "" },
  { code: "A-CAP", label: "Captation photo/vidéo de l'événement", description: "Pour la communication du lieu et de Kleiomné" },
  { code: "A-FOR", label: "Formation des guides ou du personnel du lieu", description: "À l'animation narrative" },
];

export const INTERVENANTS_GROUPE_A = [
  { code: "IA-COM", label: "Comédien(s)" },
  { code: "IA-MUS", label: "Musicien(s) live" },
  { code: "IA-TRO", label: "Troubadour / conteur" },
  { code: "IA-DAN", label: "Danseur(s) / initiation chorégraphique" },
  { code: "IA-MEN", label: "Meneur de jeu / animateur" },
  { code: "IA-CBT", label: "Initiation combat d'époque" },
  { code: "IA-DIV", label: "Diseur de bonne aventure / tarot thématisé" },
  { code: "IA-CAL", label: "Calligraphe / enlumineur" },
];

// Affiché uniquement si P-DIN, P-BAL ou P-PON est coché à l'étape 1 (voir
// REVEALS_Q1_GROUPE_B ci-dessous).
export const INTERVENANTS_GROUPE_B = [
  { code: "IB-TRA", label: "Traiteur" },
  { code: "IB-EST", label: "Professionnels de l'esthétique", description: "Stand maquillage/coiffure/ongles" },
  { code: "IB-PHO", label: "Animation photo pour les invités", description: "Portraits en costume, etc. - distinct de la captation de l'événement (A-CAP)" },
  { code: "IB-BOOTH", label: "Photobooth" },
];

// Prestations qui déclenchent l'affichage du Groupe B (étape 3 du Q1)
export const GROUPE_B_TRIGGER_PRESTATIONS = ["P-DIN", "P-BAL", "P-PON"];

// ---------- Questionnaire 2 (Lieu) - selon le type de lieu ----------
export const LIEU_BLOCKS = {
  "L-CH": {
    label: "Château / manoir / demeure historique",
    questions: [
      { id: "L-CH1", type: "QF", text: "Le château est-il habité à l'année par la famille propriétaire, ou uniquement ouvert lors d'événements ?", options: ["Habité à l'année", "Ouvert uniquement lors d'événements"] },
      { id: "L-CH2", type: "QO", text: "Quelles pièces intérieures sont ouvertes ou pourraient être ouvertes à un événement (salons, grande salle, cuisines d'époque, caves) ?" },
      { id: "L-CH3", type: "QO", text: "Quels espaces extérieurs sont exploitables (cour d'honneur, jardins à la française, parc, dépendances, orangerie) ?" },
      { id: "L-CH4", type: "QF", text: "Y a-t-il des espaces actuellement fermés au public que vous seriez prêts à ouvrir pour une expérience immersive ?", options: ["Oui", "Non"] },
      { id: "L-CH5", type: "QF", text: "Existe-t-il un parcours de visite déjà balisé ?", options: ["Oui", "Non"] },
      { id: "L-CH6", type: "QO", text: "Seriez-vous prêts à nous transmettre les documents associés (trame du parcours, script du guide, fiches historiques) pour qu'on s'appuie dessus plutôt que de repartir de zéro ?" },
      { id: "L-CH7", type: "QF", text: "Avez-vous une saison touristique marquée (ouverture d'avril à octobre par exemple) ou une activité toute l'année ?", options: ["Saison marquée", "Activité toute l'année"] },
      { id: "L-CH8", type: "QO", text: "Voyez-vous ce type d'événement comme un moyen de financer l'entretien du bâti sur le long terme ?" },
    ],
  },
  "L-DOM": {
    label: "Domaine viticole / producteur artisanal",
    questions: [
      { id: "L-DOM1", type: "QO", text: "Quel est le produit phare à mettre en valeur (cuvée, recette, savoir-faire) ?" },
      { id: "L-DOM2", type: "QF", text: "Avez-vous déjà un espace dédié à la dégustation ou à la réception de groupes ?", options: ["Oui", "Non"] },
      { id: "L-DOM3", type: "QO", text: "Y a-t-il une saisonnalité de production à respecter (vendanges, distillation) qui contraint les dates possibles ?" },
    ],
  },
};

// Formats couverts par le questionnaire écrit standard (Questionnaire 2)
export const FORMAT_BLOCKS = {
  "F-VIS": {
    label: "Visite théâtralisée / nocturne aux chandelles",
    questions: [
      { id: "F-VIS1", type: "QO", text: "Le parcours doit-il suivre un circuit déjà existant, ou peut-on en imaginer un nouveau librement ? Avez-vous des préférences ?" },
      { id: "F-VIS2", type: "QO", text: "Combien de comédiens seriez-vous prêts à accueillir sur le lieu en simultané ?" },
      { id: "F-VIS3", type: "QF", text: "Préférez-vous une visite fidèle à l'histoire réelle du lieu (rigueur historique), ou êtes-vous ouverts à une scénarisation plus libre/fictionnalisée même si elle s'éloigne des faits ?", options: ["Rigueur historique", "Scénarisation libre / fictionnalisée"] },
    ],
  },
  "F-DIN": {
    label: "Dîner immersif",
    questions: [
      { id: "F-DIN1", type: "QO", text: "Combien de couverts maximum votre espace de restauration peut-il accueillir ?" },
      { id: "F-DIN2", type: "QF", text: "Disposez-vous d'une cuisine sur place, ou faut-il prévoir un traiteur externe ?", options: ["Cuisine sur place", "Traiteur externe à prévoir"] },
      { id: "F-DIN3", type: "QF", text: "Votre équipe peut-elle absorber un menu à thème sans perturber son fonctionnement habituel ?", options: ["Oui", "Non"] },
      { id: "F-DIN4", type: "QF", text: "Avez-vous déjà un traiteur partenaire ?", options: ["Oui", "Non"] },
      { id: "F-DIN5", type: "QF", text: "Le public doit-il jouer un rôle actif (murder party à table, énigme entre les plats) ou rester spectateur d'une mise en scène ?", options: ["Rôle actif", "Spectateur"] },
      { id: "F-DIN6", type: "QO", text: "Combien de temps souhaitez-vous que dure l'événement dans son ensemble (accueil compris) ?" },
      { id: "F-DIN7", type: "QO", text: "Y a-t-il des moments du dîner que vous souhaitez sanctuariser sans animation (ex. discours, remise de prix) ?" },
      { id: "F-DIN8", type: "QO", text: "Quelle est la fourchette de prix habituelle de vos dîners ou soirées, pour caler le positionnement du menu à thème ?" },
      { id: "F-DIN9", type: "QF", text: "Voyez-vous ce format comme un événement ponctuel ou une soirée à thème récurrente ?", options: ["Événement ponctuel", "Soirée à thème récurrente"] },
      { id: "F-DIN10", type: "QF", text: "Souhaitez-vous un dîner thématisé ou scénarisé ?", options: ["Thématisé", "Scénarisé"] },
    ],
  },
  "F-MUR": {
    label: "Murder party",
    questions: [
      { id: "F-MUR1", type: "QF", text: "Disposez-vous d'un espace fermé permettant un huis clos (une ou plusieurs pièces communicantes) ?", options: ["Oui", "Non"] },
      { id: "F-MUR2", type: "QF", text: "Y a-t-il plusieurs petites pièces annexes utilisables pour des apartés/interrogatoires entre joueurs ?", options: ["Oui", "Non"] },
      { id: "F-MUR3", type: "QF", text: "L'espace permet-il de moduler l'éclairage pour une ambiance tamisée/mystérieuse ?", options: ["Oui", "Non"] },
      { id: "F-MUR4", type: "QF", text: "Quelle jauge visez-vous ? Petit groupe (plus d'interactivité) ou plus grand groupe (façon pièce de théâtre immersive) ?", options: ["Petit groupe", "Grand groupe"] },
      { id: "F-MUR5", type: "QO", text: "Quel est votre objectif en termes de régularité du format ?" },
      { id: "F-MUR6", type: "QF", text: "Le public doit-il incarner des personnages avec des costumes fournis, ou vient-il déjà déguisé ?", options: ["Costumes fournis", "Vient déjà déguisé"] },
      { id: "F-MUR7", type: "QF", text: "Souhaitez-vous que les participants découvrent leur rôle avant l'événement (en amont par mail) ou sur place ?", options: ["En amont par mail", "Sur place"] },
      { id: "F-MUR8", type: "QO", text: "Combien de comédiens/meneurs de jeu seriez-vous prêts à accueillir pour encadrer l'intrigue ?" },
      { id: "F-MUR9", type: "QF", text: "L'intrigue doit-elle s'inspirer d'un fait réel ou d'un personnage ayant existé dans l'histoire du lieu, ou préférez-vous une intrigue totalement fictive ?", options: ["Inspirée d'un fait réel / personnage du lieu", "Intrigue totalement fictive"] },
      { id: "F-MUR10", type: "QF", text: "Voyez-vous ce format comme un événement ponctuel ou une offre récurrente ?", options: ["Événement ponctuel", "Offre récurrente"] },
    ],
  },
  "F-ENQ": {
    label: "Enquête immersive / jeu de piste narratif",
    questions: [
      { id: "F-ENQ1", type: "QO", text: "Y a-t-il des éléments déjà présents sur le lieu (objets, inscriptions, architecture) pouvant servir de vrais indices dans l'enquête ?" },
      { id: "F-ENQ2", type: "QF", text: "L'enquête doit-elle s'appuyer sur un mystère réel lié à l'histoire du lieu, ou préférez-vous une intrigue totalement fictive ?", options: ["Mystère réel lié à l'histoire du lieu", "Intrigue totalement fictive"] },
      { id: "F-ENQ3", type: "QO", text: "Y a-t-il un objet, un trésor ou un secret emblématique du lieu à utiliser comme fil rouge de l'enquête ?" },
      { id: "F-ENQ4", type: "QF", text: "Format en petits groupes mêlant comédiens et indices physiques nombreux (plus interactif, plus lourd, permet une vraie récurrence), ou format façon pièce de théâtre immersive avec surtout des comédiens et des indices physiques légers (plus simple, ponctuel ou régulier) ?", options: ["Petits groupes, indices physiques nombreux", "Façon pièce de théâtre immersive, indices légers"] },
      { id: "F-ENQ5", type: "QO", text: "Y a-t-il un âge minimum ou une cible privilégiée (familles avec enfants, adultes, groupes d'entreprise) ?" },
      { id: "F-ENQ6", type: "QF", text: "Animation ponctuelle, ou expérience permanente proposée toute la saison (comme un escape game fixe) ?", options: ["Animation ponctuelle", "Expérience permanente (toute la saison)"] },
      { id: "F-ENQ7", type: "QO", text: "Quel tarif par personne ou par équipe envisagez-vous ?" },
    ],
  },
};

// Prestations hors périmètre du questionnaire écrit standard (jamais de
// Questionnaire 2 les concernant - voir §3.3 : exception directe)
export const FORMAT_EXCEPTIONS = {
  "F-BAL": {
    label: "Bal fantasy",
    encart: "Ce format se qualifie par échange direct (appel qualifié), le cadrage étant trop complexe pour un questionnaire écrit standard.",
    contactField: true,
  },
  "F-PON": {
    label: "Événement sur-mesure",
    encart: "Ce format se traite sur devis au cas par cas.",
    contactField: false,
  },
};

// Mapping déterministe Q1 -> Q2 : quelle prestation cochée au Questionnaire 1
// ouvre quel bloc de questions au Questionnaire 2. Ce mapping est appliqué en
// code, jamais laissé à l'appréciation du modèle.
export const PRESTATION_TO_FORMAT = { "P-VIS": "F-VIS", "P-DIN": "F-DIN", "P-MUR": "F-MUR", "P-ENQ": "F-ENQ" };
export const PRESTATION_TO_EXCEPTION = { "P-BAL": "F-BAL", "P-PON": "F-PON" };

// Table exhaustive des branchements conditionnels du Questionnaire 2 - SEULS
// branchements à implémenter (le branchement G12 -> G12a appartient au
// Questionnaire 1, voir REVEALS_Q1 ci-dessus).
export const REVEALS_Q2 = [
  { from: "L-CH5", value: "Oui", reveal: ["L-CH6"] },
  { from: "F-DIN2", value: "Cuisine sur place", reveal: ["F-DIN3"] },
  { from: "F-MUR4", value: "Petit groupe", reveal: ["F-MUR6", "F-MUR7"] },
];

// Avertissement G15 (lieu classé/protégé) - uniquement F-VIS, et seulement si
// G15 a déjà une réponse au moment où le bloc F-VIS est atteint.
export const G15_WARNING = {
  triggerQuestion: "G15",
  triggerValue: "Oui",
  targetFormat: "F-VIS",
  message: "à valider si le lieu est classé/protégé (bruit, feu, structures)",
};

export function allQuestionsById() {
  const map = {};
  for (const group of GENERAL_GROUPS) for (const q of group.questions) map[q.id] = q;
  for (const q of QUALIFICATION_LEGERE) map[q.id] = q;
  for (const block of Object.values(LIEU_BLOCKS)) for (const q of block.questions) map[q.id] = q;
  for (const block of Object.values(FORMAT_BLOCKS)) for (const q of block.questions) map[q.id] = q;
  return map;
}

export function questionBankSummaryForPrompt() {
  const lines = [];
  lines.push("--- Questionnaire 1 (Intérêt, statique, envoyé tôt) ---");
  lines.push("Prestations (case à cocher, une par catégorie) : " + PRESTATIONS.map((p) => p.code).join(", "));
  lines.push("Services complémentaires (cases à cocher) : " + SERVICES_COMPLEMENTAIRES.map((s) => s.code).join(", "));
  lines.push("Intervenants groupe A (toujours affiché) : " + INTERVENANTS_GROUPE_A.map((i) => i.code).join(", "));
  lines.push("Intervenants groupe B (affiché si P-DIN/P-BAL/P-PON coché) : " + INTERVENANTS_GROUPE_B.map((i) => i.code).join(", "));
  lines.push("Qualification légère : " + QUALIFICATION_LEGERE.map((q) => q.id).join(", ") + " (G12a affichée seulement si G12=Récurrent)");
  lines.push("");
  lines.push("--- Questionnaire 2 (Lieu, envoyé après confirmation d'intérêt) ---");
  lines.push("Bloc général restant (toujours affiché en intégralité) : " + GENERAL_Q2_IDS.join(", "));
  for (const [key, block] of Object.entries(LIEU_BLOCKS)) {
    lines.push(`Bloc lieu ${key} (${block.label}) : ` + block.questions.map((q) => q.id).join(", "));
  }
  for (const [key, block] of Object.entries(FORMAT_BLOCKS)) {
    lines.push(`Bloc format ${key} (${block.label}), affiché uniquement si P-xx correspondant coché au Q1 : ` + block.questions.map((q) => q.id).join(", "));
  }
  lines.push("Formats hors périmètre écrit : F-BAL (appel qualifié), F-PON (devis au cas par cas)");
  lines.push("");
  lines.push("Important : la sélection des blocs de format du Questionnaire 2 est déterminée par le code à partir des prestations cochées au Questionnaire 1 (mapping P-xx -> F-xx), pas par toi. Le bloc général et le bloc lieu du Questionnaire 2 sont toujours affichés en intégralité, sans sélection de sous-ensemble à faire de ton côté.");
  return lines.join("\n");
}
