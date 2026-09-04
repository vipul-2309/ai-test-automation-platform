CREATE TABLE jobs (
    id                    UUID PRIMARY KEY,
    project_name          VARCHAR(100)  NOT NULL,
    app_url               VARCHAR(2048) NOT NULL,
    test_case_sheet_path  VARCHAR(1024) NOT NULL,
    has_credentials       BOOLEAN       NOT NULL DEFAULT FALSE,
    credentials_path      VARCHAR(1024),
    status                VARCHAR(20)   NOT NULL,
    download_token        VARCHAR(64)   NOT NULL UNIQUE,
    zip_path              VARCHAR(1024),
    error_message         TEXT,
    summary               TEXT,
    created_at            TIMESTAMPTZ   NOT NULL,
    updated_at            TIMESTAMPTZ   NOT NULL
);

-- The worker claims the next queued job with:
--   UPDATE jobs SET status = 'GENERATING', updated_at = now()
--   WHERE id = (
--     SELECT id FROM jobs WHERE status = 'QUEUED'
--     ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
--   )
--   RETURNING *;
-- This table doubles as the job queue (see architecture build-order notes) - the
-- Postgres jobs table is the queue, not a separate broker. An index on status keeps
-- that claim query cheap as the table grows.
CREATE INDEX idx_jobs_status ON jobs (status);
