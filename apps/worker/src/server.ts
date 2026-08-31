import express from "express";
import multer from "multer";
import { generateProject } from "./generate.js";
import { config } from "./config.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

/**
 * POST /api/projects — multipart/form-data: projectName, appUrl, username?, password?,
 * testCaseSheet (file). Runs synchronously and streams the zip back on success — no
 * queue, no job-status polling, no auth. This is architecture doc §12 Phase 1's
 * "script/API endpoint taking the four inputs directly ... no auth, single trusted
 * internal caller" by design; §07's full async job-status API contract is Phase 2.
 */
app.post("/api/projects", upload.single("testCaseSheet"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "testCaseSheet file is required (multipart field name: testCaseSheet)." });
      return;
    }

    const result = await generateProject({
      projectName: String(req.body.projectName ?? ""),
      appUrl: String(req.body.appUrl ?? ""),
      username: req.body.username ? String(req.body.username) : undefined,
      password: req.body.password ? String(req.body.password) : undefined,
      testCaseSheet: req.file.buffer,
    });

    if (!result.success || !result.zipPath) {
      res.status(422).json({
        jobId: result.jobId,
        error: result.error ?? "Generation failed.",
        summary: result.summary,
        transcript: result.transcript,
      });
      return;
    }

    res.download(result.zipPath, `${result.projectName}.zip`);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(config.port, () => {
  console.log(`Phase 1 generation engine listening on http://localhost:${config.port}`);
  console.log(`Try: curl -F projectName=globex-crm -F appUrl=https://example.com ` +
    `-F testCaseSheet=@/path/to/TestCases.xlsx http://localhost:${config.port}/api/projects -o out.zip`);
});
