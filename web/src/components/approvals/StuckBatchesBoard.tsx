'use client';

import React, { useState, useEffect } from 'react';
import {
  AlertOctagon,
  Clock,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Zap,
  Activity,
  Building2,
  Users,
} from 'lucide-react';

interface StuckBatch {
  id: string;
  course_name: string;
  status: string;
  round: number;
  version: number;
  escalation_level: number;
  step_due_at: string | null;
  seconds_overdue?: number;
  candidate_count?: number;
  centre_name?: string;
  district_name?: string;
}

interface StuckBatchesBoardProps {
  apiBaseUrl: string;
  jwtToken: string | null;
  onSelectBatch: (batchId: string) => void;
  onOpenTrace: (batchId: string) => void;
}

export default function StuckBatchesBoard({
  apiBaseUrl,
  jwtToken,
  onSelectBatch,
  onOpenTrace,
}: StuckBatchesBoardProps) {
  const [stuckBatches, setStuckBatches] = useState<StuckBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const fetchStuckBatches = async () => {
    if (!jwtToken) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/batches/stuck`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStuckBatches(data.stuck_batches || []);
      }
    } catch (e) {
      console.error('Failed to fetch stuck batches', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStuckBatches();
  }, [jwtToken]);

  const handleTriggerScan = async () => {
    if (!jwtToken) return;
    setScanLoading(true);
    setScanMessage(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/escalations/trigger-scan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      const data = await res.json();
      if (res.ok) {
        setScanMessage(
          `SLA Scan Complete: ${data.summary?.remindersSent || 0} reminders sent, ${
            data.summary?.stateEscalations || 0
          } escalated to State Office.`
        );
        await fetchStuckBatches();
      } else {
        setScanMessage(`Scan error: ${data.message}`);
      }
    } catch (e: any) {
      setScanMessage(`Failed to trigger scan: ${e.message}`);
    } finally {
      setScanLoading(false);
    }
  };

  const formatOverdueTime = (seconds?: number) => {
    if (seconds === undefined || seconds <= 0) return 'Just overdue';
    if (seconds < 60) return `${seconds}s overdue`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s overdue`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m overdue`;
  };

  return (
    <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
      {/* Board Header */}
      <div className="bg-gradient-to-r from-red-900 via-red-800 to-rose-900 text-white p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <AlertOctagon className="w-6 h-6 text-red-300" />
            <h2 className="text-xl font-bold tracking-tight">State Office &bull; Stuck Batches Board</h2>
          </div>
          <p className="text-xs text-red-200 mt-1">
            Real-time monitoring of batches breaching SLAs. Escalated past officer reminders.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleTriggerScan}
            disabled={scanLoading}
            className="inline-flex items-center space-x-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-semibold px-3 py-2 rounded-lg transition"
            title="Scan batches past step_due_at and advance escalation levels"
          >
            <Zap className={`w-3.5 h-3.5 text-amber-300 ${scanLoading ? 'animate-bounce' : ''}`} />
            <span>{scanLoading ? 'Scanning...' : 'Trigger SLA Scan'}</span>
          </button>

          <button
            onClick={fetchStuckBatches}
            disabled={loading}
            className="p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition"
            title="Refresh Stuck Batches"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {scanMessage && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-xs text-amber-800 font-medium flex items-center justify-between">
          <span>{scanMessage}</span>
          <button onClick={() => setScanMessage(null)} className="text-amber-500 hover:text-amber-700">
            &times;
          </button>
        </div>
      )}

      {/* Board Content */}
      <div className="p-6">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-300" />
            Loading stuck batches...
          </div>
        ) : stuckBatches.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <Clock className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-60" />
            <p className="font-semibold text-slate-600">No Stuck Batches</p>
            <p className="text-xs text-slate-400 mt-1">
              All batches are progressing on schedule within SLA time limits.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stuckBatches.map((batch) => {
              const isLevel2 = batch.escalation_level >= 2;
              return (
                <div
                  key={batch.id}
                  className={`rounded-xl border p-4 transition flex flex-col justify-between ${
                    isLevel2
                      ? 'border-red-300 bg-red-50/50 hover:border-red-400'
                      : 'border-amber-300 bg-amber-50/40 hover:border-amber-400'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-sm text-slate-900">{batch.course_name}</h4>
                        <span className="text-xs text-slate-500 font-mono">
                          UUID: {batch.id.slice(0, 8)}... &bull; Round {batch.round}
                        </span>
                      </div>

                      {isLevel2 ? (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300 animate-pulse">
                          <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                          <span>Level 2 &bull; State HQ</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          <span>Level 1 &bull; Reminded</span>
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-2 border-t border-slate-200/60">
                      <div>
                        <span className="text-slate-400 block text-[10px]">CURRENT STAGE</span>
                        <span className="font-semibold capitalize text-slate-800">
                          {batch.status.replace('_', ' ')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">TIME OVERDUE</span>
                        <span className="font-mono font-bold text-red-700">
                          {formatOverdueTime(batch.seconds_overdue)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">DISTRICT</span>
                        <span className="font-medium text-slate-700">
                          {batch.district_name || 'Central District'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">CANDIDATES</span>
                        <span className="font-medium text-slate-700 flex items-center space-x-1">
                          <Users className="w-3 h-3 text-slate-400" />
                          <span>{batch.candidate_count || 0}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
                    <button
                      onClick={() => onOpenTrace(batch.id)}
                      className="inline-flex items-center space-x-1 text-slate-600 hover:text-indigo-600 font-semibold"
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span>Trace Audit & Jobs</span>
                    </button>

                    <button
                      onClick={() => onSelectBatch(batch.id)}
                      className="inline-flex items-center space-x-1 font-bold text-indigo-600 hover:text-indigo-800"
                    >
                      <span>Review Batch</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
