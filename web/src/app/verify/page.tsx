'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Search,
  CheckCircle2,
  XCircle,
  Award,
  Calendar,
  Lock,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';

interface VerifyResult {
  status: 'valid' | 'cancelled' | 'not_found';
  cert_number?: string | number;
  course_name?: string;
  issue_date?: string;
  candidate_name_masked?: string;
  verify_code?: string;
  cancelled_at?: string;
  cancel_reason?: string;
  cached?: boolean;
}

function VerifyContent() {
  const searchParams = useSearchParams();
  const [certNumber, setCertNumber] = useState<string>('');
  const [verifyCode, setVerifyCode] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto-verify if query params are present in URL
  useEffect(() => {
    const qCert = searchParams.get('cert_number');
    const qCode = searchParams.get('verify_code');
    if (qCert && qCode) {
      setCertNumber(qCert);
      setVerifyCode(qCode);
      executeVerification(qCert, qCode);
    }
  }, [searchParams]);

  const executeVerification = async (cNum: string, cCode: string) => {
    if (!cNum.trim() || !cCode.trim()) return;

    setLoading(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const res = await fetch(
        `http://localhost:4000/api/verify?cert_number=${encodeURIComponent(
          cNum.trim()
        )}&verify_code=${encodeURIComponent(cCode.trim())}`
      );

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || 'Verification lookup failed');
      } else {
        setResult(data);
      }
    } catch (e: any) {
      setErrorMsg('Unable to connect to verification authority');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeVerification(certNumber, verifyCode);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
              CF
            </div>
            <span className="font-bold text-slate-900 tracking-tight">CertiFlow Verification</span>
          </div>
          <Link
            href="/"
            className="inline-flex items-center space-x-1 text-xs text-slate-500 hover:text-indigo-600 font-semibold"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-xl mx-auto px-4 py-10 w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center space-x-1.5 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-semibold border border-indigo-200">
            <Lock className="w-3.5 h-3.5" />
            <span>Public Anti-Fraud Registry</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">Verify a Certificate</h1>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Check the authenticity of any vocational certificate issued under the Skills Programme.
          </p>
        </div>

        {/* Lookup Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Certificate Number
              </label>
              <input
                type="text"
                required
                value={certNumber}
                onChange={(e) => setCertNumber(e.target.value)}
                placeholder="e.g. 100001"
                className="w-full text-sm font-mono border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Verification Code
              </label>
              <input
                type="text"
                required
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                placeholder="e.g. A1B2C3D4"
                className="w-full text-sm font-mono uppercase tracking-wider border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs py-3 rounded-lg shadow-sm flex items-center justify-center space-x-1.5 transition"
            >
              <Search className="w-4 h-4" />
              <span>{loading ? 'Verifying with Authority...' : 'Verify Certificate'}</span>
            </button>
          </form>
        </div>

        {/* Verification Result Display */}
        {result && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* Status: VALID */}
            {result.status === 'valid' && (
              <div className="bg-white rounded-2xl border-2 border-emerald-500 shadow-md p-6 space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                    <ShieldCheck className="w-7 h-7" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                      Verified Authentic
                    </span>
                    <h3 className="text-lg font-extrabold text-slate-900">
                      Official Certificate Active
                    </h3>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2.5 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-200">
                    <span className="text-slate-500">Certificate Number:</span>
                    <span className="font-mono font-bold text-slate-900">#{result.cert_number}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-slate-200">
                    <span className="text-slate-500">Candidate (Masked):</span>
                    <span className="font-bold text-slate-900">{result.candidate_name_masked}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-slate-200">
                    <span className="text-slate-500">Course Qualification:</span>
                    <span className="font-bold text-indigo-700">{result.course_name}</span>
                  </div>

                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500">Date of Issuance:</span>
                    <span className="font-medium text-slate-700">{result.issue_date}</span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 text-center">
                  Digitally issued by Directorate of Vocational Skills &bull; Minimal data displayed to preserve candidate privacy.
                </p>
              </div>
            )}

            {/* Status: CANCELLED */}
            {result.status === 'cancelled' && (
              <div className="bg-white rounded-2xl border-2 border-red-500 shadow-md p-6 space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                    <ShieldAlert className="w-7 h-7" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-red-700 uppercase tracking-wider">
                      Certificate Cancelled
                    </span>
                    <h3 className="text-lg font-extrabold text-slate-900">
                      Revoked by State Authority
                    </h3>
                  </div>
                </div>

                <div className="bg-red-50 p-4 rounded-xl border border-red-200 space-y-2 text-xs text-red-900">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Certificate Number:</span>
                    <span className="font-mono font-bold">#{result.cert_number}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Cancelled Date:</span>
                    <span>{result.cancelled_at ? new Date(result.cancelled_at).toLocaleDateString() : 'Recorded'}</span>
                  </div>

                  <div className="pt-2 border-t border-red-200">
                    <span className="font-semibold block text-[11px] text-red-700 uppercase tracking-wider">
                      Reason for Revocation:
                    </span>
                    <p className="font-medium mt-0.5">{result.cancel_reason}</p>
                  </div>
                </div>

                <p className="text-[11px] text-red-600 text-center font-medium">
                  This certificate has been declared invalid and is no longer recognized for vocational accreditation.
                </p>
              </div>
            )}

            {/* Status: NOT FOUND */}
            {result.status === 'not_found' && (
              <div className="bg-white rounded-2xl border-2 border-amber-400 p-6 text-center space-y-3">
                <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
                <h3 className="text-base font-bold text-slate-900">Certificate Record Not Found</h3>
                <p className="text-xs text-slate-500">
                  No certificate matches the provided certificate number and verification code. Please check your credentials.
                </p>
              </div>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-50 text-red-700 text-xs p-3 rounded-lg border border-red-200 text-center">
            {errorMsg}
          </div>
        )}
      </main>

      <footer className="text-center py-4 text-xs text-slate-400 border-t border-slate-200">
        CertiFlow &bull; Skills Programme Public Verification Registry
      </footer>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="text-slate-500 text-sm font-medium">Loading verification portal...</div>
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
