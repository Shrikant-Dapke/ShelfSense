-- AlterTable
ALTER TABLE "stock_counts" ADD COLUMN     "reference_no" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "posted_by" UUID,
ADD COLUMN     "posted_at" TIMESTAMP(3);
