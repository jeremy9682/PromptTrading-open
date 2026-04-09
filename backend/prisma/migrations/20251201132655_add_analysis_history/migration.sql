-- CreateTable
CREATE TABLE "polymarket_analysis_history" (
    "id" TEXT NOT NULL,
    "trader_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_title" TEXT NOT NULL,
    "ai_model" TEXT NOT NULL,
    "yes_price" DECIMAL(5,4) NOT NULL,
    "no_price" DECIMAL(5,4) NOT NULL,
    "volume" DECIMAL(15,2) NOT NULL,
    "analysis_result" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "reasoning" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "polymarket_analysis_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "polymarket_analysis_history_trader_id_idx" ON "polymarket_analysis_history"("trader_id");

-- CreateIndex
CREATE INDEX "polymarket_analysis_history_user_id_idx" ON "polymarket_analysis_history"("user_id");

-- CreateIndex
CREATE INDEX "polymarket_analysis_history_created_at_idx" ON "polymarket_analysis_history"("created_at");

-- AddForeignKey
ALTER TABLE "polymarket_analysis_history" ADD CONSTRAINT "polymarket_analysis_history_trader_id_fkey" FOREIGN KEY ("trader_id") REFERENCES "polymarket_traders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polymarket_analysis_history" ADD CONSTRAINT "polymarket_analysis_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
