import React from 'react';
import { Users, Upload, Award, ExternalLink, CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { Candidate } from '../../types/batch';

interface CandidateTableProps {
  candidates: Candidate[];
  isDraft: boolean;
  isTrainingCentre: boolean;
  onOpenUpload: () => void;
}

export default function CandidateTable({
  candidates,
  isDraft,
  isTrainingCentre,
  onOpenUpload,
}: CandidateTableProps) {
  const hasAnyCerts = candidates.some((c) => c.certificate);

  // Calculate cohort performance metrics for reviewing officers
  const scores = candidates.map((c) => Number(c.score)).filter((s) => !isNaN(s));
  const passCount = scores.filter((s) => s >= 50).length;
  const avgScore =
    scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
  const passRate = scores.length > 0 ? Math.round((passCount / scores.length) * 100) : 0;
  const certsCount = candidates.filter((c) => c.certificate).length;

  return (
    <div className="space-y-3 pt-4 border-t border-slate-100">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-slate-900 flex items-center space-x-1.5">
          <Users className="w-4 h-4 text-indigo-600" />
          <span>Uploaded Candidates ({candidates.length})</span>
        </h4>

        {isTrainingCentre && isDraft && (
          <button
            onClick={onOpenUpload}
            className="text-xs font-semibold text-indigo-600 hover:underline"
          >
            + Upload / Replace Candidates
          </button>
        )}
      </div>

      {/* Cohort Performance Chips */}
      {candidates.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
            <span className="text-[10px] text-slate-500 uppercase font-semibold block">Total Cohort</span>
            <span className="text-base font-extrabold text-slate-900">{candidates.length} trainees</span>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
            <span className="text-[10px] text-emerald-700 uppercase font-semibold block">Eligible (&ge;50)</span>
            <span className="text-base font-extrabold text-emerald-800">
              {passCount} <span className="text-xs font-medium">({passRate}%)</span>
            </span>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
            <span className="text-[10px] text-blue-700 uppercase font-semibold block">Average Score</span>
            <span className="text-base font-extrabold text-blue-800">{avgScore} / 100</span>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5">
            <span className="text-[10px] text-purple-700 uppercase font-semibold block">Certificates Issued</span>
            <span className="text-base font-extrabold text-purple-800">
              {certsCount} / {passCount}
            </span>
          </div>
        </div>
      )}

      {candidates.length > 0 ? (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs divide-y divide-slate-200">
            <thead className="bg-slate-50 text-slate-600 font-semibold">
              <tr>
                <th className="px-4 py-2.5">Candidate Name</th>
                <th className="px-4 py-2.5">Phone Number</th>
                <th className="px-4 py-2.5">Course</th>
                <th className="px-4 py-2.5 text-right">Score</th>
                <th className="px-4 py-2.5">Certificate & Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {candidates.map((cand, i) => {
                const isPassing = (cand.score ?? 0) >= 50;
                const cert = cand.certificate;

                return (
                  <tr key={cand.id || i} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{cand.name}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-600">{cand.phone}</td>
                    <td className="px-4 py-2.5 text-slate-600">{cand.course}</td>
                    <td className="px-4 py-2.5 text-right font-bold">
                      <span className={isPassing ? 'text-emerald-700' : 'text-rose-600'}>
                        {cand.score} / 100
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {cert ? (
                        <div className="flex items-center space-x-2">
                          <span className="inline-flex items-center space-x-1 bg-emerald-50 text-emerald-800 font-semibold px-2 py-0.5 rounded text-[11px] border border-emerald-200">
                            <Award className="w-3 h-3 text-emerald-600" />
                            <span>Cert #{cert.cert_number}</span>
                          </span>

                          <Link
                            href={`/verify?cert_number=${cert.cert_number}&verify_code=${cert.verify_code}`}
                            target="_blank"
                            className="inline-flex items-center space-x-0.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                          >
                            <span>Verify</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </Link>

                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                            {cert.status}
                          </span>
                        </div>
                      ) : isPassing ? (
                        <span className="text-[11px] text-slate-400 italic">
                          Awaiting final issuance
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-rose-600 text-[11px] font-medium">
                          <XCircle className="w-3 h-3" />
                          <span>Not Eligible (&lt;50)</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-6 text-center space-y-2">
          <Users className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-xs text-slate-600 font-medium">No candidates uploaded yet</p>
          <p className="text-[11px] text-slate-400">
            Upload a CSV or XLSX file containing candidate records (name, phone, course, score).
          </p>
          {isTrainingCentre && isDraft && (
            <button
              onClick={onOpenUpload}
              className="mt-2 inline-flex items-center space-x-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Candidates</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
