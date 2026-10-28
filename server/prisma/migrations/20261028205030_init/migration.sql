-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(30) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `username` VARCHAR(32) NOT NULL,
    `passwordHash` VARCHAR(100) NOT NULL,
    `role` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    `status` ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `suspendedReason` VARCHAR(500) NULL,
    `tokenVersion` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `lastLoginAt` DATETIME(3) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_username_key`(`username`),
    INDEX `User_status_idx`(`status`),
    INDEX `User_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Profile` (
    `userId` VARCHAR(30) NOT NULL,
    `avatarColor` VARCHAR(7) NOT NULL DEFAULT '#2F6BFF',
    `bio` VARCHAR(280) NULL,
    `xp` INTEGER NOT NULL DEFAULT 0,
    `soundEnabled` BOOLEAN NOT NULL DEFAULT true,
    `invitesEnabled` BOOLEAN NOT NULL DEFAULT true,
    `hideOnline` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Wallet` (
    `id` VARCHAR(30) NOT NULL,
    `userId` VARCHAR(30) NOT NULL,
    `balance` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Wallet_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WalletTransaction` (
    `id` VARCHAR(30) NOT NULL,
    `walletId` VARCHAR(30) NOT NULL,
    `type` ENUM('SIGNUP_BONUS', 'DAILY_BONUS', 'STAKE', 'WIN', 'REFUND', 'ADMIN_CREDIT', 'ADMIN_DEBIT') NOT NULL,
    `amount` INTEGER NOT NULL,
    `balanceAfter` INTEGER NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `roomId` VARCHAR(30) NULL,
    `gameId` VARCHAR(30) NULL,
    `actorId` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WalletTransaction_idempotencyKey_key`(`idempotencyKey`),
    INDEX `WalletTransaction_walletId_createdAt_idx`(`walletId`, `createdAt`),
    INDEX `WalletTransaction_type_createdAt_idx`(`type`, `createdAt`),
    INDEX `WalletTransaction_gameId_idx`(`gameId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Room` (
    `id` VARCHAR(30) NOT NULL,
    `code` VARCHAR(8) NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `visibility` ENUM('PUBLIC', 'PRIVATE') NOT NULL,
    `status` ENUM('WAITING', 'PLAYING', 'FINISHED', 'CANCELLED') NOT NULL DEFAULT 'WAITING',
    `maxPlayers` INTEGER NOT NULL DEFAULT 2,
    `stake` INTEGER NOT NULL DEFAULT 0,
    `turnSeconds` INTEGER NOT NULL DEFAULT 30,
    `hostId` VARCHAR(30) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Room_code_key`(`code`),
    INDEX `Room_visibility_status_createdAt_idx`(`visibility`, `status`, `createdAt`),
    INDEX `Room_hostId_idx`(`hostId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RoomPlayer` (
    `id` VARCHAR(30) NOT NULL,
    `roomId` VARCHAR(30) NOT NULL,
    `userId` VARCHAR(30) NOT NULL,
    `seat` INTEGER NOT NULL,
    `color` VARCHAR(10) NOT NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RoomPlayer_userId_idx`(`userId`),
    UNIQUE INDEX `RoomPlayer_roomId_userId_key`(`roomId`, `userId`),
    UNIQUE INDEX `RoomPlayer_roomId_seat_key`(`roomId`, `seat`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Game` (
    `id` VARCHAR(30) NOT NULL,
    `roomId` VARCHAR(30) NOT NULL,
    `status` ENUM('ACTIVE', 'FINISHED', 'ABORTED') NOT NULL DEFAULT 'ACTIVE',
    `state` LONGTEXT NOT NULL,
    `stateVersion` INTEGER NOT NULL DEFAULT 0,
    `winnerId` VARCHAR(30) NULL,
    `endReason` ENUM('COMPLETED', 'FORFEIT', 'DISCONNECT', 'ADMIN') NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,

    INDEX `Game_status_startedAt_idx`(`status`, `startedAt`),
    INDEX `Game_roomId_idx`(`roomId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GamePlayer` (
    `id` VARCHAR(30) NOT NULL,
    `gameId` VARCHAR(30) NOT NULL,
    `userId` VARCHAR(30) NOT NULL,
    `color` VARCHAR(10) NOT NULL,
    `result` ENUM('WIN', 'LOSS') NULL,
    `payout` INTEGER NOT NULL DEFAULT 0,

    INDEX `GamePlayer_userId_idx`(`userId`),
    UNIQUE INDEX `GamePlayer_gameId_userId_key`(`gameId`, `userId`),
    UNIQUE INDEX `GamePlayer_gameId_color_key`(`gameId`, `color`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GameMove` (
    `id` VARCHAR(30) NOT NULL,
    `gameId` VARCHAR(30) NOT NULL,
    `seq` INTEGER NOT NULL,
    `userId` VARCHAR(30) NULL,
    `type` VARCHAR(16) NOT NULL,
    `payload` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GameMove_gameId_seq_key`(`gameId`, `seq`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(30) NOT NULL,
    `actorId` VARCHAR(30) NULL,
    `action` VARCHAR(64) NOT NULL,
    `targetType` VARCHAR(32) NOT NULL,
    `targetId` VARCHAR(30) NULL,
    `details` TEXT NULL,
    `ip` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `AuditLog_targetType_targetId_idx`(`targetType`, `targetId`),
    INDEX `AuditLog_action_createdAt_idx`(`action`, `createdAt`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Profile` ADD CONSTRAINT `Profile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Wallet` ADD CONSTRAINT `Wallet_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `Wallet`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_gameId_fkey` FOREIGN KEY (`gameId`) REFERENCES `Game`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Room` ADD CONSTRAINT `Room_hostId_fkey` FOREIGN KEY (`hostId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoomPlayer` ADD CONSTRAINT `RoomPlayer_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoomPlayer` ADD CONSTRAINT `RoomPlayer_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Game` ADD CONSTRAINT `Game_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Game` ADD CONSTRAINT `Game_winnerId_fkey` FOREIGN KEY (`winnerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GamePlayer` ADD CONSTRAINT `GamePlayer_gameId_fkey` FOREIGN KEY (`gameId`) REFERENCES `Game`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GamePlayer` ADD CONSTRAINT `GamePlayer_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GameMove` ADD CONSTRAINT `GameMove_gameId_fkey` FOREIGN KEY (`gameId`) REFERENCES `Game`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GameMove` ADD CONSTRAINT `GameMove_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Garde-fous au niveau base (en plus des contrôles applicatifs) :
-- aucun solde négatif, aucun montant nul, mises et tailles de table cohérentes.
ALTER TABLE `Wallet` ADD CONSTRAINT `Wallet_balance_non_negative` CHECK (`balance` >= 0);
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_amount_non_zero` CHECK (`amount` <> 0);
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_balance_after_non_negative` CHECK (`balanceAfter` >= 0);
ALTER TABLE `Room` ADD CONSTRAINT `Room_stake_non_negative` CHECK (`stake` >= 0);
ALTER TABLE `Room` ADD CONSTRAINT `Room_max_players_range` CHECK (`maxPlayers` BETWEEN 2 AND 4);
ALTER TABLE `Profile` ADD CONSTRAINT `Profile_xp_non_negative` CHECK (`xp` >= 0);
