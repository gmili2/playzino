-- Photo de profil choisie par le joueur (fichier dans le dossier uploads/avatars ; NULL = initiales sur sa couleur).
ALTER TABLE `Profile` ADD COLUMN `avatarFile` VARCHAR(64) NULL;
