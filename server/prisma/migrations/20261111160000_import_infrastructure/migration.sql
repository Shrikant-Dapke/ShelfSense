/*
  Phase F import infrastructure.

  - Add PROCESSING / COMPLETED / PARTIALLY_COMPLETED to the ImportStatus enum
    (additive; new values are not used inside this transaction).
  - Track the import type on the job so history can be filtered.
  - Allow warehouse-agnostic imports (PRODUCTS / BATCHES) by making
    warehouse_id nullable; warehouse-scoped types (BATCH_ALIASES,
    OPENING_STOCK) require it at validation / execution time.
*/

ALTER TYPE "ImportStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "ImportStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "ImportStatus" ADD VALUE 'PARTIALLY_COMPLETED';

-- AlterTable
ALTER TABLE "import_jobs" ADD COLUMN     "import_type" TEXT NOT NULL DEFAULT 'PRODUCTS',
ALTER COLUMN "warehouse_id" DROP NOT NULL;
