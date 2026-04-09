-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "privy_user_id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "polymarket_watchlist" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "polymarket_watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "polymarket_traders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'blue',
    "prompt" TEXT NOT NULL,
    "ai_model" TEXT NOT NULL DEFAULT 'gpt-4',
    "capital" DECIMAL(12,2) NOT NULL DEFAULT 1000,
    "total_value" DECIMAL(12,2) NOT NULL DEFAULT 1000,
    "total_pnl" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "min_confidence" INTEGER NOT NULL DEFAULT 65,
    "max_position" INTEGER NOT NULL DEFAULT 30,
    "stop_loss_price" INTEGER NOT NULL DEFAULT 20,
    "take_profit_price" INTEGER NOT NULL DEFAULT 80,
    "news_weight" INTEGER NOT NULL DEFAULT 40,
    "data_weight" INTEGER NOT NULL DEFAULT 35,
    "sentiment_weight" INTEGER NOT NULL DEFAULT 25,
    "analysis_interval" INTEGER NOT NULL DEFAULT 15,
    "data_sources" JSONB NOT NULL DEFAULT '{"marketDepth":true,"historyData":true,"relatedEvents":false,"technicalIndicators":false,"participantBehavior":false,"userAccount":false}',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "polymarket_traders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "polymarket_trader_events" (
    "id" TEXT NOT NULL,
    "trader_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "polymarket_trader_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_privy_user_id_key" ON "users"("privy_user_id");

-- CreateIndex
CREATE INDEX "users_wallet_address_idx" ON "users"("wallet_address");

-- CreateIndex
CREATE INDEX "polymarket_watchlist_user_id_idx" ON "polymarket_watchlist"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "polymarket_watchlist_user_id_event_id_key" ON "polymarket_watchlist"("user_id", "event_id");

-- CreateIndex
CREATE INDEX "polymarket_traders_user_id_idx" ON "polymarket_traders"("user_id");

-- CreateIndex
CREATE INDEX "polymarket_traders_is_active_idx" ON "polymarket_traders"("is_active");

-- CreateIndex
CREATE INDEX "polymarket_trader_events_trader_id_idx" ON "polymarket_trader_events"("trader_id");

-- CreateIndex
CREATE INDEX "polymarket_trader_events_event_id_idx" ON "polymarket_trader_events"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "polymarket_trader_events_trader_id_event_id_key" ON "polymarket_trader_events"("trader_id", "event_id");

-- AddForeignKey
ALTER TABLE "polymarket_watchlist" ADD CONSTRAINT "polymarket_watchlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polymarket_traders" ADD CONSTRAINT "polymarket_traders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polymarket_trader_events" ADD CONSTRAINT "polymarket_trader_events_trader_id_fkey" FOREIGN KEY ("trader_id") REFERENCES "polymarket_traders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
