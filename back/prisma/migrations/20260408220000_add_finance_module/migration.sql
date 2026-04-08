-- CreateEnum
CREATE TYPE "FinancialEntryOrigin" AS ENUM ('sale', 'sale_payment', 'fiado_receivable', 'receivable_settlement', 'payable', 'payable_settlement', 'payroll', 'tax', 'adjustment', 'cash_movement', 'reconciliation', 'fiscal_import', 'recurring');

-- CreateEnum
CREATE TYPE "FinancialBasis" AS ENUM ('caixa', 'competencia');

-- CreateEnum
CREATE TYPE "FinancialDirection" AS ENUM ('entrada', 'saida');

-- CreateEnum
CREATE TYPE "FinancialEntryStatus" AS ENUM ('draft', 'approved', 'reconciled', 'canceled');

-- CreateEnum
CREATE TYPE "FinancialCounterpartyType" AS ENUM ('customer', 'supplier', 'employee', 'other');

-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('open', 'closed', 'canceled');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('opening', 'suprimento', 'sangria', 'adjustment', 'sale_collection', 'expense_payment', 'closing_difference');

-- CreateEnum
CREATE TYPE "AccountsPayableStatus" AS ENUM ('draft', 'open', 'partial', 'paid', 'canceled', 'overdue');

-- CreateEnum
CREATE TYPE "AccountsReceivableStatus" AS ENUM ('draft', 'open', 'partial', 'paid', 'canceled', 'overdue');

-- CreateEnum
CREATE TYPE "RecurringInterval" AS ENUM ('weekly', 'monthly', 'yearly');

-- CreateEnum
CREATE TYPE "ReconciliationImportFormat" AS ENUM ('csv', 'ofx');

-- CreateEnum
CREATE TYPE "ReconciliationMatchStatus" AS ENUM ('suggested', 'matched', 'ignored');

-- CreateEnum
CREATE TYPE "FinancialAlertType" AS ENUM ('payable_due', 'payable_overdue', 'receivable_overdue', 'cash_negative');

-- CreateEnum
CREATE TYPE "FinancialAlertStatus" AS ENUM ('open', 'dismissed', 'resolved');

-- CreateEnum
CREATE TYPE "FiscalRuleType" AS ENUM ('imposto', 'taxa');

-- CreateEnum
CREATE TYPE "PayrollEventType" AS ENUM ('provento', 'desconto', 'encargo', 'beneficio');

-- CreateEnum
CREATE TYPE "FiscalDocumentDirection" AS ENUM ('entrada', 'saida');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "financialPostedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalProcess" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "openingBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "currentBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialCustomer" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "document" TEXT,
    "notes" TEXT,
    "fiadoBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialSupplier" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialEmployee" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "baseSalaryCents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollImport" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "sourceName" TEXT,
    "importedByUserId" TEXT NOT NULL,
    "rawPayload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "payrollImportId" TEXT,
    "employeeId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "type" "PayrollEventType" NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "competenceDate" TIMESTAMP(3) NOT NULL,
    "settlementDate" TIMESTAMP(3),
    "financialEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountsPayable" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "supplierId" TEXT,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "outstandingCents" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "competenceDate" TIMESTAMP(3) NOT NULL,
    "status" "AccountsPayableStatus" NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "costCenterId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "recurringTemplateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountsPayable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountsPayableSettlement" (
    "id" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "financialEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountsPayableSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountsReceivable" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "outstandingCents" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3),
    "competenceDate" TIMESTAMP(3) NOT NULL,
    "status" "AccountsReceivableStatus" NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "costCenterId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "recurringTemplateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountsReceivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountsReceivableSettlement" (
    "id" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "financialEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountsReceivableSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringTemplate" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "direction" "FinancialDirection" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "interval" "RecurringInterval" NOT NULL,
    "nextRunDate" TIMESTAMP(3) NOT NULL,
    "lastRunDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "costCenterId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "counterpartyType" "FinancialCounterpartyType",
    "counterpartyLabel" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashSession" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "openedByUserId" TEXT NOT NULL,
    "closedByUserId" TEXT,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'open',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingAmountCents" INTEGER NOT NULL,
    "closingAmountExpectedCents" INTEGER,
    "closingAmountCountedCents" INTEGER,
    "differenceCents" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "financialEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalTaxRule" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FiscalRuleType" NOT NULL,
    "appliesTo" TEXT NOT NULL,
    "productCategory" "ProductCategory",
    "paymentMethod" "PaymentMethod",
    "rateBps" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalTaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalDocument" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "number" TEXT,
    "series" TEXT,
    "issuerDocument" TEXT,
    "issuerName" TEXT,
    "direction" "FiscalDocumentDirection" NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "xmlContent" TEXT NOT NULL,
    "importedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalDocumentTax" (
    "id" TEXT NOT NULL,
    "fiscalDocumentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "rateBps" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalDocumentTax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationImport" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "format" "ReconciliationImportFormat" NOT NULL,
    "fileName" TEXT,
    "importedByUserId" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationRow" (
    "id" TEXT NOT NULL,
    "reconciliationImportId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "direction" "FinancialDirection" NOT NULL,
    "matchedEntryId" TEXT,
    "matchStatus" "ReconciliationMatchStatus" NOT NULL DEFAULT 'suggested',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialEntry" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "origin" "FinancialEntryOrigin" NOT NULL,
    "basis" "FinancialBasis" NOT NULL,
    "direction" "FinancialDirection" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "competenceDate" TIMESTAMP(3) NOT NULL,
    "settlementDate" TIMESTAMP(3),
    "status" "FinancialEntryStatus" NOT NULL DEFAULT 'draft',
    "description" TEXT,
    "costCenterId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "accountId" TEXT,
    "counterpartyType" "FinancialCounterpartyType",
    "counterpartyLabel" TEXT,
    "customerId" TEXT,
    "supplierId" TEXT,
    "employeeId" TEXT,
    "sourceRef" TEXT NOT NULL,
    "sourceRefHash" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "payableId" TEXT,
    "receivableId" TEXT,
    "fiscalDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialEntryAudit" (
    "id" TEXT NOT NULL,
    "financialEntryId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "notes" TEXT,
    "previousStatus" "FinancialEntryStatus",
    "nextStatus" "FinancialEntryStatus",
    "performedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialEntryAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAlert" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "FinancialAlertType" NOT NULL,
    "status" "FinancialAlertStatus" NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "dismissedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryValuationSnapshot" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalCostCents" INTEGER NOT NULL,
    "totalRetailCents" INTEGER NOT NULL,
    "totalMarginCents" INTEGER NOT NULL,
    "itemsCount" INTEGER NOT NULL,
    "metaJson" TEXT,

    CONSTRAINT "InventoryValuationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CostCenter_storeId_active_idx" ON "CostCenter"("storeId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_storeId_code_key" ON "CostCenter"("storeId", "code");

-- CreateIndex
CREATE INDEX "OperationalProcess_storeId_active_idx" ON "OperationalProcess"("storeId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalProcess_storeId_code_key" ON "OperationalProcess"("storeId", "code");

-- CreateIndex
CREATE INDEX "FinancialAccount_storeId_active_idx" ON "FinancialAccount"("storeId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_storeId_name_key" ON "FinancialAccount"("storeId", "name");

-- CreateIndex
CREATE INDEX "FinancialCustomer_storeId_fiadoBalanceCents_idx" ON "FinancialCustomer"("storeId", "fiadoBalanceCents");

-- CreateIndex
CREATE INDEX "FinancialCustomer_storeId_name_idx" ON "FinancialCustomer"("storeId", "name");

-- CreateIndex
CREATE INDEX "FinancialSupplier_storeId_name_idx" ON "FinancialSupplier"("storeId", "name");

-- CreateIndex
CREATE INDEX "FinancialEmployee_storeId_active_idx" ON "FinancialEmployee"("storeId", "active");

-- CreateIndex
CREATE INDEX "FinancialEmployee_storeId_name_idx" ON "FinancialEmployee"("storeId", "name");

-- CreateIndex
CREATE INDEX "PayrollImport_storeId_period_idx" ON "PayrollImport"("storeId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollImport_storeId_period_sourceName_key" ON "PayrollImport"("storeId", "period", "sourceName");

-- CreateIndex
CREATE INDEX "PayrollEvent_storeId_period_idx" ON "PayrollEvent"("storeId", "period");

-- CreateIndex
CREATE INDEX "PayrollEvent_employeeId_period_idx" ON "PayrollEvent"("employeeId", "period");

-- CreateIndex
CREATE INDEX "AccountsPayable_storeId_status_dueDate_idx" ON "AccountsPayable"("storeId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "AccountsPayable_storeId_competenceDate_idx" ON "AccountsPayable"("storeId", "competenceDate");

-- CreateIndex
CREATE INDEX "AccountsPayableSettlement_payableId_settledAt_idx" ON "AccountsPayableSettlement"("payableId", "settledAt");

-- CreateIndex
CREATE INDEX "AccountsReceivable_storeId_status_dueDate_idx" ON "AccountsReceivable"("storeId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "AccountsReceivable_storeId_competenceDate_idx" ON "AccountsReceivable"("storeId", "competenceDate");

-- CreateIndex
CREATE INDEX "AccountsReceivableSettlement_receivableId_settledAt_idx" ON "AccountsReceivableSettlement"("receivableId", "settledAt");

-- CreateIndex
CREATE INDEX "RecurringTemplate_storeId_active_nextRunDate_idx" ON "RecurringTemplate"("storeId", "active", "nextRunDate");

-- CreateIndex
CREATE INDEX "CashSession_storeId_status_openedAt_idx" ON "CashSession"("storeId", "status", "openedAt");

-- CreateIndex
CREATE INDEX "CashMovement_storeId_cashSessionId_createdAt_idx" ON "CashMovement"("storeId", "cashSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "FiscalTaxRule_storeId_active_idx" ON "FiscalTaxRule"("storeId", "active");

-- CreateIndex
CREATE INDEX "FiscalDocument_storeId_issueDate_idx" ON "FiscalDocument"("storeId", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalDocument_storeId_key_key" ON "FiscalDocument"("storeId", "key");

-- CreateIndex
CREATE INDEX "FiscalDocumentTax_fiscalDocumentId_idx" ON "FiscalDocumentTax"("fiscalDocumentId");

-- CreateIndex
CREATE INDEX "ReconciliationImport_storeId_importedAt_idx" ON "ReconciliationImport"("storeId", "importedAt");

-- CreateIndex
CREATE INDEX "ReconciliationRow_storeId_accountId_occurredAt_idx" ON "ReconciliationRow"("storeId", "accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "ReconciliationRow_matchedEntryId_idx" ON "ReconciliationRow"("matchedEntryId");

-- CreateIndex
CREATE INDEX "FinancialEntry_storeId_competenceDate_idx" ON "FinancialEntry"("storeId", "competenceDate");

-- CreateIndex
CREATE INDEX "FinancialEntry_storeId_settlementDate_idx" ON "FinancialEntry"("storeId", "settlementDate");

-- CreateIndex
CREATE INDEX "FinancialEntry_storeId_status_idx" ON "FinancialEntry"("storeId", "status");

-- CreateIndex
CREATE INDEX "FinancialEntry_storeId_origin_idx" ON "FinancialEntry"("storeId", "origin");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialEntry_storeId_sourceRef_key" ON "FinancialEntry"("storeId", "sourceRef");

-- CreateIndex
CREATE INDEX "FinancialEntryAudit_financialEntryId_createdAt_idx" ON "FinancialEntryAudit"("financialEntryId", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialAlert_storeId_status_type_idx" ON "FinancialAlert"("storeId", "status", "type");

-- CreateIndex
CREATE INDEX "FinancialAlert_storeId_dueDate_idx" ON "FinancialAlert"("storeId", "dueDate");

-- CreateIndex
CREATE INDEX "InventoryValuationSnapshot_storeId_capturedAt_idx" ON "InventoryValuationSnapshot"("storeId", "capturedAt");

-- CreateIndex
CREATE INDEX "Sale_storeId_createdAt_idx" ON "Sale"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalProcess" ADD CONSTRAINT "OperationalProcess_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialCustomer" ADD CONSTRAINT "FinancialCustomer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSupplier" ADD CONSTRAINT "FinancialSupplier_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEmployee" ADD CONSTRAINT "FinancialEmployee_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollImport" ADD CONSTRAINT "PayrollImport_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollImport" ADD CONSTRAINT "PayrollImport_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEvent" ADD CONSTRAINT "PayrollEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEvent" ADD CONSTRAINT "PayrollEvent_payrollImportId_fkey" FOREIGN KEY ("payrollImportId") REFERENCES "PayrollImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEvent" ADD CONSTRAINT "PayrollEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "FinancialEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEvent" ADD CONSTRAINT "PayrollEvent_financialEntryId_fkey" FOREIGN KEY ("financialEntryId") REFERENCES "FinancialEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayable" ADD CONSTRAINT "AccountsPayable_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayable" ADD CONSTRAINT "AccountsPayable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "FinancialSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayable" ADD CONSTRAINT "AccountsPayable_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayable" ADD CONSTRAINT "AccountsPayable_processId_fkey" FOREIGN KEY ("processId") REFERENCES "OperationalProcess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayable" ADD CONSTRAINT "AccountsPayable_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayable" ADD CONSTRAINT "AccountsPayable_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayable" ADD CONSTRAINT "AccountsPayable_recurringTemplateId_fkey" FOREIGN KEY ("recurringTemplateId") REFERENCES "RecurringTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayableSettlement" ADD CONSTRAINT "AccountsPayableSettlement_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "AccountsPayable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayableSettlement" ADD CONSTRAINT "AccountsPayableSettlement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayableSettlement" ADD CONSTRAINT "AccountsPayableSettlement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayableSettlement" ADD CONSTRAINT "AccountsPayableSettlement_financialEntryId_fkey" FOREIGN KEY ("financialEntryId") REFERENCES "FinancialEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsReceivable" ADD CONSTRAINT "AccountsReceivable_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsReceivable" ADD CONSTRAINT "AccountsReceivable_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "FinancialCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsReceivable" ADD CONSTRAINT "AccountsReceivable_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsReceivable" ADD CONSTRAINT "AccountsReceivable_processId_fkey" FOREIGN KEY ("processId") REFERENCES "OperationalProcess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsReceivable" ADD CONSTRAINT "AccountsReceivable_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsReceivable" ADD CONSTRAINT "AccountsReceivable_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsReceivable" ADD CONSTRAINT "AccountsReceivable_recurringTemplateId_fkey" FOREIGN KEY ("recurringTemplateId") REFERENCES "RecurringTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsReceivableSettlement" ADD CONSTRAINT "AccountsReceivableSettlement_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "AccountsReceivable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsReceivableSettlement" ADD CONSTRAINT "AccountsReceivableSettlement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsReceivableSettlement" ADD CONSTRAINT "AccountsReceivableSettlement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsReceivableSettlement" ADD CONSTRAINT "AccountsReceivableSettlement_financialEntryId_fkey" FOREIGN KEY ("financialEntryId") REFERENCES "FinancialEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_processId_fkey" FOREIGN KEY ("processId") REFERENCES "OperationalProcess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_financialEntryId_fkey" FOREIGN KEY ("financialEntryId") REFERENCES "FinancialEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalTaxRule" ADD CONSTRAINT "FiscalTaxRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDocumentTax" ADD CONSTRAINT "FiscalDocumentTax_fiscalDocumentId_fkey" FOREIGN KEY ("fiscalDocumentId") REFERENCES "FiscalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationImport" ADD CONSTRAINT "ReconciliationImport_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationImport" ADD CONSTRAINT "ReconciliationImport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationImport" ADD CONSTRAINT "ReconciliationImport_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationRow" ADD CONSTRAINT "ReconciliationRow_reconciliationImportId_fkey" FOREIGN KEY ("reconciliationImportId") REFERENCES "ReconciliationImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationRow" ADD CONSTRAINT "ReconciliationRow_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationRow" ADD CONSTRAINT "ReconciliationRow_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationRow" ADD CONSTRAINT "ReconciliationRow_matchedEntryId_fkey" FOREIGN KEY ("matchedEntryId") REFERENCES "FinancialEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_processId_fkey" FOREIGN KEY ("processId") REFERENCES "OperationalProcess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "FinancialCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "FinancialSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "FinancialEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "AccountsPayable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "AccountsReceivable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_fiscalDocumentId_fkey" FOREIGN KEY ("fiscalDocumentId") REFERENCES "FiscalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntryAudit" ADD CONSTRAINT "FinancialEntryAudit_financialEntryId_fkey" FOREIGN KEY ("financialEntryId") REFERENCES "FinancialEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntryAudit" ADD CONSTRAINT "FinancialEntryAudit_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAlert" ADD CONSTRAINT "FinancialAlert_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryValuationSnapshot" ADD CONSTRAINT "InventoryValuationSnapshot_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

