-- Adiciona desconto aplicado no total da venda
ALTER TABLE "Sale"
ADD COLUMN "discountCents" INTEGER NOT NULL DEFAULT 0;

-- Marca quantidade bonificada por item da venda
ALTER TABLE "SaleItem"
ADD COLUMN "bonusQty" INTEGER NOT NULL DEFAULT 0;
