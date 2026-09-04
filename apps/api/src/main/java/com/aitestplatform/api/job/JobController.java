package com.aitestplatform.api.job;

import com.aitestplatform.api.job.dto.JobResponse;
import com.aitestplatform.api.job.dto.JobSubmissionResponse;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Path;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Owns the request lifecycle per architecture doc §03: validates input, stores the
 * uploaded sheet and credentials (never in this table - see JobStorageService),
 * writes a QUEUED row, and returns. It never runs generation itself - apps/worker
 * claims and processes QUEUED rows out of band (see JobRepository's doc comment).
 */
@RestController
@RequestMapping("/api/projects")
@Validated
public class JobController {

    // Mirrors PROJECT_NAME_PATTERN in apps/worker/src/generate.ts - kept in sync
    // manually since the two are different languages/processes.
    private static final Pattern PROJECT_NAME_PATTERN = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");
    private static final Pattern APP_URL_PATTERN = Pattern.compile("^https?://", Pattern.CASE_INSENSITIVE);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final JobRepository jobRepository;
    private final JobStorageService storageService;

    public JobController(JobRepository jobRepository, JobStorageService storageService) {
        this.jobRepository = jobRepository;
        this.storageService = storageService;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<JobSubmissionResponse> submit(
            @RequestParam String projectName,
            @RequestParam String appUrl,
            @RequestParam(required = false) String username,
            @RequestParam(required = false) String password,
            @RequestParam("testCaseSheet") MultipartFile testCaseSheet
    ) {
        if (projectName == null || !PROJECT_NAME_PATTERN.matcher(projectName).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "projectName must be lowercase and hyphen-separated (e.g. \"globex-crm\"); got \""
                            + projectName + "\".");
        }
        if (appUrl == null || !APP_URL_PATTERN.matcher(appUrl).find()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "appUrl must be an absolute http(s) URL; got \"" + appUrl + "\".");
        }
        if (testCaseSheet == null || testCaseSheet.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "testCaseSheet is required and must not be empty.");
        }

        UUID jobId = UUID.randomUUID();
        String sheetPath = storageService.storeTestCaseSheet(jobId, testCaseSheet);

        boolean hasCredentials = username != null && !username.isBlank();
        String credentialsPath = hasCredentials
                ? storageService.storeCredentials(jobId, username, password == null ? "" : password)
                : null;

        Job job = new Job();
        job.setId(jobId);
        job.setProjectName(projectName);
        job.setAppUrl(appUrl);
        job.setTestCaseSheetPath(sheetPath);
        job.setHasCredentials(hasCredentials);
        job.setCredentialsPath(credentialsPath);
        job.setStatus(JobStatus.QUEUED);
        job.setDownloadToken(generateDownloadToken());
        Instant now = Instant.now();
        job.setCreatedAt(now);
        job.setUpdatedAt(now);

        jobRepository.save(job);

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(new JobSubmissionResponse(jobId));
    }

    @GetMapping("/{id}")
    public JobResponse status(@PathVariable UUID id) {
        Job job = jobRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No job with id " + id));
        return JobResponse.from(job);
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<FileSystemResource> download(@PathVariable UUID id, @RequestParam String token) {
        Job job = jobRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No job with id " + id));

        if (!job.getDownloadToken().equals(token)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid download token.");
        }
        if (job.getStatus() != JobStatus.READY || job.getZipPath() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Job is not ready for download yet (status: " + job.getStatus() + ").");
        }

        FileSystemResource resource = new FileSystemResource(Path.of(job.getZipPath()));
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + job.getProjectName() + ".zip\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(resource);
    }

    private static String generateDownloadToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
