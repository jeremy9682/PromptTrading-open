-- CreateTable
CREATE TABLE "paper_trading_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 10000,
    "initial_balance" DECIMAL(12,2) NOT NULL DEFAULT 10000,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_reset_at" TIMESTAMP(3),

    CONSTRAINT "paper_trading_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_positions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_title" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "size" DECIMAL(12,4) NOT NULL,
    "entry_price" DECIMAL(5,4) NOT NULL,
    "total_cost" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paper_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_trades" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_title" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "size" DECIMAL(12,4) NOT NULL,
    "price" DECIMAL(5,4) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "pnl" DECIMAL(12,2),
    "from_ai_analysis" BOOLEAN NOT NULL DEFAULT false,
    "ai_confidence" INTEGER,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_trades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "paper_trading_accounts_user_id_key" ON "paper_trading_accounts"("user_id");

-- CreateIndex
CREATE INDEX "paper_trading_accounts_user_id_idx" ON "paper_trading_accounts"("user_id");

-- CreateIndex
CREATE INDEX "paper_positions_account_id_idx" ON "paper_positions"("account_id");

-- CreateIndex
CREATE INDEX "paper_positions_event_id_idx" ON "paper_positions"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "paper_positions_account_id_event_id_side_key" ON "paper_positions"("account_id", "event_id", "side");

-- CreateIndex
CREATE INDEX "paper_trades_account_id_idx" ON "paper_trades"("account_id");

-- CreateIndex
CREATE INDEX "paper_trades_event_id_idx" ON "paper_trades"("event_id");

-- CreateIndex
CREATE INDEX "paper_trades_executed_at_idx" ON "paper_trades"("executed_at");

-- AddForeignKey
ALTER TABLE "paper_positions" ADD CONSTRAINT "paper_positions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "paper_trading_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_trades" ADD CONSTRAINT "paper_trades_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "paper_trading_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
