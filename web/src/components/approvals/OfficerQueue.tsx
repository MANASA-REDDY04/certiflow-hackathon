'use client';

import React, { useState } from 'react';
import {
  Clock,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  RotateCcw,
  Users,
  CheckSquare,
  Building2,
  MapPin,
  ChevronDown,
  ChevronUp,
  Award,
  AlertCircle,
  FileCheck2,
} from 'lucide-react';

interface OfficerQueueProps {
  queue: any[];
  activeUser: any;
  onSelectBatch: (id: string) => void;
  onResubmit: (id: string) => void;
  resubmitLoading: boolean;
  onReviewBatch?: (batch: any) => void;
}

export default function OfficerQueue({
  queue,
  activeUser,
  onSelectBatch,
  onResubmit,
  resubmitLoading,
  onReviewBatch,
}: OfficerQueueProps) {
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const isTrainingCentre = activeUser?.role === 'training_centre';

  const toggleExpand = (id: string) => {
    setExpandedBatchId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-4">
      {/* Queue Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
            <Clock className="w-5 h-5 text-indigo-600" />
            <span>Review & Approval Queue ({queue.length} pending)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isTrainingCentre
              ? 'Batches returned by reviewers requiring rectification and resubmission.'
              : `Batches awaiting your formal review as ${activeUser?.name} (${activeUser?.role}). Inspect candidates and verify scores before voting.`}
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span>Active Role: {activeUser?.name}</span>
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-base text-slate-900">Your Queue is Clear</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            No batches currently require your decision. When training centres submit batches or other officers complete their votes, they will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {queue.map((item) => {
            const isExpanded = expandedBatchId === item.id;
            const candidates = item.candidates || [];
            const stats = item.stats || {
              total: candidates.length,
              avg_score: 0,
              pass_count: 0,
              pass_rate: 0,
            };

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition overflow-hidden flex flex-col justify-between"
              >
                {/* Batch Summary Header */}
                <div className="p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center space-x-2.5">
                        <h4 className="font-extrabold text-base text-slate-900">
                          {item.course_name}
                        </h4>
                        <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-mono font-semibold">
                          Round {item.round} (v{item.version})
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        Batch UUID: {item.id}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-200">
                        {item.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Metadata Chips: Centre, District, Quorum */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                    <div className="flex items-center space-x-2">
                      <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Training Centre</span>
                        <span className="font-semibold text-slate-800 truncate block">
                          {item.centre_name || 'Apex Skills Training Centre'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">District Jurisdiction</span>
                        <span className="font-semibold text-slate-800 truncate block">
                          {item.district_name || 'Central District'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Award className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Quorum Status</span>
                        <span className="font-bold text-indigo-700">
                          {item.needed_approvals
                            ? `${item.current_approvals} of ${item.needed_approvals} officers approved`
                            : item.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Candidate Performance Summary KPI Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center">
                    <div className="bg-slate-50 border border-slate-200/80 p-2.5 rounded-xl">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Candidates</span>
                      <span className="text-base font-extrabold text-slate-900">{stats.total}</span>
                    </div>

                    <div className="bg-indigo-50/60 border border-indigo-100 p-2.5 rounded-xl">
                      <span className="text-[10px] uppercase font-bold text-indigo-500 block">Average Score</span>
                      <span className="text-base font-extrabold text-indigo-700">{stats.avg_score}%</span>
                    </div>

                    <div className="bg-emerald-50/60 border border-emerald-100 p-2.5 rounded-xl">
                      <span className="text-[10px] uppercase font-bold text-emerald-600 block">Pass Rate (≥50%)</span>
                      <span className="text-base font-extrabold text-emerald-700">{stats.pass_rate}%</span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200/80 p-2.5 rounded-xl">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Score Range</span>
                      <span className="text-sm font-bold text-slate-800">{stats.min_score} – {stats.max_score}</span>
                    </div>
                  </div>

                  {/* Previous Feedback Notice (if sent back) */}
                  {item.send_back_reason && (
                    <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200 space-y-1 text-xs">
                      <span className="text-amber-800 font-bold flex items-center space-x-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>Previous Return Reason (Rectification Required):</span>
                      </span>
                      <p className="text-amber-900 italic font-medium pl-5">"{item.send_back_reason}"</p>
                    </div>
                  )}

                  {/* Expandable Candidate Roster Table */}
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleExpand(item.id)}
                      className="inline-flex items-center space-x-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>
                        {isExpanded ? 'Hide Candidate Roster' : `Inspect Candidate Details & Scores (${candidates.length})`}
                      </span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {isExpanded && (
                      <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                        {candidates.length === 0 ? (
                          <div className="p-6 text-center text-xs text-slate-400">
                            No candidate records uploaded yet for this batch.
                          </div>
                        ) : (
                          <div className="max-h-60 overflow-y-auto">
                            <table className="w-full text-left text-xs divide-y divide-slate-100">
                              <thead className="bg-slate-50 text-slate-700 font-semibold sticky top-0 z-10">
                                <tr>
                                  <th className="px-3.5 py-2">Candidate Name</th>
                                  <th className="px-3.5 py-2">Phone</th>
                                  <th className="px-3.5 py-2">Course</th>
                                  <th className="px-3.5 py-2 text-right">Score</th>
                                  <th className="px-3.5 py-2 text-center w-24">Assessment</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white">
                                {candidates.map((cand: any, idx: number) => {
                                  const score = Number(cand.score);
                                  const isPassed = score >= 50;
                                  return (
                                    <tr key={cand.id || idx} className="hover:bg-slate-50/80 transition">
                                      <td className="px-3.5 py-2 font-semibold text-slate-900">{cand.name}</td>
                                      <td className="px-3.5 py-2 font-mono text-slate-500">{cand.phone}</td>
                                      <td className="px-3.5 py-2 text-slate-600">{item.course_name}</td>
                                      <td className="px-3.5 py-2 text-right font-mono font-bold text-slate-800">
                                        {score}/100
                                      </td>
                                      <td className="px-3.5 py-2 text-center">
                                        <span
                                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                            isPassed
                                              ? 'bg-emerald-100 text-emerald-800'
                                              : 'bg-red-100 text-red-800'
                                          }`}
                                        >
                                          {isPassed ? 'Passed' : 'Failed'}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <button
                    onClick={() => onSelectBatch(item.id)}
                    className="text-xs font-bold text-slate-600 hover:text-indigo-600 flex items-center space-x-1.5 transition"
                  >
                    <span>Open Full Dossier & Stepper</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center space-x-2">
                    {/* Training Centre Resubmit Action */}
                    {isTrainingCentre && item.status === 'sent_back' && (
                      <button
                        onClick={() => onResubmit(item.id)}
                        disabled={resubmitLoading}
                        className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{resubmitLoading ? 'Resubmitting...' : `Resubmit for Round ${item.round + 1}`}</span>
                      </button>
                    )}

                    {/* Reviewing Officer Direct Decision Action */}
                    {!isTrainingCentre && onReviewBatch && (
                      <button
                        onClick={() => onReviewBatch(item)}
                        className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition"
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        <span>Review & Decide Now</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
