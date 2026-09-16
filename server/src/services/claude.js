import Anthropic from "@anthropic-ai/sdk";
import { buildTunnelSystemPrompt } from "../tunnelPrompt.js";

const MODEL = "claude-opus-5";

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return null;
  }
  if (!client) client = new Anthropic();
  return client;
}

export function isClaudeConfigured() {
  return getClient() !== null;
}

function extractText(content) {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function extractWebSources(content) {
  const sources = [];
  for (const block of content) {
    if (block.type !== "web_search_tool_result") continue;
    const result = block.content;
    if (Array.isArray(result)) {
      for (const item of result) {
        if (item.type === "web_search_result") {
          sources.push({ title: item.title, url: item.url });
        }
      }
    }
  }
  return sources;
}

function parseJsonFromText(text) {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

/**
 * Génère le tunnel de prospection + la sélection de questionnaire pour un
 * lieu, en s'appuyant sur une recherche web live (outil serveur Anthropic)
 * et les informations déjà connues (notes manuelles, Gmail).
 */
export async function generateTunnel({
  nom,
  contactEmail,
  contactTelephone,
  categories,
  typeLieuForce,
  infosRecueilliesTexte,
  historiqueEchangesTexte,
  premierClientSigne,
}) {
  const anthropic = getClient();
  if (!anthropic) {
    const err = new Error(
      "ANTHROPIC_API_KEY non configurée - impossible de générer le tunnel. Voir README pour la configuration."
    );
    err.code = "CLAUDE_NOT_CONFIGURED";
    throw err;
  }

  const system = buildTunnelSystemPrompt({
    lieu: nom,
    contact: [contactEmail, contactTelephone].filter(Boolean).join(" / "),
    categories,
    typeLieuForce,
    infosRecueillies: infosRecueilliesTexte,
    historiqueEchanges: historiqueEchangesTexte,
    premierClientSigne,
  });

  const userPrompt = `Recherche ce lieu sur le web (histoire, site officiel, réseaux sociaux, offre événementielle existante, indices sur le décisionnaire) puis génère le tunnel de prospection et la sélection de questionnaire pour "${nom}", au format JSON demandé dans tes instructions système. Réponds uniquement avec le JSON, sans texte autour.`;

  let messages = [{ role: "user", content: userPrompt }];
  let lastResponse = null;
  let webSources = [];

  for (let i = 0; i < 6; i++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
      messages,
    });
    lastResponse = response;
    webSources = webSources.concat(extractWebSources(response.content));

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    break;
  }

  const text = extractText(lastResponse.content);
  let parsed;
  try {
    parsed = parseJsonFromText(text);
  } catch (e) {
    const err = new Error("Réponse du modèle non parsable en JSON : " + e.message);
    err.code = "CLAUDE_PARSE_ERROR";
    err.raw = text;
    throw err;
  }

  return { parsed, webSources, rawText: text };
}
