ALTER TABLE "Store"
ADD COLUMN "onlineStoreWhatsappNumber" TEXT,
ADD COLUMN "onlineStoreWhatsappMessage" TEXT,
ADD COLUMN "stockAlertLowColor" TEXT NOT NULL DEFAULT '#f59e0b',
ADD COLUMN "stockAlertOutColor" TEXT NOT NULL DEFAULT '#ef4444',
ADD COLUMN "stockAlertOkColor" TEXT NOT NULL DEFAULT '#22c55e';
