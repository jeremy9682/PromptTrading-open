-- Composite indexes for common search filters:
-- WHERE status = ? AND source = ? AND category = ?
CREATE INDEX IF NOT EXISTS "market_events_status_source_category_idx"
ON "market_events" ("status", "source", "category");

CREATE INDEX IF NOT EXISTS "market_events_status_source_idx"
ON "market_events" ("status", "source");

CREATE INDEX IF NOT EXISTS "market_events_status_category_idx"
ON "market_events" ("status", "category");
