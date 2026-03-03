-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'STORE_USER');

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "storeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- Insert default store for existing data (fixed id for backfill)
INSERT INTO "Store" ("id", "name", "slug", "createdAt", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'Default', 'default', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Add storeId to Product (nullable first, backfill, then NOT NULL)
ALTER TABLE "Product" ADD COLUMN "storeId" TEXT;
UPDATE "Product" SET "storeId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "Product" ALTER COLUMN "storeId" SET NOT NULL;
CREATE INDEX "Product_storeId_idx" ON "Product"("storeId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add storeId to Sale
ALTER TABLE "Sale" ADD COLUMN "storeId" TEXT;
UPDATE "Sale" SET "storeId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "Sale" ALTER COLUMN "storeId" SET NOT NULL;
CREATE INDEX "Sale_storeId_idx" ON "Sale"("storeId");
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add storeId to StockLog
ALTER TABLE "StockLog" ADD COLUMN "storeId" TEXT;
UPDATE "StockLog" SET "storeId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "StockLog" ALTER COLUMN "storeId" SET NOT NULL;
CREATE INDEX "StockLog_storeId_idx" ON "StockLog"("storeId");
ALTER TABLE "StockLog" ADD CONSTRAINT "StockLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- User and PasswordResetToken FKs
ALTER TABLE "User" ADD CONSTRAINT "User_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
