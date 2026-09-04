package com.aitestplatform.api;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class JobControllerIntegrationTest {

    @LocalServerPort
    private int port;

    private final TestRestTemplate rest = new TestRestTemplate();

    @Test
    void submitThenPollStatus_goesThroughRealHttpAndPersistsAsQueued() {
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("projectName", "globex-crm");
        form.add("appUrl", "https://example.com/login");
        form.add("testCaseSheet", new ByteArrayResource("dummy sheet bytes".getBytes()) {
            @Override
            public String getFilename() {
                return "TestCases.xlsx";
            }
        });

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        HttpEntity<MultiValueMap<String, Object>> request = new HttpEntity<>(form, headers);

        @SuppressWarnings("unchecked")
        ResponseEntity<Map<String, Object>> submitResponse = (ResponseEntity<Map<String, Object>>) (ResponseEntity<?>)
                rest.postForEntity(baseUrl("/api/projects"), request, Map.class);

        assertThat(submitResponse.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        assertThat(submitResponse.getBody()).isNotNull();
        UUID jobId = UUID.fromString((String) submitResponse.getBody().get("jobId"));

        ResponseEntity<Map<String, Object>> statusResponse = (ResponseEntity<Map<String, Object>>) (ResponseEntity<?>)
                rest.getForEntity(baseUrl("/api/projects/" + jobId), Map.class);

        assertThat(statusResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(statusResponse.getBody()).isNotNull();
        assertThat(statusResponse.getBody().get("status")).isEqualTo("QUEUED");
        assertThat(statusResponse.getBody().get("projectName")).isEqualTo("globex-crm");
        assertThat(statusResponse.getBody().get("downloadUrl")).isNull();
    }

    @Test
    void submit_rejectsBadProjectName() {
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("projectName", "Globex CRM");
        form.add("appUrl", "https://example.com/login");
        form.add("testCaseSheet", new ByteArrayResource("dummy".getBytes()) {
            @Override
            public String getFilename() {
                return "TestCases.xlsx";
            }
        });

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        HttpEntity<MultiValueMap<String, Object>> request = new HttpEntity<>(form, headers);

        ResponseEntity<String> response = rest.postForEntity(baseUrl("/api/projects"), request, String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    private String baseUrl(String path) {
        return "http://localhost:" + port + path;
    }
}
