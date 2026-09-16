import { google } from "googleapis";

// Intégration Gmail en lecture seule (cahier des charges : "lecture seule
// suffit, pas besoin de préparer ou envoyer des brouillons depuis l'outil").
// Nécessite des identifiants OAuth2 configurés côté déploiement — voir
// README.md. Si absents, toutes les fonctions renvoient un résultat vide
// plutôt que d'échouer, et l'outil continue avec les autres sources.

function getClient() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) return null;
  const oauth2Client = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

export function isGmailConfigured() {
  return getClient() !== null;
}

function decodeHeader(headers, name) {
  const h = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}

/**
 * Recherche les échanges déjà eus avec ce contact, pour situer le lieu dans
 * le tunnel (mail 1 envoyé ? relance envoyée ? réponse reçue ?) plutôt que
 * de repartir de zéro.
 */
export async function searchThreadsWithContact(contactEmail, { maxResults = 15 } = {}) {
  const gmail = getClient();
  if (!gmail || !contactEmail) return { configured: false, messages: [] };

  const res = await gmail.users.messages.list({
    userId: "me",
    q: `from:${contactEmail} OR to:${contactEmail}`,
    maxResults,
  });

  const ids = (res.data.messages || []).map((m) => m.id);
  const messages = [];
  for (const id of ids) {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["From", "To", "Subject", "Date"],
    });
    const headers = msg.data.payload?.headers || [];
    messages.push({
      id,
      from: decodeHeader(headers, "From"),
      to: decodeHeader(headers, "To"),
      subject: decodeHeader(headers, "Subject"),
      date: decodeHeader(headers, "Date"),
      snippet: msg.data.snippet,
    });
  }

  messages.sort((a, b) => new Date(a.date) - new Date(b.date));
  return { configured: true, messages };
}

export function summarizeThreadForPrompt(threadResult) {
  if (!threadResult.configured) return "Gmail non connecté — source non interrogée.";
  if (threadResult.messages.length === 0) return "Aucun échange Gmail trouvé avec ce contact.";
  return threadResult.messages
    .map((m) => `- ${m.date} | ${m.from} → ${m.to} | "${m.subject}" | ${m.snippet}`)
    .join("\n");
}
