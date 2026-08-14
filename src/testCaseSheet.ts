import ExcelJS from "exceljs";
import type { TestCase } from "./types.js";

/**
 * Parses a TestCases.xlsx following the framework's sheet format (see SKILL.md
 * "Test Case Sheet Format"): Test Case ID | Pre-Condition | Test Case Description |
 * Test Step No. | Test Step Description | Expected Result. The first three columns
 * are merged across every row belonging to one test case, so most rows show them
 * as blank cells — forward-fill from the last non-blank value in each column.
 */
export async function parseTestCaseSheet(buffer: Buffer): Promise<TestCase[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("Test case sheet has no worksheets.");
  }

  const headerValues: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headerValues[colNumber] = String(cell.text ?? "").trim().toLowerCase();
  });

  const colIndex = (...candidates: string[]): number => {
    for (const candidate of candidates) {
      const idx = headerValues.findIndex((h) => h && h.includes(candidate));
      if (idx !== -1) return idx;
    }
    throw new Error(
      `Could not find a column matching any of [${candidates.join(", ")}] in header row: ` +
        headerValues.filter(Boolean).join(" | ")
    );
  };

  const idCol = colIndex("test case id");
  const preConditionCol = colIndex("pre-condition", "precondition", "pre condition");
  const descriptionCol = colIndex("test case description");
  const stepNoCol = colIndex("test step no", "step no");
  const stepDescriptionCol = colIndex("test step description", "step description");
  const expectedResultCol = colIndex("expected result");

  const cellText = (row: ExcelJS.Row, col: number): string => {
    const cell = row.getCell(col);
    const value = cell.text ?? cell.value;
    return value == null ? "" : String(value).trim();
  };

  const cases = new Map<string, TestCase>();
  let lastTestCaseId = "";
  let lastPreCondition = "";
  let lastDescription = "";

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;

    const rawId = cellText(row, idCol);
    const rawPreCondition = cellText(row, preConditionCol);
    const rawDescription = cellText(row, descriptionCol);
    const stepNo = cellText(row, stepNoCol);
    const stepDescription = cellText(row, stepDescriptionCol);
    const expectedResult = cellText(row, expectedResultCol);

    const testCaseId = rawId || lastTestCaseId;
    if (!testCaseId) {
      if (!stepDescription && !expectedResult) continue; // fully blank separator row
      throw new Error(`Row ${rowNumber}: no Test Case ID found on this row or any row above it.`);
    }

    const preCondition = rawId ? rawPreCondition : rawPreCondition || lastPreCondition;
    const description = rawId ? rawDescription : rawDescription || lastDescription;

    lastTestCaseId = testCaseId;
    lastPreCondition = preCondition;
    lastDescription = description;

    if (!cases.has(testCaseId)) {
      cases.set(testCaseId, { testCaseId, preCondition, description, steps: [] });
    }

    if (stepDescription || expectedResult) {
      cases.get(testCaseId)!.steps.push({ stepNo, description: stepDescription, expectedResult });
    }
  }

  const result = Array.from(cases.values());
  if (result.length === 0) {
    throw new Error("Parsed zero test cases from the sheet — check the column headers match SKILL.md's format.");
  }
  return result;
}
