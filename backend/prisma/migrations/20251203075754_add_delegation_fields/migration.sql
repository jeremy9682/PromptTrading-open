-- AlterTable
ALTER TABLE "users" ADD COLUMN     "auto_trade_daily_limit" DECIMAL(12,2),
ADD COLUMN     "auto_trade_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "auto_trade_max_amount" DECIMAL(12,2),
ADD COLUMN     "delegated_at" TIMESTAMP(3),
ADD COLUMN     "delegation_chain_id" INTEGER,
ADD COLUMN     "is_delegated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "auto_trade_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_title" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "price" DECIMAL(5,4) NOT NULL,
    "order_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "signal_source" TEXT NOT NULL,
    "signal_confidence" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executed_at" TIMESTAMP(3),

    CONSTRAINT "auto_trade_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auto_trade_history_user_id_idx" ON "auto_trade_history"("user_id");

-- CreateIndex
CREATE INDEX "auto_trade_history_status_idx" ON "auto_trade_history"("status");

-- CreateIndex
CREATE INDEX "auto_trade_history_created_at_idx" ON "auto_trade_history"("created_at");

-- CreateIndex
CREATE INDEX "users_is_delegated_idx" ON "users"("is_delegated");

-- AddForeignKey
ALTER TABLE "auto_trade_history" ADD CONSTRAINT "auto_trade_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
