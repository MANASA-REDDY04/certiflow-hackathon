import * as XLSX from 'xlsx';

export interface CandidateRow {
  row: number;
  name: string;
  phone: string;
  course: string;
  score: number;
  national_id?: string;
}

export interface ValidationError {
  row: number;
  column: 'name' | 'phone' | 'course' | 'score' | 'file';
  message: string;
}

export interface ParsedRowResult {
  row: number;
  name: string;
  phone: string;
  course: string;
  score: string | number;
  status: 'valid' | 'invalid';
  errors: string[];
}

export interface ParseResult {
  success: boolean;
  errors: ValidationError[];
  totalRows: number;
  candidates: CandidateRow[];
  rowResults?: ParsedRowResult[];
}

export interface ValidationContext {
  batchCourse?: string;
  existingCertifiedPhoneNumbers?: Set<string>;
  maxRows?: number;
  maxSizeBytes?: number;
}

const DEFAULT_MAX_ROWS = 2000;
const DEFAULT_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Neutralise CSV formula injection.
 * If a value starts with '=', '+', '-', or '@', prepend a single quote (').
 */
export function sanitizeFormulaInjection(value: string): string {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (/^[=+\-@]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

/**
 * Validate phone number format.
 * Expects 10 to 15 digits, optionally prefixed with '+'.
 */
export function isValidPhone(phone: string): boolean {
  if (!phone) return false;
  // Strip spaces, dashes, or parentheses if any
  const cleaned = phone.replace(/[\s\-()]/g, '');
  return /^\+?[0-9]{10,15}$/.test(cleaned);
}

/**
 * Normalize and clean phone number for consistent deduplication
 */
export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  return cleaned;
}

/**
 * Parse and validate candidate records from a CSV or XLSX Buffer / raw text.
 * 
 * Rules:
 * 1. Parse whole file, inspect every row.
 * 2. Validate required fields, phone format, score range (0-100), duplicate phones in file,
 *    and whether the candidate is already certified for the specified course.
 * 3. Neutralise formula injection on string inputs.
 * 4. Collect ALL errors across all rows.
 * 5. If any errors exist: returns success = false with full error list.
 */
export function parseAndValidateCandidateFile(
  fileBuffer: Buffer | string,
  context: ValidationContext = {}
): ParseResult {
  const maxRows = context.maxRows || DEFAULT_MAX_ROWS;
  const maxSizeBytes = context.maxSizeBytes || DEFAULT_MAX_SIZE_BYTES;
  const existingCertified = context.existingCertifiedPhoneNumbers || new Set<string>();
  const batchCourse = context.batchCourse ? context.batchCourse.trim().toLowerCase() : undefined;

  const errors: ValidationError[] = [];

  // 1. File Size Check
  if (Buffer.isBuffer(fileBuffer) && fileBuffer.length > maxSizeBytes) {
    return {
      success: false,
      errors: [
        {
          row: 0,
          column: 'file',
          message: `File size exceeds the maximum limit of ${maxSizeBytes / (1024 * 1024)}MB`,
        },
      ],
      totalRows: 0,
      candidates: [],
    };
  }

  // 2. Parse File using XLSX (handles both CSV and XLSX)
  let workbook: XLSX.WorkBook;
  try {
    if (Buffer.isBuffer(fileBuffer)) {
      workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    } else {
      workbook = XLSX.read(fileBuffer, { type: 'string' });
    }
  } catch (err: any) {
    return {
      success: false,
      errors: [
        {
          row: 0,
          column: 'file',
          message: `Failed to parse file: invalid CSV/XLSX structure (${err.message})`,
        },
      ],
      totalRows: 0,
      candidates: [],
    };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      success: false,
      errors: [{ row: 0, column: 'file', message: 'File contains no sheets' }],
      totalRows: 0,
      candidates: [],
    };
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, {
    header: 1, // Array of arrays: row 0 is header, row 1+ are data
    defval: '',
    blankrows: false,
  });

  if (rawRows.length < 2) {
    return {
      success: false,
      errors: [
        {
          row: 0,
          column: 'file',
          message: 'File is empty or contains no data rows (header row + at least 1 data row required)',
        },
      ],
      totalRows: 0,
      candidates: [],
    };
  }

  // 3. Header mapping
  const headerRow = rawRows[0] as any[];
  const columnIndices: { name?: number; phone?: number; course?: number; score?: number } = {};

  headerRow.forEach((col, idx) => {
    if (typeof col === 'string') {
      const clean = col.trim().toLowerCase().replace(/[\s_-]/g, '');
      if (clean === 'name' || clean === 'candidatename') columnIndices.name = idx;
      else if (clean === 'phone' || clean === 'mobile' || clean === 'phonenumber') columnIndices.phone = idx;
      else if (clean === 'course' || clean === 'coursename') columnIndices.course = idx;
      else if (clean === 'score' || clean === 'marks' || clean === 'grade') columnIndices.score = idx;
    }
  });

  // Check required headers
  if (columnIndices.name === undefined) {
    errors.push({ row: 1, column: 'name', message: 'Missing required header column: "name"' });
  }
  if (columnIndices.phone === undefined) {
    errors.push({ row: 1, column: 'phone', message: 'Missing required header column: "phone"' });
  }
  if (columnIndices.course === undefined) {
    errors.push({ row: 1, column: 'course', message: 'Missing required header column: "course"' });
  }
  if (columnIndices.score === undefined) {
    errors.push({ row: 1, column: 'score', message: 'Missing required header column: "score"' });
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors,
      totalRows: rawRows.length - 1,
      candidates: [],
    };
  }

  const dataRows = rawRows.slice(1);

  // 4. Row limit check
  if (dataRows.length > maxRows) {
    errors.push({
      row: 0,
      column: 'file',
      message: `File contains ${dataRows.length} rows, which exceeds the maximum limit of ${maxRows} rows`,
    });
    return {
      success: false,
      errors,
      totalRows: dataRows.length,
      candidates: [],
    };
  }

  const seenPhonesInFile = new Map<string, number>(); // phone -> first seen row number
  const candidates: CandidateRow[] = [];
  const rowResults: ParsedRowResult[] = [];

  // 5. Row-by-row validation (Row numbers are 1-based, matching Excel / CSV visual line numbers)
  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2; // Row 1 is header, so data starts at row 2
    const rowData = dataRows[i];

    const rawName = String(rowData[columnIndices.name!] ?? '').trim();
    const rawPhone = String(rowData[columnIndices.phone!] ?? '').trim();
    const rawCourse = String(rowData[columnIndices.course!] ?? '').trim();
    const rawScore = rowData[columnIndices.score!];

    let rowHasError = false;
    const rowErrors: string[] = [];

    // Validate Name
    if (!rawName) {
      errors.push({ row: rowNumber, column: 'name', message: 'Candidate name is required' });
      rowErrors.push('Candidate name is required');
      rowHasError = true;
    }

    // Validate Phone
    let normalizedPhone = '';
    if (!rawPhone) {
      errors.push({ row: rowNumber, column: 'phone', message: 'Phone number is required' });
      rowErrors.push('Phone number is required');
      rowHasError = true;
    } else if (!isValidPhone(rawPhone)) {
      const errMsg = `Invalid phone format: "${rawPhone}" (expected 10-15 digits, e.g. +919876543210)`;
      errors.push({ row: rowNumber, column: 'phone', message: errMsg });
      rowErrors.push(errMsg);
      rowHasError = true;
    } else {
      normalizedPhone = normalizePhone(rawPhone);

      // Check duplicates within the file
      if (seenPhonesInFile.has(normalizedPhone)) {
        const firstSeen = seenPhonesInFile.get(normalizedPhone);
        const errMsg = `Duplicate phone number in file (first seen on row ${firstSeen})`;
        errors.push({ row: rowNumber, column: 'phone', message: errMsg });
        rowErrors.push(errMsg);
        rowHasError = true;
      } else {
        seenPhonesInFile.set(normalizedPhone, rowNumber);
      }

      // Check if already certified for this course
      if (existingCertified.has(normalizedPhone)) {
        const errMsg = `Candidate with phone "${rawPhone}" is already certified for this course`;
        errors.push({ row: rowNumber, column: 'phone', message: errMsg });
        rowErrors.push(errMsg);
        rowHasError = true;
      }
    }

    // Validate Course
    if (!rawCourse) {
      errors.push({ row: rowNumber, column: 'course', message: 'Course is required' });
      rowErrors.push('Course is required');
      rowHasError = true;
    } else if (batchCourse && rawCourse.toLowerCase() !== batchCourse) {
      const errMsg = `Course "${rawCourse}" does not match batch course "${context.batchCourse}"`;
      errors.push({ row: rowNumber, column: 'course', message: errMsg });
      rowErrors.push(errMsg);
      rowHasError = true;
    }

    // Validate Score
    let scoreNum: number = NaN;
    if (rawScore === '' || rawScore === undefined || rawScore === null) {
      errors.push({ row: rowNumber, column: 'score', message: 'Score is required' });
      rowErrors.push('Score is required');
      rowHasError = true;
    } else {
      scoreNum = typeof rawScore === 'number' ? rawScore : parseFloat(String(rawScore).trim());
      if (isNaN(scoreNum)) {
        const errMsg = `Score must be a valid number, got "${rawScore}"`;
        errors.push({ row: rowNumber, column: 'score', message: errMsg });
        rowErrors.push(errMsg);
        rowHasError = true;
      } else if (scoreNum < 0 || scoreNum > 100) {
        const errMsg = `Score must be between 0 and 100, got ${scoreNum}`;
        errors.push({ row: rowNumber, column: 'score', message: errMsg });
        rowErrors.push(errMsg);
        rowHasError = true;
      }
    }

    rowResults.push({
      row: rowNumber,
      name: rawName || '(blank)',
      phone: rawPhone || '(blank)',
      course: rawCourse || '(blank)',
      score: rawScore !== undefined && rawScore !== null && rawScore !== '' ? rawScore : '(blank)',
      status: rowHasError ? 'invalid' : 'valid',
      errors: rowErrors,
    });

    if (!rowHasError) {
      // Neutralise formula injection on string fields before saving
      candidates.push({
        row: rowNumber,
        name: sanitizeFormulaInjection(rawName),
        phone: sanitizeFormulaInjection(normalizedPhone),
        course: sanitizeFormulaInjection(rawCourse),
        score: Math.round(scoreNum * 100) / 100,
      });
    }
  }

  // If any errors exist in ANY row, return success = false and empty candidates (save NOTHING)
  if (errors.length > 0) {
    return {
      success: false,
      errors,
      totalRows: dataRows.length,
      candidates: [],
      rowResults,
    };
  }

  return {
    success: true,
    errors: [],
    totalRows: dataRows.length,
    candidates,
    rowResults,
  };
}
