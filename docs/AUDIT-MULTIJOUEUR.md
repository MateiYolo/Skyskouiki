# Audit : la partie à trois et quatre joueurs

Le jeu a été écrit, joué et réglé à deux. Ce document regarde ce qui change
au-delà, et le regarde avec des mesures plutôt qu'à l'œil : parties entières
jouées par le moteur, écritures concurrentes chronométrées contre un dos à
latence réaliste, mise en page mesurée dans un vrai navigateur à la largeur
d'un téléphone.

**Verdict.** Les règles tiennent, sans réserve, de deux à huit joueurs. Le
serveur tient aussi, sauf à un endroit précis et il revient à chaque manche. Le
reste des problèmes est de l'interface et de l'information : la table sait jouer
à quatre, l'écran a été dessiné pour deux, et trois choses qu'on lisait
gratuitement en face-à-face ne se lisent plus.

---

## 1. Ce qui tient

### Le moteur, de 3 à 8 joueurs

`src/lib/skyjo/multiplayer.test.ts` joue 25 parties complètes par configuration
(3, 4, 5 et 8 joueurs × classique et spicy), en tirant à chaque coup **un coup
au hasard parmi les coups légaux** — un bot qui joue mal, exprès, pour tomber
dans les situations qu'un bon joueur évite : grille entièrement vidée par ses
éliminations, Vol sans cible, main qu'on ne peut plus jeter.

Rien ne se bloque, et les quatre invariants qui pouvaient casser au-delà de deux
joueurs tiennent :

| Ce qui est vérifié | Pourquoi deux joueurs ne le testait pas |
| --- | --- |
| La rotation passe par tout le monde | À deux, une rotation est un aller-retour |
| Après la fermeture, chaque adversaire joue **exactement** un tour | À deux, le dernier tour ne dure qu'un coup |
| La pénalité ne frappe que le fermeur, et seulement s'il n'est pas *seul* au plus bas | À deux, « pas seul au plus bas » n'a qu'un concurrent — et l'égalité, qui suffit à doubler, y est rare |
| Les totaux cumulés suivent les manches, pour chacun | — |
| La version avance d'un cran par coup (c'est le verrou du magasin) | — |

Le vainqueur a bien le plus petit total, et la partie s'arrête bien quand
quelqu'un franchit le seuil.

### L'écriture concurrente, en jeu normal

Un tour de Skyjo est séquentiel : à tout instant un seul joueur peut écrire. Le
verrou optimiste n'a donc rien à arbitrer pendant une manche, quel que soit le
nombre de joueurs. La seule exception est le retournement initial — voir §2.1.

### La longueur de partie

Mesurée sur 200 parties par configuration, avec un bot qui joue raisonnablement
(prend la défausse si elle est basse, remplace sa pire carte, jette au-delà de 6) :

| Joueurs | Manches / partie | Score moyen / manche | Scores doublés | Actions / manche |
| --- | --- | --- | --- | --- |
| 2 | 3,86 | 24,4 | 27,1 % | 72 |
| 3 | 3,50 | 24,9 | 23,2 % | 105 |
| 4 | 3,35 | 24,8 | 19,4 % | 137 |
| 5 | 3,26 | 24,4 | 15,9 % | 169 |
| 6 | 3,07 | 25,2 | 14,3 % | 200 |
| 8 | 2,15 | 37,9 | 11,0 % | 252 |

L'objectif de 100 points reste bien réglé jusqu'à six : une partie fait toujours
trois à quatre manches. La baisse du taux de scores doublés est la règle qui
parle, pas un défaut — à quatre, être *seul* au plus bas est plus dur, mais
l'égalité qui double aussi est plus fréquente, et les deux se compensent en
partie.

Ce que la dernière colonne dit, en revanche, compte pour l'interface : **une
manche à quatre joueurs, c'est deux fois plus d'actions qu'à deux, et chacun en
joue le quart au lieu de la moitié.** Le temps d'attente entre deux de ses
propres coups triple. C'est le vrai changement d'expérience, et c'est lui que
§3 essaie d'adresser.

À huit, le réglage décroche (2,15 manches, 38 points de moyenne) : la manche se
ferme avant que la plupart aient eu le temps de nettoyer leur grille.

### La pioche

Aucun remélange et aucune pioche épuisée jusqu'à six joueurs (0 sur 585 manches
à trois, 0 sur 587 à quatre). Le paquet de 150 cartes est largement
dimensionné ; rien à faire de ce côté.

---

## 2. Ce qui casse

### 2.1 — Le retournement initial rate à 4 joueurs et plus · **important**

C'est le seul moment du jeu où tout le monde écrit en même temps, et il revient
**à chaque manche**. Quatre joueurs retournant deux cartes, ce sont huit
écritures concurrentes sur la même ligne. `MAX_COMMIT_RETRIES` valant 6
(`src/lib/server/store.ts`), celui qui perd toutes les courses épuise son budget
et reçoit un 503.

Mesuré contre un dos qui simule la latence d'une vraie base (chaque appel coûte
son aller-retour), tous les joueurs tapant simultanément :

| Joueurs | Requêtes | Écritures refusées | **Requêtes perdues** |
| --- | --- | --- | --- |
| 2 | 4 | 6 | 0 |
| 4 | 8 | 27 | **2** |
| 6 | 12 | 51 | **6** |
| 8 | 16 | 75 | **10** |

Côté joueur : la carte se retourne sous le doigt, puis revient face cachée avec
un bandeau rouge — « La partie bouge trop vite, réessaie. » Il faut retaper. En
mémoire (développement) ça ne se voit pas : les requêtes se sérialisent d'
elles-mêmes, il n'y a pas de latence pour les faire se chevaucher. C'est un
défaut qui n'apparaît qu'en production, et seulement à partir de trois ou quatre
joueurs.

La vraie vie est plus clémente que le test — les gens tapent à quelques
centaines de millisecondes d'écart, pas tous dans la même milliseconde — mais
huit écritures réparties sur deux secondes avec un aller-retour de 40 ms se
chevauchent encore largement.

**Correctif.** Le garde-fou utile est déjà là et c'est `ACTION_BUDGET_MS`
(7 s) : il borne le temps, ce qui est la seule chose qui compte pour ne pas être
coupé en plein vol. Le compteur de tentatives, lui, borne la *contention*, et 6
est simplement trop bas dès qu'il y a plus de deux mains sur la table. Passer
`MAX_COMMIT_RETRIES` à 24 suffit — vérifié, même test :

| Joueurs | Aller-retour 40 ms | Requêtes perdues |
| --- | --- | --- |
| 4 | 370 ms | 0 |
| 6 | 533 ms | 0 |
| 8 | ~700 ms | 0 |

Tout tient dans le budget, avec de la marge. Un refus de verrou coûte un
aller-retour, pas une seconde ; ce n'est pas la même monnaie qu'un appel perdu,
et le code les compte pourtant pareil. Deux raffinements possibles par-dessus,
ni l'un ni l'autre nécessaire : un peu de gigue entre deux tentatives pour
casser les pelotons, et une file côté client pour les deux retournements d'un
même joueur (elle est explicitement désactivée pour `flipInitial` dans
`useGame`, à raison : ce sont les joueurs *entre eux* qui se marchent dessus,
pas les deux coups d'un même joueur).

### 2.2 — Trois joueurs sur quatre reçoivent une erreur rouge à chaque fin de manche · **important**

`nextRound` et `playAgain` sont légaux pour **tout le monde**
(`legalActionsFrom`). À la fin d'une manche, les quatre joueurs voient le bouton
« Manche suivante » et les quatre tapent. Vérifié par HTTP sur une vraie partie
à quatre :

```
[ '200 "ok"',
  '409 "La manche n’est pas terminée."',
  '409 "La manche n’est pas terminée."',
  '409 "La manche n’est pas terminée."' ]
```

Les trois perdants de la course lisent un message qui ne veut rien dire pour eux
— la manche *était* terminée, c'est justement pour ça qu'ils ont tapé. À deux,
ça touchait un joueur une fois sur deux ; à quatre, ça touche trois joueurs
presque à chaque manche. Idem pour « Revanche » en fin de partie
(« La partie n'est pas terminée. »).

Et le problème sous le problème : **c'est le premier à taper qui décide pour
tout le monde.** Le délai d'affichage des scores (`revealHold`) est calculé
localement, donc quelqu'un peut enchaîner alors que les autres regardent encore
la table se retourner.

**Trois correctifs possibles, du moins au plus intrusif :**
1. Avaler le refus. Une demande de manche suivante qui arrive sur une manche
   déjà lancée n'est pas une faute : c'est un doublon. `performAction` pourrait
   rendre la vue courante au lieu d'un 409 — ou `GameClient` taire ce refus-là.
2. Montrer qui est prêt. Le bouton devient « Prêt (2/4) », et la manche part
   quand tout le monde y est. C'est de l'état en plus dans le moteur, mais c'est
   la vraie sémantique de l'écran.
3. Réserver l'enchaînement à l'hôte, comme le lancement de partie. Le plus
   simple, le moins agréable.

Le (1) est à faire dans tous les cas : il coûte trois lignes et supprime le
message trompeur.

### 2.3 — Un joueur absent bloque la partie pour de bon · **important**

`leave` existe dans le moteur (il retire du salon, marque `connected: false` en
cours de partie) et dans le schéma de validation. **Aucun client ne l'envoie
jamais** — `grep leave src/` ne trouve que la définition. Donc :

- le point « déconnecté » de `Avatar` (`PlayerPanel.tsx`) est du code mort :
  `connected` est mis à `true` au `join` et ne redescend jamais ;
- un onglet fermé dans le salon y laisse un joueur pour l'éternité, et l'hôte
  n'a aucun moyen de l'enlever ;
- une fois la partie lancée, la rotation passe par lui et **personne ne peut
  plus jouer**. La partie est morte, il faut tout recommencer.

À deux, ça reste vivable — sans l'autre il n'y a plus de partie de toute façon.
À quatre, c'est un jeu de quatre personnes perdu parce qu'une a fermé son
onglet, et la probabilité que ça arrive est trois fois plus grande.

**Correctif.** Il y a trois morceaux, indépendants :
- **dire la vérité** : envoyer `leave` sur `pagehide`/`visibilitychange` (pas
  `beforeunload`, qui ne part pas sur iOS) via `navigator.sendBeacon`, ou faire
  vieillir `connected` côté serveur sur la base des requêtes reçues. La pastille
  grise de l'avatar se met alors à servir ;
- **débloquer le tour** : passer son tour au joueur suivant quand le courant est
  déconnecté depuis assez longtemps. C'est une règle de jeu, donc elle se
  décide — un tour sauté n'est pas neutre (le joueur ne retourne pas de carte,
  donc il ne ferme jamais), mais c'est toujours mieux qu'une table figée ;
- **pouvoir virer quelqu'un** du salon, avant la distribution. C'est de loin le
  plus facile et ça couvre le cas le plus fréquent (le doublon).

### 2.4 — Le score d'un adversaire est tronqué · **petit, mais visible tout le temps**

Dans `OpponentStrip`, hors face-à-face, le panneau fait 120 px de large et la
ligne de score est un `truncate` de 0,62 rem qui partage sa largeur avec le nom
et le badge « fermé ». Un score à trois chiffres n'y rentre pas : capture prise
à quatre joueurs, 390 px de large, Bob à 126 points affiche **`126…`**.

C'est le chiffre qui décide de tout en fin de partie, et il est illisible pile
au moment où il commence à compter. À deux, ce cas n'existe pas : le face-à-face
utilise `ScoreTiles`, qui a la place.

### 2.5 — En dessous de 375 px, un adversaire est rogné et inatteignable · **petit**

La bande est `overflow-x-auto`, mais `justify-center` quand il y a trois
adversaires ou moins. C'est le piège classique : un conteneur centré qui déborde
déborde **des deux côtés**, et le débordement de gauche n'est pas
récupérable — `scrollLeft` est bloqué à 0.

Le contenu à quatre joueurs mesure `3 × 120 + 2 × 8 + 24 = 400 px`. Mesuré dans
Chromium :

| Largeur | Position du 1ᵉʳ panneau | Rogné |
| --- | --- | --- |
| 390 px (iPhone 13/14/15) | x = 7 | non, le padding absorbe |
| 375 px (iPhone SE/mini) | x = 0 | à la limite |
| 360 px (beaucoup d'Android) | x = **−8** | oui, 8 px |
| 320 px | x = **−28** | oui, 28 px |

**Correctif** : `justify-center` → centrage par marge automatique (`mx-auto` sur
un conteneur interne) ou `justify-content: safe center`, et étendre `fade-right`
à `opponents.length > 2`. Deux mots de CSS.

### 2.6 — La Valse n'a pas de propriétaire au milieu de la table · **petit**

`GameClient` :

```ts
const holderId =
  view?.heldFrom !== null || view?.turnStep === 'stealing' ? view?.currentPlayerId : null;
```

`'swapping'` manque, alors que `TableCenter` traite bien les deux
(`const special = stealing || swapping`). Conséquence : pendant une Valse, la
carte posée au milieu n'affiche ni nom ni avatar et ne penche pas vers son
porteur. À deux, on savait de qui il s'agissait ; à quatre, la carte turquoise
apparaît au milieu de la table sans dire à qui elle est. La consigne le dit
encore (`heldSummary`), l'emplacement non.

---

## 3. Ce qui manque

Ces points ne sont pas des bugs : ce sont des informations qu'on lisait
gratuitement en face-à-face et qui disparaissent à trois.

### 3.1 — Le score de manche des adversaires · **le plus utile de la liste**

En face-à-face, l'adversaire porte `ScoreTiles` : **manche** (sa somme visible)
et **total**. À trois joueurs et plus, le panneau se réduit à `{totalScore} pts`
— le score de manche disparaît complètement.

Or c'est exactement le chiffre qui décide de quand on ferme. « Est-ce que je
peux fermer maintenant ? » se répond en comparant sa somme visible à celle des
autres, et à quatre joueurs il faut la reconstituer de tête sur trois grilles de
23 px — ou ouvrir trois fiches l'une après l'autre. La décision la plus
importante du jeu devient un calcul mental au moment où elle se pose.

C'est aussi ce qui rend le risque de doublement opaque : on ferme sans savoir
contre qui.

**Piste** : la somme visible tient en deux ou trois caractères. Elle peut aller
à la place de « 0 pts » (`12 · 45`), ou dans un coin de la grille, ou remplacer
la jauge du bas de panneau, qui est la moins informative des trois.

### 3.2 — Qui joue après moi

À deux, la question ne se pose pas. À quatre, savoir s'il reste un tour ou trois
avant le sien change tout : c'est ce qui dit si la carte de la défausse qu'on
convoite sera encore là. L'information est dans la vue (l'ordre de
`view.players` **est** l'ordre de jeu, `currentPlayerIndex` avance dedans), il
n'y a rien à calculer — juste rien d'affiché. Un liseré discret « ensuite » sur
le panneau suivant, ou un compteur « tu joues dans 2 », suffirait.

### 3.3 — Les annonces se perdent quand deux coups arrivent ensemble

`EventLayer` garde **une seule** annonce (`freshHero`) par lot d'événements, et
la dernière écrase les précédentes. Ce n'est pas théorique : `eventsSince`
rattrape volontairement plusieurs versions d'un coup quand un client a pris du
retard, et le sondage de secours (2,5 s quand le temps réel est tombé) tombe
pile dans ce cas. À quatre joueurs, deux coups dans le même rafraîchissement
sont bien plus fréquents qu'à deux — et l'annonce qui se perd, c'est « Colonne
éliminée chez Charlotte », soit exactement ce qu'on ne peut pas deviner en
regardant une vignette de 23 px.

Même remarque, en plus léger, pour `lastMove` (`moves.ts`) : il ne rend **que le
dernier** coup du lot, donc la phrase « pose 3, jette 7 » ne s'affiche que sur
un panneau, même quand deux joueurs ont joué depuis le dernier rendu.

**Piste** : faire de `hero` une petite file (deux ou trois, enchaînées), comme
les toasts le font déjà — ou au minimum ne jamais laisser une élimination se
faire écraser par un simple « À toi ».

### 3.4 — L'attente triple, et rien ne la comble hors de l'écran

À quatre joueurs, on regarde jouer les trois quarts du temps (§1). Le seul
signal de « c'est à toi » hors de l'écran est `cue('yourTurn')` — son et
vibration — plus le titre de l'onglet. Les deux sont inertes sur un iPhone dont
l'écran est verrouillé ou l'onglet en arrière-plan : iOS ne connaît pas
`navigator.vibrate`, et un onglet Safari en arrière-plan ne joue rien. Il n'y a
pas de notification web.

Ce n'est pas un correctif d'après-midi, mais c'est la contrainte principale
d'une partie à quatre : les gens posent le téléphone, et il faut pouvoir les
rappeler.

### 3.5 — Le salon ment un peu

`prompt()` rend, en phase `lobby` : *« Partage le code, on démarre à deux. »* —
lu par un groupe de quatre qui attend le cinquième, c'est faux. Il n'y a par
ailleurs aucun compteur (« 4 joueurs, 8 max ») ni mention que **l'ordre
d'arrivée est l'ordre de jeu**, ce qui à quatre est une information de jeu.
Enfin la page Règles se termine sur « faite pour jouer à deux sur nos
téléphones » et ne dit nulle part combien on peut être.

### 3.6 — À cinq et plus, le joueur actif peut être hors de l'écran

Hors scope de la question posée, mais mesuré en passant : à huit joueurs sur
390 px, la bande mesure 912 px pour 390 visibles — **48 cartes sur 96 sont hors
écran**, et rien ne fait défiler la bande jusqu'à celui dont c'est le tour. La
consigne annonce « Hélène joue » alors que la grille d'Hélène est invisible et
qu'aucun des trois panneaux affichés ne porte l'anneau d'activité. La couche de
vol (`FlightLayer`) mesure par ailleurs des ancres hors viewport, donc les
cartes volent vers un point qu'on ne voit pas.

Le README annonce « à deux (ou à huit) ». Soit la bande défile toute seule
jusqu'au joueur actif (un `scrollIntoView` sur changement de tour), soit le
maximum annoncé descend à cinq ou six.

---

## 4. Équilibrage du mode spicy à plusieurs

Mesuré sur 150 parties par configuration, même bot qu'au §1 :

| Joueurs | Vol / manche | Valse / manche | Total d'interruptions |
| --- | --- | --- | --- |
| 2 | 0,98 | 0,84 | 1,8 |
| 3 | 1,61 | 1,27 | 2,9 |
| 4 | **2,33** | **1,92** | **4,3** |
| 6 | 4,29 | 3,49 | 7,8 |

Le dosage est documenté dans `rules.ts` comme *« un peu plus d'un demi Vol par
manche à deux joueurs et près d'un et demi à quatre »*. La mesure donne 0,98 et
2,33 : le commentaire sous-estime les deux, d'environ moitié. Ce n'est pas
grave en soi — c'est un commentaire, pas une règle — mais le raisonnement qu'il
porte (« deux cartes ne sortiraient quasiment jamais, huit feraient de l'échange
le jeu principal ») est celui qui a fixé `STEAL_COUNT = 5`, et il a été fait sur
des chiffres faux.

Deux conséquences de fond, à décider plutôt qu'à corriger :

1. **Par table**, à quatre joueurs, il se passe 4,3 échanges par manche contre
   1,8 à deux. Sur une manche déjà deux fois plus longue, ça reste proportionné ;
   à six, avec 7,8, l'échange devient le jeu principal — précisément ce que le
   commentaire voulait éviter.
2. **Par victime**, en supposant les cibles réparties au hasard, un joueur se
   fait voler environ 0,58 fois par manche à quatre (1,75 Vol piochés par les
   autres, répartis sur trois victimes) contre 0,49 à deux : +19 % seulement.
   Ce qui change vraiment, c'est que le vol arrive maintenant d'un joueur qu'on
   ne surveillait pas forcément — plus dur à anticiper, à fréquence presque
   égale.

Si on veut retrouver la sensation du jeu à deux, le nombre de cartes spéciales
devrait décroître avec le nombre de joueurs plutôt que rester fixe — par exemple
autour de `⌈10 / joueurs⌉` Vol. Mais c'est un choix de jeu : il n'est pas
évident que la version à quatre soit moins bonne, seulement qu'elle est
différente de celle qui a été réglée.

Le joker, lui, reste rare partout (il ne ferme un groupe que 0,08 à 0,25 fois
par manche) : deux exemplaires ne sont pas de trop.

---

## 5. Par où commencer

| # | Correctif | Coût | Effet |
| --- | --- | --- | --- |
| 2.1 | `MAX_COMMIT_RETRIES` 6 → 24 | une ligne | supprime un échec par manche à partir de 4 joueurs |
| 2.2 | Taire le refus de `nextRound` déjà joué | trois lignes | supprime trois bandeaux rouges par manche |
| 2.4 | Score adverse non tronqué | petit | rend lisible le chiffre qui décide de la partie |
| 3.1 | Somme visible des adversaires dans le panneau | petit | rend la décision de fermer calculable |
| 2.5 | `justify-center` → marge automatique + `fade-right` | deux mots de CSS | plus rien de rogné sous 375 px |
| 2.6 | `'swapping'` dans `holderId` | un mot | la Valse retrouve son porteur |
| 3.2 | Marquer le joueur suivant | petit | rend la rotation lisible |
| 3.5 | Textes du salon et des règles | petit | arrête de dire « à deux » à quatre personnes |
| 3.3 | File d'annonces dans `EventLayer` | moyen | les éliminations d'en face ne se perdent plus |
| 2.3 | Départ, déconnexion, exclusion du salon | gros, à décider | une partie à quatre ne meurt plus sur un onglet fermé |
| 3.6 | Bande qui défile jusqu'au joueur actif | moyen | tient la promesse du « ou à huit » |
| 3.4 | Notifications web | gros | comble l'attente qui triple |

---

## Comment reproduire les mesures

**Règles, 3 à 8 joueurs** — dans la suite :

```bash
npx vitest run src/lib/skyjo/multiplayer.test.ts
```

**Longueur de partie, fréquence des cartes spicy** — même principe : une boucle
sur `applyAction` avec le bot décrit au §1, 150 à 200 graines par configuration.
Les scripts de mesure n'ont pas été conservés : ils ne testent rien, ils
comptent.

**Contention des retournements initiaux** — un `Backend` de test qui dort
`rtt` millisecondes à chaque appel (`installBackend`, comme
`src/lib/server/store.test.ts`), puis `2n` appels `performAction` lancés en
parallèle avec `Promise.all`, et on compte les rejets. Vaut la peine d'être
ajouté à la suite **en même temps** que le correctif du §2.1, pas avant : tel
quel, le test échoue.

**Mise en page** — Chromium piloté, identité posée dans `localStorage`, partie
montée par l'API, puis mesure de `scrollWidth` / `getBoundingClientRect` sur la
bande d'adversaires à 320, 360, 375 et 390 px de large.
