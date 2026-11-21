import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, ArrowRight, Clock } from 'lucide-react';
import { STATUS_STEPS, getStatusStepIndex } from '../../types/batch';

interface WorkflowStatusStepperProps {
  status: string;
  submittedAt?: string | null;
  stepDueAt?: string | null;
  candidateCount?: number;
  sendBackReason?: string;
  rejectionReason?: string;
  round?: number;
}

export default function WorkflowStatusStepper({
  status,
  submittedAt,
  stepDueAt,
  candidateCount = 0,
  sendBackReason,
  rejectionReason,
  round = 1,
}: WorkflowStatusStepperProps) {
  const currentIdx = getStatusStepIndex(status);
  const isSentBack = status === 'sent_back';
  const isRejected = status === 'rejected';

  // Determine if Quality QA was waived due to small cohort (< 50)
  const isQualityWaived = candidateCount < 50;

  return (
    <div className="space-y-3">
      {/* Sent Back Banner */}
      {isSentBack && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-amber-900 flex items-start space-x-2.5">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold">Returned for Revision (Round {round}):</span>
            <p className="mt-0.5 text-amber-800">
              {sendBackReason || 'Officer requested changes to the candidate list or batch details.'}
            </p>
          </div>
        </div>
      )}

      {/* Rejected Banner */}
      {isRejected && (
        <div className="bg-rose-50 border border-rose-300 rounded-lg p-3 text-rose-900 flex items-start space-x-2.5">
          <XCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold">Batch Rejected:</span>
            <p className="mt-0.5 text-rose-800">
              {rejectionReason || 'This batch has been rejected and cannot proceed further in this round.'}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Workflow Status Stepper
        </span>
        <span className="text-xs font-mono font-medium text-slate-400">
          Status: <strong className="text-slate-700 capitalize">{status.replace('_', ' ')}</strong>
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {STATUS_STEPS.map((step, idx) => {
          let isCompleted = idx < currentIdx;
          let isCurrent = idx === currentIdx;

          // If Quality QA (idx === 3) and batch has < 50 candidates and has reached State Review or beyond
          const isQualityStep = idx === 3;
          const isQualitySkipped = isQualityStep && isQualityWaived && currentIdx > 3;

          let label = step.label;
          if (isQualityStep && isQualityWaived && currentIdx >= 4) {
            label = '4. Quality QA (Waived <50)';
          }

          return (
            <div
              key={step.key}
              className={`p-2.5 rounded-lg border text-center transition flex flex-col justify-between ${
                isCurrent && !isRejected && !isSentBack
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-bold shadow-sm ring-1 ring-indigo-500/30'
                  : isCompleted || isQualitySkipped
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 font-medium'
                  : isSentBack && idx === 0
                  ? 'border-amber-400 bg-amber-50 text-amber-800 font-bold'
                  : isRejected && idx === 0
                  ? 'border-rose-400 bg-rose-50 text-rose-800 font-bold'
                  : 'border-slate-100 bg-slate-50 text-slate-400'
              }`}
            >
              <div className="text-[11px] font-semibold leading-tight">{label}</div>
              <div className="mt-1 flex justify-center">
                {isCompleted || isQualitySkipped ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : isCurrent && !isRejected && !isSentBack ? (
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                ) : isSentBack && idx === 0 ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                ) : isRejected && idx === 0 ? (
                  <XCircle className="w-3.5 h-3.5 text-rose-600" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-slate-300" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {submittedAt && (
        <div className="text-[11px] text-slate-500 pt-1 flex items-center justify-between">
          <span className="inline-flex items-center space-x-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>Submitted: {new Date(submittedAt).toLocaleString()}</span>
          </span>
          {stepDueAt && !isRejected && (
            <span className="text-amber-700 font-medium">
              SLA Step Due: {new Date(stepDueAt).toLocaleDateString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
