package com.aitestplatform.api.job.dto;

import com.aitestplatform.api.job.Job;
import com.aitestplatform.api.job.JobStatus;
import com.fasterxml.jackson.annotation.JsonRawValue;

import java.time.Instant;
import java.util.UUID;

public record JobResponse(
        UUID id,
        String projectName,
        String appUrl,
        JobStatus status,
        String errorMessage,
        String summary,
        Instant createdAt,
        Instant updatedAt,
        String downloadUrl,
        String filesUrl,
        // Job.validationReport is already a JSON string (written by apps/worker) - embed it
        // as-is rather than re-encoding it as a quoted string within a string.
        @JsonRawValue String validationReport
) {
    /** downloadUrl/filesUrl carry the per-job token stand-in for a real signed object-storage URL. */
    public static JobResponse from(Job job) {
        boolean ready = job.getStatus() == JobStatus.READY;
        String downloadUrl = ready
                ? "/api/projects/" + job.getId() + "/download?token=" + job.getDownloadToken()
                : null;
        String filesUrl = ready
                ? "/api/projects/" + job.getId() + "/files?token=" + job.getDownloadToken()
                : null;
        return new JobResponse(
                job.getId(),
                job.getProjectName(),
                job.getAppUrl(),
                job.getStatus(),
                job.getErrorMessage(),
                job.getSummary(),
                job.getCreatedAt(),
                job.getUpdatedAt(),
                downloadUrl,
                filesUrl,
                job.getValidationReport()
        );
    }
}
