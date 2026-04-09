-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ai_credits_balance" DECIMAL(12,6) NOT NULL DEFAULT 0,
ADD COLUMN     "ai_credits_currency" TEXT NOT NULL DEFAULT 'USD';

-- CreateTable
CREATE TABLE "recharge_orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_no" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "credits_amount" DECIMAL(12,6) NOT NULL,
    "payment_chain" TEXT NOT NULL DEFAULT 'arbitrum',
    "payment_token" TEXT NOT NULL DEFAULT 'USDC',
    "payer_address" TEXT NOT NULL,
    "receiver_address" TEXT NOT NULL,
    "tx_hash" TEXT,
    "block_number" INTEGER,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "recharge_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "ai_model" TEXT,
    "ai_model_name" TEXT,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "openrouter_cost" DECIMAL(12,8) NOT NULL,
    "platform_markup" DECIMAL(12,8) NOT NULL,
    "total_cost" DECIMAL(12,8) NOT NULL,
    "balance_before" DECIMAL(12,6) NOT NULL,
    "balance_after" DECIMAL(12,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_action_logs" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "admin_email" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_finance_summary" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "recharge_count" INTEGER NOT NULL DEFAULT 0,
    "recharge_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "usage_revenue" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "openrouter_cost" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "gross_profit" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "new_users" INTEGER NOT NULL DEFAULT 0,
    "active_users" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_finance_summary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recharge_orders_order_no_key" ON "recharge_orders"("order_no");

-- CreateIndex
CREATE UNIQUE INDEX "recharge_orders_tx_hash_key" ON "recharge_orders"("tx_hash");

-- CreateIndex
CREATE INDEX "recharge_orders_user_id_idx" ON "recharge_orders"("user_id");

-- CreateIndex
CREATE INDEX "recharge_orders_status_idx" ON "recharge_orders"("status");

-- CreateIndex
CREATE INDEX "recharge_orders_order_no_idx" ON "recharge_orders"("order_no");

-- CreateIndex
CREATE INDEX "recharge_orders_created_at_idx" ON "recharge_orders"("created_at");

-- CreateIndex
CREATE INDEX "usage_records_user_id_idx" ON "usage_records"("user_id");

-- CreateIndex
CREATE INDEX "usage_records_type_idx" ON "usage_records"("type");

-- CreateIndex
CREATE INDEX "usage_records_created_at_idx" ON "usage_records"("created_at");

-- CreateIndex
CREATE INDEX "admin_action_logs_admin_id_idx" ON "admin_action_logs"("admin_id");

-- CreateIndex
CREATE INDEX "admin_action_logs_action_idx" ON "admin_action_logs"("action");

-- CreateIndex
CREATE INDEX "admin_action_logs_target_id_idx" ON "admin_action_logs"("target_id");

-- CreateIndex
CREATE INDEX "admin_action_logs_created_at_idx" ON "admin_action_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "daily_finance_summary_date_key" ON "daily_finance_summary"("date");

-- CreateIndex
CREATE INDEX "daily_finance_summary_date_idx" ON "daily_finance_summary"("date");

-- AddForeignKey
ALTER TABLE "recharge_orders" ADD CONSTRAINT "recharge_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
