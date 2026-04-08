-- Remove duplicidades historicas de metodo de pagamento por venda
WITH ranked_payments AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "saleId", "method"
      ORDER BY "id"
    ) AS row_num
  FROM "SalePayment"
)
DELETE FROM "SalePayment" sp
USING ranked_payments rp
WHERE sp."id" = rp."id"
  AND rp.row_num > 1;

-- Garante no maximo um registro de metodo por venda
CREATE UNIQUE INDEX "SalePayment_saleId_method_key"
ON "SalePayment"("saleId", "method");
