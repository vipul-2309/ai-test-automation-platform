package com.aitestplatform.api.job;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

/**
 * Owns each job's upload directory on disk: the submitted test-case sheet, and -
 * until Phase 3 replaces this with an encrypted job_secrets table - a plaintext
 * credentials file the worker reads once when it claims the job and deletes
 * afterward. This is an explicit, temporary stand-in for the architecture doc's
 * "never in job metadata" property, not an oversight: the raw values never touch the
 * jobs table or Postgres at all, only a local file path does.
 */
@Service
public class JobStorageService {

    private final Path jobsRoot;

    public JobStorageService(JobStorageProperties properties) {
        this.jobsRoot = Path.of(properties.getJobsRoot());
    }

    public Path jobDirectory(UUID jobId) {
        return jobsRoot.resolve(jobId.toString());
    }

    public String storeTestCaseSheet(UUID jobId, MultipartFile sheet) {
        Path dir = createJobDirectory(jobId);
        Path target = dir.resolve("test-case-sheet.xlsx");
        try {
            sheet.transferTo(target);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to store test case sheet for job " + jobId, e);
        }
        return target.toString();
    }

    public String storeCredentials(UUID jobId, String username, String password) {
        Path dir = createJobDirectory(jobId);
        Path target = dir.resolve("credentials.properties");
        String content = "username=" + username + "\npassword=" + password + "\n";
        try {
            Files.writeString(target, content);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to store credentials for job " + jobId, e);
        }
        return target.toString();
    }

    private Path createJobDirectory(UUID jobId) {
        Path dir = jobDirectory(jobId);
        try {
            Files.createDirectories(dir);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to create job directory " + dir, e);
        }
        return dir;
    }
}
