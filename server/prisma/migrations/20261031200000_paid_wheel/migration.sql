-- AlterTable : tours de roue payants (mise et gain).
ALTER TABLE `WalletTransaction` MODIFY `type` ENUM('SIGNUP_BONUS', 'DAILY_BONUS', 'STAKE', 'WIN', 'REFUND', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'DEPOSIT', 'WITHDRAWAL', 'WITHDRAWAL_REFUND', 'WHEEL_SPIN', 'WHEEL_PRIZE') NOT NULL;
