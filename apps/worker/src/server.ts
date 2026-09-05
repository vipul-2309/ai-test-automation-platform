import express from "express";
import cors from "cors";
import multer from "multer";
import { generateProject } from "./generate.js";
import { parseTestCaseSheet } from "./testCaseSheet.js";
import { config } from "./config.js";

const app = express();
// apps/ui calls /api/preview directly from the browser - without this, the
// browser's same-origin policy blocks it before it reaches Express at all.
app.use(cors({ origin: process.env.UI_ORIGIN ?? "http://localhost:5173" }));
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
      skipDiscovery: req.body.skipDiscovery === "true" || req.body.skipDiscovery === true,
      runLiveValidation: req.body.runLiveValidation === "true" || req.body.runLiveValidation === true,
      enableRepairLoop: req.body.enableRepairLoop === "true" || req.body.enableRepairLoop === true,
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

/**
 * POST /api/preview — multipart/form-data: testCaseSheet (file, .xlsx or .csv).
 * Parses and returns the structured TestCase[] without running generation - lets a
 * caller confirm the sheet's columns/rows are being read correctly before spending a
 * Copilot session on it. Lives here rather than on apps/api because the actual
 * parsing logic (testCaseSheet.ts) only exists in this service.
 */
app.post("/api/preview", upload.single("testCaseSheet"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "testCaseSheet file is required (multipart field name: testCaseSheet)." });
      return;
    }

    const testCases = await parseTestCaseSheet(req.file.buffer);
    res.json({ testCases });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(config.port, () => {
  console.log(`Phase 1 generation engine listening on http://localhost:${config.port}`);
  console.log(`Try: curl -F projectName=globex-crm -F appUrl=https://example.com ` +
    `-F testCaseSheet=@/path/to/TestCases.xlsx http://localhost:${config.port}/api/projects -o out.zip`);
});
