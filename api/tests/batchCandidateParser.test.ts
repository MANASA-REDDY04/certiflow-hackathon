import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  parseAndValidateCandidateFile,
  sanitizeFormulaInjection,
  isValidPhone,
} from '../src/services/batchCandidateParser.js';

describe('Candidate CSV/XLSX Parser & Validation Engine', () => {
  describe('Formula Injection Sanitization', () => {
    it('should prepend a single quote to neutralize formula injection characters (=, +, -, @)', () => {
      expect(sanitizeFormulaInjection('=1+2')).toBe("'=1+2");
      expect(sanitizeFormulaInjection('@SUM(A1:B10)')).toBe("'@SUM(A1:B10)");
      expect(sanitizeFormulaInjection('+cmd|/c calc')).toBe("'+cmd|/c calc");
      expect(sanitizeFormulaInjection('-DDE("cmd";"calc")')).toBe("'-DDE(\"cmd\";\"calc\")");
    });

    it('should leave normal text untouched', () => {
      expect(sanitizeFormulaInjection('Rahul Sharma')).toBe('Rahul Sharma');
      expect(sanitizeFormulaInjection('+919876543210')).toBe("'+919876543210");
    });
  });

  describe('Phone Format Validation', () => {
    it('should accept valid 10-15 digit phone numbers', () => {
      expect(isValidPhone('9876543210')).toBe(true);
      expect(isValidPhone('+919876543210')).toBe(true);
      expect(isValidPhone('9876-543-210')).toBe(true);
      expect(isValidPhone('(987) 654 3210')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(isValidPhone('12345')).toBe(false);
      expect(isValidPhone('abcd1234ef')).toBe(false);
      expect(isValidPhone('')).toBe(false);
    });
  });

  describe('All-or-Nothing Validation & Exact Error Reporting', () => {
    it('should return exact errors and save ZERO rows when bad rows exist', () => {
      // CSV with intentional errors across multiple rows:
      // Row 1: Header
      // Row 2: Valid candidate
      // Row 3: Missing name, invalid phone, score > 100
      // Row 4: Duplicate phone of row 2, negative score, mismatched course
      const csvContent = [
        'name,phone,course,score',
        'Priya Patel,9876543210,Solar Technician,85',
        ',invalid-phone,Solar Technician,105',
        'Amit Roy,9876543210,Electrician,-10',
      ].join('\n');

      const result = parseAndValidateCandidateFile(csvContent, {
        batchCourse: 'Solar Technician',
      });

      // Verification: ALL-OR-NOTHING rule
      expect(result.success).toBe(false);
      expect(result.candidates).toHaveLength(0); // ZERO rows saved
      expect(result.totalRows).toBe(3);

      // Verify exact errors on Row 3
      const row3Errors = result.errors.filter((e) => e.row === 3);
      expect(row3Errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ row: 3, column: 'name', message: 'Candidate name is required' }),
          expect.objectContaining({ row: 3, column: 'phone' }),
          expect.objectContaining({ row: 3, column: 'score', message: expect.stringContaining('between 0 and 100') }),
        ])
      );

      // Verify exact errors on Row 4
      const row4Errors = result.errors.filter((e) => e.row === 4);
      expect(row4Errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            row: 4,
            column: 'phone',
            message: 'Duplicate phone number in file (first seen on row 2)',
          }),
          expect.objectContaining({
            row: 4,
            column: 'course',
            message: 'Course "Electrician" does not match batch course "Solar Technician"',
          }),
          expect.objectContaining({
            row: 4,
            column: 'score',
            message: 'Score must be between 0 and 100, got -10',
          }),
        ])
      );
    });

    it('should flag an error if candidate is already certified for the specified course', () => {
      const csvContent = [
        'name,phone,course,score',
        'Vikas Kumar,9111222333,Solar Technician,92',
      ].join('\n');

      const existingCertified = new Set<string>(['9111222333']);

      const result = parseAndValidateCandidateFile(csvContent, {
        batchCourse: 'Solar Technician',
        existingCertifiedPhoneNumbers: existingCertified,
      });

      expect(result.success).toBe(false);
      expect(result.candidates).toHaveLength(0); // Zero rows saved
      expect(result.errors).toEqual([
        {
          row: 2,
          column: 'phone',
          message: 'Candidate with phone "9111222333" is already certified for this course',
        },
      ]);
    });

    it('should successfully parse and save valid CSV rows when zero errors exist', () => {
      const csvContent = [
        'name,phone,course,score',
        'Priya Patel,9876543210,Solar Technician,85',
        'Rohan Sharma,9876543211,Solar Technician,92.5',
        'Sunita Rao,9876543212,Solar Technician,78',
      ].join('\n');

      const result = parseAndValidateCandidateFile(csvContent, {
        batchCourse: 'Solar Technician',
      });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.candidates).toHaveLength(3);
      expect(result.candidates[0]).toMatchObject({
        name: 'Priya Patel',
        phone: '9876543210',
        course: 'Solar Technician',
        score: 85,
      });
      expect(result.candidates[1].score).toBe(92.5);
    });

    it('should parse XLSX binary buffer seamlessly with identical validation rules', () => {
      // Create XLSX workbook in memory
      const wb = XLSX.utils.book_new();
      const wsData = [
        ['name', 'phone', 'course', 'score'],
        ['Anil Verma', '9811122233', 'Data Entry', 88],
        ['Meena Iyer', '9811122244', 'Data Entry', 94],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
      const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const result = parseAndValidateCandidateFile(xlsxBuffer, {
        batchCourse: 'Data Entry',
      });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates[0].name).toBe('Anil Verma');
    });

    it('should reject files exceeding row limit and save zero rows', () => {
      const rows = ['name,phone,course,score'];
      for (let i = 0; i < 15; i++) {
        rows.push(`Candidate ${i},98000000${i.toString().padStart(2, '0')},Solar,80`);
      }
      const csv = rows.join('\n');

      // Test with low maxRows limit (e.g. 10 rows)
      const result = parseAndValidateCandidateFile(csv, { maxRows: 10 });

      expect(result.success).toBe(false);
      expect(result.candidates).toHaveLength(0);
      expect(result.errors[0].column).toBe('file');
      expect(result.errors[0].message).toContain('exceeds the maximum limit of 10 rows');
    });
  });
});
