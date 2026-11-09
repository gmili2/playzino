#!/bin/sh
# Publie l'APK Android (mobile/dist/playzino.apk, construite par mobile/build-apk.sh) sur le serveur :
# ~/playzino-app/downloads/playzino.apk → https://playzino.mygympro.club/download/playzino.apk
# Après une nouvelle APK : augmenter APK_VERSION dans web/src/components/AppDownload.tsx et redéployer le site.
set -e
cd "$(dirname "$0")/.."
SSH="ssh -i ${DEPLOY_KEY:-$HOME/.ssh/gmbijoux_deploy} -p 21098"
HOST=gmbimeor@server71-1.web-hosting.com
test -f mobile/dist/playzino.apk
$SSH "$HOST" 'mkdir -p ~/playzino-app/downloads'
rsync -az -e "$SSH" mobile/dist/playzino.apk "$HOST":playzino-app/downloads/playzino.apk.tmp
$SSH "$HOST" 'mv ~/playzino-app/downloads/playzino.apk.tmp ~/playzino-app/downloads/playzino.apk'
echo "APK publiée : https://playzino.mygympro.club/download/playzino.apk"
