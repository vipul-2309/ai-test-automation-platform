import { promises as fs } from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import type { TestFailure, TestResults } from "./types.js";

/**
 * Ground-truth pass/fail, independent of anything the agent claims. Parses
 * target/surefire-reports/testng-results.xml - TestNG's own native format
 * (richer than the JUnit-shaped Surefire equivalent), confirmed against a
 * real run earlier in this project:
 *   <testng-results total="2" passed="2" failed="0" skipped="0">
 * Root attributes give authoritative counts directly; failure detail comes
 * from walking <test-method status="FAIL"> nodes (skipping is-config="true"
 * setUp/tearDown entries) for their <exception> message.
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (tagName) => ["suite", "test", "class", "test-method", "exception"].includes(tagName),
});

export async function readTestResults(workspaceDir: string): Promise<TestResults> {
  const reportPath = path.join(workspaceDir, "target", "surefire-reports", "testng-results.xml");

  let xml: string;
  try {
    xml = await fs.readFile(reportPath, "utf8");
  } catch {
    return { ran: false, total: 0, passed: 0, failed: 0, skipped: 0, failures: [] };
  }

  const doc = parser.parse(xml);
  const root = doc["testng-results"];
  if (!root) {
    return { ran: false, total: 0, passed: 0, failed: 0, skipped: 0, failures: [] };
  }

  const failures: TestFailure[] = [];
  for (const suite of root.suite ?? []) {
    for (const test of suite.test ?? []) {
      for (const klass of test.class ?? []) {
        for (const method of klass["test-method"] ?? []) {
          if (method["@_status"] !== "FAIL" || method["@_is-config"] === "true") continue;

          const exception = method.exception?.[0];
          failures.push({
            testName: method["@_name"],
            description: method["@_description"],
            message: exception?.message ?? exception?.["full-stacktrace"]?.split("\n")[0],
          });
        }
      }
    }
  }

  return {
    ran: true,
    total: Number(root["@_total"] ?? 0),
    passed: Number(root["@_passed"] ?? 0),
    failed: Number(root["@_failed"] ?? 0),
    skipped: Number(root["@_skipped"] ?? 0),
    failures,
  };
}
