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
  slug TEXT UNIQUE NOT NULL,
  nom TEXT NOT NULL,
  contact_email TEXT,
  contact_telephone TEXT,
  categories TEXT NOT NULL DEFAULT '[]',
  statut TEXT NOT NULL DEFAULT 'nouveau',
  infos_recueillies TEXT NOT NULL DEFAULT '{}',
  notes_conversations_claude TEXT NOT NULL DEFAULT '',
  profil_lieu_deduit TEXT NOT NULL DEFAULT 'null',
  tunnel TEXT NOT NULL DEFAULT '[]',
  questionnaire_meta TEXT NOT NULL DEFAULT '{}',
  questionnaire_prefill TEXT NOT NULL DEFAULT '{}',
  questionnaire_selection TEXT NOT NULL DEFAULT '{}',
  questionnaire_valide INTEGER NOT NULL DEFAULT 0,
  questionnaire_reponses TEXT,
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

// Migration légère pour les bases déjà déployées avant l'ajout de ces
// colonnes (CREATE TABLE IF NOT EXISTS ne les ajoute pas rétroactivement).
const existingColumns = new Set(db.prepare("PRAGMA table_info(lieux)").all().map((c) => c.name));
const columnsToAdd = [
  ["questionnaire_selection", "TEXT NOT NULL DEFAULT '{}'"],
  ["questionnaire_valide", "INTEGER NOT NULL DEFAULT 0"],
  ["type_lieu_force", "TEXT"],
];
for (const [name, def] of columnsToAdd) {
  if (!existingColumns.has(name)) {
    db.exec(`ALTER TABLE lieux ADD COLUMN ${name} ${def}`);
  }
}

// Statuts possibles, dans l'ordre du tunnel de suivi interne :
// nouveau -> recherche_en_cours -> tunnel_genere -> questionnaire_envoye
// -> questionnaire_recu -> tunnel_affine
//
// questionnaire_valide : distinct du statut ci-dessus - reflète si Solenne a
// validé la sélection de questions proposée (surface 1) avant qu'elle ne
// devienne visible côté lien public (surface 2).

export function getSetting(key, fallback = null) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? JSON.parse(row.value) : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, JSON.stringify(value));
}
