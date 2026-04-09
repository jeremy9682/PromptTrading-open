-- AlterTable
ALTER TABLE "users" ADD COLUMN     "safe_address" TEXT,
ADD COLUMN     "safe_approvals_set" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "safe_deployed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "users_safe_address_idx" ON "users"("safe_address");
