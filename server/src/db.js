import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, "kleiomne.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS lieux (
  id TEXT PRIMARY KEY,
  slug_q1 TEXT UNIQUE NOT NULL,
  slug_q2 TEXT UNIQUE,
  nom TEXT NOT NULL,
  contact_email TEXT,
  contact_telephone TEXT,
  categories TEXT NOT NULL DEFAULT '[]',
  statut TEXT NOT NULL DEFAULT 'nouveau',
  infos_recueillies TEXT NOT NULL DEFAULT '{}',
  notes_conversations_claude TEXT NOT NULL DEFAULT '',
  profil_lieu_deduit TEXT NOT NULL DEFAULT 'null',
  tunnel TEXT NOT NULL DEFAULT '[]',
  questionnaire_1_reponses TEXT,
  interet_statut TEXT,
  questionnaire_2_meta TEXT NOT NULL DEFAULT '{}',
  questionnaire_2_prefill TEXT NOT NULL DEFAULT '{}',
  questionnaire_2_selection TEXT NOT NULL DEFAULT '{}',
  questionnaire_2_valide INTEGER NOT NULL DEFAULT 0,
  questionnaire_2_reponses TEXT,
  points_a_verifier TEXT NOT NULL DEFAULT '[]',
  premier_client_signe INTEGER NOT NULL DEFAULT 0,
  type_lieu_force TEXT,
  generation_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// Migration pour les bases déjà déployées avant l'introduction du modèle à
// deux questionnaires (CREATE TABLE IF NOT EXISTS n'affecte pas une table
// déjà existante). Renomme les anciennes colonnes du questionnaire unique
// vers leur équivalent "Questionnaire 2", et ajoute les colonnes nouvelles.
let existingColumns = new Set(db.prepare("PRAGMA table_info(lieux)").all().map((c) => c.name));

const renames = [
  ["slug", "slug_q1"],
  ["questionnaire_meta", "questionnaire_2_meta"],
  ["questionnaire_prefill", "questionnaire_2_prefill"],
  ["questionnaire_selection", "questionnaire_2_selection"],
  ["questionnaire_valide", "questionnaire_2_valide"],
  ["questionnaire_reponses", "questionnaire_2_reponses"],
];
for (const [from, to] of renames) {
  if (existingColumns.has(from) && !existingColumns.has(to)) {
    db.exec(`ALTER TABLE lieux RENAME COLUMN ${from} TO ${to}`);
  }
}

existingColumns = new Set(db.prepare("PRAGMA table_info(lieux)").all().map((c) => c.name));
const columnsToAdd = [
  ["slug_q2", "TEXT"],
  ["questionnaire_1_reponses", "TEXT"],
  ["interet_statut", "TEXT"],
  ["type_lieu_force", "TEXT"],
  ["questionnaire_2_meta", "TEXT NOT NULL DEFAULT '{}'"],
  ["questionnaire_2_prefill", "TEXT NOT NULL DEFAULT '{}'"],
  ["questionnaire_2_selection", "TEXT NOT NULL DEFAULT '{}'"],
  ["questionnaire_2_valide", "INTEGER NOT NULL DEFAULT 0"],
  ["questionnaire_2_reponses", "TEXT"],
];
for (const [name, def] of columnsToAdd) {
  if (!existingColumns.has(name)) {
    db.exec(`ALTER TABLE lieux ADD COLUMN ${name} ${def}`);
  }
}
// slug_q2 doit être unique une fois peuplé, mais ALTER TABLE ADD COLUMN ne
// permet pas d'ajouter une contrainte UNIQUE directement - on la recrée ici
// si elle n'existe pas déjà (no-op si déjà présente, ex. table fraîchement créée).
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_lieux_slug_q2 ON lieux(slug_q2) WHERE slug_q2 IS NOT NULL`);

// Statuts possibles, dans l'ordre du suivi interne :
// nouveau -> recherche_en_cours -> tunnel_genere
// -> q1_envoye -> q1_recu_interet_confirme | q1_recu_exception
// -> q2_genere -> q2_envoye -> q2_recu -> tunnel_affine
//
// interet_statut : "confirme" (au moins une prestation standard cochée au Q1)
// ou "exception_uniquement" (seulement P-BAL/P-PON, ou rien de standard) -
// détermine si un Questionnaire 2 standard a lieu d'être généré.
//
// questionnaire_2_valide : distinct du statut ci-dessus - reflète si Solenne
// a validé la sélection de questions du Questionnaire 2 (surface 1) avant
// qu'elle ne devienne visible côté lien public (surface 2, /q2/<slug_q2>).

export function getSetting(key, fallback = null) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? JSON.parse(row.value) : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, JSON.stringify(value));
}
