-- AlterTable : seules les tables de « partie rapide » basculent vers le robot faute d'adversaire.
ALTER TABLE `Room` ADD COLUMN `quickMatch` BOOLEAN NOT NULL DEFAULT false;
