#!/bin/sh
# Base séparée pour les tests d'intégration (créée au premier démarrage du volume).
mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" <<SQL
CREATE DATABASE IF NOT EXISTS \`${MARIADB_DATABASE}_test\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON \`${MARIADB_DATABASE}_test\`.* TO '${MARIADB_USER}'@'%';
-- Prisma migrate dev a besoin d'une "shadow database" temporaire.
GRANT CREATE, DROP ON *.* TO '${MARIADB_USER}'@'%';
FLUSH PRIVILEGES;
SQL
