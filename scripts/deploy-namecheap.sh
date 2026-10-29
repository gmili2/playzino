#!/bin/sh
# Déploiement sur l'hébergement Namecheap (cPanel, Node.js App « playzino-app » → https://playzino.mygympro.club).
# Le fichier ~/playzino-app/.env du serveur (DATABASE_URL, JWT_SECRET, …) n'est jamais écrasé.
set -e
cd "$(dirname "$0")/.."
SSH="ssh -i ${DEPLOY_KEY:-$HOME/.ssh/gmbijoux_deploy} -p 21098"
HOST=gmbimeor@server71-1.web-hosting.com
B=$(mktemp -d)

npm run build -w server
npm run build -w web
cp -R server/dist server/prisma "$B"/
cp -R web/dist "$B"/web
find "$B" -name '*.map' -delete
node -e '
const p=require("./server/package.json");
require("fs").writeFileSync(process.argv[1]+"/package.json",JSON.stringify({name:"playzino",private:true,type:"module",
  scripts:{start:"node dist/index.js",migrate:"prisma migrate deploy","seed:admin":"node dist/scripts/createAdmin.js"},
  dependencies:{...p.dependencies,prisma:p.devDependencies.prisma}},null,2));' "$B"
printf "import('./dist/index.js').catch((e) => { console.error(e); process.exit(1); });\n" > "$B/app.cjs"

rsync -az --delete --exclude .env --exclude node_modules --exclude tmp --exclude public -e "$SSH" "$B"/ "$HOST":playzino-app/
$SSH "$HOST" 'source ~/nodevenv/playzino-app/22/bin/activate && cd ~/playzino-app \
  && npm install --no-audit --no-fund --omit=dev \
  && export TOKIO_WORKER_THREADS=2 && set -a && . ./.env && set +a \
  && npx prisma generate && npx prisma migrate deploy \
  && cloudlinux-selector restart --json --interpreter=nodejs --app-root=playzino-app \
  && (pkill -f "lsnode:/home/gmbimeor/playzino-app/" || true)'
# LiteSpeed ne relance pas toujours le processus Node existant : on l'arrête, il redémarre à la requête suivante.
rm -rf "$B"
curl -sf https://playzino.mygympro.club/api/health && echo "  → en ligne : https://playzino.mygympro.club"
