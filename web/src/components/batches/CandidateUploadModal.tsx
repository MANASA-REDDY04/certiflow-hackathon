'use client';

import React, { useState } from 'react';
import {
  Upload,
  Download,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  X,
  FileSpreadsheet,
  Check,
  AlertCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ValidationError } from '../../types/batch';

export interface RowResult {
  row: number;
  name: string;
  phone: string;
  course: string;
  score: string | number;
  status: 'valid' | 'invalid';
  errors: string[];
}

interface CandidateUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchId: string;
  courseName: string;
  onUpload: (file: File) => Promise<any>;
  isLoading: boolean;
  errors: ValidationError[];
  successMessage: string | null;
}

export default function CandidateUploadModal({
  isOpen,
  onClose,
  batchId,
  courseName,
  onUpload,
  isLoading,
  errors: initialErrors,
  successMessage: initialSuccessMessage,
}: CandidateUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rowResults, setRowResults] = useState<RowResult[]>([]);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [uploadDone, setUploadDone] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [filterView, setFilterView] = useState<'all' | 'errors' | 'valid'>('all');

  if (!isOpen) return null;

  // 1. Download official template (Excel .xlsx or CSV .csv)
  const downloadTemplate = (format: 'xlsx' | 'csv') => {
    const templateData = [
      { name: 'Rahul Sharma', phone: '+919876543210', course: courseName, score: 85.5 },
      { name: 'Priya Patel', phone: '+919876543211', course: courseName, score: 92.0 },
      { name: 'Amit Verma', phone: '+919876543212', course: courseName, score: 78.0 },
      { name: 'Sunita Rao', phone: '+919876543213', course: courseName, score: 94.5 },
    ];

    if (format === 'xlsx') {
      const worksheet = XLSX.utils.json_to_sheet(templateData, {
        header: ['name', 'phone', 'course', 'score'],
      });
      // Set column widths
      worksheet['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 28 }, { wch: 10 }];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Candidates');
      XLSX.writeFile(workbook, `candidate_template_${courseName.replace(/\s+/g, '_')}.xlsx`);
    } else {
      const csvContent = [
        'name,phone,course,score',
        `Rahul Sharma,+919876543210,${courseName},85.5`,
        `Priya Patel,+919876543211,${courseName},92.0`,
        `Amit Verma,+919876543212,${courseName},78.0`,
        `Sunita Rao,+919876543213,${courseName},94.5`,
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `candidate_template_${courseName.replace(/\s+/g, '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // 2. Download sample with intentional errors for testing
  const downloadErrorSample = () => {
    const csvContent = [
      'name,phone,course,score',
      `Valid Candidate 1,+919876543210,${courseName},88.0`,
      `,12345,${courseName},105`, // missing name, bad phone, score > 100
      `Duplicate Phone,+919876543210,Wrong Course,-10`, // duplicate phone, mismatched course, negative score
      `=cmd|' /C calc'!A0,+919876543214,${courseName},75.0`, // formula injection test
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `sample_with_intentional_errors.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 3. Inspect headers client-side before sending
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setHeaderError(null);
    setRowResults([]);
    setUploadDone(false);

    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: any[] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

      if (rawRows.length > 0) {
        const headers = (rawRows[0] as any[]).map((h) =>
          String(h).trim().toLowerCase().replace(/[\s_-]/g, '')
        );

        const hasName = headers.includes('name') || headers.includes('candidatename');
        const hasPhone =
          headers.includes('phone') || headers.includes('mobile') || headers.includes('phonenumber');
        const hasCourse = headers.includes('course') || headers.includes('coursename');
        const hasScore = headers.includes('score') || headers.includes('marks');

        if (!hasName || !hasPhone || !hasCourse || !hasScore) {
          setHeaderError(
            'Template Mismatch: The uploaded file is missing required headers. File must have columns: "name", "phone", "course", "score".'
          );
        }
      }
    } catch {
      // Allow backend to parse if client-side preview fails
    }
  };

  // 4. Submit and parse
  const handleFileSubmit = async () => {
    if (!selectedFile) return;

    setHeaderError(null);
    const res = await onUpload(selectedFile);

    setUploadDone(true);
    if (res && res.rowResults) {
      setRowResults(res.rowResults);
      setIsSuccess(res.success);
    }
  };

  // 5. Download error report CSV
  const downloadErrorReportCsv = () => {
    const invalidRows = rowResults.filter((r) => r.status === 'invalid');
    if (invalidRows.length === 0) return;

    const header = 'Row,Name,Phone,Course,Score,Status,Error Messages\n';
    const lines = invalidRows.map(
      (r) =>
        `${r.row},"${r.name}","${r.phone}","${r.course}",${r.score},"${r.status}","${r.errors.join(
          '; '
        )}"`
    );
    const blob = new Blob([header + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `validation_errors_batch_${batchId.slice(0, 8)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredRows = rowResults.filter((r) => {
    if (filterView === 'errors') return r.status === 'invalid';
    if (filterView === 'valid') return r.status === 'valid';
    return true;
  });

  const errorRowCount = rowResults.filter((r) => r.status === 'invalid').length;
  const validRowCount = rowResults.filter((r) => r.status === 'valid').length;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 space-y-5 max-h-[92vh] overflow-y-auto border border-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <Upload className="w-5 h-5 text-indigo-600" />
              <span>Upload Candidates Spreadsheet</span>
            </h3>
            <p className="text-xs text-slate-500">
              Batch: <strong>{courseName}</strong> &bull; Must follow template: `name, phone, course, score`
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Template Download Section */}
        <div className="bg-gradient-to-r from-indigo-50/80 to-purple-50/80 p-4 rounded-xl border border-indigo-100 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-950 flex items-center space-x-1.5">
              <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
              <span>Step 1: Download Required Candidate Template</span>
            </span>
            <span className="text-[11px] text-indigo-600 font-medium">Headers: name, phone, course, score</span>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => downloadTemplate('xlsx')}
              className="inline-flex items-center space-x-1.5 text-indigo-900 bg-white hover:bg-indigo-50 border border-indigo-200 font-semibold px-3 py-1.5 rounded-lg shadow-xs transition"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600" />
              <span>Download Excel Template (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={() => downloadTemplate('csv')}
              className="inline-flex items-center space-x-1.5 text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 font-semibold px-3 py-1.5 rounded-lg shadow-xs transition"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Download CSV Template (.csv)</span>
            </button>

            <button
              type="button"
              onClick={downloadErrorSample}
              className="inline-flex items-center space-x-1.5 text-amber-800 bg-amber-50/70 hover:bg-amber-100 border border-amber-200 font-medium px-3 py-1.5 rounded-lg transition"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Download Error Demo Sample</span>
            </button>
          </div>
        </div>

        {/* Step 2: File Picker & Upload */}
        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-800">
            Step 2: Select and Upload Your Filled Spreadsheet
          </label>

          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
              onChange={handleFileChange}
              className="flex-1 text-xs text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer border border-slate-200 rounded-xl p-1.5"
            />

            <button
              type="button"
              disabled={isLoading || !selectedFile}
              onClick={handleFileSubmit}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-2 ${
                !selectedFile || isLoading
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>{isLoading ? 'Validating...' : 'Upload & Verify'}</span>
            </button>
          </div>

          {headerError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{headerError}</span>
            </div>
          )}
        </div>

        {/* Step 3: Row-by-Row Visual Table View */}
        {rowResults.length > 0 && (
          <div className="space-y-3 pt-3 border-t border-slate-100">
            {/* Table Summary & View Filter */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-900">
                  Upload Results ({rowResults.length} rows):
                </span>
                {errorRowCount > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
                    {errorRowCount} Error(s) &bull; 0 Saved
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {validRowCount} Valid &bull; All Saved!
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {/* Filter Pills */}
                <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-medium border border-slate-200">
                  <button
                    onClick={() => setFilterView('all')}
                    className={`px-2.5 py-1 rounded-md transition ${
                      filterView === 'all' ? 'bg-white font-bold text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    All ({rowResults.length})
                  </button>
                  <button
                    onClick={() => setFilterView('errors')}
                    className={`px-2.5 py-1 rounded-md transition ${
                      filterView === 'errors' ? 'bg-white font-bold text-red-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Errors ({errorRowCount})
                  </button>
                  <button
                    onClick={() => setFilterView('valid')}
                    className={`px-2.5 py-1 rounded-md transition ${
                      filterView === 'valid' ? 'bg-white font-bold text-emerald-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Valid ({validRowCount})
                  </button>
                </div>

                {errorRowCount > 0 && (
                  <button
                    type="button"
                    onClick={downloadErrorReportCsv}
                    className="inline-flex items-center space-x-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg shadow-xs transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Error CSV</span>
                  </button>
                )}
              </div>
            </div>

            {/* Row-by-Row Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs divide-y divide-slate-200">
                <thead className="bg-slate-50 text-slate-700 font-semibold sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 w-14">Row</th>
                    <th className="px-3 py-2 w-20">Status</th>
                    <th className="px-3 py-2">Candidate Name</th>
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">Course</th>
                    <th className="px-3 py-2 w-16">Score</th>
                    <th className="px-3 py-2">Validation Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredRows.map((row) => (
                    <tr
                      key={row.row}
                      className={`hover:bg-slate-50/80 transition ${
                        row.status === 'invalid' ? 'bg-red-50/30' : ''
                      }`}
                    >
                      <td className="px-3 py-2 font-mono font-bold text-slate-500">#{row.row}</td>
                      <td className="px-3 py-2">
                        {row.status === 'valid' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            <Check className="w-3 h-3" />
                            <span>Valid</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                            <AlertCircle className="w-3 h-3" />
                            <span>Error</span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-900">{row.name}</td>
                      <td className="px-3 py-2 font-mono text-slate-600">{row.phone}</td>
                      <td className="px-3 py-2 text-slate-600">{row.course}</td>
                      <td className="px-3 py-2 font-mono font-bold text-slate-800">{row.score}</td>
                      <td className="px-3 py-2">
                        {row.status === 'valid' ? (
                          <span className="text-emerald-700 text-[11px] font-medium">
                            Passed all validation checks
                          </span>
                        ) : (
                          <div className="space-y-0.5">
                            {row.errors.map((err, errIdx) => (
                              <div
                                key={errIdx}
                                className="text-red-600 text-[11px] font-semibold flex items-center space-x-1"
                              >
                                <span>&bull; {err}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex justify-between items-center pt-3 border-t border-slate-100">
          <span className="text-[11px] text-slate-400">
            Rules: Required fields, phone format (10-15 digits), score (0-100), course match, formula injection neutralizer.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-slate-700 px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 transition shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
