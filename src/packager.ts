import archiver from "archiver";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";

const EXCLUDED_TOP_LEVEL = new Set(["target", ".git", "node_modules"]);

/** Zips a generated project workspace into workspaceDir/output/<projectName>.zip. */
export async function packageWorkspace(workspaceDir: string, projectName: string): Promise<string> {
  const outputDir = path.join(workspaceDir, "output");
  await fs.mkdir(outputDir, { recursive: true });

  const zipPath = path.join(outputDir, `${projectName}.zip`);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    archive.on("error", (err) => reject(err));
    archive.on("warning", (err) => {
      if (err.code !== "ENOENT") reject(err);
    });

    archive.pipe(output);
    archive.glob("**/*", {
      cwd: workspaceDir,
      dot: true,
      ignore: [...EXCLUDED_TOP_LEVEL].map((d) => `${d}/**`).concat(["output/**"]),
    });
    archive.finalize();
  });

  return zipPath;
}
