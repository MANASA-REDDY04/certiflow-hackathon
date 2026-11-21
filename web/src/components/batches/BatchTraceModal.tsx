'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Activity,
  History,
  Send,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Clock,
  Shield,
  Smartphone,
  Copy,
  Check,
} from 'lucide-react';

interface BatchTraceModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchId: string;
  courseName?: string;
  apiBaseUrl: string;
  jwtToken: string | null;
}

export default function BatchTraceModal({
  isOpen,
  onClose,
  batchId,
  courseName,
  apiBaseUrl,
  jwtToken,
}: BatchTraceModalProps) {
  const [activeTab, setActiveTab] = useState<'audit' | 'jobs' | 'deliveries'>('audit');
  const [traceData, setTraceData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && batchId && jwtToken) {
      fetchTrace();
    }
  }, [isOpen, batchId, jwtToken]);

  const fetchTrace = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/batches/${batchId}/trace`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTraceData(data);
      }
    } catch (e) {
      console.error('Failed to load batch trace:', e);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, keyId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyId);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">End-to-End Batch Trace</h3>
              <p className="text-xs text-slate-400 font-mono">
                {courseName || 'Batch'} &bull; UUID: {batchId}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 flex space-x-6 text-xs font-bold">
          <button
            onClick={() => setActiveTab('audit')}
            className={`py-3 border-b-2 flex items-center space-x-2 transition ${
              activeTab === 'audit'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Immutable Audit Trail ({traceData?.audit_logs?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('jobs')}
            className={`py-3 border-b-2 flex items-center space-x-2 transition ${
              activeTab === 'jobs'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Outbox & Worker Jobs ({traceData?.outbox_events?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('deliveries')}
            className={`py-3 border-b-2 flex items-center space-x-2 transition ${
              activeTab === 'deliveries'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>WhatsApp Deliveries ({traceData?.deliveries?.length || 0})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              <Activity className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
              Loading batch trace logs...
            </div>
          ) : (
            <>
              {/* Tab 1: Audit Log */}
              {activeTab === 'audit' && (
                <div className="space-y-4">
                  <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <span className="font-semibold text-slate-700">Append-Only Immutability:</span>{' '}
                    Every action is locked by a PostgreSQL trigger preventing UPDATE or DELETE.
                  </div>

                  {!traceData?.audit_logs || traceData.audit_logs.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8">No audit logs found for this batch.</p>
                  ) : (
                    <div className="space-y-3">
                      {traceData.audit_logs.map((log: any, idx: number) => (
                        <div
                          key={log.id || idx}
                          className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 hover:border-slate-300 transition"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-slate-900 capitalize">
                                {log.action.replace(/_/g, ' ')}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {log.actor_role}
                              </span>
                            </div>
                            <span className="text-slate-400 font-mono text-[11px]">
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                            {log.old_data && Object.keys(log.old_data).length > 0 && (
                              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                                <span className="font-semibold text-slate-500 block mb-1">Old Data</span>
                                <pre className="font-mono text-slate-600 whitespace-pre-wrap">
                                  {JSON.stringify(log.old_data, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.new_data && (
                              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                                <span className="font-semibold text-slate-500 block mb-1">New Data</span>
                                <pre className="font-mono text-slate-600 whitespace-pre-wrap">
                                  {JSON.stringify(log.new_data, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Outbox Events */}
              {activeTab === 'jobs' && (
                <div className="space-y-4">
                  <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <span className="font-semibold text-slate-700">Transactional Outbox:</span> Events
                    committed in the same transaction as state transitions and dispatched to pg-boss workers.
                  </div>

                  {!traceData?.outbox_events || traceData.outbox_events.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8">No outbox events recorded for this batch.</p>
                  ) : (
                    <div className="space-y-3">
                      {traceData.outbox_events.map((evt: any, idx: number) => (
                        <div
                          key={evt.id || idx}
                          className="bg-white border border-slate-200 rounded-xl p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center space-x-2">
                              <span className="font-mono font-bold text-indigo-700">{evt.event_type}</span>
                              <span className="text-slate-400 font-mono">({evt.aggregate_type})</span>
                            </div>
                            <span className="text-slate-400 font-mono text-[11px]">
                              {new Date(evt.created_at).toLocaleString()}
                            </span>
                          </div>

                          <div className="bg-slate-900 text-slate-200 p-3 rounded-lg font-mono text-xs overflow-x-auto">
                            <pre>{JSON.stringify(evt.payload, null, 2)}</pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: WhatsApp Deliveries */}
              {activeTab === 'deliveries' && (
                <div className="space-y-4">
                  <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <span className="font-semibold text-slate-700">Delivery Attempts:</span> Recorded
                    before dispatch to ensure idempotent delivery through mock-whatsapp service.
                  </div>

                  {!traceData?.deliveries || traceData.deliveries.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8">
                      No certificates or deliveries generated yet. Batch must reach APPROVED status.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                      {traceData.deliveries.map((del: any) => (
                        <div key={del.id} className="p-4 hover:bg-slate-50 transition space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-slate-900">{del.candidate_name}</span>
                              <span className="font-mono text-slate-500">{del.recipient}</span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-700">
                                {del.cert_number}
                              </span>
                            </div>

                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                del.status === 'delivered'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : del.status === 'failed'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {del.status}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 font-mono pt-1">
                            <div className="flex items-center space-x-1">
                              <span>Idempotency-Key:</span>
                              <span className="text-slate-700">{del.idempotency_key}</span>
                              <button
                                onClick={() => copyToClipboard(del.idempotency_key, del.id)}
                                className="p-1 hover:text-slate-900"
                                title="Copy Idempotency Key"
                              >
                                {copiedKey === del.id ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>

                            <div>
                              <span>Attempts: {del.attempt_count} &bull; </span>
                              <span>{del.delivered_at ? `Delivered at ${new Date(del.delivered_at).toLocaleTimeString()}` : 'In progress'}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
