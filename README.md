# Kleiomné — outils de prospection

Ce dépôt contient deux outils distincts :

- **`index.html`** — le suivi de prospection existant (statuts d'envoi, relances, analytics), en pur HTML/JS local (`localStorage`), à ouvrir directement dans un navigateur.
- **`server/` + `public/`** — le nouvel outil **tunnel + questionnaire**, décrit dans le cahier des charges : une fiche par lieu partagée entre l'interface interne et un lien public de questionnaire découverte. C'est un vrai backend (Node + SQLite), documenté ci-dessous.

## Outil tunnel + questionnaire

### Architecture

- **Surface 1 — interface interne** (`public/internal/`, servie à la racine `/`) : recherche, génération et édition du tunnel, historique des lieux.
- **Surface 2 — lien public par lieu** (`public/q/`, servie sur `/q/<slug>`) : questionnaire découverte préempli, sans authentification.
- Les deux surfaces lisent/écrivent la **même fiche lieu** en base SQLite (`server/data/kleiomne.sqlite`, créée automatiquement — non versionnée).

### Installation

```bash
cd server
npm install
cp .env.example .env
# éditer .env : au minimum ANTHROPIC_API_KEY (voir ci-dessous)
npm start
```

Le serveur écoute sur `http://localhost:3000` par défaut (`PORT` dans `.env`). L'interface interne est sur `/`, le lien questionnaire d'un lieu sur `/q/<slug>` (le slug est généré automatiquement à la création du lieu et visible dans sa fiche).

### Configuration requise

**Clé Anthropic (obligatoire pour générer un tunnel)**
Créez une clé sur [console.anthropic.com](https://console.anthropic.com) et renseignez `ANTHROPIC_API_KEY` dans `server/.env`. Sans clé, l'outil reste utilisable (création de lieux, historique) mais la génération du tunnel échoue proprement (statut « Erreur de génération », message affiché dans la fiche).

Le générateur de tunnel utilise le modèle `claude-opus-5` avec l'outil de recherche web intégré à l'API (`web_search`) pour interroger le web à la volée (histoire du lieu, offre événementielle, décisionnaire probable).

**Gmail (optionnel, lecture seule)**
Pour activer la recherche automatique des échanges déjà eus avec un contact :
1. Dans [Google Cloud Console](https://console.cloud.google.com), créez un projet et activez l'API Gmail.
2. Créez des identifiants OAuth2 (type « Application de bureau »).
3. Générez un refresh token pour le compte Gmail de Solenne avec le scope `https://www.googleapis.com/auth/gmail.readonly` (par exemple via [OAuth 2.0 Playground](https://developers.google.com/oauthplayground)).
4. Renseignez `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` dans `.env`.

Sans ces variables, l'outil continue de fonctionner : la source Gmail est simplement ignorée (visible dans la fiche du lieu et sur le badge d'état en haut de l'interface interne).

**Recherche dans les conversations Claude passées**
Cette source n'est pas automatisable depuis un backend applicatif standard (elle n'existe que côté Claude.ai / Claude Code, pas via l'API publique). Elle reste **manuelle** : le champ « Notes issues de conversations Claude passées » dans la fiche du lieu (et à la création) permet à Solenne de coller ce qu'elle a trouvé — ces notes sont ensuite injectées dans le prompt de génération du tunnel comme les autres sources.

### Sécurité de la surface interne

Le cahier des charges ne demandait pas de système de comptes, mais l'interface interne expose des données de prospection : dès que l'outil est accessible sur une URL publique, protégez-la avec `INTERNAL_BASIC_AUTH_USER` / `INTERNAL_BASIC_AUTH_PASS` (voir `.env.example`) — l'outil demandera alors un identifiant/mot de passe avant d'afficher l'interface interne ou de répondre à l'API interne. Sans ces variables, l'accès reste ouvert (pratique en local). La surface 2 (`/q/<slug>`), elle, reste toujours sans authentification (lien à usage prospect).

### Déploiement sur Render.com (gratuit)

1. Sur [dashboard.render.com](https://dashboard.render.com), **New +** → **Web Service**, puis connectez le repo GitHub `solenne876/test`.
2. Render détecte `render.yaml` à la racine et propose de pré-remplir la configuration (Root Directory `server`, build `npm install`, start `npm start`) — validez, ou configurez-le manuellement si l'import Blueprint n'est pas proposé.
3. Dans **Environment**, renseignez au minimum `ANTHROPIC_API_KEY`. Ajoutez `INTERNAL_BASIC_AUTH_USER` / `INTERNAL_BASIC_AUTH_PASS` pour protéger l'interface interne (fortement recommandé), et les 3 variables `GMAIL_*` si vous avez configuré l'intégration Gmail.
4. Déployez. L'interface interne est à la racine de l'URL Render (`https://<nom-du-service>.onrender.com`), et chaque lien questionnaire devient `https://<nom-du-service>.onrender.com/q/<slug>`.

**Deux limites du plan gratuit à connaître :**
- Le service se met en veille après ~15 minutes d'inactivité ; la première requête suivante prend 30-60 secondes le temps qu'il redémarre.
- Le disque n'est **pas persistant** entre deux déploiements : à chaque mise à jour du code poussée sur GitHub, `server/data/kleiomne.sqlite` repart de zéro et l'historique des lieux est perdu. Pour l'éviter, ajoutez un disque payant (~1€/mois, section `disks` commentée dans `render.yaml`) dès que l'historique devient précieux.

### Statuts d'un lieu

`Nouveau` → `Recherche en cours` → `Tunnel généré` → (`Questionnaire envoyé` — à passer manuellement une fois le lien collé dans le mail) → `Questionnaire reçu, tunnel à affiner` → `Tunnel affiné` (après régénération avec les réponses confirmées). `Erreur de génération` si l'appel à l'API a échoué (relançable depuis la fiche).
