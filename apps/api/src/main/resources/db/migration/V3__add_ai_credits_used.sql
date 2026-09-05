-- Total AI credits apps/worker's Copilot session(s) for this job actually consumed (see
-- agentRunner.ts's session.shutdown usage capture), summed across any chunked generation
-- sessions and repair-loop attempts. Null when the job used the baseline fast path (no AI
-- session ran at all) or hasn't reached a terminal state yet.
ALTER TABLE jobs ADD COLUMN ai_credits_used DOUBLE PRECISION;
