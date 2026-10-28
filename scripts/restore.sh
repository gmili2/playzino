#!/bin/sh
# Restaure une sauvegarde : npm run restore -- backups/fichier.sql.gz
# ATTENTION : remplace le contenu actuel de la base.
set -e
cd "$(dirname "$0")/.."
. ./.env
[ -f "$1" ] || { echo "Usage : npm run restore -- backups/fichier.sql.gz"; exit 1; }
printf "Restaurer %s dans %s ? Les données actuelles seront remplacées. [oui/N] " "$1" "${MARIADB_DATABASE:-parcheesi}"
read -r ok
[ "$ok" = "oui" ] || { echo "Annulé."; exit 1; }
gunzip -c "$1" | docker compose exec -T db mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "${MARIADB_DATABASE:-parcheesi}"
echo "Restauration terminée."
