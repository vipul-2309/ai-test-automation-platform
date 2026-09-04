package com.aitestplatform.api.job;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.storage")
public class JobStorageProperties {

    /** Root directory each job gets a "{jobsRoot}/{jobId}/" subdirectory under. */
    private String jobsRoot = "./data/jobs";

    public String getJobsRoot() {
        return jobsRoot;
    }

    public void setJobsRoot(String jobsRoot) {
        this.jobsRoot = jobsRoot;
    }
}
