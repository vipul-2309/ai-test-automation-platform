package com.aitestplatform.api.job;

/**
 * Persisted subset of the architecture doc's §05 job lifecycle. SUBMITTED/VALIDATING
 * are deliberately not persisted states - they happen synchronously inside
 * JobController.submit before a row ever exists; malformed input is rejected with a
 * 400 and never queued at all.
 */
public enum JobStatus {
    QUEUED,
    GENERATING,
    VERIFYING,
    PACKAGING,
    READY,
    FAILED
}
