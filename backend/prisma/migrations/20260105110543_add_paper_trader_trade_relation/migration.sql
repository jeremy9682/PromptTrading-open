-- AlterTable
ALTER TABLE "paper_trades" ADD COLUMN     "trader_id" TEXT;

-- CreateIndex
CREATE INDEX "paper_trades_trader_id_idx" ON "paper_trades"("trader_id");

-- AddForeignKey
ALTER TABLE "paper_trades" ADD CONSTRAINT "paper_trades_trader_id_fkey" FOREIGN KEY ("trader_id") REFERENCES "paper_traders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
