package com.aitestplatform.api.job.dto;

import com.aitestplatform.api.job.Job;
import com.aitestplatform.api.job.JobStatus;

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
        String downloadUrl
) {
    /** downloadUrl carries the per-job token stand-in for a real signed object-storage URL. */
    public static JobResponse from(Job job) {
        String downloadUrl = job.getStatus() == JobStatus.READY
                ? "/api/projects/" + job.getId() + "/download?token=" + job.getDownloadToken()
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
                downloadUrl
        );
    }
}
