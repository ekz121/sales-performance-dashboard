-- AlterTable
ALTER TABLE `ImportBatch`
  ADD COLUMN `duplicateCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `importMode` VARCHAR(20) NOT NULL DEFAULT 'append',
  ADD COLUMN `totalQuantity` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `totalNettAmount` DECIMAL(20, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `profileId` INTEGER NULL;

-- CreateTable
CREATE TABLE `ImportProfile` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `signature` CHAR(64) NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `sheetName` VARCHAR(120) NULL,
  `headerRow` INTEGER NULL,
  `mapping` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ImportProfile_signature_key`(`signature`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ImportReplacementBackup` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `importBatchId` INTEGER NOT NULL,
  `rowCount` INTEGER NOT NULL,
  `payload` LONGTEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `ImportReplacementBackup_importBatchId_key`(`importBatchId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ImportBatch_profileId_idx` ON `ImportBatch`(`profileId`);

-- AddForeignKey
ALTER TABLE `ImportBatch`
  ADD CONSTRAINT `ImportBatch_profileId_fkey`
  FOREIGN KEY (`profileId`) REFERENCES `ImportProfile`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ImportReplacementBackup`
  ADD CONSTRAINT `ImportReplacementBackup_importBatchId_fkey`
  FOREIGN KEY (`importBatchId`) REFERENCES `ImportBatch`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
