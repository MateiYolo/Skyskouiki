# Audit de performance

Ce document répond à une question précise : **pourquoi un coup ne répond pas au
doigt**, en particulier piocher, prendre une carte et la poser.

La réponse courte : ce n'est ni le moteur, ni le rendu, ni les animations.
C'est le **nombre d'aller-retours réseau qu'un seul tap déclenche**, et le fait
que l'adversaire, lui, apprend le coup par une notification qui l'oblige à
tout redemander.

Toutes les valeurs ci-dessous ont été mesurées sur ce dépôt, build de
production, pas estimées.

---

## 1. Ce qui n'est pas en cause

### Le moteur

| mesure | valeur |
| --- | --- |
| état complet d'une partie, sérialisé | **2,2 Ko** |
| `applyAction` (dont 41 µs de `structuredClone`) | **44 µs** |
| `toView` | **2,9 µs** |
| `JSON.parse` de l'état | 10 µs |

Un coup coûte moins de **0,1 ms** de calcul serveur. Le moteur pourrait être
mille fois plus lent sans que personne ne le remarque. Il n'y a rien à
optimiser là, et surtout rien à y toucher.

### Le rendu

Mesuré dans Chromium, CPU divisé par 4 (≈ téléphone de milieu de gamme),
**réseau à zéro** (serveur local, magasin en mémoire), une partie à deux jouée
par script :

| mesure | valeur |
| --- | --- |
| latence d'interaction (pointerdown → image suivante) | **p50 = 64 ms, p90 = 80–96 ms** |
| dont traitement JS (React + gestionnaire) | 16–39 ms |
| tâches longues au chargement | 157 ms (hydratation), puis 73 et 64 ms |
| tâches longues à la distribution | 65 + 52 + 87 ms |
| *total blocking time* sur une partie courte | ~200 ms |

64 ms, c'est bien. Le découpage mémoïsé des cartes, les styles pré-calculés, la
lecture de `legalActions` dans une référence plutôt que dans l'état : tout ça
fait son travail, et ça se voit. **Le rendu n'est pas le problème.**

Deux points mineurs restent, en fin de document (§ 7).

---

## 2. Ce qui est en cause : le chemin d'un coup

### Pour celui qui joue

```
tap ──▶ POST /api/games/:code ──▶ skyjo_load_game  ──▶ Postgres
                                   skyjo_commit_state ──▶ Postgres
        ◀── vue ────────────────────────────────────────┘
```

**Trois aller-retours**, dont deux séquentiels entre la fonction et Supabase.
`performAction` relit l'état, l'applique, puis l'écrit — et les deux appels
PostgREST sont des requêtes HTTPS complètes.

Si la région de la fonction Vercel n'est pas celle du projet Supabase, ces deux
appels coûtent 2 × 80–150 ms **à eux seuls**, avant même de compter le trajet
téléphone → fonction.

S'ajoute le démarrage à froid : `/api/games/[code]` est `force-dynamic` en
runtime `nodejs`. Entre deux parties, la fonction s'endort ; le premier tap de
la session paie le réveil.

### Pour l'adversaire

```
commit ──▶ WAL ──▶ Realtime (postgres_changes) ──▶ « ça a bougé »
                                                        │
                       GET /api/games/:code ◀───────────┘
                       ──▶ skyjo_load_game ──▶ Postgres
                       ◀── vue ──────────────┘
```

Là, c'est pire : la notification ne transporte **que le numéro de version**, ce
qui oblige à refaire un aller-retour complet pour obtenir la vue. Et
`postgres_changes` est le canal Supabase le plus lent — réplication logique,
puis évaluation de la RLS par abonné — comptez 100 à 500 ms avant même la
notification.

**Total pour l'adversaire : 0,5 à 1 s après que le joueur actif a vu son
coup.** C'est là que « ce n'est pas snappy » se joue le plus fort, parce que
c'est le seul endroit où aucune vue optimiste ne vient masquer l'attente.

### Le cas des coups qui ne peuvent pas être optimistes

`optimistic.ts` a raison de ne pas inventer de valeur cachée : `drawFromPile`,
`flipInitial` et `flipCard` **doivent** attendre le serveur. Ce sont exactement
les coups que tu cites.

Le budget existe pourtant déjà, et il est généreux : un vol de carte dure
`FLIGHT_DURATION = 0,5 s`. Tant que l'aller-retour rentre sous ~400 ms, la
valeur arrive **avant que la carte se pose** et le joueur ne voit jamais la
face neutre. Au-delà, il la voit — et c'est précisément la sensation de
latence.

Autrement dit : l'animation n'est pas trop lente, c'est le réseau qui déborde
du budget qu'elle lui avait accordé.

---

## 3. Recommandation n° 1 — diffuser la vue au lieu de la faire redemander

**Gain : supprime un aller-retour complet du chemin de l'adversaire, et
remplace le canal le plus lent de Supabase par le plus rapide.**

Constat vérifié par test : pour un même état, `toView(state, A)` et
`toView(state, B)` ne diffèrent que par **deux champs**, `you` et
`legalActions`. Tout le reste — grilles, sommet de défausse, carte en main,
événements — est identique pour tout le monde. C'est une conséquence directe
du modèle : la vue *est* déjà ce qu'un client a le droit de voir.

Et `legalActionsFor` n'a besoin de rien que la vue ne contienne déjà :
`drawPileCount`, `discardCount`, `faceUpCount`, `faceDownCount`, la grille avec
ses `null`. Elle se recalcule donc côté client.

Donc :

1. après le commit, le serveur publie la vue partagée en **Realtime Broadcast**
   sur `skyjo:${code}` ;
2. chaque client l'adopte telle quelle et calcule ses propres `legalActions` ;
3. le `GET` reste, mais comme **filet** — reconnexion, onglet réveillé, version
   sautée — plus jamais dans le chemin d'un coup.

Sur la sécurité, rien ne change : cette vue est déjà obtenable par n'importe qui
connaît le code de la partie, puisque c'est ce que le `GET` renvoie. Ce qui
reste secret — l'ordre de la pioche, le dos des grilles — n'entre pas dans
`toView` et n'entrera pas davantage dans le broadcast.

L'adversaire passe de ~600–1000 ms à ~100–150 ms.

---

## 4. Recommandation n° 2 — supprimer un aller-retour base sur deux

**Gain : 30 à 50 % du temps serveur d'un coup, pour le joueur actif.**

`performAction` fait `load` puis `commit`. Le `load` est évitable dans le cas
courant : garder l'état en mémoire dans le processus (`Map<code, GameState>`),
appliquer dessus, et laisser le verrou optimiste faire son travail.

C'est sans risque, et c'est important de comprendre pourquoi : **la correction
ne repose pas sur la fraîcheur du cache, elle repose sur le
compare-and-swap en base**. `skyjo_commit_state` refuse déjà d'écrire si la
version a bougé ; un cache périmé ne produit donc pas un état faux, il produit
un `false` — et la boucle de retry qui existe déjà recharge et rejoue. Le pire
cas est celui d'aujourd'hui.

Variante, à faire de toute façon : que `skyjo_commit_state` **renvoie l'état
frais** quand la version ne colle pas, au lieu de `false`. Le retry passe de
deux aller-retours à un.

---

## 5. Recommandation n° 3 — la géographie

**Gain potentiel : 200–300 ms par coup. Coût : une ligne de configuration.**

À vérifier en premier, parce que c'est gratuit : la région de déploiement de
`/api/games/*` doit être celle du projet Supabase. Deux appels PostgREST
séquentiels qui traversent un océan, c'est le plus gros poste de la latence
d'un tap, et c'est invisible en local.

Sur Vercel : `export const preferredRegion = '…'` dans la route, ou la région
par défaut du projet.

Le runtime Edge serait tentant pour le démarrage à froid — la route ne fait que
du `fetch` vers Supabase, elle y tournerait — mais il place la fonction près du
*joueur*, pas près de la base, ce qui rallonge les deux appels qu'on cherche
justement à raccourcir. À ne considérer qu'une fois la recommandation n° 2
appliquée.

---

## 6. Recommandations de chargement

### 6.1 La page de partie n'a aucune raison d'être une fonction

`/r/[code]` apparaît en `ƒ` au build : **chaque ouverture de salon réveille une
fonction serverless** pour rendre une coquille qui ne dépend de rien d'autre
que du code dans l'URL.

Deux lignes suffisent (vérifié : le build passe de `ƒ` à `●`) —

```ts
// src/app/r/[code]/page.tsx
export function generateStaticParams() {
  return [];
}
```

— et la page part du CDN, sans démarrage à froid, pour tout le monde.

### 6.2 Ne pas embarquer tout Supabase pour écouter un canal

La page de partie charge **889 Ko de JS brut (~265 Ko gzip)** :

| morceau | brut | gzip |
| --- | --- | --- |
| `@supabase/supabase-js` | **289 Ko** | ~80 Ko |
| React + runtime Next | ~390 Ko | ~115 Ko |
| `motion` | 145 Ko | ~50 Ko |
| le reste | ~65 Ko | ~20 Ko |

Le premier poste est utilisé pour **une seule chose** : `client.channel(…).on(…)`.
Auth, PostgREST, Storage, Edge Functions voyagent avec, et ne servent jamais —
le navigateur n'écrit ni ne lit jamais la base, c'est tout le principe.

Deux sorties :

- remplacer par `@supabase/realtime-js` seul, qui est la moitié du paquet ;
- au minimum, `await import('@supabase/supabase-js')` **dans l'effet temps
  réel**, pour que le paquet ne soit ni téléchargé ni compilé avant la première
  image.

C'est aussi une bonne part des 157 ms d'hydratation mesurés, qui tombent pile
au moment où le joueur arrive sur la partie et veut jouer.

### 6.3 Le filet de sondage

- `visibilitychange` **et** `focus` déclenchent tous les deux `onVisible` : au
  retour sur l'onglet, deux `GET` au lieu d'un.
- Temps réel inactif → sondage toutes les 2,5 s. À deux joueurs, c'est ~48
  invocations de fonction par minute, chacune avec son `skyjo_load_game` — de
  quoi provoquer les démarrages à froid qu'on cherche à éviter.
- Une fois le broadcast en place (§ 3), ce filet peut remonter franchement :
  10 s en direct, 30 s sinon.

---

## 7. Deux points de rendu, mineurs mais réels

**Les tâches longues de la distribution** (65 + 52 + 87 ms) sont le montage
simultané de ~28 `PlayingCard`, chacune avec son conteneur 3D (`perspective`,
`preserve-3d`, `backface-visibility`) et ses deux faces. Le découpage mémoïsé
est déjà là ; ce qui reste est du coût de composition. Les grilles adverses en
`size="xs"` n'ont sans doute pas besoin du conteneur 3D tant qu'aucune carte
n'y tourne — une face simple suffirait, et le conteneur ne se monterait qu'au
retournement.

**`backdrop-blur` pendant le jeu.** Sur les feuilles de score et la fiche
adverse, c'est acceptable : elles arrivent quand rien d'autre ne bouge. Dans
`EventLayer` (`backdrop-blur-md` sur les annonces et les pastilles), il tombe
pendant les coups — et c'est l'un des effets les plus chers qui soient sur
mobile, parce qu'il force la recomposition de tout ce qui est dessous à chaque
image. Un fond opaque à 92 % donne le même résultat à l'œil pour rien.

---

## 8. Ordre de bataille

| # | Action | Effort | Gain |
| --- | --- | --- | --- |
| 1 | Vérifier / corriger la colocalisation fonction ↔ base (§ 5) | minutes | 200–300 ms/coup |
| 2 | `generateStaticParams` sur `/r/[code]` (§ 6.1) | 2 lignes | plus de cold start à l'entrée |
| 3 | Diffuser la vue en Broadcast, calculer `legalActions` côté client (§ 3) | 1 jour | adversaire : −500 ms |
| 4 | Cache d'état en processus + commit qui renvoie l'état frais (§ 4) | ½ journée | joueur actif : −1 RTT base |
| 5 | Sortir `supabase-js` du bundle initial (§ 6.2) | 1–2 h | −80 Ko gzip, hydratation |
| 6 | Détendre le sondage, dédoublonner `onVisible` (§ 6.3) | 30 min | charge serveur |
| 7 | Conteneur 3D à la demande, `backdrop-blur` en jeu (§ 7) | 1–2 h | −200 ms de TBT |

Les points 1 et 2 sont à faire tout de suite : ils ne touchent pas une ligne de
logique de jeu.

---

## 9. Si la lenteur persiste après tout ça

Il resterait un plancher : chaque coup traverse un processus sans mémoire qui
doit consulter une base distante. Le pas d'après serait un **serveur
authoritatif persistant** — un processus qui garde les parties en RAM, que les
téléphones joignent par WebSocket, et qui persiste en tâche de fond hors du
chemin critique. Le tap coûterait alors un seul aller-retour brut (20–60 ms),
et le moteur, déjà pur et déjà testé sans réseau, s'y déplacerait sans une
ligne à changer.

Ce n'est pas la première chose à faire. C'est la bonne chose à faire si, une
fois les sept points ci-dessus appliqués, le jeu ne répond toujours pas au
doigt.

---

## Comment ces chiffres ont été obtenus

- **Moteur** : banc de mesure sur `applyAction` / `toView` / `structuredClone`,
  2000 itérations, partie en mode spicy après distribution et retournements
  initiaux.
- **Rendu et interactions** : build de production servi en local avec le
  magasin en mémoire (réseau ≈ 0), Chromium piloté par Playwright, deux
  contextes mobiles (390 × 844), `Emulation.setCPUThrottlingRate: 4`,
  `PerformanceObserver` sur `event` (seuil 0) et `longtask`, partie jouée par
  script jusqu'à six coups.
- **Charge réseau** : mêmes conditions, comptage des réponses par
  `page.on('response')`.
- **Vue partagée** : test comparant `toView(state, A)` et `toView(state, B)`
  champ par champ.
