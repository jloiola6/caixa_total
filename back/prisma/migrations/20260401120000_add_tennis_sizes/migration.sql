CREATE TABLE "TennisSize" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "stock" INTEGER NOT NULL DEFAULT 0,
  "sku" TEXT,
  "barcode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TennisSize_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TennisSize"
  ADD CONSTRAINT "TennisSize_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "TennisSize_productId_idx" ON "TennisSize"("productId");
CREATE INDEX "TennisSize_barcode_idx" ON "TennisSize"("barcode");

INSERT INTO "TennisSize" (
  "id",
  "productId",
  "number",
  "stock",
  "sku",
  "barcode",
  "createdAt",
  "updatedAt"
)
SELECT
  'ts_' || md5(p."id" || ':' || COALESCE(p."size", '') || ':' || p."createdAt"::text) AS "id",
  p."id" AS "productId",
  p."size" AS "number",
  GREATEST(p."stock", 0) AS "stock",
  p."sku" AS "sku",
  p."barcode" AS "barcode",
  p."createdAt" AS "createdAt",
  p."updatedAt" AS "updatedAt"
FROM "Product" p
WHERE p."category" = 'tenis'::"ProductCategory"
  AND p."size" IS NOT NULL;

UPDATE "Product"
SET "size" = NULL
WHERE "category" = 'tenis'::"ProductCategory";
