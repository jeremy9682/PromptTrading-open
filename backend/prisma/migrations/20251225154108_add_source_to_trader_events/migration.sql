-- AlterTable
ALTER TABLE "auto_trade_history" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'POLYMARKET';

-- AlterTable
ALTER TABLE "paper_analysis_history" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'POLYMARKET';

-- AlterTable
ALTER TABLE "paper_positions" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'POLYMARKET';

-- AlterTable
ALTER TABLE "paper_trader_events" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'POLYMARKET';

-- AlterTable
ALTER TABLE "paper_trades" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'POLYMARKET';

-- AlterTable
ALTER TABLE "polymarket_analysis_history" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'POLYMARKET';

-- AlterTable
ALTER TABLE "polymarket_trader_events" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'POLYMARKET';

-- AlterTable
ALTER TABLE "polymarket_watchlist" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'POLYMARKET';
