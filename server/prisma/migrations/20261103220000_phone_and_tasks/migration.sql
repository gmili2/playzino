-- Téléphone du joueur (identification par l'admin) et récompense de la mission « 10 parties avec mise ».
ALTER TABLE `User` ADD COLUMN `phone` VARCHAR(10) NULL;
CREATE UNIQUE INDEX `User_phone_key` ON `User`(`phone`);
ALTER TABLE `WalletTransaction` MODIFY `type` ENUM('SIGNUP_BONUS', 'DAILY_BONUS', 'STAKE', 'WIN', 'REFUND', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'DEPOSIT', 'WITHDRAWAL', 'WITHDRAWAL_REFUND', 'WHEEL_SPIN', 'WHEEL_PRIZE', 'TASK_REWARD') NOT NULL;
