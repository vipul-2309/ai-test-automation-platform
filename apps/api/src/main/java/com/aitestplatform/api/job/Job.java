package com.aitestplatform.api.job;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "jobs")
@Getter
@Setter
@NoArgsConstructor
public class Job {

    @Id
    private UUID id;

    @Column(name = "project_name", nullable = false, length = 100)
    private String projectName;

    @Column(name = "app_url", nullable = false, length = 2048)
    private String appUrl;

    @Column(name = "test_case_sheet_path", nullable = false, length = 1024)
    private String testCaseSheetPath;

    @Column(name = "has_credentials", nullable = false)
    private boolean hasCredentials;

    @Column(name = "credentials_path", length = 1024)
    private String credentialsPath;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private JobStatus status;

    @Column(name = "download_token", nullable = false, unique = true, length = 64)
    private String downloadToken;

    @Column(name = "zip_path", length = 1024)
    private String zipPath;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "summary", columnDefinition = "TEXT")
    private String summary;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
