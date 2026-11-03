-- Case « 0 » de la roue : un tour sans gain laisse une ligne à 0 (trace du tour du jour / du tour payant).
-- Tout autre mouvement reste interdit à 0.
ALTER TABLE `WalletTransaction` DROP CONSTRAINT `WalletTransaction_amount_non_zero`;
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_amount_non_zero` CHECK (`amount` <> 0 OR `type` IN ('DAILY_BONUS', 'WHEEL_PRIZE'));
