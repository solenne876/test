import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import "./db.js"; // initialise le schéma au démarrage
import { internalRouter } from "./routes/internal.js";
import { publicRouter } from "./routes/public.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const PUBLIC_INTERNAL = path.join(ROOT, "public", "internal");
const PUBLIC_Q1 = path.join(ROOT, "public", "q1");
const PUBLIC_Q2 = path.join(ROOT, "public", "q2");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Protège la surface interne (interface + API interne) par Basic Auth quand
// INTERNAL_BASIC_AUTH_USER/PASS sont configurés - utile dès que l'outil est
// déployé sur une URL publique. Jamais appliqué à /q ni /api/public : le lien
// questionnaire doit rester accessible au prospect sans identifiants.
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireInternalAuth(req, res, next) {
  const user = process.env.INTERNAL_BASIC_AUTH_USER;
  const pass = process.env.INTERNAL_BASIC_AUTH_PASS;
  if (!user || !pass) return next(); // non configuré : pas de gate (dev local)

  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [reqUser, reqPass] = Buffer.from(encoded, "base64").toString().split(":");
    if (reqUser && reqPass && timingSafeEqual(reqUser, user) && timingSafeEqual(reqPass, pass)) {
      return next();
    }
  }
  res.set("WWW-Authenticate", 'Basic realm="Kleiomne - acces interne"');
  res.status(401).send("Authentification requise.");
}

app.use("/api/public", publicRouter);
app.use("/api", requireInternalAuth, internalRouter);

// Surface 2 - liens publics par lieu, sans authentification : Questionnaire 1
// (intérêt, /q1/<slug>) et Questionnaire 2 (lieu, /q2/<slug>)
app.use("/q1", express.static(PUBLIC_Q1));
app.get("/q1/:slug", (req, res) => {
  res.sendFile(path.join(PUBLIC_Q1, "index.html"));
});
app.use("/q2", express.static(PUBLIC_Q2));
app.get("/q2/:slug", (req, res) => {
  res.sendFile(path.join(PUBLIC_Q2, "index.html"));
});

// Surface 1 - interface interne, protégée par Basic Auth si configuré (voir
// INTERNAL_BASIC_AUTH_USER/PASS dans .env.example)
app.use(requireInternalAuth, express.static(PUBLIC_INTERNAL));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Kleiomné - outil de prospection en écoute sur http://localhost:${PORT}`);
});
