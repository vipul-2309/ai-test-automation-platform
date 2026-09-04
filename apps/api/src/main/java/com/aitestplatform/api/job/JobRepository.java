package com.aitestplatform.api.job;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/**
 * Plain CRUD is all the API side ever needs. The worker (apps/worker, a separate
 * Node process per the architecture doc's §10 polyglot seam) claims the next queued
 * job directly via SQL against this same table:
 *
 *   UPDATE jobs SET status = 'GENERATING', updated_at = now()
 *   WHERE id = (
 *     SELECT id FROM jobs WHERE status = 'QUEUED'
 *     ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
 *   )
 *   RETURNING *;
 *
 * That's a cross-language contract against shared table structure, not a JPA query -
 * it deliberately doesn't live here.
 */
public interface JobRepository extends JpaRepository<Job, UUID> {
}
