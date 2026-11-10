-- AlterTable
ALTER TABLE "dispatches" ADD COLUMN     "idempotency_key" TEXT;

-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "dispatches_idempotency_key_key" ON "dispatches"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_idempotency_key_key" ON "receipts"("idempotency_key");
