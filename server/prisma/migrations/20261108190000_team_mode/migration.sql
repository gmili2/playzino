-- Mode 2 contre 2 : table jouée en deux équipes de partenaires assis face à face.
ALTER TABLE `Room` ADD COLUMN `teams` BOOLEAN NOT NULL DEFAULT false;
