#!/bin/sh
# Sauvegarde compressée de la base MariaDB du conteneur docker compose.
# Usage : npm run backup   → backups/parcheesi-AAAAMMJJ-HHMMSS.sql.gz
set -e
cd "$(dirname "$0")/.."
. ./.env
mkdir -p backups
OUT="backups/${MARIADB_DATABASE:-parcheesi}-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T db mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" \
  --single-transaction --routines --triggers "${MARIADB_DATABASE:-parcheesi}" | gzip > "$OUT"
echo "Sauvegarde : $OUT ($(du -h "$OUT" | cut -f1))"
