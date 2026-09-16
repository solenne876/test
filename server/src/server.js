import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import "./db.js"; // initialise le schéma au démarrage
import { internalRouter } from "./routes/internal.js";
import { publicRouter } from "./routes/public.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const PUBLIC_INTERNAL = path.join(ROOT, "public", "internal");
const PUBLIC_Q = path.join(ROOT, "public", "q");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use("/api/public", publicRouter);
app.use("/api", internalRouter);

// Surface 2 — lien public par lieu (outil.toi/q/<slug>), sans authentification
app.use("/q", express.static(PUBLIC_Q));
app.get("/q/:slug", (req, res) => {
  res.sendFile(path.join(PUBLIC_Q, "index.html"));
});

// Surface 1 — interface interne (à restreindre au niveau de l'hébergement,
// aucune authentification applicative n'est mise en place dans cette V1)
app.use(express.static(PUBLIC_INTERNAL));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Kleiomné — outil de prospection en écoute sur http://localhost:${PORT}`);
});
