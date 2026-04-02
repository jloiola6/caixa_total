CREATE TABLE "ClothingSize" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "stock" INTEGER NOT NULL DEFAULT 0,
  "sku" TEXT,
  "barcode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClothingSize_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ClothingSize"
  ADD CONSTRAINT "ClothingSize_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ClothingSize_productId_idx" ON "ClothingSize"("productId");
CREATE INDEX "ClothingSize_barcode_idx" ON "ClothingSize"("barcode");

INSERT INTO "ClothingSize" (
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
  'cs_' || md5(p."id" || ':' || COALESCE(NULLIF(BTRIM(p."size"), ''), 'U') || ':' || p."createdAt"::text) AS "id",
  p."id" AS "productId",
  COALESCE(NULLIF(BTRIM(p."size"), ''), 'U') AS "number",
  GREATEST(p."stock", 0) AS "stock",
  p."sku" AS "sku",
  p."barcode" AS "barcode",
  p."createdAt" AS "createdAt",
  p."updatedAt" AS "updatedAt"
FROM "Product" p
WHERE p."category" = 'roupas'::"ProductCategory"
  AND (p."size" IS NOT NULL OR p."stock" > 0);

UPDATE "Product"
SET "size" = NULL
WHERE "category" = 'roupas'::"ProductCategory";
