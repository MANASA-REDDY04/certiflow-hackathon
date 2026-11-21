'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  RotateCcw,
  XCircle,
  AlertTriangle,
  X,
  Users,
  Building2,
  MapPin,
  ChevronDown,
  ChevronUp,
  Award,
} from 'lucide-react';

interface DecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchId: string;
  courseName: string;
  stepName: string;
  candidates?: any[];
  centreName?: string;
  districtName?: string;
  onSubmitDecision: (decision: 'approve' | 'reject' | 'send_back', reason: string) => Promise<void>;
  isLoading: boolean;
}

export default function DecisionModal({
  isOpen,
  onClose,
  batchId,
  courseName,
  stepName,
  candidates = [],
  centreName,
  districtName,
  onSubmitDecision,
  isLoading,
}: DecisionModalProps) {
  const [decision, setDecision] = useState<'approve' | 'send_back' | 'reject'>('approve');
  const [reason, setReason] = useState<string>('');
  const [showCandidates, setShowCandidates] = useState<boolean>(true);

  if (!isOpen) return null;

  const isReasonRequired = decision === 'send_back' || decision === 'reject';
  const isReasonValid = !isReasonRequired || reason.trim().length >= 5;

  const scores = candidates.map((c: any) => Number(c.score)).filter((s: number) => !isNaN(s));
  const avgScore =
    scores.length > 0
      ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10
      : 0;
  const passCount = scores.filter((s: number) => s >= 50).length;
  const passRate = scores.length > 0 ? Math.round((passCount / scores.length) * 100) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReasonValid) return;
    await onSubmitDecision(decision, reason.trim());
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-5 max-h-[92vh] overflow-y-auto border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Official Workflow Review</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Reviewing: <strong>{courseName}</strong> &bull; Stage: <span className="font-mono font-bold text-indigo-600">{stepName.replace('_', ' ')}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Batch Metadata & Accreditation Summary */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Training Centre</span>
                <span className="font-semibold text-slate-800">{centreName || 'Apex Skills Training Centre'}</span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">District</span>
                <span className="font-semibold text-slate-800">{districtName || 'Central District'}</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-center">
            <div className="bg-white p-2 rounded-lg border border-slate-100">
              <span className="text-[10px] text-slate-400 block font-bold">Candidates</span>
              <span className="font-extrabold text-slate-900">{candidates.length}</span>
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-100">
              <span className="text-[10px] text-indigo-500 block font-bold">Avg Score</span>
              <span className="font-extrabold text-indigo-700">{avgScore}%</span>
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-100">
              <span className="text-[10px] text-emerald-600 block font-bold">Pass Rate</span>
              <span className="font-extrabold text-emerald-700">{passRate}%</span>
            </div>
          </div>
        </div>

        {/* Expandable Candidate Roster */}
        {candidates.length > 0 && (
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <button
              type="button"
              onClick={() => setShowCandidates(!showCandidates)}
              className="w-full bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 hover:text-slate-900 flex items-center justify-between border-b border-slate-200"
            >
              <span className="flex items-center space-x-1.5">
                <Users className="w-4 h-4 text-indigo-600" />
                <span>Candidate Dossier & Assessment Scores ({candidates.length})</span>
              </span>
              {showCandidates ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showCandidates && (
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs divide-y divide-slate-100">
                  <thead className="bg-slate-100/70 text-slate-700 font-semibold sticky top-0 z-10">
                    <tr>
                      <th className="px-3.5 py-2">Name</th>
                      <th className="px-3.5 py-2">Phone</th>
                      <th className="px-3.5 py-2 text-right">Score</th>
                      <th className="px-3.5 py-2 text-center w-24">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {candidates.map((cand: any, i: number) => {
                      const score = Number(cand.score);
                      const isPassed = score >= 50;
                      return (
                        <tr key={cand.id || i} className="hover:bg-slate-50 transition">
                          <td className="px-3.5 py-2 font-medium text-slate-900">{cand.name}</td>
                          <td className="px-3.5 py-2 font-mono text-slate-500">{cand.phone}</td>
                          <td className="px-3.5 py-2 text-right font-mono font-bold text-slate-800">
                            {score}/100
                          </td>
                          <td className="px-3.5 py-2 text-center">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Decision Selection Options */}
          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => setDecision('approve')}
              className={`p-3 rounded-xl border text-center transition flex flex-col items-center space-y-1.5 ${
                decision === 'approve'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <CheckCircle2
                className={`w-5 h-5 ${decision === 'approve' ? 'text-emerald-600' : 'text-slate-400'}`}
              />
              <span className="text-xs font-bold">Approve</span>
            </button>

            <button
              type="button"
              onClick={() => setDecision('send_back')}
              className={`p-3 rounded-xl border text-center transition flex flex-col items-center space-y-1.5 ${
                decision === 'send_back'
                  ? 'border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-500/20'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <RotateCcw
                className={`w-5 h-5 ${decision === 'send_back' ? 'text-amber-600' : 'text-slate-400'}`}
              />
              <span className="text-xs font-bold">Send Back</span>
            </button>

            <button
              type="button"
              onClick={() => setDecision('reject')}
              className={`p-3 rounded-xl border text-center transition flex flex-col items-center space-y-1.5 ${
                decision === 'reject'
                  ? 'border-red-500 bg-red-50 text-red-900 ring-2 ring-red-500/20'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <XCircle className={`w-5 h-5 ${decision === 'reject' ? 'text-red-600' : 'text-slate-400'}`} />
              <span className="text-xs font-bold">Reject</span>
            </button>
          </div>

          {/* Contextual Notice */}
          <div className="text-xs">
            {decision === 'approve' && (
              <p className="text-emerald-700 bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200">
                Approving this step records your formal vote in the audit log and advances the workflow if quorum is satisfied.
              </p>
            )}
            {decision === 'send_back' && (
              <p className="text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200 flex items-start space-x-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Send back returns the batch to the training centre.</strong> A mandatory reason is required so the centre can rectify candidate details and resubmit in a new round.
                </span>
              </p>
            )}
            {decision === 'reject' && (
              <p className="text-red-800 bg-red-50 p-2.5 rounded-xl border border-red-200 flex items-start space-x-1.5">
                <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Rejection is terminal.</strong> The batch will be permanently closed and cannot be resubmitted. A mandatory explanation is required.
                </span>
              </p>
            )}
          </div>

          {/* Comments / Reason Textarea */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-slate-700">
                {isReasonRequired ? 'Mandatory Reason / Notes' : 'Comments (Optional)'}
              </label>
              {isReasonRequired && (
                <span
                  className={`text-[11px] font-mono ${
                    reason.trim().length >= 5 ? 'text-emerald-600 font-bold' : 'text-red-500'
                  }`}
                >
                  {reason.trim().length}/5 min characters
                </span>
              )}
            </div>
            <textarea
              required={isReasonRequired}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                decision === 'send_back'
                  ? 'e.g. Candidate scores require supporting practical assessment sheets'
                  : decision === 'reject'
                  ? 'e.g. Assessment found to violate national skill qualification standards'
                  : 'Add any optional review commentary...'
              }
              className="w-full text-xs border border-slate-300 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-semibold text-slate-600 px-4 py-2 rounded-xl border hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !isReasonValid}
              className={`text-xs font-bold text-white px-5 py-2 rounded-xl shadow-xs transition ${
                !isReasonValid
                  ? 'bg-slate-300 cursor-not-allowed'
                  : decision === 'approve'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : decision === 'send_back'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {isLoading ? 'Submitting in Transaction...' : `Confirm ${decision.replace('_', ' ')}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
