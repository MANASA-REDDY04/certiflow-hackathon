'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Building2,
  MapPin,
  Lock,
  ArrowRight,
  RefreshCw,
  FileCheck2,
  Layers,
  Key,
  FileSpreadsheet,
  Users,
} from 'lucide-react';
import BatchManagement from '../components/BatchManagement';
import NotificationBell from '../components/NotificationBell';

interface SeedUser {
  id: string;
  name: string;
  email: string;
  role: 'training_centre' | 'district_officer' | 'quality_team' | 'state_office';
  district_id: string | null;
  district_name?: string | null;
  centre_id: string | null;
  centre_name?: string | null;
}

interface HealthData {
  status: string;
  services?: {
    database?: string;
    redis?: string;
  };
  timestamp?: string;
}

const SEED_USERS_FALLBACK: SeedUser[] = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'Anika',
    email: 'anika@certiflow.local',
    role: 'training_centre',
    district_id: '11111111-1111-1111-1111-111111111111',
    district_name: 'Central District',
    centre_id: '22222222-2222-2222-2222-222222222222',
    centre_name: 'Apex Skills Training Centre',
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    name: 'Dev',
    email: 'dev@certiflow.local',
    role: 'district_officer',
    district_id: '11111111-1111-1111-1111-111111111111',
    district_name: 'Central District',
    centre_id: null,
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    name: 'Meera',
    email: 'meera@certiflow.local',
    role: 'district_officer',
    district_id: '11111111-1111-1111-1111-111111111111',
    district_name: 'Central District',
    centre_id: null,
  },
  {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    name: 'Kabir',
    email: 'kabir@certiflow.local',
    role: 'district_officer',
    district_id: '11111111-1111-1111-1111-111111111111',
    district_name: 'Central District',
    centre_id: null,
  },
  {
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    name: 'Neha',
    email: 'neha@certiflow.local',
    role: 'quality_team',
    district_id: null,
    centre_id: null,
  },
  {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    name: 'Farah',
    email: 'farah@certiflow.local',
    role: 'state_office',
    district_id: null,
    centre_id: null,
  },
];

export default function Home() {
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('http://localhost:4000');
  const [users, setUsers] = useState<SeedUser[]>(SEED_USERS_FALLBACK);
  const [activeUser, setActiveUser] = useState<SeedUser | null>(SEED_USERS_FALLBACK[0]); // Default to Anika (Training Centre)
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [verifiedTokenUser, setVerifiedTokenUser] = useState<any>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [healthLoading, setHealthLoading] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'batches' | 'personas' | 'health'>('batches');

  // Auto-login as Anika on initial mount
  useEffect(() => {
    checkHealth();
    fetchUsers();
    handleLogin(SEED_USERS_FALLBACK[0]);
  }, [apiBaseUrl]);

  const checkHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/health`);
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      } else {
        setHealth({ status: 'offline' });
      }
    } catch (e) {
      setHealth({ status: 'offline' });
    } finally {
      setHealthLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/users`);
      if (res.ok) {
        const data = await res.json();
        if (data.users && data.users.length > 0) {
          setUsers(data.users);
        }
      }
    } catch {
      // Keep fallbacks
    }
  };

  const handleLogin = async (user: SeedUser) => {
    setLoading(true);
    setLoginError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.id }),
      });

      if (!res.ok) {
        // Fallback for offline dev
        setActiveUser(user);
        setJwtToken('dev-fallback-token');
        return;
      }

      const data = await res.json();
      setJwtToken(data.token);
      setActiveUser(data.user);

      // Verify token strictly via /api/auth/me
      const meRes = await fetch(`${apiBaseUrl}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${data.token}`,
        },
      });

      if (meRes.ok) {
        const meData = await meRes.json();
        setVerifiedTokenUser(meData.user);
      }
    } catch (err: any) {
      // In offline mode, still activate user session locally so testing is uninterrupted
      setActiveUser(user);
      setJwtToken('dev-fallback-token');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setActiveUser(null);
    setJwtToken(null);
    setVerifiedTokenUser(null);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'training_centre':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            Training Centre
          </span>
        );
      case 'district_officer':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
            District Officer
          </span>
        );
      case 'quality_team':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-300">
            Quality Team
          </span>
        );
      case 'state_office':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            State Office
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold shadow-sm">
              <FileCheck2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">CertiFlow</h1>
                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-300 font-mono">
                  Skills Platform
                </span>
              </div>
              <p className="text-xs text-slate-500">Skills Programme Certificate Issuance Platform</p>
            </div>
          </div>

          {/* Active User Switcher Bar */}
          <div className="flex items-center space-x-3">
            {/* Live SSE Notification Bell */}
            <NotificationBell
              apiBaseUrl={apiBaseUrl}
              jwtToken={jwtToken}
            />

            {activeUser && (
              <div className="hidden sm:flex items-center space-x-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 text-xs">
                <span className="text-slate-500">Active:</span>
                <span className="font-bold text-slate-800">{activeUser.name}</span>
                {getRoleBadge(activeUser.role)}
              </div>
            )}

            <div
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                health?.status === 'ok'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  health?.status === 'ok' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span>API: {health?.status || 'connecting...'}</span>
              <button
                onClick={checkHealth}
                disabled={healthLoading}
                className="ml-1 text-slate-400 hover:text-slate-600 transition"
              >
                <RefreshCw className={`w-3 h-3 ${healthLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-6">
          <button
            onClick={() => setActiveTab('batches')}
            className={`py-3.5 text-xs font-bold border-b-2 flex items-center space-x-2 transition ${
              activeTab === 'batches'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Batches & Candidate Upload</span>
          </button>

          <button
            onClick={() => setActiveTab('personas')}
            className={`py-3.5 text-xs font-bold border-b-2 flex items-center space-x-2 transition ${
              activeTab === 'personas'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Switch Persona & Policy Guard</span>
          </button>

          <button
            onClick={() => setActiveTab('health')}
            className={`py-3.5 text-xs font-bold border-b-2 flex items-center space-x-2 transition ${
              activeTab === 'health'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Infrastructure & Health</span>
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        {activeTab === 'batches' && (
          <BatchManagement
            apiBaseUrl={apiBaseUrl}
            activeUser={activeUser}
            jwtToken={jwtToken}
          />
        )}

        {activeTab === 'personas' && (
          <div className="space-y-6">
            <div className="bg-indigo-900 text-white rounded-xl p-6">
              <h2 className="text-xl font-bold">Switchable Programme Officials</h2>
              <p className="text-xs text-indigo-200 mt-1">
                Click any persona to immediately switch sessions. The server reads role and district
                exclusively from the token claims, enforcing strict boundaries.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {users.map((user) => {
                const isCurrent = activeUser?.id === user.id;
                return (
                  <div
                    key={user.id}
                    onClick={() => handleLogin(user)}
                    className={`cursor-pointer rounded-xl border p-5 transition flex flex-col justify-between ${
                      isCurrent
                        ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/40'
                        : 'border-slate-200 bg-white hover:border-indigo-300 shadow-xs'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-sm text-slate-900">{user.name}</h4>
                          <span className="text-xs text-slate-400 font-mono">{user.email}</span>
                        </div>
                        {getRoleBadge(user.role)}
                      </div>

                      <div className="text-xs text-slate-600 pt-2 border-t border-slate-100 space-y-1">
                        {user.district_name && (
                          <div className="flex items-center space-x-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            <span>District: {user.district_name}</span>
                          </div>
                        )}
                        {user.centre_name && (
                          <div className="flex items-center space-x-1">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            <span>Centre: {user.centre_name}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-mono">{user.id.slice(0, 8)}...</span>
                      <span
                        className={`font-semibold ${
                          isCurrent ? 'text-indigo-600' : 'text-slate-600 hover:text-indigo-600'
                        }`}
                      >
                        {isCurrent ? 'Active Session' : 'Switch to ' + user.name} &rarr;
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'health' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Monorepo Topology</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                {[
                  { name: 'web', role: 'Next.js Frontend', port: '3000', status: 'Running' },
                  { name: 'api', role: 'Fastify + TypeScript', port: '4000', status: health?.status === 'ok' ? 'Ready' : 'Offline' },
                  { name: 'worker', role: 'pg-boss Jobs', port: '-', status: 'Background' },
                  { name: 'postgres', role: 'PostgreSQL 16', port: '5432', status: health?.services?.database || 'Pending' },
                  { name: 'redis', role: 'Rate Limit & Cache', port: '6379', status: health?.services?.redis || 'Pending' },
                  { name: 'mock-whatsapp', role: 'Delivery Webhook', port: '4001', status: 'Mock Ready' },
                  { name: 'db-viewer', role: 'Web Table GUI', port: '8080', status: 'Ready' },
                ].map((svc) => (
                  <div key={svc.name} className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                    <span className="font-mono text-xs font-bold text-slate-800">{svc.name}</span>
                    <p className="text-[11px] text-slate-500">{svc.role}</p>
                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono pt-1">
                      <span>Port {svc.port}</span>
                      <span className="text-indigo-600 font-medium">{svc.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        CertiFlow &bull; Skills Programme Certificate Issuance Platform
      </footer>
    </div>
  );
}
