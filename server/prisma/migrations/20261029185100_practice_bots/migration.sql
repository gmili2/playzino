-- AlterTable
ALTER TABLE `Room` ADD COLUMN `isPractice` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `isBot` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `User_isBot_idx` ON `User`(`isBot`);
