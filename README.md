# Skyskouiki

Le Skyjo à deux (ou à huit), chacun sur son téléphone. Une page web, un code à
quatre lettres, et c'est parti. Pas de compte, pas de pub, pas de store.

Règles officielles, y compris les deux qui font le sel du jeu : l'élimination
des colonnes de trois cartes identiques, et le doublement du score de celui qui
ferme la manche sans avoir, à lui seul, le plus petit total.

Une seule règle maison s'y ajoute, assumée : **une ligne entière de quatre
cartes identiques saute elle aussi**. Le jeu de société ne connaît que les
colonnes ; la page Règles de l'application signale l'écart pour qu'on ne
l'emporte pas par erreur sur une vraie table.

## Comment ça marche

```
navigateur ──POST /api/games/:code──▶ Next.js ──RPC──▶ Postgres
    ▲                                    │
    │                            moteur de règles (TS pur)
    │                                    │
    └────── Supabase Realtime ◀───────────┘
             (« la partie a bougé »)
```

Trois idées structurent le tout.

**Le moteur ne connaît ni le réseau ni la base.** `src/lib/skyjo/` est un
réducteur pur : `(état, action) → état`. Il se teste sans rien démarrer, avec un
mélange déterministe par graine, et c'est là que vivent toutes les règles.

**Le serveur fait autorité.** Le navigateur n'écrit jamais dans la base et ne lit
jamais l'état complet d'une partie. Il envoie une intention, le serveur la
valide contre le moteur, écrit le nouvel état, puis renvoie une projection
expurgée (`toView`) : les cartes face cachée y sont présentes mais sans leur
valeur, la pioche se résume à un compteur, et la carte en main n'est visible que
de son porteur. Tricher demanderait de deviner l'état, pas de lire une réponse.

**Le temps réel ne transporte rien de secret.** Deux tables : `skyjo.games`
(méta publique — code, version, à qui de jouer) diffusée en temps réel, et
`skyjo.game_states` (l'état complet) sur laquelle la RLS est active *sans aucune
policy*, donc illisible pour tout rôle client. Quand la version change, le
téléphone est réveillé et redemande sa propre vue.

Les écritures utilisent un verrou optimiste : `skyjo_commit_state` n'écrit que si
la version en base n'a pas bougé. Si les deux joueurs tapent en même temps, le
perdant rejoue son action sur l'état frais et se fait proprement refuser par le
moteur si ce n'était plus son tour.

## Lancer en local

```bash
npm install
npm run dev
```

Sans configuration, les parties sont gardées **en mémoire** dans le processus :
suffisant pour développer et pour ouvrir deux onglets. Rien ne survit à un
redémarrage, et ce repli est refusé en production.

Pour brancher la vraie base, crée un `.env.local` à partir de `.env.example`.

## Déploiement

Le schéma SQL est dans `supabase/migrations/`. Applique-le sur ton projet
Supabase, puis renseigne trois variables d'environnement côté hébergeur :

| Variable | Où la trouver | Exposée au navigateur |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → Data API | oui |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys (clé `publishable`) | oui |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys (clé `service_role` / `secret`) | **non, jamais** |

La clé de service donne un accès complet à la base : elle ne doit exister que
dans les variables du serveur.

Le schéma vit dans un espace `skyjo` dédié, séparé de `public`, et n'est pas
exposé à PostgREST : le serveur y accède par quatre fonctions SQL réservées au
rôle de service. Le nettoyage des parties abandonnées se fait avec
`select public.skyjo_purge_stale_games();`.

## Tests

```bash
npm test          # 36 tests du moteur : règles, comptage, confidentialité
npm run typecheck
npm run smoke     # partie complète jouée par HTTP (serveur de dev requis)
```

Le fichier `src/lib/skyjo/engine.test.ts` sert aussi de spécification lisible :
chaque règle y a son test nommé en français, les officielles comme la maison —
dont un test qui vérifie que trois cartes identiques côte à côte dans une ligne
ne suffisent *pas*.

## Arborescence

```
src/lib/skyjo/     moteur pur : types, règles, réducteur, projection client
src/lib/server/    magasin (Supabase ou mémoire), validation, réponses HTTP
src/lib/client/    identité locale, temps réel, retours sonores et haptiques
src/components/    cartes, grilles, table, écrans de score
src/app/           accueil, salon + partie, règles, API
supabase/          migrations SQL
```

---

Skyjo est un jeu de Magilano. Ce dépôt est une implémentation personnelle de ses
règles, sans lien avec l'éditeur.
