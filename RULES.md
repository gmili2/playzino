# Règles — variante « Parchís à un dé, 2 à 4 joueurs »

Variante documentée du **Parchís espagnol** (famille Parcheesi / Pachisi), adaptée au plateau du design
(68 cases, 12 cases sûres, couloir final de 7 cases). Toutes les règles sont appliquées **côté serveur**
par `server/src/game/engine.ts` et couvertes par `server/src/game/engine.test.ts`.

| # | Règle | Référence moteur |
|---|-------|------------------|
| 1 | 2 à 4 joueurs. Couleurs par siège : bleu (sortie n° 22), vert (n° 56), jaune (n° 5), rouge (n° 39) — à deux, coins opposés. Le tour suit le sens de la piste, antihoraire (jaune → bleu → rouge → vert) ; le premier joueur est tiré au sort. | `createGame`, `turnOrder`, `rooms.service#startGame` |
| 2 | Chaque tour : lancer d'**un dé** (1–6), tiré par le serveur (`crypto.randomInt`). | `applyRoll` |
| 3 | Un **5** fait sortir un pion du nid vers sa case de sortie. Sortir est **obligatoire** si c'est possible. | `legalMoves` |
| 4 | Un pion avance exactement du nombre de cases. Après un tour complet (positions 0–63, de sa case de sortie à la case d'extrémité de son bras : n° 68 pour le jaune, 17 bleu, 34 rouge, 51 vert), il entre dans son couloir (64–70) puis au centre (71). Le **compte exact** est exigé pour arriver. | `stepMove` |
| 5 | Un **6** donne un nouveau lancer. Si aucun pion n'est au nid, le 6 vaut **7**. | `applyRoll`, `endOfMove` |
| 6 | **Trois 6 consécutifs** : le dernier pion déplacé retourne au nid (sauf s'il est dans le couloir final) et le tour passe. | `applyRoll` |
| 7 | **Capture** : finir sur une case non sûre occupée par un seul pion adverse le renvoie au nid. Le capteur gagne un **bonus de 20 cases** à jouer avec le pion de son choix. | `applyMove`, `resolveBonuses` |
| 8 | **Cases sûres** (cercles + cases de sortie) : pas de capture, deux pions de couleurs différentes peuvent y cohabiter. | `SAFE` |
| 9 | **Barrage** : deux pions de la même couleur sur une case forment un barrage infranchissable (y compris pour leur propriétaire). Une case accueille au plus 2 pions. | `isBlockade`, `stepMove` |
| 10 | Avec un **6**, le joueur doit ouvrir son propre barrage s'il le peut. | `legalMoves` |
| 11 | **Sortie sur case occupée** : si la case de sortie contient deux pions dont au moins un adverse, le dernier pion adverse arrivé est capturé (avec bonus de 20). | `exitMove` |
| 12 | Chaque pion arrivé au centre donne un **bonus de 10 cases**. Un bonus sans coup légal est perdu. | `applyMove` |
| 13 | Sans coup légal, le tour passe (le 6 garde son lancer supplémentaire). | `applyRoll` |
| 14 | **Victoire** : premier joueur à amener ses 4 pions au centre. | `applyMove` |
| 15 | **Élimination** (abandon, déconnexion prolongée, suspension) : les pions du joueur quittent le plateau et son tour est sauté. Le dernier joueur restant gagne. | `eliminate`, `activeColors` |

## Règles de plateforme

- **Temps par tour** (15/30/60 s, choisi à la création) : à l'expiration, le serveur lance et joue le pion le plus avancé.
- **Déconnexion** : la partie se met en pause ; le joueur dispose de 60 s (`RECONNECT_GRACE_SECONDS`) pour revenir.
  Sinon il est éliminé (à deux, l'adversaire gagne). Si personne ne revient, la partie est annulée et les mises remboursées.
- **Abandon volontaire** : le joueur est éliminé et perd sa mise ; il peut aussitôt rejoindre une autre table.
  Les autres continuent ; le dernier restant (ou le premier à finir) remporte le pot.
- **Mises** : débitées en rejoignant la table, remboursées si on la quitte avant le début ; le vainqueur reçoit la somme
  des mises. XP : +250 victoire, +60 défaite.

## Entraînement contre les robots

- 1 à 3 robots (`POST /api/rooms/practice`), table privée sans mise ; la partie démarre immédiatement.
- Les robots jouent côté serveur avec les mêmes règles (`botChooseMove` : arriver au centre > capturer > sortir
  un pion > se mettre à l'abri > avancer, en évitant de finir à portée d'un pion adverse), une action toutes les ~0,9 s.
- Aucune mise, aucun gain, aucune XP ; ces parties ne comptent ni dans les statistiques ni dans le classement.
- Si le joueur quitte : à un contre un le robot gagne ; contre plusieurs robots la partie est annulée.
- Les comptes robots (`User.isBot`) ne peuvent pas se connecter et n'apparaissent pas dans l'administration.

## Différences avec le Parchís officiel (4 joueurs, 2 dés)

Un seul dé (comme le design). Plateau et parcours du Parchís classique : jaune en haut à gauche, vert en haut à droite, bleu en bas à gauche, rouge en bas à droite, sens antihoraire, 64 cases de piste avant le couloir. Les parties commencées avec l'ancien parcours (56 cases) sont converties au chargement (`upgradeState`).

---

# Règles — Puissance 4 (« أربعة على التوالي »)

Appliquées côté serveur par `server/src/game/connect4.ts`, couvertes par `server/src/game/connect4.test.ts`.

| # | Règle | Référence moteur |
|---|-------|------------------|
| 1 | Deux joueurs, rouge et jaune ; le premier joueur est tiré au sort. Grille de 7 colonnes × 6 lignes. | `createConnect4`, `rooms.service#startGame` |
| 2 | À son tour, le joueur choisit une colonne non pleine ; le jeton tombe sur la case libre la plus basse. | `c4Drop`, `c4LegalMoves` |
| 3 | **Victoire** : 4 jetons alignés ou plus (horizontal, vertical, diagonal). Le gagnant reçoit le pot. | `c4Drop` |
| 4 | **Match nul** : grille pleine sans alignement ; chaque joueur récupère sa mise, résultat `DRAW`. | `c4Drop`, `gameManager#finish` |
| 5 | **Abandon / déconnexion prolongée** : l'adversaire gagne. | `c4Eliminate` |
| 6 | **Temps écoulé** : le serveur joue un coup prudent (gagner, sinon bloquer, sinon le centre). | `GAME_RULES.CONNECT4.auto` |
| 7 | **Robot** (niveau réglé dans l'admin) : bas = colonne au hasard ; moyen = gagne/bloque et évite d'offrir la victoire ; haut = recherche négamax à 6 demi-coups. | `c4BotColumn` |
