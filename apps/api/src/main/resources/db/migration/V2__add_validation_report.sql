-- Stores apps/worker's independent validation result (compile status, test
-- pass/fail counts and failures, file-safety issues) as JSON, written once the
-- job reaches a terminal state (READY or FAILED). Kept separate from
-- zip_path/summary because it's a structured report the UI renders directly,
-- not prose or a file path.
ALTER TABLE jobs ADD COLUMN validation_report TEXT;
