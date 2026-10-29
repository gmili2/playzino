# Parcheesi Online

Application full-stack de Parcheesi multijoueur (2 à 4 joueurs) construite à partir du design
« Parcheesi Online » (export Claude Design conservé dans `design/`). L'interface reste en **arabe (RTL)**
avec le thème bleu nuit d'origine.

- **Frontend** : React 18 + Vite + TypeScript (`web/`) — même framework que le design (React).
- **Backend** : Node.js 22, Express 5, TypeScript (`server/`).
- **Base** : MariaDB 11 (InnoDB, clés étrangères, index, contraintes uniques et CHECK) via Prisma.
- **Temps réel** : Socket.IO (authentifié par le cookie de session).
- **Monnaie virtuelle uniquement** : aucune transaction en argent réel.

## Démarrage rapide (développement)

```bash
cp .env.example .env          # puis changer les mots de passe et JWT_SECRET (openssl rand -hex 32)
npm install
npm run dev:db                # MariaDB dans Docker (port 3307, volume persistant db_data)
npm run db:migrate            # applique les migrations Prisma
npm run db:seed-admin         # crée le compte ADMIN défini par ADMIN_EMAIL / ADMIN_USERNAME / ADMIN_PASSWORD
npm run dev:server            # API + Socket.IO sur http://localhost:4000
npm run dev:web               # interface sur http://localhost:5180 (proxy /api et /socket.io)
```

## Production avec Docker Compose

```bash
cp .env.example .env && nano .env      # COOKIE_SECURE=true derrière HTTPS, CORS_ORIGIN = URL publique
docker compose up -d --build           # MariaDB + application (migrations appliquées au démarrage)
```

L'application (API + frontend compilé) écoute sur `APP_PORT` (4000 par défaut). Le compte admin est créé au
démarrage si `ADMIN_*` est renseigné.

## Sauvegarde / restauration

```bash
npm run backup                                   # backups/parcheesi-AAAAMMJJ-HHMMSS.sql.gz
npm run restore -- backups/parcheesi-….sql.gz    # demande confirmation, remplace la base
```

## Tests

```bash
npm test             # moteur de jeu, auth, portefeuille, migrations, multijoueur Socket.IO (base parcheesi_test)
npm run test:e2e     # Playwright : deux navigateurs jouent l'un contre l'autre (API + Vite doivent tourner)
```

Les tests d'intégration utilisent la base `TEST_DATABASE_URL` (créée par `docker/db-init` au premier démarrage du
volume) et y appliquent les migrations : une base vide vérifie donc les migrations depuis zéro.

## Architecture

```
server/src
  config.ts                 validation des variables d'environnement (zod)
  app.ts / index.ts         Express, sécurité (helmet, CORS, anti-CSRF), service du frontend compilé
  game/engine.ts            moteur de règles pur (voir RULES.md)
  realtime/gameManager.ts   état autoritaire des parties : file d'actions, persistance, minuterie, reconnexion, gains
  realtime/socket.ts        Socket.IO : game:join / game:roll / game:move / game:forfeit, room:watch, lobby:watch
  modules/auth|users|wallet|rooms|games|stats|admin   routes REST + services
  middleware/               auth (cookie httpOnly JWT, rôle relu en base), erreurs centralisées
prisma/schema.prisma        User, Profile, Wallet, WalletTransaction, Room, RoomPlayer, Game, GamePlayer, GameMove, AuditLog
web/src
  components/Board.tsx      plateau porté du composant « Board » du design
  pages/                    Home, Tables, Auth, Game (salle d'attente + partie), Profile (portefeuille, historique), Admin
```

### Garanties côté serveur

- **Soldes** : mise à jour conditionnelle atomique (`balance + montant >= 0`) dans une transaction, contrainte
  `CHECK (balance >= 0)` en base, clé d'idempotence unique par opération (inscription, mise, gain, remboursement,
  bonus quotidien, ajustement admin) : impossible de doubler une opération ou de passer en négatif.
- **Parties** : chaque action est validée par le moteur, sérialisée par partie, persistée avec verrou optimiste
  (`stateVersion`) et journalisée dans `GameMove`. L'état est rechargé depuis MariaDB après un redémarrage.
- **Tables** : verrou de ligne (`SELECT … FOR UPDATE`) à l'arrivée d'un joueur ; un utilisateur ne peut occuper
  qu'une table active.
- **Admin** : rôle vérifié en base à chaque requête ; suspension (sessions révoquées, forfait automatique),
  ajustements de crédits plafonnés avec justification obligatoire, annulation de partie avec remboursement ;
  toutes ces actions sont écrites dans `AuditLog`.

## API (résumé)

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | public |
| GET/PATCH | `/api/me` · POST `/api/me/password` · GET `/api/me/games` | utilisateur |
| GET | `/api/wallet` · POST `/api/wallet/daily-bonus` | utilisateur |
| GET | `/api/rooms`, `/api/rooms/:id`, `/api/rooms/current` | public / utilisateur |
| POST | `/api/rooms`, `/api/rooms/quick`, `/api/rooms/practice` (contre 1 à 3 robots), `/api/rooms/join-code`, `/api/rooms/:id/join`, `/api/rooms/:id/leave` | utilisateur |
| GET/POST | `/api/games/:id`, `/roll`, `/move`, `/forfeit` (équivalents REST des événements Socket.IO) | joueur |
| GET | `/api/stats` (classement, dernières victoires, joueurs en ligne) | public |
| GET/POST | `/api/admin/overview`, `/users`, `/users/:id/suspend`, `/reactivate`, `/credits`, `/games`, `/games/:id/abort`, `/transactions`, `/audit` | ADMIN |

Toute requête qui modifie l'état doit porter l'en-tête `X-Requested-With: parcheesi` (protection CSRF).

## Déploiement Namecheap (playzino.mygympro.club)

Application Node.js 22 « playzino-app » (cPanel → Setup Node.js App, fichier de démarrage `app.cjs`), base
`gmbimeor_playzino`. Le fichier `~/playzino-app/.env` du serveur contient les secrets de production.

```bash
npm run deploy      # build, envoi (rsync), npm install, prisma migrate deploy, redémarrage
```

DNS (Cloudflare, zone mygympro.club) : enregistrement `A playzino → 198.54.114.155`, proxy activé (WebSockets
supportés par Cloudflare).
