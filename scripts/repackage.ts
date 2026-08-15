import { packageWorkspace } from "../src/packager.js";

const workspaceDir = process.argv[2];
const projectName = process.argv[3];
if (!workspaceDir || !projectName) {
  console.error("Usage: tsx scripts/repackage.ts <workspaceDir> <projectName>");
  process.exit(1);
}

const zipPath = await packageWorkspace(workspaceDir, projectName);
console.log("Repackaged: " + zipPath);
