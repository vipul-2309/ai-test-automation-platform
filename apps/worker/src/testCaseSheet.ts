import ExcelJS from "exceljs";
import { parse as parseCsvSync } from "csv-parse/sync";
import type { TestCase } from "./types.js";

// XLSX files are ZIP archives; "PK" is the ZIP local-file-header signature. Sniffing
// content instead of trusting a filename/extension means every call site (cli.ts
// reading by path, server.ts's multipart upload) needs zero changes to support CSV.
function isXlsx(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

async function xlsxToRows(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("Test case sheet has no worksheets.");
  }

  const rows: string[][] = [];
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const value = cell.text ?? cell.value;
      cells[colNumber - 1] = value == null ? "" : String(value).trim();
    });
    rows.push(cells);
  }
  return rows;
}

function csvToRows(buffer: Buffer): string[][] {
  return parseCsvSync(buffer, { skip_empty_lines: false, relax_column_count: true }) as string[][];
}

function colIndex(headerValues: string[], ...candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headerValues.findIndex((h) => h && h.includes(candidate));
    if (idx !== -1) return idx;
  }
  throw new Error(
    `Could not find a column matching any of [${candidates.join(", ")}] in header row: ` +
      headerValues.filter(Boolean).join(" | ")
  );
}

/**
 * Parses a TestCases.xlsx or .csv following the framework's sheet format (see SKILL.md
 * "Test Case Sheet Format"): Test Case ID | Pre-Condition | Test Case Description |
 * Test Step No. | Test Step Description | Expected Result. The first three columns
 * are conventionally left blank on every row after a test case's first (merged cells
 * in the XLSX case; simply blank in the CSV case) - forward-fill from the last
 * non-blank value in each column, whichever format this came from.
 *
 * XLSX and CSV are normalized to the same string[][] shape by the two loaders above
 * before any of the actual parsing logic below runs, so that logic never needs to
 * know which format it came from.
 */
export async function parseTestCaseSheet(buffer: Buffer): Promise<TestCase[]> {
  const rows = isXlsx(buffer) ? await xlsxToRows(buffer) : csvToRows(buffer);
  if (rows.length === 0) {
    throw new Error("Test case sheet is empty.");
  }

  const headerValues = (rows[0] ?? []).map((h) => String(h ?? "").trim().toLowerCase());

  const idCol = colIndex(headerValues, "test case id");
  const preConditionCol = colIndex(headerValues, "pre-condition", "precondition", "pre condition");
  const descriptionCol = colIndex(headerValues, "test case description");
  const stepNoCol = colIndex(headerValues, "test step no", "step no");
  const stepDescriptionCol = colIndex(headerValues, "test step description", "step description");
  const expectedResultCol = colIndex(headerValues, "expected result");

  const cellAt = (row: string[], col: number): string => String(row[col] ?? "").trim();

  const cases = new Map<string, TestCase>();
  let lastTestCaseId = "";
  let lastPreCondition = "";
  let lastDescription = "";

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (!row || row.length === 0) continue;

    const rawId = cellAt(row, idCol);
    const rawPreCondition = cellAt(row, preConditionCol);
    const rawDescription = cellAt(row, descriptionCol);
    const stepNo = cellAt(row, stepNoCol);
    const stepDescription = cellAt(row, stepDescriptionCol);
    const expectedResult = cellAt(row, expectedResultCol);

    const testCaseId = rawId || lastTestCaseId;
    if (!testCaseId) {
      if (!stepDescription && !expectedResult) continue; // fully blank separator row
      throw new Error(`Row ${rowIndex + 1}: no Test Case ID found on this row or any row above it.`);
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
