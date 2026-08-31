/**
 * Java package segments can't contain hyphens (or most other punctuation), so the
 * hyphenated project-name convention (e.g. "secure-bank") needs a distinct,
 * package-safe form (e.g. "securebank"). Used consistently for both the generated
 * package name and the renamed shared-core package, so a project's Java code is
 * self-contained under one root - e.g. com.securebank.* - rather than nested under
 * the reference repo's generic com.platform.*.
 */
export function toJavaPackageSegment(projectName: string): string {
  const segment = projectName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!segment) {
    throw new Error(`projectName "${projectName}" has no valid Java package characters.`);
  }
  return segment;
}
