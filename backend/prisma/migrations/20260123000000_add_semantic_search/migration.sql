-- ============================================
-- Semantic Search Migration
-- Adds pgvector support and search tables
-- ============================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create MarketEvent table
CREATE TABLE "market_events" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "title_normalized" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "search_text" TEXT NOT NULL,
    "embedding" vector(1536),
    "category" VARCHAR(50),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "yes_price" DECIMAL(5,4),
    "no_price" DECIMAL(5,4),
    "volume" DECIMAL(18,2),
    "liquidity" DECIMAL(18,2),
    "end_date" TIMESTAMP(3),
    "url" VARCHAR(500),
    "metadata" JSONB,
    "embedding_generated_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_events_pkey" PRIMARY KEY ("id")
);

-- 3. Create SearchLog table
CREATE TABLE "search_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "input_text" TEXT NOT NULL,
    "input_length" INTEGER NOT NULL,
    "events_detected" INTEGER NOT NULL,
    "query_data" JSONB,
    "results_returned" INTEGER NOT NULL,
    "top_result_id" TEXT,
    "clicked_event_id" TEXT,
    "latency_ms" INTEGER NOT NULL,
    "stage_latencies" JSONB,
    "source" TEXT NOT NULL DEFAULT 'web',
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_logs_pkey" PRIMARY KEY ("id")
);

-- 4. Create unique index on external_id
CREATE UNIQUE INDEX "market_events_external_id_key" ON "market_events"("external_id");

-- 5. Create standard indexes for MarketEvent
CREATE INDEX "market_events_source_idx" ON "market_events"("source");
CREATE INDEX "market_events_status_idx" ON "market_events"("status");
CREATE INDEX "market_events_category_idx" ON "market_events"("category");
CREATE INDEX "market_events_volume_idx" ON "market_events"("volume");
CREATE INDEX "market_events_end_date_idx" ON "market_events"("end_date");
CREATE INDEX "market_events_created_at_idx" ON "market_events"("created_at");
CREATE INDEX "market_events_last_synced_at_idx" ON "market_events"("last_synced_at");

-- 6. Create indexes for SearchLog
CREATE INDEX "search_logs_user_id_idx" ON "search_logs"("user_id");
CREATE INDEX "search_logs_events_detected_idx" ON "search_logs"("events_detected");
CREATE INDEX "search_logs_latency_ms_idx" ON "search_logs"("latency_ms");
CREATE INDEX "search_logs_source_idx" ON "search_logs"("source");
CREATE INDEX "search_logs_created_at_idx" ON "search_logs"("created_at");

-- 7. Create GIN index for full-text search on search_text
-- Using pg_trgm for fuzzy matching support
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "market_events_search_text_gin_idx" ON "market_events" 
USING GIN (to_tsvector('english', "search_text"));

-- Also create trigram index for fuzzy search
CREATE INDEX "market_events_title_trgm_idx" ON "market_events" 
USING GIN ("title" gin_trgm_ops);

-- 8. Create vector index for semantic search (HNSW)
CREATE INDEX "market_events_embedding_idx" ON "market_events" 
USING hnsw ("embedding" vector_cosine_ops);
