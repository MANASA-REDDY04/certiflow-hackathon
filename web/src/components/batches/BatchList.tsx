import React from 'react';
import { Users, FileText, ChevronRight } from 'lucide-react';
import { Batch } from '../../types/batch';

interface BatchListProps {
  batches: Batch[];
  selectedBatchId?: string;
  onSelectBatch: (id: string) => void;
  isTrainingCentre: boolean;
  onOpenCreateModal: () => void;
}

export default function BatchList({
  batches,
  selectedBatchId,
  onSelectBatch,
  isTrainingCentre,
  onOpenCreateModal,
}: BatchListProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
        Batches ({batches.length})
      </h3>

      {batches.length === 0 ? (
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center space-y-3">
          <FileText className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm text-slate-500 font-medium">No batches created yet</p>
          {isTrainingCentre && (
            <button
              onClick={onOpenCreateModal}
              className="text-xs text-indigo-600 font-bold hover:underline"
            >
              Create your first batch
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {batches.map((batch) => {
            const isSelected = selectedBatchId === batch.id;
            return (
              <div
                key={batch.id}
                onClick={() => onSelectBatch(batch.id)}
                className={`cursor-pointer p-4 rounded-xl border transition flex flex-col justify-between ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-500/20'
                    : 'border-slate-200 bg-white hover:border-indigo-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900">{batch.course_name}</h4>
                    <p className="text-xs text-slate-400 font-mono">
                      ID: {batch.id.slice(0, 8)}... &bull; R{batch.round}v{batch.version}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      batch.status === 'draft'
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : batch.status === 'submitted'
                        ? 'bg-blue-100 text-blue-800 border border-blue-200'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {batch.status}
                  </span>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center space-x-1">
                    <Users className="w-3.5 h-3.5" />
                    <span>{batch.candidate_count || 0} candidates</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
