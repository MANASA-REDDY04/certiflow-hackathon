'use client';

import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  RefreshCw,
  Plus,
  Send,
  Upload,
  CheckCircle,
  ExternalLink,
  ShieldAlert,
  Smartphone,
  Search,
  CheckSquare,
  Clock,
  RotateCcw,
  Activity,
  AlertOctagon,
  Database,
  FileText,
  Award,
} from 'lucide-react';
import Link from 'next/link';
import { Batch, ValidationError } from '../types/batch';
import BatchList from './batches/BatchList';
import WorkflowStatusStepper from './batches/WorkflowStatusStepper';
import CandidateTable from './batches/CandidateTable';
import CreateBatchModal from './batches/CreateBatchModal';
import CandidateUploadModal from './batches/CandidateUploadModal';
import DecisionModal from './approvals/DecisionModal';
import DecisionTimeline, { TimelineItem } from './approvals/DecisionTimeline';
import OfficerQueue from './approvals/OfficerQueue';
import StuckBatchesBoard from './approvals/StuckBatchesBoard';
import BatchTraceModal from './batches/BatchTraceModal';

interface BatchManagementProps {
  apiBaseUrl: string;
  activeUser: any;
  jwtToken: string | null;
}

export default function BatchManagement({
  apiBaseUrl,
  activeUser,
  jwtToken,
}: BatchManagementProps) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [queue, setQueue] = useState<any[]>([]);

  // View state: 'all_batches' | 'queue' | 'stuck'
  const [viewMode, setViewMode] = useState<'all_batches' | 'queue' | 'stuck'>('all_batches');

  // Trace Modal state
  const [showTraceModal, setShowTraceModal] = useState<boolean>(false);
  const [traceBatchId, setTraceBatchId] = useState<string>('');
  const [traceCourseName, setTraceCourseName] = useState<string>('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [createLoading, setCreateLoading] = useState<boolean>(false);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadLoading, setUploadLoading] = useState<boolean>(false);
  const [uploadErrors, setUploadErrors] = useState<ValidationError[]>([]);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);

  // Decision Modal
  const [showDecisionModal, setShowDecisionModal] = useState<boolean>(false);
  const [decisionLoading, setDecisionLoading] = useState<boolean>(false);
  const [submitLoading, setSubmitLoading] = useState<boolean>(false);
  const [resubmitLoading, setResubmitLoading] = useState<boolean>(false);

  // Cancel Modal
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [cancelCertId, setCancelCertId] = useState<string>('');
  const [cancelReason, setCancelReason] = useState<string>('');
  const [cancelLoading, setCancelLoading] = useState<boolean>(false);

  const isTrainingCentre = activeUser?.role === 'training_centre';
  const isStateOffice = activeUser?.role === 'state_office';
  const isOfficer =
    activeUser?.role === 'district_officer' ||
    activeUser?.role === 'quality_team' ||
    activeUser?.role === 'state_office';

  useEffect(() => {
    if (jwtToken) {
      fetchBatches();
      fetchQueue();
    }
  }, [jwtToken, activeUser]);

  const fetchBatches = async () => {
    if (!jwtToken) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/batches`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBatches(data.batches || []);
        if (data.batches?.length > 0 && !selectedBatch) {
          fetchBatchDetails(data.batches[0].id);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchQueue = async () => {
    if (!jwtToken) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/queue/waiting-for-me`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setQueue(data.queue || []);
      }
    } catch {}
  };

  const fetchBatchDetails = async (id: string) => {
    if (!jwtToken) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/batches/${id}`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedBatch(data.batch);
      }

      // Also fetch timeline
      const timeRes = await fetch(`${apiBaseUrl}/api/batches/${id}/timeline`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      if (timeRes.ok) {
        const timeData = await timeRes.json();
        setTimeline(timeData.timeline || []);
      }
    } catch (e) {
      console.error('Failed to fetch batch details:', e);
    }
  };

  const handleCreateBatch = async (courseName: string) => {
    if (!jwtToken) return;
    setCreateLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/batches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({ course_name: courseName }),
      });

      if (res.ok) {
        const data = await res.json();
        setShowCreateModal(false);
        await fetchBatches();
        if (data.batch?.id) fetchBatchDetails(data.batch.id);
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to create batch');
      }
    } finally {
      setCreateLoading(false);
    }
  };

  const handleUploadFile = async (file: File) => {
    if (!jwtToken || !selectedBatch) return;
    setUploadLoading(true);
    setUploadErrors([]);
    setUploadSuccessMessage(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${apiBaseUrl}/api/batches/${selectedBatch.id}/candidates/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwtToken}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setUploadErrors(data.errors || [{ row: 0, column: 'file', message: data.message }]);
      } else {
        setUploadSuccessMessage(data.message);
        await fetchBatches();
        await fetchBatchDetails(selectedBatch.id);
      }
      return data;
    } finally {
      setUploadLoading(false);
    }
  };

  const handleSubmitBatch = async () => {
    if (!jwtToken || !selectedBatch) return;
    if (!confirm('Submit this batch for District Review?')) return;

    setSubmitLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/batches/${selectedBatch.id}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwtToken}` },
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Failed to submit batch');
      } else {
        alert('Batch successfully submitted for District Review!');
        await fetchBatches();
        await fetchQueue();
        await fetchBatchDetails(selectedBatch.id);
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleResubmitBatch = async (batchId: string) => {
    if (!jwtToken) return;
    setResubmitLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/batches/${batchId}/resubmit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwtToken}` },
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Resubmit failed');
      } else {
        alert(data.message || 'Batch resubmitted for round 2!');
        await fetchBatches();
        await fetchQueue();
        await fetchBatchDetails(batchId);
      }
    } finally {
      setResubmitLoading(false);
    }
  };

  const handleDecision = async (
    decision: 'approve' | 'reject' | 'send_back',
    reason: string
  ) => {
    if (!jwtToken || !selectedBatch) return;

    setDecisionLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/batches/${selectedBatch.id}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({ decision, reason, comments: reason }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(`[${res.status} ${data.error || 'Error'}] ${data.message}`);
      } else {
        alert(data.message || `Decision recorded successfully!`);
        setShowDecisionModal(false);
        await fetchBatches();
        await fetchQueue();
        await fetchBatchDetails(selectedBatch.id);
      }
    } finally {
      setDecisionLoading(false);
    }
  };

  const handleCancelCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jwtToken || !cancelCertId.trim() || !cancelReason.trim()) return;

    setCancelLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/certificates/${cancelCertId.trim()}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({ cancel_reason: cancelReason.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Cancellation failed');
      } else {
        alert('Certificate cancelled and Redis cache cleared immediately!');
        setShowCancelModal(false);
        setCancelCertId('');
        setCancelReason('');
      }
    } finally {
      setCancelLoading(false);
    }
  };

  const [issueLoading, setIssueLoading] = useState<boolean>(false);

  const handleIssueCertificates = async (batchId: string) => {
    if (!jwtToken) return;
    setIssueLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/batches/${batchId}/issue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
      });
      if (res.ok) {
        await fetchBatchDetails(batchId);
        await fetchBatches();
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to issue certificates');
      }
    } catch (e: any) {
      alert(`Error issuing certificates: ${e.message}`);
    } finally {
      setIssueLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center space-x-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
              <span>CertiFlow Workflow Management</span>
            </h2>
            <p className="text-xs text-slate-500">
              Active persona: <strong>{activeUser?.name}</strong> ({activeUser?.role})
            </p>
          </div>

          {/* View Toggle */}
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setViewMode('all_batches')}
              className={`px-3 py-1.5 rounded-md transition ${
                viewMode === 'all_batches' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Batches ({batches.length})
            </button>

            <button
              onClick={() => setViewMode('queue')}
              className={`px-3 py-1.5 rounded-md transition flex items-center space-x-1.5 ${
                viewMode === 'queue' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Waiting for Me</span>
              {queue.length > 0 && (
                <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {queue.length}
                </span>
              )}
            </button>

            {isStateOffice && (
              <button
                onClick={() => setViewMode('stuck')}
                className={`px-3 py-1.5 rounded-md transition flex items-center space-x-1.5 ${
                  viewMode === 'stuck'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'text-red-700 hover:text-red-900'
                }`}
              >
                <AlertOctagon className="w-3.5 h-3.5" />
                <span>Stuck Batches</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Swagger API Docs */}
          <a
            href="http://localhost:4000/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1.5 text-xs text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-2 rounded-lg font-semibold transition"
            title="Open Interactive Swagger OpenAPI Documentation"
          >
            <FileText className="w-3.5 h-3.5 text-amber-600" />
            <span>Swagger Docs</span>
            <ExternalLink className="w-3 h-3 text-amber-500" />
          </a>

          {/* Database Tables Viewer */}
          <a
            href="http://localhost:8080"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1.5 text-xs text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-2 rounded-lg font-semibold transition"
            title="Open local Database Table Viewer Web GUI"
          >
            <Database className="w-3.5 h-3.5 text-indigo-600" />
            <span>DB Tables (8080)</span>
            <ExternalLink className="w-3 h-3 text-indigo-500" />
          </a>

          {/* WhatsApp Inbox */}
          <a
            href="http://localhost:4001"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1.5 text-xs text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-2 rounded-lg font-semibold transition"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
            <span>WhatsApp Inbox (Port 4001)</span>
            <ExternalLink className="w-3 h-3 text-emerald-500" />
          </a>

          {/* Public Verify */}
          <Link
            href="/verify"
            className="inline-flex items-center space-x-1.5 text-xs text-slate-700 hover:text-indigo-600 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg font-semibold transition"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Public Verify</span>
          </Link>

          {isStateOffice && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="inline-flex items-center space-x-1 text-xs text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-2 rounded-lg font-semibold transition"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
              <span>Cancel Certificate</span>
            </button>
          )}

          <button
            onClick={() => {
              fetchBatches();
              fetchQueue();
            }}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {isTrainingCentre && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>New Batch</span>
            </button>
          )}
        </div>
      </div>

      {/* Main View Area */}
      {viewMode === 'stuck' ? (
        <StuckBatchesBoard
          apiBaseUrl={apiBaseUrl}
          jwtToken={jwtToken}
          onSelectBatch={(id) => {
            setViewMode('all_batches');
            fetchBatchDetails(id);
          }}
          onOpenTrace={(id) => {
            setTraceBatchId(id);
            setTraceCourseName('Stuck Batch');
            setShowTraceModal(true);
          }}
        />
      ) : viewMode === 'queue' ? (
        <OfficerQueue
          queue={queue}
          activeUser={activeUser}
          onSelectBatch={(id) => {
            setViewMode('all_batches');
            fetchBatchDetails(id);
          }}
          onResubmit={handleResubmitBatch}
          resubmitLoading={resubmitLoading}
          onReviewBatch={(batch) => {
            setSelectedBatch(batch);
            setShowDecisionModal(true);
          }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <BatchList
              batches={batches}
              selectedBatchId={selectedBatch?.id}
              onSelectBatch={fetchBatchDetails}
              isTrainingCentre={isTrainingCentre}
              onOpenCreateModal={() => setShowCreateModal(true)}
            />
          </div>

          <div className="lg:col-span-2 space-y-6">
            {selectedBatch ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                {/* Batch Title & Actions */}
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-xl font-extrabold text-slate-900">
                        {selectedBatch.course_name}
                      </h3>
                      <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                        Round {selectedBatch.round} (v{selectedBatch.version})
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-1">UUID: {selectedBatch.id}</p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        setTraceBatchId(selectedBatch.id);
                        setTraceCourseName(selectedBatch.course_name);
                        setShowTraceModal(true);
                      }}
                      className="inline-flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200"
                      title="Inspect Audit Logs, Outbox Events & Deliveries"
                    >
                      <Activity className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Trace</span>
                    </button>

                    {/* Training Centre: Upload & Submit */}
                    {isTrainingCentre && selectedBatch.status === 'draft' && (
                      <>
                        <button
                          onClick={() => {
                            setUploadErrors([]);
                            setUploadSuccessMessage(null);
                            setShowUploadModal(true);
                          }}
                          className="inline-flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold px-3 py-2 rounded-lg"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload Candidates</span>
                        </button>

                        <button
                          onClick={handleSubmitBatch}
                          disabled={submitLoading || (selectedBatch.candidate_count || 0) === 0}
                          className={`inline-flex items-center space-x-1.5 text-xs font-semibold px-4 py-2 rounded-lg shadow-sm ${
                            (selectedBatch.candidate_count || 0) === 0
                              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{submitLoading ? 'Submitting...' : 'Submit Batch'}</span>
                        </button>
                      </>
                    )}

                    {/* Training Centre: Resubmit from Sent Back */}
                    {isTrainingCentre && selectedBatch.status === 'sent_back' && (
                      <button
                        onClick={() => handleResubmitBatch(selectedBatch.id)}
                        disabled={resubmitLoading}
                        className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{resubmitLoading ? 'Resubmitting...' : `Resubmit for Round ${selectedBatch.round + 1}`}</span>
                      </button>
                    )}

                    {/* Reviewing Officers: Review Batch Dialog */}
                    {isOfficer &&
                      selectedBatch.status !== 'draft' &&
                      selectedBatch.status !== 'rejected' &&
                      selectedBatch.status !== 'approved' &&
                      selectedBatch.status !== 'issued' &&
                      selectedBatch.status !== 'sent_back' && (
                        <button
                          onClick={() => setShowDecisionModal(true)}
                          className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm"
                        >
                          <CheckSquare className="w-3.5 h-3.5" />
                          <span>Review & Decide</span>
                        </button>
                      )}
                    {/* State Office / Officer: Issue & Deliver Certificates */}
                    {(selectedBatch.status === 'approved' || selectedBatch.status === 'state_approved') && (
                      <button
                        onClick={() => handleIssueCertificates(selectedBatch.id)}
                        disabled={issueLoading}
                        className="inline-flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm"
                      >
                        <Award className="w-3.5 h-3.5" />
                        <span>{issueLoading ? 'Issuing & Delivering...' : '⚡ Issue Certificates & Send WhatsApp'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Workflow Status Stepper */}
                <WorkflowStatusStepper
                  status={selectedBatch.status}
                  submittedAt={selectedBatch.submitted_at}
                  stepDueAt={selectedBatch.step_due_at}
                  candidateCount={selectedBatch.candidate_count || selectedBatch.candidates?.length || 0}
                  sendBackReason={selectedBatch.send_back_reason}
                  rejectionReason={selectedBatch.rejection_reason}
                  round={selectedBatch.round}
                />

                {/* Decision Timeline */}
                <DecisionTimeline timeline={timeline} />

                {/* Candidates Table */}
                <CandidateTable
                  candidates={selectedBatch.candidates || []}
                  isDraft={selectedBatch.status === 'draft'}
                  isTrainingCentre={isTrainingCentre}
                  onOpenUpload={() => {
                    setUploadErrors([]);
                    setUploadSuccessMessage(null);
                    setShowUploadModal(true);
                  }}
                />
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
                Select a batch from the left to view details and candidate records.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Decision Modal */}
      {selectedBatch && (
        <DecisionModal
          isOpen={showDecisionModal}
          onClose={() => setShowDecisionModal(false)}
          batchId={selectedBatch.id}
          courseName={selectedBatch.course_name}
          stepName={selectedBatch.status}
          candidates={selectedBatch.candidates || []}
          centreName={selectedBatch.centre_name}
          districtName={selectedBatch.district_name}
          onSubmitDecision={handleDecision}
          isLoading={decisionLoading}
        />
      )}

      {/* Modals */}
      <CreateBatchModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateBatch}
        isLoading={createLoading}
      />

      {selectedBatch && (
        <CandidateUploadModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          batchId={selectedBatch.id}
          courseName={selectedBatch.course_name}
          onUpload={handleUploadFile}
          isLoading={uploadLoading}
          errors={uploadErrors}
          successMessage={uploadSuccessMessage}
        />
      )}

      {/* State Office: Cancel Certificate Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-red-600" />
              <span>Cancel / Revoke Certificate</span>
            </h3>
            <p className="text-xs text-slate-500">
              State Office authority only. Reason is mandatory. Immediately clears the Redis verification cache.
            </p>

            <form onSubmit={handleCancelCertificate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Certificate UUID
                </label>
                <input
                  type="text"
                  required
                  value={cancelCertId}
                  onChange={(e) => setCancelCertId(e.target.value)}
                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                  className="w-full text-xs font-mono border border-slate-300 rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cancellation Reason (Required, min 5 chars)
                </label>
                <textarea
                  required
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Disqualified due to duplicate identity document fraud"
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="text-xs font-semibold text-slate-600 px-3 py-2 rounded-lg border hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={cancelLoading}
                  className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg shadow-sm"
                >
                  {cancelLoading ? 'Cancelling & Clearing Cache...' : 'Revoke Certificate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Trace Modal */}
      <BatchTraceModal
        isOpen={showTraceModal}
        onClose={() => setShowTraceModal(false)}
        batchId={traceBatchId}
        courseName={traceCourseName}
        apiBaseUrl={apiBaseUrl}
        jwtToken={jwtToken}
      />
    </div>
  );
}
