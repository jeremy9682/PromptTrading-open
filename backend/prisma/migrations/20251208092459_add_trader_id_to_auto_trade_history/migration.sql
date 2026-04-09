-- AlterTable
ALTER TABLE "auto_trade_history" ADD COLUMN     "trader_id" TEXT;

-- CreateIndex
CREATE INDEX "auto_trade_history_trader_id_idx" ON "auto_trade_history"("trader_id");

-- AddForeignKey
ALTER TABLE "auto_trade_history" ADD CONSTRAINT "auto_trade_history_trader_id_fkey" FOREIGN KEY ("trader_id") REFERENCES "polymarket_traders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
