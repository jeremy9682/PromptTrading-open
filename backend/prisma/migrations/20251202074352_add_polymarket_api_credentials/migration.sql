-- CreateTable
CREATE TABLE "polymarket_api_credentials" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "api_secret" TEXT NOT NULL,
    "passphrase" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "polymarket_api_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "polymarket_api_credentials_user_id_idx" ON "polymarket_api_credentials"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "polymarket_api_credentials_user_id_wallet_address_key" ON "polymarket_api_credentials"("user_id", "wallet_address");

-- AddForeignKey
ALTER TABLE "polymarket_api_credentials" ADD CONSTRAINT "polymarket_api_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
