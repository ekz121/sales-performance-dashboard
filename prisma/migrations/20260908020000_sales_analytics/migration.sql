CREATE TABLE `ImportBatch` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fileName` VARCHAR(191) NOT NULL,
    `fileType` VARCHAR(12) NOT NULL,
    `rowCount` INTEGER NOT NULL,
    `insertedCount` INTEGER NOT NULL,
    `periodStart` DATETIME(3) NULL,
    `periodEnd` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `ImportBatch_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SalesTransaction` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `importBatchId` INTEGER NOT NULL,
    `fingerprint` CHAR(64) NOT NULL,
    `salesOrg` VARCHAR(40) NULL,
    `salesOrgDesc` VARCHAR(160) NULL,
    `siteCode` VARCHAR(40) NOT NULL,
    `siteDesc` VARCHAR(180) NOT NULL,
    `salesCode` VARCHAR(40) NULL,
    `salesName` VARCHAR(140) NOT NULL,
    `posNumber` VARCHAR(60) NULL,
    `orderDate` DATETIME(3) NOT NULL,
    `week` INTEGER NULL,
    `itemGroup` VARCHAR(60) NULL,
    `itemGroupDesc` VARCHAR(180) NULL,
    `brandName` VARCHAR(100) NOT NULL,
    `articleCode` VARCHAR(60) NULL,
    `articleDescription` VARCHAR(220) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `price` DECIMAL(18, 2) NOT NULL,
    `discount` DECIMAL(18, 2) NOT NULL,
    `totalNettAmountWithTax` DECIMAL(18, 2) NOT NULL,
    `totalNettAmountExcTax` DECIMAL(18, 2) NOT NULL,
    `category` VARCHAR(80) NOT NULL,
    `category2` VARCHAR(80) NULL,
    `businessUnit` VARCHAR(80) NULL,
    `salesLeader` VARCHAR(140) NULL,
    `territorySalesHead` VARCHAR(140) NULL,
    UNIQUE INDEX `SalesTransaction_fingerprint_key`(`fingerprint`),
    INDEX `SalesTransaction_siteCode_orderDate_idx`(`siteCode`, `orderDate`),
    INDEX `SalesTransaction_siteCode_salesName_orderDate_idx`(`siteCode`, `salesName`, `orderDate`),
    INDEX `SalesTransaction_siteCode_category_orderDate_idx`(`siteCode`, `category`, `orderDate`),
    INDEX `SalesTransaction_siteCode_brandName_orderDate_idx`(`siteCode`, `brandName`, `orderDate`),
    INDEX `SalesTransaction_importBatchId_idx`(`importBatchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ReportDataset` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `importBatchId` INTEGER NOT NULL,
    `storeCode` VARCHAR(40) NOT NULL,
    `storeName` VARCHAR(180) NOT NULL,
    `month` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `sourceFile` VARCHAR(191) NOT NULL,
    `config` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `ReportDataset_storeCode_month_year_key`(`storeCode`, `month`, `year`),
    INDEX `ReportDataset_month_year_idx`(`month`, `year`),
    INDEX `ReportDataset_importBatchId_idx`(`importBatchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SalesTransaction` ADD CONSTRAINT `SalesTransaction_importBatchId_fkey` FOREIGN KEY (`importBatchId`) REFERENCES `ImportBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ReportDataset` ADD CONSTRAINT `ReportDataset_importBatchId_fkey` FOREIGN KEY (`importBatchId`) REFERENCES `ImportBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
