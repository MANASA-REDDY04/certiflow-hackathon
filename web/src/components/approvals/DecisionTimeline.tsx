import React from 'react';
import { CheckCircle2, RotateCcw, XCircle, Clock, ShieldCheck, User } from 'lucide-react';

export interface TimelineItem {
  id: string;
  batch_id: string;
  round: number;
  step: string;
  officer_id: string;
  officer_name?: string;
  officer_role?: string;
  status: 'approved' | 'rejected' | 'changes_requested';
  comments?: string | null;
  created_at: string;
}

interface DecisionTimelineProps {
  timeline: TimelineItem[];
}

export default function DecisionTimeline({ timeline }: DecisionTimelineProps) {
  if (timeline.length === 0) {
    return (
      <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 text-center space-y-1.5 text-xs text-slate-500">
        <Clock className="w-5 h-5 text-slate-400 mx-auto" />
        <p className="font-semibold text-slate-700">No review decisions recorded yet</p>
        <p className="text-slate-400">Decisions and officer votes will appear chronologically here.</p>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center space-x-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px] font-bold border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Approved</span>
          </span>
        );
      case 'changes_requested':
        return (
          <span className="inline-flex items-center space-x-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[11px] font-bold border border-amber-200">
            <RotateCcw className="w-3 h-3 text-amber-600" />
            <span>Sent Back</span>
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center space-x-1 text-red-700 bg-red-50 px-2 py-0.5 rounded text-[11px] font-bold border border-red-200">
            <XCircle className="w-3 h-3 text-red-600" />
            <span>Rejected</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
        <ShieldCheck className="w-4 h-4 text-indigo-600" />
        <span>Workflow Decision Timeline ({timeline.length})</span>
      </h4>

      <div className="relative border-l-2 border-indigo-200 ml-3 space-y-4 py-1">
        {timeline.map((item) => (
          <div key={item.id} className="relative pl-6">
            {/* Timeline Node Icon */}
            <div
              className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 bg-white flex items-center justify-center ${
                item.status === 'approved'
                  ? 'border-emerald-500'
                  : item.status === 'rejected'
                  ? 'border-red-500'
                  : 'border-amber-500'
              }`}
            />

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  <span className="font-bold text-slate-900">{item.officer_name || 'Official'}</span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    ({item.officer_role ? item.officer_role.replace('_', ' ') : 'Reviewer'})
                  </span>
                  <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-[10px] font-mono">
                    Round {item.round}
                  </span>
                </div>
                {getStatusBadge(item.status)}
              </div>

              {item.comments && (
                <p className="text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 text-xs italic">
                  "{item.comments}"
                </p>
              )}

              <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1">
                <span className="uppercase font-mono tracking-wider">{item.step.replace('_', ' ')}</span>
                <span>{new Date(item.created_at).toLocaleString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
