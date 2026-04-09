-- CreateTable
CREATE TABLE "paper_traders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'blue',
    "prompt" TEXT NOT NULL,
    "ai_model" TEXT NOT NULL DEFAULT 'deepseek/deepseek-chat',
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

    CONSTRAINT "paper_traders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_trader_events" (
    "id" TEXT NOT NULL,
    "trader_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_trader_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_analysis_history" (
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
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_analysis_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "paper_traders_user_id_idx" ON "paper_traders"("user_id");

-- CreateIndex
CREATE INDEX "paper_traders_is_active_idx" ON "paper_traders"("is_active");

-- CreateIndex
CREATE INDEX "paper_trader_events_trader_id_idx" ON "paper_trader_events"("trader_id");

-- CreateIndex
CREATE INDEX "paper_trader_events_event_id_idx" ON "paper_trader_events"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "paper_trader_events_trader_id_event_id_key" ON "paper_trader_events"("trader_id", "event_id");

-- CreateIndex
CREATE INDEX "paper_analysis_history_trader_id_idx" ON "paper_analysis_history"("trader_id");

-- CreateIndex
CREATE INDEX "paper_analysis_history_user_id_idx" ON "paper_analysis_history"("user_id");

-- CreateIndex
CREATE INDEX "paper_analysis_history_created_at_idx" ON "paper_analysis_history"("created_at");

-- AddForeignKey
ALTER TABLE "paper_trader_events" ADD CONSTRAINT "paper_trader_events_trader_id_fkey" FOREIGN KEY ("trader_id") REFERENCES "paper_traders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_analysis_history" ADD CONSTRAINT "paper_analysis_history_trader_id_fkey" FOREIGN KEY ("trader_id") REFERENCES "paper_traders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
