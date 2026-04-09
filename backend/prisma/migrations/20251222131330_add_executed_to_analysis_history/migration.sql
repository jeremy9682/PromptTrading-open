-- AlterTable
ALTER TABLE "polymarket_analysis_history" ADD COLUMN     "executed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "executed_at" TIMESTAMP(3);
