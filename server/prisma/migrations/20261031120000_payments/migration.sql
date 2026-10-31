-- AlterTable
ALTER TABLE `WalletTransaction` MODIFY `type` ENUM('SIGNUP_BONUS', 'DAILY_BONUS', 'STAKE', 'WIN', 'REFUND', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'DEPOSIT', 'WITHDRAWAL', 'WITHDRAWAL_REFUND') NOT NULL;

-- CreateTable
CREATE TABLE `PaymentBank` (
    `id` VARCHAR(30) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `accountHolder` VARCHAR(100) NOT NULL,
    `rib` VARCHAR(24) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PaymentBank_active_idx`(`active`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DepositRequest` (
    `id` VARCHAR(30) NOT NULL,
    `clientRef` VARCHAR(80) NOT NULL,
    `userId` VARCHAR(30) NOT NULL,
    `bankId` VARCHAR(30) NOT NULL,
    `amount` INTEGER NOT NULL,
    `creditedAmount` INTEGER NULL,
    `receiptFile` VARCHAR(64) NOT NULL,
    `receiptMime` VARCHAR(32) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `note` VARCHAR(500) NULL,
    `reviewedById` VARCHAR(30) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DepositRequest_clientRef_key`(`clientRef`),
    INDEX `DepositRequest_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `DepositRequest_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WithdrawalRequest` (
    `id` VARCHAR(30) NOT NULL,
    `clientRef` VARCHAR(80) NOT NULL,
    `userId` VARCHAR(30) NOT NULL,
    `amount` INTEGER NOT NULL,
    `bankName` VARCHAR(60) NOT NULL,
    `accountHolder` VARCHAR(100) NOT NULL,
    `rib` VARCHAR(24) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `note` VARCHAR(500) NULL,
    `reviewedById` VARCHAR(30) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WithdrawalRequest_clientRef_key`(`clientRef`),
    INDEX `WithdrawalRequest_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `WithdrawalRequest_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DepositRequest` ADD CONSTRAINT `DepositRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DepositRequest` ADD CONSTRAINT `DepositRequest_bankId_fkey` FOREIGN KEY (`bankId`) REFERENCES `PaymentBank`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DepositRequest` ADD CONSTRAINT `DepositRequest_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WithdrawalRequest` ADD CONSTRAINT `WithdrawalRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WithdrawalRequest` ADD CONSTRAINT `WithdrawalRequest_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

